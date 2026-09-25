// Post-generation checks (Mark's v1.2 spec, section 9, C1–C12), run in code
// against every pair the model returns, before anything reaches the UI.
// A failing pair is dropped; if fewer than 2 pairs survive, ai-suggest.js
// makes one repair call with the failure reasons fed back.
//
// All checks are pure functions of the pair + the brief — no extra data
// model, no sheet access (the vertical blocked-words list is passed in,
// already resolved from the Verticals tab by the caller).

// ── Normalisation helpers ────────────────────────────────────────────────────

// Lowercase, strip punctuation and spaces — the C6 comparison form.
export function normalizeForCompare(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-zäöüß0-9]+/g, '')
}

// Character trigram similarity in [0,1] — C6's near-copy threshold.
export function trigramSimilarity(a, b) {
  const grams = s => {
    const set = new Set()
    for (let i = 0; i < s.length - 2; i += 1) set.add(s.slice(i, i + 3))
    return set
  }
  if (a.length < 3 || b.length < 3) return a === b ? 1 : 0
  const ga = grams(a)
  const gb = grams(b)
  if (ga.size === 0 || gb.size === 0) return 0
  let shared = 0
  for (const g of ga) if (gb.has(g)) shared += 1
  return shared / Math.min(ga.size, gb.size)
}

// Greedy word wrap at `width` chars — C1's fallback for real font metrics.
function wrapWords(text, width) {
  const lines = []
  for (const paragraph of (text || '').split('\n')) {
    let current = ''
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (!current) { current = word; continue }
      if ((current + ' ' + word).length <= width) current += ' ' + word
      else { lines.push(current); current = word }
    }
    lines.push(current)
  }
  return lines.filter(l => l.length > 0)
}

// ── Fact / token extraction ──────────────────────────────────────────────────

// Offer symbols and numeric claims a pair must be able to back up: 1+1,
// 2für1, 2x15€, 30%, 0€, plain numbers, dates.
export function offerTokens(text) {
  const t = (text || '').toLowerCase().replace(/\s+/g, ' ')
  const out = new Set()
  const push = s => { if (s) out.add(s) }
  const dec = s => s.replace(',', '.')
  // 1+1
  for (const m of t.matchAll(/(\d)\s*\+\s*(\d)/g)) push(`${m[1]}+${m[2]}`)
  // 2für1 / 2 fuer 1
  for (const m of t.matchAll(/(\d)\s*für\s*(\d)/g)) push(`${m[1]}für${m[2]}`)
  // 2x15€ / 2 x 15 / 2×15
  for (const m of t.matchAll(/(\d+)\s*[x×]\s*(\d+)\s*(€)?/g)) push(`${m[1]}x${m[2]}${m[3] ?? ''}`)
  // 30% / 26 %
  for (const m of t.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g)) push(`${dec(m[1])}%`)
  // 15€ / 0€
  for (const m of t.matchAll(/(\d+(?:[.,]\d+)?)\s*€/g)) push(`${dec(m[1])}€`)
  // bare numbers, so "…" inside compound tokens is covered too
  for (const m of t.matchAll(/\d+(?:[.,]\d+)?/g)) push(dec(m[0]))
  return out
}

const AD_SPEAK = [
  'beste', 'besten', 'bestes', 'unglaublich', 'revolutionär', 'einzigartig',
  'himmlisch', 'genuss pur', 'geschmackserlebnis',
]

const BARGAIN_WORDS = ['billig', 'schnäppchen', 'ramsch', 'spottbillig', 'sparfuchs']

const FINEPRINT_WORDS = ['agb', 'mindestbestellwert', 'gültig bis', 'neukund']

const PICKUP_WORDS = ['abholen', 'abholung', 'vorbeikommen', 'im laden', 'pickup', 'to go']

const HEADLINE_CTA_WORDS = ['jetzt bestellen', 'jetzt einkaufen', 'app downloaden']

