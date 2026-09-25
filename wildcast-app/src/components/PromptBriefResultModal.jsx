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

export default function PromptBriefResultModal({ entry, config, answers, rows, onEdit, onClose, onSendForReview, onOpenLibrary, onNewBrief }) {
  // Send for review: onSendForReview({ brief, fields, png }) saves the design
  // (without opening the editor) and resolves { url } - the shareable review
  // link. sentUrl is kept so going Back and pressing Send again shows the same
  // link instead of saving a second copy.
  const [view, setView] = useState('summary') // 'summary' | 'sent'
  const [confirming, setConfirming] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState(null)
  const [sentUrl, setSentUrl] = useState(null)
  const [copied, setCopied] = useState(false)
  const [brief, setBrief] = useState(null)
  const sent = view === 'sent'
  const [fields, setFields] = useState(null)
  const [png, setPng] = useState(null)
  const [autoLogo, setAutoLogo] = useState(false)
  const exportRef = useRef(null)
  const captureTimer = useRef(null)

  useEffect(() => {
    let cancelled = false
    async function resolveFields() {
      const built = assembleBrief(answers, entry)
      // Same as the editor hand-off (App.jsx): with no logo given, use the
      // partner's own logo from Assets if they have one, so what you preview
      // here is what Edit design opens with.
      let logoUrl = built.logoUrl
      if (!logoUrl) {
        logoUrl = (await fetchMerchantAssets(partnerNameFrom(answers))).logoUrl
        if (logoUrl && !cancelled) setAutoLogo(true)
      }
      if (cancelled) return
      setBrief(built)
      setFields(buildCandidateFields(built, { logoUrl, photoUrl: built.photoUrl }))
    }
    resolveFields()
    return () => { cancelled = true; clearTimeout(captureTimer.current) }
  }, [answers, entry])

  const canSend = !!png && !!fields && !!brief && !!onSendForReview && !sending

  async function send() {
    if (sentUrl) { setView('sent'); return }
    setSendError(null)
    setSending(true)
    try {
      const { url } = await onSendForReview({ brief, fields, png })
      setSentUrl(url)
      setConfirming(false)
      setView('sent')
    } catch (err) {
      setSendError(err?.message || 'Something went wrong.')
    } finally {
      setSending(false)
    }
  }

  async function copyLink() {
    try { await navigator.clipboard.writeText(sentUrl) } catch { /* clipboard blocked - link is still selectable */ }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

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
                {sent ? 'Saved and ready for review' : 'Your design is ready'}
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
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--dark)', marginBottom: 6 }}>Review link</div>
                  <div style={{ fontSize: 13, color: 'var(--mid)', lineHeight: 1.55, marginBottom: 14 }}>
                    Send this link to your client or team. They can view the design and leave comments. It's also saved in your Design library.
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      value={sentUrl ?? ''} readOnly onClick={e => e.target.select()}
                      style={{ flex: 1, minWidth: 0, padding: '10px 12px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 8, background: '#F9FAFB', color: 'var(--dark)', fontFamily: 'inherit' }}
                    />
                    <button
                      type="button" onClick={copyLink}
                      style={{ padding: '10px 16px', background: copied ? '#16a34a' : 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700, flexShrink: 0, transition: 'background 0.2s', minWidth: 78, fontFamily: 'inherit' }}
                    >
                      {copied ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--dark)', marginBottom: 2 }}>What went into it</div>
                  <div style={{ marginBottom: 20 }}>
                    {rows.map(r => (
                      <SummaryRow key={r.id} row={r.id === 'logo' && !r.value && !r.imageUrl && autoLogo ? { ...r, value: "Your partner's logo from Assets" } : r} />
                    ))}
                  </div>
                </>
              )}

              {sendError && !sent && (
                <div style={{ fontSize: 12, color: '#B91C1C', marginBottom: 10, lineHeight: 1.5 }}>
                  Couldn't send for review: {sendError}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: sent ? 16 : 0 }}>
                {sent && (
                  <>
                    <button
                      type="button" onClick={onOpenLibrary}
                      style={{ width: '100%', padding: '13px', fontSize: 14, fontWeight: 700, background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      Open Design library
                    </button>
                    <button
                      type="button" onClick={onNewBrief}
                      style={{ width: '100%', padding: '12px', fontSize: 14, fontWeight: 700, background: '#fff', color: 'var(--primary)', border: '1.5px solid var(--primary)', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      Start another brief
                    </button>
                  </>
                )}
                {!sent && !confirming && (
                  <>
                    <button
                      type="button" onClick={onEdit}
                      style={{ width: '100%', padding: '13px', fontSize: 14, fontWeight: 700, background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      Edit design
                    </button>
                    <button
                      type="button" disabled={!sentUrl && !canSend} onClick={() => (sentUrl ? setView('sent') : setConfirming(true))}
                      style={{ width: '100%', padding: '12px', fontSize: 14, fontWeight: 700, background: '#fff', color: !sentUrl && !canSend ? 'var(--light)' : 'var(--primary)', border: `1.5px solid ${!sentUrl && !canSend ? 'var(--border)' : 'var(--primary)'}`, borderRadius: 10, cursor: !sentUrl && !canSend ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
                    >
                      {sentUrl ? 'View review link' : (!png && config ? 'Preparing preview…' : 'Send for review')}
                    </button>
                  </>
                )}
                {!sent && confirming && (
                  <div style={{ background: 'var(--primary-glow)', border: '1.5px solid var(--primary)', borderRadius: 12, padding: '14px 16px' }}>
                    <div style={{ fontSize: 13, color: 'var(--dark)', lineHeight: 1.5, marginBottom: 12 }}>
                      Save this design to your Design library and create a shareable review link?
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button" onClick={send} disabled={sending}
                        style={{ flex: 1, padding: '11px', fontSize: 13, fontWeight: 700, background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 10, cursor: sending ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: sending ? 0.7 : 1 }}
                      >
                        {sending ? 'Saving…' : 'Yes, send for review'}
                      </button>
                      <button
                        type="button" onClick={() => { setConfirming(false); setSendError(null) }} disabled={sending}
                        style={{ padding: '11px 16px', fontSize: 13, fontWeight: 600, background: '#fff', color: 'var(--mid)', border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                <button
                  type="button" onClick={sent ? () => setView('summary') : onClose}
                  style={{ width: '100%', padding: '11px', fontSize: 13, fontWeight: 600, background: '#fff', color: 'var(--dark)', border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  {sent ? 'Back' : 'Back to chat'}
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
