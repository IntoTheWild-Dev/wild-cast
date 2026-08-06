import { useState, useEffect } from 'react'
import { getLibraryAssets, saveAssetToLibrary, libraryAssetSrc } from '../lib/assetLibrary'
import { hasTransparency } from '../lib/image'

// "Nothing in the library yet" reads as broken if you don't know why — these
// folders only ever get populated by uploading through the Library page
// (Header nav → Library), since Option A/B have no sticker/QR zone to
// auto-upload one via the normal in-canvas flow. Julia hit exactly this
// (2026-08-03): reported the picker as "not functioning" when it was actually
// correctly showing a genuinely empty folder.
const EMPTY_HINTS = {
  stickers: 'No stickers uploaded yet. Upload one below, or go to Library (top nav).',
  'qr-codes': 'No QR codes uploaded yet for this partner. Upload one below, or go to Library (top nav).',
  'product-images': 'No photos uploaded yet for this partner. Upload one below, or go to Library (top nav).',
}

// A compact "pick an existing asset from the shared Library, or upload a new
// one" field — used for Sticker, QR code and Food photo in the briefing
// form. Uploads go through the exact same validation as everywhere else in
// the app (see LibraryPage.jsx's UPLOADABLE_FOLDERS / lib/image.js's
// hasTransparency): requireTransparent fields must be a real transparent
// PNG, not a flattened image with a solid background — same "no misfit
// backgrounds" rule Julia set for the canvas/Library page uploads. A
// successful upload both saves to the shared Library AND selects it for
// this field in one step, since picking is the point here (unlike the
// Library page's plain "add to library").
export default function LibraryAssetPickerField({ label, hint, folder, merchant, value, onSelect, requireTransparent }) {
  const [open, setOpen] = useState(false)
  const [assets, setAssets] = useState([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)

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

  function handleUploadClick() {
    setUploadError(null)
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async e => {
      const file = e.target.files[0]
      if (!file) return

      if (requireTransparent && file.type !== 'image/png') {
        setUploadError('This image has a background — please upload a transparent PNG.')
        return
      }

      const blobUrl = URL.createObjectURL(file)

      if (requireTransparent) {
        const transparent = await hasTransparency(blobUrl)
        if (!transparent) {
          setUploadError('This image has a background — please upload a transparent PNG.')
          URL.revokeObjectURL(blobUrl)
          return
        }
      }

      setUploading(true)
      const saved = await saveAssetToLibrary(folder, file.name, blobUrl, merchant)
      URL.revokeObjectURL(blobUrl)
      setUploading(false)

      if (!saved) {
        setUploadError('Upload failed — please try again.')
        return
      }

      const asset = { ...saved, src: libraryAssetSrc(saved.url) }
      onSelect(asset)
      setOpen(false)
    }
    input.click()
  }

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
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--dark)' }}>Choose from library or upload…</span>
        )}
      </div>

      {open && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 20, width: 480, maxWidth: '100%', maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--dark)', flex: 1 }}>Choose {label.toLowerCase()}</div>
              <button onClick={() => setOpen(false)} style={{ width: 26, height: 26, border: 'none', background: '#F3F4F6', borderRadius: '50%', cursor: 'pointer', fontSize: 14, color: 'var(--mid)', lineHeight: 1 }}>×</button>
            </div>

            <button
              type="button"
              onClick={handleUploadClick}
              disabled={uploading}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '10px 14px', borderRadius: 10, marginBottom: 12,
                border: '1.5px dashed var(--border)', background: '#FAFAF8',
                cursor: uploading ? 'default' : 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--dark)',
                opacity: uploading ? 0.6 : 1,
              }}
            >
              {uploading ? 'Uploading…' : `↑ Upload from computer${requireTransparent ? ' (transparent PNG)' : ''}`}
            </button>
            {uploadError && (
              <div style={{ marginBottom: 12, fontSize: 11, color: '#B91C1C' }}>✕ {uploadError}</div>
            )}

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
