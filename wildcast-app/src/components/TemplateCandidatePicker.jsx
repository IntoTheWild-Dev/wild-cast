import { useState, useEffect, useRef } from 'react'
import TemplateCanvas from './TemplateCanvas'
import { TEMPLATE_ZONES } from '../data/templateZones'
import { TEMPLATES } from '../data/templates'
import { CANDIDATE_TEMPLATE_IDS, getMatchingTemplateIds, buildCandidateFields, fetchMerchantAssets } from '../lib/briefToCandidates'
import { OBJECTIVES, resolvePartnerName } from '../lib/briefConstants'

const [OPTION_A_ID, OPTION_B_ID] = CANDIDATE_TEMPLATE_IDS
const CANDIDATE_LABELS = { [OPTION_A_ID]: 'Option A', [OPTION_B_ID]: 'Option B' }

function Row({ label, value }) {
  if (!value) return null
  return (
    <div style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ width: 160, flexShrink: 0, fontSize: 12, fontWeight: 700, color: 'var(--mid)' }}>{label}</div>
      <div style={{ fontSize: 14, color: 'var(--dark)' }}>{value}</div>
    </div>
  )
}

// Shown when the brief's Business type / Formats don't match any live
// template yet (today: only Restaurant + Flyer has real templates) — a
// plain, honest read-back rather than pretending candidates exist.
function NoMatchFallback({ brief, onEdit }) {
  const objective = OBJECTIVES.find(o => o.value === brief.objective)
  const partnerLabel = resolvePartnerName(brief)

  return (
    <div style={{ flex: 1, background: 'var(--bg)', overflow: 'auto' }}>
      <div style={{ borderBottom: '1px solid var(--border)', padding: '28px 40px 24px', background: '#fff' }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--dark)' }}>No matching template yet</h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--mid)', maxWidth: 520 }}>
          Right now only Restaurant + Flyer has live templates to generate from. Here's what you entered — nothing's been saved.
        </p>
      </div>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 24px 60px' }}>
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: '8px 20px' }}>
          <Row label="Partner name" value={partnerLabel} />
          <Row label="Business type" value={brief.businessType} />
          <Row label="Objective" value={objective?.label} />
          <Row label="Formats" value={brief.formats.join(', ')} />
          <Row label="Headline" value={brief.headline} />
        </div>
        <button onClick={onEdit} style={{ marginTop: 20, width: '100%', padding: '11px', fontSize: 13, fontWeight: 600, borderRadius: 8, border: '1px solid var(--border)', background: '#fff', color: 'var(--dark)', cursor: 'pointer' }}>
          ← Edit answers
        </button>
      </div>
    </div>
  )
}

