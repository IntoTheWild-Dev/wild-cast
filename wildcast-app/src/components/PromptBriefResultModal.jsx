import { useState, useEffect, useRef } from 'react'
import TemplateCanvas from './TemplateCanvas'
import { assembleBrief, partnerNameFrom } from '../lib/promptBriefFlow'
import { buildCandidateFields, fetchMerchantAssets } from '../lib/briefToCandidates'

// Last step of the Prompt Brief chat (Julia's ask, 2026-09-19): once the chat
// has every answer it shows the finished template with two exits - Edit (into
// the editor) or Send for review. The preview is the real template rendered
// with the answers (same off-screen TemplateCanvas + getPng capture
// TemplateCandidatePicker uses), so it does not depend on any AI; the
// template's stock thumb stays as the fallback if the render can't happen.
// TemplateCanvas's onReady fires once text is placed but image zones load in
// a later step, so the capture waits a beat before reading the PNG.
const CAPTURE_DELAY_MS = 1600

function SummaryRow({ row }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '9px 0', borderBottom: '1px solid var(--border)', alignItems: 'flex-start' }}>
      <div style={{ width: 112, flexShrink: 0, fontSize: 12, fontWeight: 700, color: 'var(--mid)', paddingTop: 1 }}>{row.label}</div>
      <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: row.value || row.imageUrl ? 'var(--dark)' : 'var(--light)', lineHeight: 1.45, wordBreak: 'break-word' }}>
        {row.imageUrl ? (
          <img src={row.imageUrl} alt={row.label} style={{ height: 44, maxWidth: 120, objectFit: 'contain', borderRadius: 6, border: '1px solid var(--border)', background: '#F3F4F6' }} />
        ) : (row.value || 'Skipped, add it in the editor')}
      </div>
    </div>
  )
}

export default function PromptBriefResultModal({ entry, config, answers, rows, onEdit, onClose }) {
  const [sent, setSent] = useState(false)
  const [fields, setFields] = useState(null)
  const [png, setPng] = useState(null)
  const exportRef = useRef(null)
  const captureTimer = useRef(null)

  useEffect(() => {
    let cancelled = false
    async function resolveFields() {
      const brief = assembleBrief(answers, entry)
      let logoUrl = brief.logoUrl
      if (!logoUrl && answers.logo?.value === '__library__') {
        logoUrl = (await fetchMerchantAssets(partnerNameFrom(answers))).logoUrl
      }
      if (cancelled) return
      setFields(buildCandidateFields(brief, { logoUrl, photoUrl: brief.photoUrl }))
    }
    resolveFields()
    return () => { cancelled = true; clearTimeout(captureTimer.current) }
  }, [answers, entry])

  function scheduleCapture() {
    clearTimeout(captureTimer.current)
    captureTimer.current = setTimeout(() => {
      const data = exportRef.current?.getPng?.()
      if (data) setPng(data)
    }, CAPTURE_DELAY_MS)
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 250, background: 'rgba(17,17,17,0.25)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 860, maxHeight: '92vh', overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ overflowY: 'auto', minHeight: 0, padding: 28 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
                {sent ? 'Sent' : 'All done'}
              </div>
              <h3 style={{ fontSize: 22, fontWeight: 800, color: 'var(--dark)', margin: 0, letterSpacing: '-0.02em' }}>
                {sent ? 'Your design is on its way to review' : 'Your design is ready'}
              </h3>
            </div>
            <button
              type="button" onClick={onClose} aria-label="Back to chat"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--light)', lineHeight: 1, padding: 4 }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--dark)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--light)'}
            >
              ×
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 28, alignItems: 'start' }}>
            <div>
              <div style={{ position: 'relative', background: '#F3F4F6', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', maxWidth: 320, margin: '0 auto', boxShadow: '0 8px 28px rgba(0,0,0,0.10)', ...(png ? {} : { aspectRatio: '1191 / 1679' }) }}>
                {png
                  ? <img src={png} alt={entry.label} style={{ display: 'block', width: '100%', height: 'auto' }} />
                  : <img src={entry.thumb} alt={entry.label} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: config ? 0.55 : 1 }} />}
                {!png && config && (
                  <div style={{ position: 'absolute', left: 0, right: 0, bottom: 14, textAlign: 'center' }}>
                    <span style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 999, padding: '6px 14px', fontSize: 12, fontWeight: 600, color: 'var(--mid)' }}>
                      Filling in your design…
                    </span>
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--mid)', marginTop: 10 }}>{png ? entry.label : `${entry.label} · sample preview`}</div>
            </div>

            <div>
              {sent ? (
                <div style={{ background: 'var(--primary-glow)', border: '1.5px solid var(--primary)', borderRadius: 12, padding: '16px 18px' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--dark)', marginBottom: 4 }}>Prototype only</div>
                  <div style={{ fontSize: 13, color: 'var(--dark)', lineHeight: 1.55 }}>
                    Nothing was actually sent. Once this is hooked up, this step saves the design and notifies the reviewer.
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--dark)', marginBottom: 2 }}>What went into it</div>
                  <div style={{ marginBottom: 20 }}>
                    {rows.map(r => <SummaryRow key={r.id} row={r} />)}
                  </div>
                </>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: sent ? 16 : 0 }}>
                {!sent && (
                  <>
                    <button
                      type="button" onClick={onEdit}
                      style={{ width: '100%', padding: '13px', fontSize: 14, fontWeight: 700, background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      Edit design
                    </button>
                    <button
                      type="button" onClick={() => setSent(true)}
                      style={{ width: '100%', padding: '12px', fontSize: 14, fontWeight: 700, background: '#fff', color: 'var(--primary)', border: '1.5px solid var(--primary)', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      Send for review
                    </button>
                  </>
                )}
                <button
                  type="button" onClick={sent ? () => setSent(false) : onClose}
                  style={{ width: '100%', padding: '10px', fontSize: 13, fontWeight: 600, background: 'transparent', color: 'var(--mid)', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  {sent ? '← Back' : 'Back to chat'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {fields && config && (
        <div style={{ position: 'absolute', left: -9999, top: 0, width: 1, height: 1, overflow: 'hidden' }}>
          <TemplateCanvas config={config} fields={fields} mode="non-designer" exportRef={exportRef} onReady={scheduleCapture} />
        </div>
      )}
    </div>
  )
}
