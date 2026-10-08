import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { setRemoveBackgroundPrompt } from '../lib/removeBackground'

// "Remove the background?" asked after an image is picked, before anything is
// sent to Photoroom (Anang's ask, 2026-10-08: removal used to happen
// automatically on every upload). Mounted once in main.jsx; upload code asks
// through askRemoveBackground() in lib/removeBackground.js. Several uploads
// asking at once (e.g. a drop while another is pending) are answered in turn.
// Same look as LibraryPage's DeleteAssetConfirmModal.
export default function RemoveBgPrompt() {
  const [queue, setQueue] = useState([])

  useEffect(() => setRemoveBackgroundPrompt((file, { requireTransparent } = {}) => new Promise(resolve => {
    setQueue(prev => [...prev, { id: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file), requireTransparent, resolve }])
  })), [])

  const current = queue[0]
  if (!current) return null

  function answer(removeBg) {
    URL.revokeObjectURL(current.previewUrl)
    current.resolve(removeBg)
    setQueue(prev => prev.slice(1))
  }

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="remove-bg-title"
        style={{ background: '#fff', borderRadius: 16, padding: 28, maxWidth: 380, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', textAlign: 'center', boxSizing: 'border-box' }}
      >
        <div style={{ height: 160, borderRadius: 10, marginBottom: 16, border: '1px solid var(--border)', background: 'repeating-conic-gradient(#F3F4F6 0% 25%, #fff 0% 50%) 50% / 16px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          <img src={current.previewUrl} alt={current.file.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }} />
        </div>
        <div id="remove-bg-title" style={{ fontWeight: 800, fontSize: 17, color: 'var(--dark)', marginBottom: 6 }}>Remove the background?</div>
        <div style={{ fontSize: 13, color: 'var(--mid)', lineHeight: 1.6, marginBottom: 20, overflowWrap: 'anywhere' }}>
          "{current.file.name}" can be cut out automatically, or used as it is.
          {current.requireTransparent && ' This spot works best with a transparent image.'}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => answer(false)}
            style={{ flex: 1, padding: '11px', fontSize: 13, fontWeight: 700, background: '#fff', color: 'var(--dark)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer' }}
          >
            Keep original
          </button>
          <button
            autoFocus
            onClick={() => answer(true)}
            style={{ flex: 1, padding: '11px', fontSize: 13, fontWeight: 700, background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}
          >
            Remove background
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
