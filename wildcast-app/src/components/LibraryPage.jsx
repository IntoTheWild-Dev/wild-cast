import { useState, useEffect, useMemo } from 'react'
import Select from './Select'
import { FOLDERS, GENERAL_MERCHANT, getLibraryAssets, saveAssetToLibrary, deleteLibraryAsset, renameLibraryAsset, uniqueMerchants } from '../lib/assetLibrary'
import { hasTransparency } from '../lib/image'

const ALL_MERCHANTS = '__all__'
const ALL_TYPES = '__all__'
const LAST_MERCHANT_KEY = 'wildcast_library_last_merchant'

// Folders a partner can upload straight into from this page — matches the
// same rules the canvas already enforces per zone type (logos: any JPG/PNG,
// product photos and stickers: must be a real transparent PNG, QR codes: no
// transparency requirement since QR generators commonly export flat PNGs).
const UPLOADABLE_FOLDERS = [
  { key: 'logos', label: 'Upload a logo', requireTransparent: false },
  { key: 'product-images', label: 'Upload a product photo', requireTransparent: true },
  { key: 'stickers', label: 'Upload a sticker / badge', requireTransparent: true },
  { key: 'qr-codes', label: 'Upload a QR code', requireTransparent: false },
]

// No specific print zone to check against here, so this is a general
// "will this look sharp in most print zones" heuristic, not an exact DPI figure.
const HI_RES_THRESHOLD = 1200

function formatDate(ts) {
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function EmptyState() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🖼️</div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--dark)', marginBottom: 6 }}>No assets yet</div>
        <div style={{ fontSize: 13, color: 'var(--mid)', maxWidth: 320 }}>
          Upload a logo or product photo above, or use one in the editor — either way it's saved here for reuse across designs.
        </div>
      </div>
    </div>
  )
}

