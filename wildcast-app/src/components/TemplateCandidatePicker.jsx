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

export default function TemplateCandidatePicker({ brief, onEdit, onPick }) {
  const [candidateFields, setCandidateFields] = useState(null) // null until resolved
  const [previews, setPreviews] = useState({}) // { [templateId]: pngDataUrl }
  const matchingIds = getMatchingTemplateIds(brief)
  const exportRefA = useRef(null)
  const exportRefB = useRef(null)

  useEffect(() => {
    let cancelled = false
    async function run() {
      if (!matchingIds.length) { setCandidateFields(null); return }
      const partnerName = resolvePartnerName(brief)
      const { logoUrl, photoUrl } = await fetchMerchantAssets(partnerName)
      if (cancelled) return
      const fields = buildCandidateFields(brief, { logoUrl, photoUrl })
      setCandidateFields({ [OPTION_A_ID]: fields, [OPTION_B_ID]: fields })
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
    onPick(template, candidateFields[templateId])
  }

  if (!matchingIds.length) {
    return <NoMatchFallback brief={brief} onEdit={onEdit} />
  }

  const bothReady = previews[OPTION_A_ID] && previews[OPTION_B_ID]

  return (
    <div style={{ flex: 1, background: 'var(--bg)', overflow: 'auto' }}>
      <div style={{ borderBottom: '1px solid var(--border)', padding: '28px 40px 24px', background: '#fff' }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--dark)' }}>Pick a design</h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--mid)', maxWidth: 520 }}>
          Generated from your brief. Pick one to fine-tune it.
        </p>
      </div>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 24px 60px' }}>
        {!bothReady && (
          <div style={{ textAlign: 'center', padding: '40px 0', fontSize: 13, color: 'var(--mid)' }}>
            Generating designs…
          </div>
        )}

        <div style={{ display: bothReady ? 'flex' : 'none', gap: 20, justifyContent: 'center' }}>
          {[OPTION_A_ID, OPTION_B_ID].map(id => (
            <button
              key={id}
              onClick={() => handlePick(id)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                padding: 14, borderRadius: 12, border: '1.5px solid var(--border)', background: '#fff',
                cursor: 'pointer', width: 240,
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
            >
              {previews[id] && <img src={previews[id]} alt={CANDIDATE_LABELS[id]} style={{ width: '100%', borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }} />}
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--dark)' }}>{CANDIDATE_LABELS[id]}</div>
            </button>
          ))}
        </div>

        {bothReady && (
          <button onClick={onEdit} style={{ marginTop: 24, width: '100%', padding: '11px', fontSize: 13, fontWeight: 600, borderRadius: 8, border: '1px solid var(--border)', background: '#fff', color: 'var(--mid)', cursor: 'pointer' }}>
            ← Edit answers
          </button>
        )}
      </div>

      {/* Off-screen renders used only to capture a static PNG of each candidate — never shown */}
      {candidateFields && (
        <div style={{ position: 'absolute', left: -9999, top: 0, width: 1, height: 1, overflow: 'hidden' }}>
          <TemplateCanvas
            config={TEMPLATE_ZONES[OPTION_A_ID]}
            fields={candidateFields[OPTION_A_ID]}
            mode="non-designer"
            exportRef={exportRefA}
            onReady={() => capture(OPTION_A_ID, exportRefA)}
          />
          <TemplateCanvas
            config={TEMPLATE_ZONES[OPTION_B_ID]}
            fields={candidateFields[OPTION_B_ID]}
            mode="non-designer"
            exportRef={exportRefB}
            onReady={() => capture(OPTION_B_ID, exportRefB)}
          />
        </div>
      )}
    </div>
  )
}
