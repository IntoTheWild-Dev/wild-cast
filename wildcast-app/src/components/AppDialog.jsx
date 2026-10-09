import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { setDialogOpener } from '../lib/dialog'

// Draws showAlert / showConfirm / showPrompt from lib/dialog.js - the app's
// stand-in for the browser's native popups. Mounted once in main.jsx; several
// dialogs asked at once are shown in turn. Same look as Header.jsx's Sign out
// popup. Enter confirms, Escape cancels, a click outside cancels.
export default function AppDialog() {
  const [queue, setQueue] = useState([])

  useEffect(() => setDialogOpener(dialog => new Promise(resolve => {
    setQueue(prev => [...prev, { ...dialog, id: crypto.randomUUID(), resolve }])
  })), [])

  const current = queue[0]
  if (!current) return null

  function done(result) {
    current.resolve(result)
    setQueue(prev => prev.slice(1))
  }

  // Keyed by id so each dialog starts with its own input value and focus.
  return createPortal(<DialogBox key={current.id} dialog={current} onDone={done} />, document.body)
}

function DialogBox({ dialog, onDone }) {
  const [value, setValue] = useState(dialog.defaultValue ?? '')
  const inputRef = useRef(null)
  const okRef = useRef(null)

  useEffect(() => {
    // Focus after paint so the click that opened it doesn't steal it back.
    const t = setTimeout(() => (dialog.kind === 'prompt' ? inputRef.current?.select() : okRef.current?.focus()), 0)
    return () => clearTimeout(t)
  }, [dialog.kind])

  function close(confirmed) {
    onDone(dialog.kind === 'confirm' ? confirmed
      : dialog.kind === 'prompt' ? (confirmed ? value.trim() : null)
        : undefined)
  }

  const isAlert = dialog.kind === 'alert'
  // A prompt's message is its question, so it reads as the title.
  const title = dialog.title ?? (dialog.kind === 'prompt' ? dialog.message : null)
  const body = dialog.kind === 'prompt' && !dialog.title ? null : dialog.message

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={() => close(false)}
      onKeyDown={e => {
        if (e.key === 'Escape') { e.preventDefault(); close(false) }
        if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') { e.preventDefault(); close(true) }
      }}
    >
      <div
        role={isAlert ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-label={title ?? undefined}
        style={{ background: '#fff', borderRadius: 16, padding: 28, maxWidth: 380, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', textAlign: 'center', boxSizing: 'border-box' }}
        onClick={e => e.stopPropagation()}
      >
        {title && <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--dark)', marginBottom: 6, overflowWrap: 'anywhere' }}>{title}</div>}
        {body && (
          <div style={{ fontSize: 13, color: title ? 'var(--mid)' : 'var(--dark)', lineHeight: 1.6, marginBottom: 20, whiteSpace: 'pre-line', overflowWrap: 'anywhere', textAlign: body.includes('\n') ? 'left' : 'center' }}>
            {body}
          </div>
        )}
        {dialog.kind === 'prompt' && (
          <input
            ref={inputRef}
            value={value}
            placeholder={dialog.placeholder ?? ''}
            onChange={e => setValue(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', fontSize: 14, borderRadius: 8, border: '1px solid var(--border)', marginTop: body ? 0 : 10, marginBottom: 20, fontFamily: 'inherit', color: 'var(--dark)' }}
          />
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          {!isAlert && (
            <button
              onClick={() => close(false)}
              style={{ flex: 1, padding: '11px', fontSize: 13, fontWeight: 700, background: '#fff', color: 'var(--dark)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer' }}
            >
              {dialog.cancelLabel ?? 'Cancel'}
            </button>
          )}
          <button
            ref={okRef}
            onClick={() => close(true)}
            style={{ flex: 1, padding: '11px', fontSize: 13, fontWeight: 700, background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}
          >
            {dialog.confirmLabel ?? 'OK'}
          </button>
        </div>
      </div>
    </div>
  )
}