// The two language checks (C10). EN briefs: no umlauts/ß at all. DE briefs:
// drop only clearly-all-English lines (≥2 English function words, zero
// German indicators) unless the pair's source example was EN/DE+EN.
const GERMAN_MARKERS = /[äöüß]|\b(der|die|das|den|dem|ein|eine|einen|mit|für|und|dein|deine|jetzt|bei|auf|aus|ist|wird|nicht|hier|neu|schon|wie|wär's|heute|wir|du)\b/i

// ── The checks ───────────────────────────────────────────────────────────────
// Each check returns null when the pair passes, or a short reason string
// when it fails. `pair` = {subheadline, headline, reads_as, ...};
// `ctx` carries everything the checks need from the brief.

export function checkLength(pair, ctx) {
  for (const [fieldKey, limits] of [['headline', ctx.limits.headline], ['subheadline', ctx.limits.subheadline]]) {
    if (!limits) continue
    const text = pair[fieldKey]
    if (!text) continue
    // Wrap at max_chars_min_pt (the generous end — the box fits that many
    // chars once reduced to min_pt); fall back to max_chars.
    const width = limits.max_chars_min_pt || limits.max_chars
    const maxLines = limits.max_lines ?? 1
    const lines = wrapWords(text, width)
    if (lines.length > maxLines) {
      return `${fieldKey} wraps to ${lines.length} lines (max ${maxLines}): "${text}"`
    }
    // A single word longer than max_chars is only allowed if it fits
    // max_chars_min_pt (spec format rule); anything longer fails outright.
    const longestWord = text.split(/\s+/).reduce((a, w) => Math.max(a, w.length), 0)
    if (longestWord > (limits.max_chars_min_pt || limits.max_chars)) {
      return `${fieldKey} has an unbreakable word of ${longestWord} chars: "${text}"`
    }
  }
  return null
}

export function checkNumbers(pair, ctx) {
  // Every number/offer symbol in either field must be backed by the brief.
  const allowed = new Set()
  for (const t of offerTokens(ctx.offer.text || '')) allowed.add(t)
  for (const f of ctx.offer.facts ?? []) for (const t of offerTokens(f)) allowed.add(t)
  for (const t of offerTokens(ctx.partner.name || '')) allowed.add(t)
  for (const p of ctx.partner.products ?? []) for (const t of offerTokens(p)) allowed.add(t)
  if (ctx.campaign?.start) for (const t of offerTokens(String(ctx.campaign.start))) allowed.add(t)
  if (ctx.campaign?.end) for (const t of offerTokens(String(ctx.campaign.end))) allowed.add(t)
  // Free pass for the partner's own name and quoted products (word parts
  // like "Big Mac 2" for "2BigMac" merchants would otherwise false-positive).
  const forbidden = []
  for (const fieldKey of ['headline', 'subheadline']) {
    for (const token of offerTokens(pair[fieldKey])) {
      if (allowed.has(token)) continue
      // Escape hatch for unit-bearing tokens backed by a compound allowed
      // token (e.g. "15€" inside an allowed "2x15€"). Must keep the
      // symbol AND be more than a bare digit — otherwise a fabricated "5"
      // would slip through as a substring of any allowed "15€".
      const insideAllowed = token.length > 1 && /[€%x]/.test(token) &&
        [...allowed].some(a => a.includes(token))
      if (!insideAllowed) forbidden.push(`${fieldKey} claims "${token}"`)
    }
  }
  if (forbidden.length) return `unsupported offer claims: ${forbidden.join(', ')}`
  // If the badge already shows the offer, the pair must not repeat the
  // offer number (it may still say "sparen" or name the product).
  if (ctx.offer.shown_in_badge && ctx.badgeNumbers.size) {
    for (const fieldKey of ['headline', 'subheadline']) {
      for (const token of offerTokens(pair[fieldKey])) {
        if (ctx.badgeNumbers.has(token)) return `${fieldKey} repeats the badge offer number (${token})`
      }
    }
  }
  return null
}

export function checkOfferQualifiers(pair, ctx) {
  const text = `${pair.subheadline} ${pair.headline}`.toLowerCase()
  const statesOffer = offerTokens(text).size > 0 && /(%|€|\d)/.test(text)
  if (!statesOffer) return null
  const qualifiers = (ctx.offer.text || '').toLowerCase().includes('bis zu') || (ctx.offer.text || '').toLowerCase().includes('ausgewählte')
  if (!qualifiers) return null
  if (!text.includes('bis zu') && !text.includes('ausgewählte')) {
    return 'states the offer number without "bis zu"/"ausgewählte"'
  }
  return null
}

// Word-boundary match — plain substring matching would flag "bestellen"
// for "beste", "Sie" inside "isoliert"-class words, etc.
function containsWord(text, word) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${escaped}\\b`, 'i').test(text)
}

export function checkBlockedWords(pair, ctx) { // eslint-disable-line no-unused-vars
  const texts = { headline: pair.headline, subheadline: pair.subheadline }
  for (const [fieldKey, value] of Object.entries(texts)) {
    // Formal address is matched on the ORIGINAL case — capitalized
    // Sie/Ihnen/Ihr(e|n|em|es) is the formal you anywhere in the line
    // (including line start, where the declined forms are unambiguous),
    // while lowercase "sie" (she/they) and "ihr" (informal plural you)
    // are perfectly valid du-form words and must NOT be flagged. Wolt
    // voice is always "du" (P1), so any capital-I form fails.
    if (/\b(Sie|Ihnen|Ihr(e|n|em|es)?)\b/.test(value)) {
      return `${fieldKey} uses formal "Sie/Ihr"`
    }
    const text = (value || '').toLowerCase()
    for (const w of [...BARGAIN_WORDS, ...FINEPRINT_WORDS, ...AD_SPEAK]) {
      // "Neukund" is a stem (Neukund*innen, Neukunden) — prefix match.
      const hit = w === 'neukund' ? new RegExp('\\bneukund', 'i').test(text) : containsWord(text, w)
      if (hit) return `${fieldKey} uses blocked word "${w}"`
    }
    if (containsWord(text, 'das bringt nur wolt')) return `${fieldKey} uses the sign-off`
    if (fieldKey === 'headline') {
      for (const w of HEADLINE_CTA_WORDS) {
        if (text.includes(w)) return `headline uses CTA "${w}"`
      }
    }
  }
  return null
}

export function checkVerticalWords(pair, ctx) {
  if (!ctx.blockedWords?.length) return null
  // Retail's "Gerichte" block is conditional (allowed when the partner is
  // food/grocery per the Verticals tab note) — the caller resolves that.
  for (const [fieldKey, raw] of Object.entries({ headline: pair.headline, subheadline: pair.subheadline })) {
    const text = (raw || '').toLowerCase()
    for (const w of ctx.blockedWords) {
      if (text.includes(w.toLowerCase())) return `${fieldKey} uses cross-vertical word "${w}"`
    }
  }
  return null
}

export function checkNoCopying(pair, ctx) {
  // The locked field's own text is exempt — it was already on the design
  // (T11: pairs must keep a locked "Berlin." even though "Berlin." appears
  // as a library lockup half; it's the user's/kept text, not new copying).
  const lockedText = ctx.locked ? normalizeForCompare(ctx.locked.text) : null
  const forms = []
  for (const key of ['subheadline', 'headline']) {
    const norm = normalizeForCompare(pair[key])
    if (norm && norm !== lockedText) forms.push({ form: norm, what: key })
  }
  if (pair.reads_as) {
    const norm = normalizeForCompare(pair.reads_as)
    if (norm) forms.push({ form: norm, what: 'reads_as' })
  }
  for (const { form, what } of forms) {
    for (const source of ctx.knownLines) {
      const src = normalizeForCompare(source)
      if (src && src === form) return `${what} is a word-for-word copy of a known line: "${source}"`
    }
    for (const source of ctx.excludeLines) {
      const src = normalizeForCompare(source)
      if (!src) continue
      if (src === form) return `${what} repeats an excluded line: "${source}"`
      if (what !== 'reads_as' && trigramSimilarity(src, form) > 0.85) {
        return `${what} is a near-copy of an excluded line: "${source}"`
      }
    }
  }
  return null
}

export function checkPickup(pair, ctx) {
  if (!ctx.offer.delivery_only) return null
  const text = `${pair.subheadline} ${pair.headline}`.toLowerCase()
  for (const w of PICKUP_WORDS) {
    if (text.includes(w)) return `suggests pickup ("${w}") on a delivery-only offer`
  }
  return null
}

export function checkMinutes(pair, ctx) {
  if (ctx.offer.verified_delivery_minutes != null) return null
  const text = `${pair.subheadline} ${pair.headline}`.toLowerCase()
  if (/\d+\s*(min\b|minuten\b)/.test(text)) {
    return 'states delivery minutes without a verified number'
  }
  return null
}

export function checkStaticText(pair, ctx) {
  const runs = s => (s || '').toLowerCase().split(/\s+/).filter(Boolean)
  const pairForms = [pair.subheadline, pair.headline, pair.reads_as]
    .filter(Boolean)
    .map(t => runs(t).join(' '))
  for (const staticText of ctx.staticText ?? []) {
    const words = runs(staticText)
    // Every contiguous 2+ word window of the static text, matched against
    // the pair's normalized word sequence.
    for (let size = 2; size <= words.length; size += 1) {
      for (let start = 0; start + size <= words.length; start += 1) {
        const window = words.slice(start, start + size).join(' ')
        for (const form of pairForms) {
          if (form.includes(window)) {
            return `repeats printed template text ("${window}")`
          }
        }
      }
    }
  }
  return null
}

export function checkLanguage(pair, ctx) {
  const text = `${pair.subheadline} ${pair.headline}`
  if (ctx.lang === 'EN') {
    if (/[äöüß]/i.test(text)) return 'umlaut/ß in an EN brief'
    return null
  }
  if (ctx.sourceAllowsEnglish) return null
  const hasGerman = GERMAN_MARKERS.test(text)
  const englishRuns = (text.match(/\b(the|and|with|your|you|for|from|meet|knows|love|best|real|out|off)\b/gi) ?? []).length
  if (!hasGerman && englishRuns >= 2) return 'all-English line on a DE brief'
  return null
}

export function checkLockedField(pair, ctx) {
  if (!ctx.locked) return null
  const { fieldKey, text } = ctx.locked
  const pairField = fieldKey === 'headline' ? 'headline' : 'subheadline'
  if ((pair[pairField] || '').trim() !== text.trim()) {
    return `${pairField} does not keep the locked text exactly`
  }
  return null
}

// Emoji detector — the variation-selector U+FE0F rides outside the class
// (a bare combining mark inside a class trips no-misleading-character-class).
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]\u{FE0F}?/u

export function checkEmoji(pair, ctx) {
  for (const fieldKey of ['headline', 'subheadline']) {
    const text = pair[fieldKey] || ''
    if (!EMOJI_RE.test(text)) continue
    const heart = text.includes('♥')
    const stripped = text.replace(/♥/g, '')
    if (EMOJI_RE.test(stripped)) return `${fieldKey} contains emoji`
    if (heart && !ctx.merchantUsesHeart) return `${fieldKey} uses ♥ without a merchant example`
  }
  return null
}

// Runs every check in spec order on one pair; returns {ok, check, reason}.
export function runChecks(pair, ctx) {
  const checks = [
    ['C1', checkLength],
    ['C2', checkNumbers],
    ['C3', checkOfferQualifiers],
    ['C4', checkBlockedWords],
    ['C5', checkVerticalWords],
    ['C6', checkNoCopying],
    ['C7', checkPickup],
    ['C8', checkMinutes],
    ['C9', checkStaticText],
    ['C10', checkLanguage],
    ['C11', checkLockedField],
    ['C12', checkEmoji],
  ]
  for (const [id, fn] of checks) {
    try {
      const reason = fn(pair, ctx)
      if (reason) return { ok: false, check: id, reason }
    } catch (err) {
      // A throwing check must never drop a pair silently for the wrong
      // reason — treat it as a failure with the error surfaced.
      return { ok: false, check: id, reason: `check error: ${err.message}` }
    }
  }
  return { ok: true }
}