export default function TemplateCandidatePicker({ brief, onEdit, onPick, onSendForReview, savedIds, savedPreviews }) {
  const [candidateFields, setCandidateFields] = useState(null) // null until resolved
  const [previews, setPreviews] = useState({}) // { [templateId]: pngDataUrl }
  const [ticked, setTicked] = useState({}) // { [templateId]: boolean } — one or both
  const [sending, setSending] = useState(false)
  const matchingIds = getMatchingTemplateIds(brief)
  const exportRefA = useRef(null)
  const exportRefB = useRef(null)

  useEffect(() => {
    let cancelled = false
    async function run() {
      if (!matchingIds.length) { setCandidateFields(null); return }
      const partnerName = resolvePartnerName(brief)
      const { logoUrl, photoUrl: autoPhotoUrl } = await fetchMerchantAssets(partnerName)
      if (cancelled) return
      // A food photo explicitly picked in the brief (brief.foodPhotoAsset — added
      // because a merchant like Wen Cheng may have several dishes, so "just grab
      // the first one" isn't always right) wins over the auto-pulled fallback.
      const photoUrl = brief.foodPhotoAsset?.src ?? autoPhotoUrl
      const fields = buildCandidateFields(brief, { logoUrl, photoUrl })
      // Only build fields for what actually matched (Julia's fix request,
      // 2026-08-20 — picking just Option A in the preview popup shouldn't
      // still generate both).
      setCandidateFields(Object.fromEntries(matchingIds.map(id => [id, fields])))
    }
    run()
    return () => { cancelled = true }
    // brief is a one-shot snapshot passed in on submit — safe to depend on identity only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brief])

  function capture(templateId, exportRef) {
    const png = exportRef.current?.getPng?.()
    if (png) setPreviews(prev => ({ ...prev, [templateId]: png }))
  }

  function handlePick(templateId) {
    const template = TEMPLATES.find(t => t.id === templateId)
    if (!template || !candidateFields) return
    onPick(template, candidateFields[templateId], savedIds?.[templateId])
  }

  function toggleTick(id) {
    setTicked(prev => ({ ...prev, [id]: !prev[id] }))
  }

  if (!matchingIds.length) {
    return <NoMatchFallback brief={brief} onEdit={onEdit} />
  }

  // Renamed usage sites keep "bothReady" name for a minimal diff, but this
  // now means "everything that actually matched is ready" — could be one
  // id or two, not always both, since matchingIds is now filtered by any
  // pre-selection made in the "Pick your template first" popup.
  const bothReady = matchingIds.length > 0 && matchingIds.every(id => previews[id])
  const tickedIds = matchingIds.filter(id => ticked[id])

  // Julia's confirmed choice (2026-08-03): Send for Review skips the editor
  // entirely, reusing the PNG already captured for the card preview — one
  // review link per ticked design (both ticked = two links, shown together).
  async function handleSend() {
    if (!tickedIds.length || !candidateFields) return
    setSending(true)
    try {
      const items = tickedIds.map(id => ({
        template: TEMPLATES.find(t => t.id === id),
        fields: candidateFields[id],
        png: previews[id],
        label: CANDIDATE_LABELS[id],
      }))
      await onSendForReview(items)
    } finally {
      setSending(false)
    }
  }

  // Edit only makes sense for exactly one design at a time.
  function handleEdit() {
    if (tickedIds.length !== 1) return
    handlePick(tickedIds[0])
  }

  return (
    <div style={{ flex: 1, background: 'var(--bg)', overflow: 'auto' }}>
      <div style={{ borderBottom: '1px solid var(--border)', padding: '28px 40px 24px', background: '#fff' }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--dark)' }}>Pick a design</h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--mid)', maxWidth: 520 }}>
          Generated from your brief. Tick one or both, then send for review or edit one further.
        </p>
      </div>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 24px 60px' }}>
        {!bothReady && (
          <div style={{ textAlign: 'center', padding: '40px 0', fontSize: 13, color: 'var(--mid)' }}>
            Generating designs…
          </div>
        )}

        <div style={{ display: bothReady ? 'flex' : 'none', gap: 20, justifyContent: 'center' }}>
          {matchingIds.map(id => {
            // savedPreviews[id] is a fresh capture from the last time this
            // option was saved in the editor — take it over the off-screen
            // render below, which always reflects the brief's original
            // fields and would otherwise silently show pre-edit content
            // after a save (Julia's "preview doesn't show my changes" report,
            // 2026-08-07).
            const previewSrc = savedPreviews?.[id] ?? previews[id]
            return (
            <div
              key={id}
              onClick={() => toggleTick(id)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                padding: 14, borderRadius: 12, position: 'relative',
                border: `1.5px solid ${ticked[id] ? 'var(--primary)' : 'var(--border)'}`,
                background: ticked[id] ? 'var(--primary-glow)' : '#fff',
                cursor: 'pointer', width: 240,
              }}
            >
              <div style={{
                position: 'absolute', top: 10, left: 10, width: 22, height: 22, borderRadius: 6,
                border: `1.5px solid ${ticked[id] ? 'var(--primary)' : 'var(--border)'}`,
                background: ticked[id] ? 'var(--primary)' : '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 13, fontWeight: 700,
              }}>
                {ticked[id] && '✓'}
              </div>
              {previewSrc && <img src={previewSrc} alt={CANDIDATE_LABELS[id]} style={{ width: '100%', borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }} />}
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--dark)' }}>{CANDIDATE_LABELS[id]}</div>
            </div>
            )
          })}
        </div>

        {bothReady && (
          <>
            <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
              <button
                onClick={handleEdit}
                disabled={tickedIds.length !== 1}
                title={tickedIds.length !== 1 ? 'Tick exactly one design to edit it' : undefined}
                style={{
                  flex: 1, padding: '13px', fontSize: 14, fontWeight: 700, borderRadius: 10,
                  border: '1.5px solid var(--border)', background: '#fff',
                  color: tickedIds.length === 1 ? 'var(--dark)' : 'var(--light)',
                  cursor: tickedIds.length === 1 ? 'pointer' : 'not-allowed',
                }}
              >
                Edit
              </button>
              <button
                onClick={handleSend}
                disabled={!tickedIds.length || sending}
                style={{
                  flex: 1, padding: '13px', fontSize: 14, fontWeight: 700, borderRadius: 10, border: 'none',
                  background: tickedIds.length && !sending ? 'var(--primary)' : '#E5E7EB',
                  color: tickedIds.length && !sending ? '#fff' : 'var(--mid)',
                  cursor: tickedIds.length && !sending ? 'pointer' : 'not-allowed',
                }}
              >
                {sending ? 'Sending…' : tickedIds.length > 1 ? 'Send both for Review' : 'Send for Review'}
              </button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--light)', textAlign: 'center', marginTop: 8 }}>
              Send for Review skips editing — it goes straight out as-is.
            </div>
            <button onClick={onEdit} style={{ marginTop: 16, width: '100%', padding: '11px', fontSize: 13, fontWeight: 600, borderRadius: 8, border: '1px solid var(--border)', background: '#fff', color: 'var(--mid)', cursor: 'pointer' }}>
              ← Edit answers
            </button>
          </>
        )}
      </div>

      {/* Off-screen renders used only to capture a static PNG of each candidate
          — never shown. Only rendered for ids that actually matched (present
          in candidateFields), so picking just Option A in the preview popup
          doesn't still generate/capture Option B (Julia's fix request,
          2026-08-20). */}
      {candidateFields && (
        <div style={{ position: 'absolute', left: -9999, top: 0, width: 1, height: 1, overflow: 'hidden' }}>
          {candidateFields[OPTION_A_ID] && (
          <TemplateCanvas
            config={TEMPLATE_ZONES[OPTION_A_ID]}
            fields={candidateFields[OPTION_A_ID]}
            mode="non-designer"
            exportRef={exportRefA}
            onReady={() => capture(OPTION_A_ID, exportRefA)}
          />
          )}
          {candidateFields[OPTION_B_ID] && (
          <TemplateCanvas
            config={TEMPLATE_ZONES[OPTION_B_ID]}
            fields={candidateFields[OPTION_B_ID]}
            mode="non-designer"
            exportRef={exportRefB}
            onReady={() => capture(OPTION_B_ID, exportRefB)}
          />
          )}
        </div>
      )}
    </div>
  )
}