// Asked for by name: clicking an upload button used to silently tag the new
// asset with whatever merchant happened to be selected in the page-level
// filter above — not obvious at all, took real figuring-out to notice that
// connection existed. Now it asks explicitly, every time, right where the
// decision actually needs to be made.
function MerchantPickerModal({ label, merchants, defaultMerchant, onCancel, onConfirm }) {
  const hasExisting = merchants.length > 0
  const [mode, setMode] = useState(hasExisting ? 'existing' : 'new')
  const [existingChoice, setExistingChoice] = useState(defaultMerchant || merchants[0] || '')
  const [newName, setNewName] = useState('')

  const subject = label.replace(/^Upload (a|an) /i, '')

  return (
    <div
      onClick={onCancel}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
    >
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 22, width: 380, maxWidth: '100%' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--dark)', marginBottom: 4 }}>Who is this {subject.toLowerCase()} for?</div>
        <div style={{ fontSize: 12, color: 'var(--mid)', marginBottom: 16 }}>Assets are organized by merchant so they don't get mixed up.</div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {hasExisting && (
            <button
              onClick={() => setMode('existing')}
              style={{
                flex: 1, padding: '9px 10px', fontSize: 12, fontWeight: 700, borderRadius: 8, cursor: 'pointer',
                border: mode === 'existing' ? '1.5px solid var(--primary)' : '1.5px solid var(--border)',
                background: mode === 'existing' ? 'var(--primary-glow)' : '#fff',
                color: mode === 'existing' ? 'var(--primary)' : 'var(--dark)',
              }}
            >
              Add to existing merchant
            </button>
          )}
          <button
            onClick={() => setMode('new')}
            style={{
              flex: 1, padding: '9px 10px', fontSize: 12, fontWeight: 700, borderRadius: 8, cursor: 'pointer',
              border: mode === 'new' ? '1.5px solid var(--primary)' : '1.5px solid var(--border)',
              background: mode === 'new' ? 'var(--primary-glow)' : '#fff',
              color: mode === 'new' ? 'var(--primary)' : 'var(--dark)',
            }}
          >
            Add new merchant
          </button>
        </div>

        {mode === 'existing' ? (
          <Select
            value={existingChoice}
            onChange={e => setExistingChoice(e.target.value)}
            style={{ width: '100%', padding: '9px 12px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', background: '#fff', color: 'var(--dark)', boxSizing: 'border-box' }}
          >
            {merchants.map(m => <option key={m} value={m}>{m}</option>)}
          </Select>
        ) : (
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="e.g. Wen Cheng"
            autoFocus
            style={{ width: '100%', padding: '9px 12px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', outline: 'none', boxSizing: 'border-box' }}
          />
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <button
            onClick={onCancel}
            style={{ flex: 1, padding: '10px', fontSize: 13, fontWeight: 600, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--mid)', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(mode === 'new' ? newName.trim() : existingChoice)}
            disabled={mode === 'new' && !newName.trim()}
            style={{
              flex: 2, padding: '10px', fontSize: 13, fontWeight: 700, borderRadius: 8, border: 'none',
              background: mode === 'new' && !newName.trim() ? '#E5E7EB' : 'var(--primary)',
              color: mode === 'new' && !newName.trim() ? 'var(--mid)' : '#fff',
              cursor: mode === 'new' && !newName.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            Continue to upload
          </button>
        </div>
      </div>
    </div>
  )
}

function UploadCard({ folderKey, label, requireTransparent, merchants, defaultMerchant, onUploaded }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [picking, setPicking] = useState(false)

  function runUpload(merchant) {
    setPicking(false)
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async e => {
      const file = e.target.files[0]
      if (!file) return
      setError(null)

      if (requireTransparent && file.type !== 'image/png') {
        setError('This image has a background — please upload a transparent PNG.')
        return
      }

      const url = URL.createObjectURL(file)

      if (requireTransparent) {
        const transparent = await hasTransparency(url)
        if (!transparent) {
          setError('This image has a background — please upload a transparent PNG.')
          URL.revokeObjectURL(url)
          return
        }
      }

      setBusy(true)
      await saveAssetToLibrary(folderKey, file.name, url, merchant)
      setBusy(false)
      onUploaded()
    }
    input.click()
  }

  return (
    <div style={{ marginBottom: 8 }}>
      <button
        onClick={() => setPicking(true)}
        disabled={busy}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 16px', borderRadius: 10,
          border: '1.5px dashed var(--border)', background: '#fff',
          cursor: busy ? 'default' : 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--dark)',
          opacity: busy ? 0.6 : 1,
        }}
      >
        <div style={{ width: 28, height: 28, background: 'var(--dark)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
        </div>
        {busy ? 'Uploading…' : label}
      </button>
      {error && (
        <div style={{ marginTop: 6, fontSize: 11, color: '#B91C1C' }}>✕ {error}</div>
      )}
      {picking && (
        <MerchantPickerModal
          label={label}
          merchants={merchants}
          defaultMerchant={defaultMerchant}
          onCancel={() => setPicking(false)}
          onConfirm={runUpload}
        />
      )}
    </div>
  )
}

function AssetCard({ asset, onDelete, onRename, onMove, allMerchants, showMerchant }) {
  const [dims, setDims] = useState(null)
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(asset.name)
  const [renaming, setRenaming] = useState(false)
  const [movingMerchant, setMovingMerchant] = useState(false)

  useEffect(() => {
    const img = new Image()
    img.onload = () => setDims({ w: img.naturalWidth, h: img.naturalHeight })
    img.src = asset.src
  }, [asset.src])

  const isHiRes = dims && Math.max(dims.w, dims.h) >= HI_RES_THRESHOLD

  async function commitRename() {
    setEditing(false)
    const trimmed = draftName.trim()
    if (!trimmed || trimmed === asset.name) { setDraftName(asset.name); return }
    setRenaming(true)
    await onRename(asset, trimmed)
    setRenaming(false)
  }

  return (
    <div
      style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', position: 'relative' }}
    >
      <div style={{
        aspectRatio: '1 / 1', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        background: asset.folder === 'logos' || asset.folder === 'stickers'
          ? 'repeating-conic-gradient(#f3f4f6 0% 25%, #fff 0% 50%) 50% / 16px 16px'
          : '#F3F4F6',
      }}>
        <img src={asset.src} alt={asset.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      </div>
      <div style={{ padding: '8px 10px' }}>
        {editing ? (
          <input
            autoFocus
            value={draftName}
            onChange={e => setDraftName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') { setDraftName(asset.name); setEditing(false) }
            }}
            style={{
              width: '100%', fontSize: 11, fontWeight: 600, color: 'var(--dark)',
              border: '1px solid var(--primary)', borderRadius: 4, padding: '1px 4px',
              boxSizing: 'border-box', outline: 'none',
            }}
          />
        ) : (
          <div
            onClick={() => !renaming && setEditing(true)}
            title={`${asset.name} — click to rename`}
            style={{ fontSize: 11, fontWeight: 600, color: 'var(--dark)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' }}
          >
            {renaming ? 'Renaming…' : asset.name}
          </div>
        )}
        <div style={{ fontSize: 10, color: 'var(--mid)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
          <span>{formatDate(asset.uploadedAt)}</span>
          {showMerchant && (
            movingMerchant ? (
              <select
                autoFocus
                defaultValue={asset.merchant || GENERAL_MERCHANT}
                onBlur={() => setMovingMerchant(false)}
                onChange={async e => {
                  const next = e.target.value
                  setMovingMerchant(false)
                  if (next !== (asset.merchant || GENERAL_MERCHANT)) await onMove(asset, next)
                }}
                style={{ fontSize: 10, border: '1px solid var(--primary)', borderRadius: 4, padding: '0 2px' }}
              >
                {allMerchants.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            ) : (
              <span
                onClick={() => setMovingMerchant(true)}
                title="Click to move to a different merchant"
                style={{ cursor: 'pointer', textDecoration: 'underline dotted' }}
              >
                · {asset.merchant || GENERAL_MERCHANT}
              </span>
            )
          )}
        </div>
        {dims && (
          <div style={{ fontSize: 10, marginTop: 3, color: isHiRes ? '#3F9C6D' : '#B7791F', fontWeight: 600 }}>
            {dims.w}×{dims.h}px {isHiRes ? '· High resolution ✓' : '· May be low-res for print'}
          </div>
        )}
      </div>
      <button
        onClick={() => onDelete(asset)}
        title="Remove from library"
        style={{
          position: 'absolute', top: 6, right: 6,
          width: 22, height: 22, borderRadius: '50%',
          background: 'rgba(0,0,0,0.45)', color: '#fff', border: 'none',
          cursor: 'pointer', fontSize: 12, lineHeight: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: 0, transition: 'opacity 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.opacity = '1'}
        onMouseLeave={e => e.currentTarget.style.opacity = '0'}
      >
        ×
      </button>
    </div>
  )
}

export default function LibraryPage() {
  const [assets, setAssets] = useState([])
  const [loading, setLoading] = useState(true)
  const [merchant, setMerchant] = useState(() => localStorage.getItem(LAST_MERCHANT_KEY) || GENERAL_MERCHANT)
  const [typeFilter, setTypeFilter] = useState(ALL_TYPES)
  const [search, setSearch] = useState('')

  async function refresh() {
    setAssets(await getLibraryAssets())
    setLoading(false)
  }

  useEffect(() => { refresh() }, [])

  function handleMerchantChange(next) {
    // Snap to an existing merchant's exact casing when typing a new one that
    // matches case-insensitively — mirrors the server-side snap that happens
    // on actual upload, so the view doesn't show an empty "new" merchant for
    // a moment before the first upload resolves it back to the real one.
    // Recomputed fresh from `assets` here (not the memoized `merchants` below)
    // so this plain event handler doesn't reference a useMemo'd value.
    const existing = uniqueMerchants(assets).find(m => m.toLowerCase() === next.toLowerCase())
    const resolved = existing || next
    setMerchant(resolved)
    if (resolved && resolved !== ALL_MERCHANTS) localStorage.setItem(LAST_MERCHANT_KEY, resolved)
  }

  async function handleDelete(asset) {
    setAssets(prev => prev.filter(a => a.id !== asset.id))
    await deleteLibraryAsset(asset.url)
  }

  async function handleRename(asset, newName) {
    const renamed = await renameLibraryAsset(asset.url, newName)
    if (renamed) setAssets(prev => prev.map(a => (a.id === asset.id ? renamed : a)))
  }

  // Moves an asset to a different merchant folder — e.g. consolidating a
  // stray "wen cheng" duplicate into the real "Wen Cheng".
  async function handleMove(asset, newMerchant) {
    const moved = await renameLibraryAsset(asset.url, asset.name, newMerchant)
    if (moved) setAssets(prev => prev.map(a => (a.id === asset.id ? moved : a)))
  }

  const merchants = useMemo(() => uniqueMerchants(assets), [assets])

  const viewAssets = useMemo(() => {
    const q = search.trim().toLowerCase()
    return assets
      .filter(a => merchant === ALL_MERCHANTS || (a.merchant || GENERAL_MERCHANT) === merchant)
      .filter(a => typeFilter === ALL_TYPES || a.folder === typeFilter)
      .filter(a => !q || a.name.toLowerCase().includes(q))
  }, [assets, merchant, typeFilter, search])

  // Default pre-fill for the upload picker's "existing merchant" dropdown —
  // whatever's currently being viewed, if it's a real merchant.
  const defaultUploadMerchant = merchant === ALL_MERCHANTS ? (merchants[0] || GENERAL_MERCHANT) : merchant

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'auto' }}>

      {/* Page header */}
      <div style={{ borderBottom: '1px solid var(--border)', padding: '28px 40px 24px', background: '#fff' }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--dark)' }}>Library</h1>
        <p style={{ margin: '6px 0 12px', fontSize: 13, color: 'var(--mid)' }}>
          {loading ? 'Loading…' : assets.length === 0
            ? 'Your uploaded logos and photos, ready to reuse across designs.'
            : `${assets.length} saved asset${assets.length === 1 ? '' : 's'}`}
        </p>

        {/* Merchant — filters which assets are shown below. Which merchant a
            NEW upload gets tagged with is asked explicitly in a pop-up when
            you click one of the upload buttons, not decided by this filter. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--mid)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Viewing
          </label>
          <Select
            value={merchant}
            onChange={e => handleMerchantChange(e.target.value)}
            style={{ fontSize: 13, fontWeight: 600, color: 'var(--dark)', padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: '#fff' }}
          >
            <option value={ALL_MERCHANTS}>All merchants</option>
            {merchants.map(m => <option key={m} value={m}>{m}</option>)}
          </Select>
          <Select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            style={{ fontSize: 13, fontWeight: 600, color: 'var(--dark)', padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: '#fff' }}
          >
            <option value={ALL_TYPES}>All types</option>
            {Object.entries(FOLDERS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </Select>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name…"
            style={{ marginLeft: 'auto', fontSize: 13, padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: '#fff', width: 200 }}
          />
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {UPLOADABLE_FOLDERS.map(f => (
            <UploadCard key={f.key} folderKey={f.key} label={f.label} requireTransparent={f.requireTransparent} merchants={merchants} defaultMerchant={defaultUploadMerchant} onUploaded={refresh} />
          ))}
        </div>
      </div>

      {!loading && assets.length === 0 ? (
        <EmptyState />
      ) : !loading && viewAssets.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
          <div style={{ fontSize: 13, color: 'var(--mid)', textAlign: 'center' }}>
            No assets match {search.trim() ? `"${search.trim()}"` : 'these filters'}.
          </div>
        </div>
      ) : (
        <div style={{ padding: '32px 40px' }}>
          {Object.entries(FOLDERS).map(([folderKey, folderLabel]) => {
            const folderAssets = viewAssets.filter(a => a.folder === folderKey)
            if (folderAssets.length === 0) return null
            return (
              <div key={folderKey} style={{ marginBottom: 36 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--mid)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
                  {folderLabel} · {folderAssets.length}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 16 }}>
                  {folderAssets.map(asset => (
                    <AssetCard key={asset.id} asset={asset} onDelete={handleDelete} onRename={handleRename} onMove={handleMove} allMerchants={merchants} showMerchant={merchant === ALL_MERCHANTS} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

    </div>
  )
}
