import { useCallback, useEffect, useRef, useState } from 'react'

// The AI Suggest pair queue (Mark's v1.2 spec, section 8) — client-side,
// in-memory React state, scoped per design + context.
//
// One API call = one batch of 4–6 sub-headline + headline pairs = 1 credit.
// The UI still shows one line per box, but the pair lives in the session:
// clicking AI Suggest on the Headline applies pair N's headline and keeps
// its sub-headline as the "partner line", so a subsequent click on the
// Sub-headline shows the matching line with NO new API call (§8.2). Only a
// genuinely new batch (no session, changed context, exhausted queue, or a
// locked rewrite) costs a credit; queue serves are free.
//
// Session rules (§8.1):
// - key: design_id + context hash (partner, offer, note, language,
//   template) — any change drops the queue ("Reset").
// - order: rank order, one fresh line per click, partner line served free.
// - refill: when 1 untouched pair is left, the next batch is built in the
//   background (costs its own credit, gated on credits + the hourly cap).
// - cap: max 4 batches per design per hour, then "Out of fresh ideas".
// - hints: flag-driven guidance under the field (§8.3).
//
// Partner history (§4.4) is deferred — the brief always sends an empty
// history for now.

const PAIRS_WANTED = 5
const MAX_BATCHES_PER_HOUR = 4
const HOUR_MS = 60 * 60 * 1000

// djb2 → base36: a short, stable context key. Not cryptographic — it only
// needs to detect "something the brief depends on changed".
function contextKey(parts) {
  const str = JSON.stringify(parts)
  let hash = 5381
  for (let i = 0; i < str.length; i += 1) hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0
  return (hash >>> 0).toString(36)
}

const other = key => (key === 'headline' ? 'sub_headline' : 'headline')

