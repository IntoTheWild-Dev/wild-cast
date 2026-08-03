import { useState, useEffect } from 'react'
import { getLibraryAssets } from '../lib/assetLibrary'

// "Nothing in the library yet" reads as broken if you don't know why — these
// folders only ever get populated by uploading through the Library page
// (Header nav → Library), since Option A/B have no sticker/QR zone to
// auto-upload one via the normal in-canvas flow. Julia hit exactly this
// (2026-08-03): reported the picker as "not functioning" when it was actually
// correctly showing a genuinely empty folder.
const EMPTY_HINTS = {
  stickers: 'No stickers uploaded yet. Go to Library (top nav) → upload a sticker/badge — it\'ll show up here right after.',
  'qr-codes': 'No QR codes uploaded yet for this partner. Go to Library (top nav) → upload a QR code — it\'ll show up here right after.',
  'product-images': 'No photos uploaded yet for this partner. Go to Library (top nav) → upload a product photo, or add one from inside the editor.',
}

// A compact "pick an existing asset from the shared Library" field — used for
// Sticker, QR code and Food photo in the briefing form. Deliberately does NOT
// support a fresh upload here (unlike the editor's ImageUpload) — the brief
// only ever picks from what's already in the Library, scoped to `folder` +
// `merchant`. Cannot be exercised against real data on local `vite dev` (no
// serverless layer for /api/library-assets) — only verified there with a
// mocked fetch; real verification needs the deployed app.
export default function LibraryAssetPickerField({ label, hint, folder, merchant, value, onSelect }) {
  const [open, setOpen] = useState(false)
  const [assets, setAssets] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    async function run() {
      setLoading(true)
      const all = await getLibraryAssets()
      if (cancelled) return
      setAssets(all.filter(a => a.folder === folder && (a.merchant || 'General') === (merchant || 'General')))
      setLoading(false)
    }
    run()
    return () => { cancelled = true }
  }, [open, folder, merchant])

  return (
    <div style={{ marginBottom: 22 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--dark)', marginBottom: 4 }}>{label}</label>
      {hint && <div style={{ fontSize: 12, color: 'var(--mid)', marginBottom: 8 }}>{hint}</div>}

      <div
        onClick={() => setOpen(true)}
        style={{ border: `1.5px dashed ${value ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 10, padding: '14px', cursor: 'pointer', background: value ? 'var(--primary-glow)' : '#FAFAF8', display: 'flex', alignItems: 'center', gap: 12 }}
      >
        {value ? (
          <>
            <img src={value.src} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6 }} />
            <span style={{ fontSize: 13, color: 'var(--primary)', fontWeight: 600 }}>{value.name} — click to change</span>
          </>
        ) : (
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--dark)' }}>Choose from library…</span>
        )}
      </div>

      {open && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 20, width: 480, maxWidth: '100%', maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--dark)', flex: 1 }}>Choose {label.toLowerCase()}</div>
              <button onClick={() => setOpen(false)} style={{ width: 26, height: 26, border: 'none', background: '#F3F4F6', borderRadius: '50%', cursor: 'pointer', fontSize: 14, color: 'var(--mid)', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {loading ? (
                <div style={{ fontSize: 12, color: 'var(--mid)', textAlign: 'center', padding: '30px 0' }}>Loading…</div>
              ) : assets.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--mid)', textAlign: 'center', padding: '30px 0', lineHeight: 1.5 }}>
                  {EMPTY_HINTS[folder] ?? 'Nothing in the library yet for this.'}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                  {assets.map(asset => (
                    <div key={asset.id} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <img
                        src={asset.src}
                        alt={asset.name}
                        title={asset.name}
                        onClick={() => { onSelect(asset); setOpen(false) }}
                        style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 6, cursor: 'pointer', border: '1.5px solid var(--border)' }}
                      />
                      <div style={{ fontSize: 10, color: 'var(--mid)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={asset.name}>{asset.name}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