export function usePairQueue(options) {
  // Always-fresh options inside event handlers: the ref syncs in an effect
  // (after commit, before any click can happen), so click handlers never
  // read stale fields/credits. Render-time derivations (the hint below)
  // read the `options` param directly instead of the ref.
  const optRef = useRef(options)
  useEffect(() => {
    optRef.current = options
  })

  const [session, setSession] = useState(null)
  // session = {
  //   ctxKey, baseTexts: {headline, sub_headline},    // field texts when the session started
  //   pairs: [...],                                   // the batch queue (rank order)
  //   appliedTexts: {headline: [], sub_headline: []}, // every line this session put in a field
  //   appliedIndex: {headline: null, sub_headline: null},
  //   batches: [timestamps],
  // }
  const [busyField, setBusyField] = useState(null)
  const [refilling, setRefilling] = useState(false)
  const [error, setError] = useState(null)
  const [lastFlags, setLastFlags] = useState([])
  const [capped, setCapped] = useState(false)
  const [showOutOfCredits, setShowOutOfCredits] = useState(false)
  const [partnerLineLink, setPartnerLineLink] = useState(null) // {fieldKey, text}

  function currentTexts() {
    const o = optRef.current
    return {
      headline: (o.getFieldText('headline') || '').trim(),
      sub_headline: (o.getFieldText('sub_headline') || '').trim(),
    }
  }

  // ── Session validity (§8.1 "Reset") ──────────────────────────────────────
  // The queue survives clicks that APPLY session lines (the applied field's
  // text naturally changes — that must not count as a context change) but
  // resets when the brief inputs change or a field is edited to something
  // the session didn't put there (user typed over an AI line, cleared a
  // field that started with their own text, …).
  function isStale(s) {
    const o = optRef.current
    if (!s) return true
    const key = contextKey([
      o.designId, o.templateId, o.templateName, o.lang, o.partnerName,
      o.vertical, o.category, o.offerText, o.offerShownInBadge,
      o.showLogoHint ? o.logoPicked : true, o.userNote,
    ])
    if (s.ctxKey !== key) return true
    for (const k of ['headline', 'sub_headline']) {
      const text = (o.getFieldText(k) || '').trim()
      const allowed = new Set([s.baseTexts[k], ...s.appliedTexts[k]])
      if (text && !allowed.has(text)) return true
      if (!text && s.baseTexts[k] && !s.appliedTexts[k].length) return true // cleared a user draft
    }
    return false
  }

  function newSession(baseTexts, pairs) {
    const o = optRef.current
    return {
      ctxKey: contextKey([
        o.designId, o.templateId, o.templateName, o.lang, o.partnerName,
        o.vertical, o.category, o.offerText, o.offerShownInBadge,
        o.showLogoHint ? o.logoPicked : true, o.userNote,
      ]),
      baseTexts,
      pairs,
      appliedTexts: { headline: [], sub_headline: [] },
      appliedIndex: { headline: null, sub_headline: null },
    }
  }

  // Batch timestamps for the hourly cap (§8.1 "max 4 batches per design
  // per hour") — deliberately OUTSIDE the session: a context reset drops
  // the queue, not the spend counter.
  const batchTimesRef = useRef([])
  function recentBatchCount() {
    batchTimesRef.current = batchTimesRef.current.filter(t => Date.now() - t < HOUR_MS)
    return batchTimesRef.current.length
  }
  function recordBatch() {
    batchTimesRef.current = [...batchTimesRef.current.filter(t => Date.now() - t < HOUR_MS), Date.now()]
  }

  // Spec §4.5 kinds: placeholder (empty), user_draft (typed), kept (an AI
  // line the user kept by applying it). Provenance lives in FieldEditor and
  // is session-local: text with NO known provenance (e.g. restored from a
  // saved design) must read as user_draft, never as kept — we can't vouch
  // it came from an AI line, and rewrite mode has to work on old designs.
  function kindFor(key) {
    const o = optRef.current
    const text = (o.getFieldText(key) || '').trim()
    if (!text) return 'placeholder'
    return o.fieldProvenance(key) === 'kept' ? 'kept' : 'user_draft'
  }

  // ── The API call ─────────────────────────────────────────────────────────
  async function fetchBatch({ clickedField, locked, sessionBase }) {
    const o = optRef.current
    const texts = currentTexts()
    const body = {
      field: clickedField,
      lang: o.lang,
      brief: {
        design_id: o.designId ?? 'draft',
        template_id: o.templateId,
        template_name: o.templateName,
        vertical: o.vertical ?? '',
        partner: {
          name: o.partnerName ?? '',
          category: o.category ?? '',
          products: o.products ?? [],
          city: o.city ?? '',
          district: '',
        },
        logo_picked: !!o.logoPicked,
        static_text: o.staticText ?? [],
        other_fields: o.otherFields ?? [],
        offer: {
          text: o.offerText ?? '',
          shown_in_badge: !!o.offerShownInBadge,
        },
        user_note: o.userNote ?? '',
        fields: {
          headline: { current: texts.headline, kind: kindFor('headline') },
          sub_headline: {
            current: texts.sub_headline,
            kind: kindFor('sub_headline'),
            role: o.box?.sub_headline?.role ?? 'setup',
            position: o.box?.sub_headline?.position ?? 'above',
          },
        },
        box: o.box ?? {},
        caps: o.caps !== false,
        exclude: o.getShownLines?.() ?? [],
        pairs_wanted: PAIRS_WANTED,
      },
    }
    // sessionBase marks which texts were already in the fields when this
    // session began — used only for the locked/rewrite shape of the brief;
    // kinds come from provenance (above).
    void sessionBase
    if (locked) body.brief.locked = locked

    const res = await fetch('/api/ai-suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Could not write a line. Try again.')
    if (!data.pairs?.length) throw new Error('Could not write a line. Try again.')
    return data
  }

  function pairText(s, index, fieldKey) {
    const pair = s.pairs[index]
    if (!pair) return ''
    return (fieldKey === 'headline' ? pair.headline : pair.subheadline) || ''
  }

  // ── Background refill (§8.1) ─────────────────────────────────────────────
  // When 1 untouched pair is left, build the next batch in the background.
  // Costs its own credit (a batch is a batch), gated on credits + cap.
  const maybeRefill = useCallback(async s => {
    const o = optRef.current
    if (!s || refilling) return
    const untouched = s.pairs.filter((_, i) =>
      !s.appliedTexts.headline.includes(pairText(s, i, 'headline')) &&
      !s.appliedTexts.sub_headline.includes(pairText(s, i, 'sub_headline')))
    if (untouched.length > 1) return
    if (recentBatchCount() >= MAX_BATCHES_PER_HOUR) return
    if (o.credits != null && o.credits <= 0) return

    setRefilling(true)
    try {
      const data = await fetchBatch({ clickedField: s.lastClickedField ?? 'headline', sessionBase: s.baseTexts })
      // Record the spend only after success — a failed background refill
      // must not consume a batch slot (same rule as the manual path, §7.2).
      recordBatch()
      setSession(prev => (prev ? { ...prev, pairs: [...prev.pairs, ...data.pairs] } : prev))
      o.onCreditUsed?.()
    } catch {
      // A failed background refill stays silent — the next click builds a
      // batch the normal way and surfaces any error there.
    } finally {
      setRefilling(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refilling])

  // ── The click (§8.2) ─────────────────────────────────────────────────────
  // Synchronous re-entrancy guard: busyField is state and commits late, so
  // two clicks in the same tick would both see it null and both build a
  // batch (double credit). A ref updates immediately.
  const inFlightRef = useRef(false)

  const click = useCallback(async clickedField => {
    const o = optRef.current
    if (busyField || inFlightRef.current) return
    inFlightRef.current = true
    try {
      setError(null)
      setCapped(false)

      const stale = isStale(session)
      let s = stale ? null : session
      if (stale && session) setSession(null)

      const otherKey = other(clickedField)
      const otherText = (o.getFieldText(otherKey) || '').trim()
      const otherIsLocked = !!otherText // any kept/typed text locks a NEW batch (§8.2.4)

      // Next line for this field: the smallest pair index not yet applied to
      // it (0 on the partner-line click — that's the whole point of pairs).
      const nextIndex = s
        ? (s.appliedIndex[clickedField] == null ? 0 : s.appliedIndex[clickedField] + 1)
        : 0
      const canServe = !!s && nextIndex < s.pairs.length && !!pairText(s, nextIndex, clickedField)
      const willCost = !canServe

      if (willCost) {
        if (o.credits != null && o.credits <= 0) {
          setShowOutOfCredits(true)
          return
        }
        if (recentBatchCount() >= MAX_BATCHES_PER_HOUR) {
          setCapped(true)
          return
        }
        const message = otherIsLocked
          ? 'Generate lines that match the other field\'s text? This uses 1 credit.'
          : `Generate ${PAIRS_WANTED} AI suggestions? This uses 1 credit.`
        if (!window.confirm(message)) return
      }

      setBusyField(clickedField)
      try {
        if (canServe) {
          // ── Queue serve (free): §8.2.2 / §8.2.3.
          const text = pairText(s, nextIndex, clickedField)
          // If the other field still holds the previous pair's partner line
          // (AI-applied, not hand-edited), offer its new match as a link.
          const prevPartnerLine = nextIndex > 0 ? pairText(s, nextIndex - 1, otherKey) : null
          if (otherText && prevPartnerLine && otherText === prevPartnerLine && o.fieldProvenance(otherKey) !== 'user_draft') {
            setPartnerLineLink({ fieldKey: otherKey, text: pairText(s, nextIndex, otherKey), pairIndex: nextIndex })
          } else if (partnerLineLink?.fieldKey === clickedField || partnerLineLink?.fieldKey === otherKey) {
            setPartnerLineLink(null)
          }
          o.applyText(clickedField, text)
          const next = {
            ...s,
            lastClickedField: clickedField,
            appliedIndex: { ...s.appliedIndex, [clickedField]: nextIndex },
            appliedTexts: { ...s.appliedTexts, [clickedField]: [...s.appliedTexts[clickedField], text] },
          }
          setSession(next)
          maybeRefill(next)
        } else {
          // ── New batch (1 credit). The other field's kept/typed text is
          // locked (§8.2.4); the API derives generate-vs-rewrite from the
          // clicked field's own kind.
          const locked = otherIsLocked ? { fieldKey: otherKey, text: otherText } : null
          const baseTexts = currentTexts()
          const data = await fetchBatch({ clickedField, locked, sessionBase: baseTexts })
          // Record the spend only after success (a failed call costs nothing,
          // §7.2) — the in-flight guard prevents double-fires meanwhile.
          recordBatch()
          const batch = newSession(baseTexts, data.pairs)
          batch.lastClickedField = clickedField
          const text = pairText(batch, 0, clickedField)
          if (text) {
            o.applyText(clickedField, text)
            batch.appliedIndex = { ...batch.appliedIndex, [clickedField]: 0 }
            batch.appliedTexts = { ...batch.appliedTexts, [clickedField]: [text] }
          }
          if (partnerLineLink) setPartnerLineLink(null)
          setSession(batch)
          setLastFlags(data.flags ?? [])
          o.onCreditUsed?.()
          maybeRefill(batch)
        }
      } catch (err) {
        // §7.2: on failure show the error and do NOT charge a credit —
        // onCreditUsed is only called on success. The error is scoped to the
        // field that triggered the batch so it stays visible after the busy
        // flag clears.
        setError({ field: clickedField, message: err.message })
      } finally {
        setBusyField(null)
      }
    } finally {
      inFlightRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, busyField, refilling, partnerLineLink])

  const dismissLink = useCallback(() => setPartnerLineLink(null), [])
  const clearError = useCallback(() => setError(null), [])
  const dismissOutOfCredits = useCallback(() => setShowOutOfCredits(false), [])

  // The §8.2.3 link's apply: puts the matching partner line into its field
  // AND records it in the session, so the queue continues from this pair
  // on the next click (same as if the user had clicked AI Suggest there).
  function applyPartnerLine() {
    const link = partnerLineLink
    if (!link) return
    const o = optRef.current
    setPartnerLineLink(null)
    setSession(prev => (prev
      ? {
          ...prev,
          appliedIndex: { ...prev.appliedIndex, [link.fieldKey]: Math.max(prev.appliedIndex[link.fieldKey] ?? -1, link.pairIndex) },
          appliedTexts: { ...prev.appliedTexts, [link.fieldKey]: [...new Set([...prev.appliedTexts[link.fieldKey], link.text])] },
        }
      : prev))
    o.applyText(link.fieldKey, link.text)
  }

  // §8.3 hints, derived from the last batch's flags + brief inputs (read
  // from the render-time options param, not the ref).
  const hint = (() => {
    if (capped) return 'Out of fresh ideas for this brief. Add a note to steer the AI.'
    if (options.showLogoHint && !options.logoPicked) return 'Pick the restaurant logo first for lines made for this partner.'
    if (lastFlags.includes('conflict_note_vs_offer')) return 'Your note and the Discount field do not match. Lines use the Discount field.'
    if (lastFlags.includes('too_little_context') || lastFlags.includes('vertical_unclear')) {
      return 'Add a note for better lines (e.g. new store, offer, product).'
    }
    return null
  })()

  return {
    click,
    applyPartnerLine,
    busyField,
    refilling,
    error,
    clearError,
    hint,
    capped,
    partnerLineLink,
    dismissLink,
    showOutOfCredits,
    dismissOutOfCredits,
  }
}
