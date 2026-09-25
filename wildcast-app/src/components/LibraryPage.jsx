import { useState, useEffect, useMemo, Fragment } from 'react'
import Select from './Select'
import ChoiceButton from './ChoiceButton'
import { HugeiconsIcon } from '@hugeicons/react'
import { Delete02Icon } from '@hugeicons/core-free-icons'
import { FOLDERS, GENERAL_MERCHANT, getLibraryAssets, saveAssetToLibrary, deleteLibraryAsset, renameLibraryAsset, uniqueMerchants, removeBackgroundForUpload, LIBRARY_MAX_DIM } from '../lib/assetLibrary'
import { FRAME_PRESETS, imageSize, resizeToFrame } from '../lib/image'
import { AUTO_REMOVE_BG_NOTE, shouldRemoveBackground, isAlreadyCutOut } from '../lib/removeBackground'
import { PAGE_PADDING_X } from '../lib/layout'
import PageSpinner from './PageSpinner'

const ALL_MERCHANTS = '__all__'
const ALL_TYPES = '__all__'
const LAST_MERCHANT_KEY = 'wildcast_library_last_merchant'

// Folders a partner can upload straight into from this page. Every upload
// except QR codes gets its background removed automatically (see
// lib/removeBackground.js). requireTransparent now only decides what happens
// if that removal fails: product photos and stickers can't fall back to the
// original with its background, logos can.
const UPLOADABLE_FOLDERS = [
  { key: 'logos', label: 'Upload a logo', requireTransparent: false },
  { key: 'product-images', label: 'Upload a product photo', requireTransparent: true },
  { key: 'stickers', label: 'Upload a discount badge', requireTransparent: true },
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
          Upload a logo or product photo above, or use one in the editor - either way it's saved here for reuse across designs.
        </div>
      </div>
    </div>
  )
}

// Asked for by name: clicking an upload button used to silently tag the new
// asset with whatever merchant happened to be selected in the page-level
// filter above - not obvious at all, took real figuring-out to notice that
// connection existed. Now it asks explicitly, every time, right where the
// decision actually needs to be made.
//
// Several images at once, processed in one go (Anang's ask, 2026-09-25,
// modelled on wild-scale): files are chosen BEFORE this opens, shown as a
// grid (more can be added, any removed), and each one's background removal
// + framing + save runs with its own status. Up to UPLOAD_CONCURRENCY run
// at a time - same limit wild-scale uses.
//
// Frame size, like wild-scale: two presets or Custom / Original. The default
// keeps every image at its own size (capped to what the Library stores -
// LIBRARY_MAX_DIM). With one image the width/height boxes show that size;
// typing a size applies it to every image.
const UPLOAD_CONCURRENCY = 3

// Turns picked Files into grid items: preview URL (kept alive while the
// modal is open), real size, and whether it's already cut out (the "NO BG"
// badge - those skip Photoroom, see lib/removeBackground.js).
async function loadUploadItems(files, checkCutOut) {
  const items = []
  for (const file of files) {
    const previewUrl = URL.createObjectURL(file)
    try {
      const size = await imageSize(previewUrl)
      const alreadyCutOut = checkCutOut ? await isAlreadyCutOut(previewUrl).catch(() => false) : false
      items.push({ id: crypto.randomUUID(), file, previewUrl, size, alreadyCutOut, status: 'waiting', error: null })
    } catch {
      URL.revokeObjectURL(previewUrl)
    }
  }
  return items
}

function cappedSize({ width, height }) {
  const cap = Math.min(1, LIBRARY_MAX_DIM / Math.max(width, height))
  return { width: Math.round(width * cap), height: Math.round(height * cap) }
}

function pickImageFiles(onPicked) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.multiple = true
  input.onchange = e => {
    const files = [...(e.target.files ?? [])].filter(f => f.type.startsWith('image/'))
    if (files.length) onPicked(files)
  }
  input.click()
}

const STATUS_LABEL = {
  'remove-bg': 'Removing background…',
  resize: 'Resizing…',
  save: 'Saving…',
  done: 'Uploaded',
}

function UploadModal({ label, merchants, defaultMerchant, removesBackground, initialItems, onClose, onUploadItem }) {
  const hasExisting = merchants.length > 0
  const [mode, setMode] = useState(hasExisting ? 'existing' : 'new')
  const [existingChoice, setExistingChoice] = useState(defaultMerchant || merchants[0] || '')
  const [newName, setNewName] = useState('')
  const [items, setItems] = useState(initialItems)
  const [adding, setAdding] = useState(false)

  const [preset, setPreset] = useState(null) // null = Custom / Original
  const [customSize, setCustomSize] = useState(null) // null = each image keeps its own size
  const clampDim = v => Math.min(LIBRARY_MAX_DIM, Math.max(1, parseInt(v, 10) || 1))
  const single = items.length === 1
  // What the width/height boxes show while nothing's been typed: one image's
  // own size, or blank ("Original") for several different ones.
  const shownSize = preset ?? customSize ?? (single ? cappedSize(items[0].size) : null)

  const [processing, setProcessing] = useState(false)
  const merchantName = mode === 'new' ? newName.trim() : existingChoice
  const pendingItems = items.filter(i => i.status !== 'done')
  const failedCount = items.filter(i => i.status === 'error').length
  const doneCount = items.filter(i => i.status === 'done').length
  const canSubmit = !!merchantName && !processing && pendingItems.length > 0
  const toRemove = items.filter(i => !i.alreadyCutOut).length

  const subject = label.replace(/^Upload (a|an) /i, '').toLowerCase()
  const plural = items.length > 1

  function updateItem(id, patch) {
    setItems(prev => prev.map(i => (i.id === id ? { ...i, ...patch } : i)))
  }

  function removeItem(id) {
    setItems(prev => {
      const gone = prev.find(i => i.id === id)
      if (gone) URL.revokeObjectURL(gone.previewUrl)
      return prev.filter(i => i.id !== id)
    })
  }

  function handleAddMore() {
    pickImageFiles(async files => {
      setAdding(true)
      const more = await loadUploadItems(files, removesBackground)
      setItems(prev => [...prev, ...more])
      setAdding(false)
    })
  }

  function handleSizeInput(dim, value) {
    const n = clampDim(value)
    setCustomSize(prev => {
      const base = prev ?? shownSize ?? { width: n, height: n }
      return { ...base, [dim]: n }
    })
  }

  function frameFor(item) {
    const size = preset ?? customSize ?? cappedSize(item.size)
    return { ...size, centreContent: !!preset }
  }

  async function handleUpload() {
    setProcessing(true)
    const queue = items.filter(i => i.status !== 'done')
    queue.forEach(i => updateItem(i.id, { status: 'waiting', error: null }))
    const results = []
    async function worker() {
      while (queue.length) {
        const item = queue.shift()
        try {
          await onUploadItem(item, merchantName, frameFor(item), status => updateItem(item.id, { status }))
          updateItem(item.id, { status: 'done' })
          results.push(true)
        } catch (err) {
          updateItem(item.id, { status: 'error', error: err.message })
          results.push(false)
        }
      }
    }
    await Promise.all(Array.from({ length: UPLOAD_CONCURRENCY }, worker))
    setProcessing(false)
    // Everything through -> close. Any failure keeps the modal open with
    // those items marked, so they can be retried (done ones aren't redone).
    if (results.every(Boolean)) close(true)
  }

  function close(uploadedSomething = doneCount > 0) {
    items.forEach(i => URL.revokeObjectURL(i.previewUrl))
    onClose(uploadedSomething)
  }

  const inputStyle = locked => ({ width: '100%', padding: '9px 30px 9px 12px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', outline: 'none', boxSizing: 'border-box', background: locked ? '#F9FAFB' : '#fff', color: locked ? 'var(--light)' : 'var(--dark)', cursor: locked ? 'not-allowed' : 'text' })

  return (
    <div
      onClick={processing ? undefined : () => close()}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
    >
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 32, width: 760, maxWidth: '100%', maxHeight: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--dark)', marginBottom: 4 }}>
          Who {plural ? `are these ${subject}s` : `is this ${subject}`} for?
        </div>
        <div style={{ fontSize: 12, color: 'var(--mid)', marginBottom: removesBackground ? 10 : 16 }}>Assets are organized by merchant so they don't get mixed up.</div>
        {removesBackground && (
          <div style={{ fontSize: 12, color: 'var(--dark)', background: 'var(--primary-glow)', borderRadius: 8, padding: '8px 10px', marginBottom: 16, lineHeight: 1.45 }}>
            {AUTO_REMOVE_BG_NOTE}
          </div>
        )}

        {/* Images - the originals as picked, before any processing. */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--dark)' }}>
            Images <span style={{ fontWeight: 500, color: 'var(--mid)' }}>({items.length})</span>
          </div>
          {removesBackground && items.length > 0 && (
            <div style={{ fontSize: 11, color: 'var(--mid)', textAlign: 'right' }}>
              {toRemove === 0
                ? 'All already transparent - no background removal needed'
                : `${toRemove} will have the background removed${items.length - toRemove ? `, ${items.length - toRemove} already transparent` : ''}`}
            </div>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12, marginBottom: 20 }}>
          {items.map(item => (
            <div key={item.id} title={item.error || item.file.name} style={{ minWidth: 0 }}>
              <div style={{ position: 'relative', aspectRatio: '1 / 1', borderRadius: 10, overflow: 'hidden', background: '#F3F4F6', border: `1.5px solid ${item.status === 'error' ? '#FCA5A5' : item.status === 'done' ? '#86EFAC' : 'var(--border)'}` }}>
                <img src={item.previewUrl} alt={item.file.name} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', opacity: processing && item.status === 'waiting' ? 0.55 : 1 }} />
                {item.alreadyCutOut && (
                  <span style={{ position: 'absolute', bottom: 6, left: '50%', transform: 'translateX(-50%)', fontSize: 9, fontWeight: 800, letterSpacing: '0.04em', color: '#fff', background: '#14B8A6', borderRadius: 100, padding: '2px 7px' }}>NO BG</span>
                )}
                {!processing && item.status !== 'done' && (
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    title="Remove"
                    aria-label={`Remove ${item.file.name}`}
                    style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.55)', color: '#fff', cursor: 'pointer', fontSize: 13, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >×</button>
                )}
                {['remove-bg', 'resize', 'save'].includes(item.status) && (
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Spinner size={22} color="var(--primary)" />
                  </div>
                )}
                {(item.status === 'done' || item.status === 'error') && (
                  <span style={{ position: 'absolute', top: 6, left: 6, width: 20, height: 20, borderRadius: '50%', background: item.status === 'done' ? '#16A34A' : '#DC2626', color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {item.status === 'done' ? '✓' : '!'}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: 'var(--dark)', marginTop: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.file.name}</div>
              <div style={{ fontSize: 10, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: item.status === 'error' ? '#B91C1C' : item.status === 'done' ? '#16A34A' : 'var(--mid)', fontWeight: item.status === 'error' || item.status === 'done' ? 600 : 400 }}>
                {item.status === 'error' ? item.error
                  : STATUS_LABEL[item.status] ?? `${item.size.width} × ${item.size.height}px`}
              </div>
            </div>
          ))}
          {!processing && (
            <button
              type="button"
              onClick={handleAddMore}
              disabled={adding}
              style={{ aspectRatio: '1 / 1', borderRadius: 10, border: '1.5px dashed var(--border)', background: '#fff', cursor: adding ? 'default' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, color: 'var(--mid)', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--mid)' }}
            >
              {adding ? <Spinner size={18} /> : <span style={{ fontSize: 24, lineHeight: 1, fontWeight: 400 }}>+</span>}
              Add images
            </button>
          )}
        </div>

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

        <div style={{ borderTop: '1px solid var(--border)', margin: '20px 0 16px' }} />

        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--dark)', marginBottom: 10 }}>Frame size</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
          {[null, ...FRAME_PRESETS].map(p => {
            const active = p ? preset?.label === p.label : !preset
            return (
              <button
                key={p?.label ?? 'custom'}
                type="button"
                onClick={() => setPreset(p)}
                style={{
                  padding: '9px 6px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center',
                  border: active ? '1.5px solid var(--primary)' : '1.5px solid var(--border)',
                  background: active ? 'var(--primary-glow)' : '#fff',
                  color: active ? 'var(--primary)' : 'var(--dark)',
                }}
              >
                {p ? p.label : 'Custom / Original'}
                <span style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--mid)', marginTop: 2 }}>
                  {p ? `${p.width} × ${p.height}` : 'Any size'}
                </span>
              </button>
            )
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--dark)' }}>Custom / Original size (e.g. for logos)</div>
          {!preset && customSize && (
            <button type="button" onClick={() => setCustomSize(null)} style={{ fontSize: 11, fontWeight: 600, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
              Reset to original size{plural ? 's' : ''}
            </button>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--mid)', margin: '2px 0 8px' }}>
          {preset ? 'Select Custom / Original above to edit.'
            : customSize ? `Every image is fitted into this size. Max ${LIBRARY_MAX_DIM}px per side.`
            : plural ? `Each image keeps its own size. Type a size to use one size for all. Max ${LIBRARY_MAX_DIM}px per side.`
            : `Starts at the image's own size. Max ${LIBRARY_MAX_DIM}px per side.`}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
          {['width', 'height'].map((dim, i) => (
            <Fragment key={dim}>
              {i === 1 && <div style={{ color: 'var(--light)', paddingBottom: 9 }}>×</div>}
              <label style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--mid)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{dim}</span>
                <span style={{ position: 'relative', display: 'block' }}>
                  <input
                    type="number"
                    min={1}
                    max={LIBRARY_MAX_DIM}
                    value={shownSize ? shownSize[dim] : ''}
                    placeholder="Original"
                    readOnly={!!preset || processing}
                    onChange={e => handleSizeInput(dim, e.target.value)}
                    style={inputStyle(!!preset)}
                  />
                  <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--light)' }}>px</span>
                </span>
              </label>
            </Fragment>
          ))}
        </div>

        {/* Overall progress while running, or a summary after a partial failure */}
        {(processing || failedCount > 0) && (
          <div style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: failedCount && !processing ? '#B91C1C' : 'var(--mid)', marginBottom: 6 }}>
              <span>
                {processing
                  ? `Processing… ${doneCount} of ${items.length} done`
                  : `${failedCount} image${failedCount === 1 ? '' : 's'} failed - ${doneCount} uploaded. Hover a failed image to see why.`}
              </span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: '#F3F4F6', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${items.length ? (doneCount / items.length) * 100 : 0}%`, background: failedCount && !processing ? '#DC2626' : 'var(--primary)', transition: 'width 0.3s' }} />
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <button
            onClick={() => close()}
            disabled={processing}
            style={{ flex: 1, padding: '11px', fontSize: 13, fontWeight: 700, background: '#fff', color: processing ? 'var(--light)' : 'var(--dark)', border: '1px solid var(--border)', borderRadius: 8, cursor: processing ? 'not-allowed' : 'pointer' }}
          >
            {doneCount > 0 && !processing ? 'Done' : 'Cancel'}
          </button>
          <button
            onClick={handleUpload}
            disabled={!canSubmit}
            style={{
              flex: 1, padding: '11px', fontSize: 13, fontWeight: 700, borderRadius: 8, border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              background: canSubmit || processing ? 'var(--primary)' : '#E5E7EB',
              color: canSubmit || processing ? '#fff' : 'var(--mid)',
              opacity: processing ? 0.85 : 1,
              cursor: processing ? 'progress' : canSubmit ? 'pointer' : 'not-allowed',
            }}
          >
            {processing && <Spinner />}
            {processing ? `Uploading ${doneCount + 1 > items.length ? items.length : doneCount + 1} of ${items.length}…`
              : failedCount ? `Retry failed (${failedCount})`
              : `Upload ${pendingItems.length} image${pendingItems.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  )
}

const SPIN_KEYFRAMES = '@keyframes lib-spin { to { transform: rotate(360deg) } }'

function Spinner({ size = 14, color = 'currentColor' }) {
  return (
    <>
      <style>{SPIN_KEYFRAMES}</style>
      <span style={{ width: size, height: size, borderRadius: '50%', border: `2px solid ${color}`, borderRightColor: 'transparent', display: 'inline-block', flexShrink: 0, animation: 'lib-spin 0.7s linear infinite' }} />
    </>
  )
}

function UploadCard({ folderKey, label, requireTransparent, merchants, defaultMerchant, onUploaded }) {
  const [error, setError] = useState(null)
  const [loadingFiles, setLoadingFiles] = useState(false)
  // Grid items once files are chosen - the modal needs each image's real
  // size (Custom / Original) and cut-out state, so the picker opens first.
  const [pending, setPending] = useState(null)
  const removesBackground = shouldRemoveBackground(folderKey)

  function chooseFiles() {
    setError(null)
    pickImageFiles(async files => {
      setLoadingFiles(true)
      const items = await loadUploadItems(files, removesBackground)
      setLoadingFiles(false)
      if (items.length) setPending(items)
      else setError('Could not read these images - please try different files.')
    })
  }

  // One image's full pipeline, called by the modal for each item (several
  // in parallel). onStatus drives that item's label in the grid; throwing
  // marks just that item as failed.
  async function uploadItem(item, merchant, frame, onStatus) {
    if (removesBackground && !item.alreadyCutOut) onStatus('remove-bg')
    const { url, name } = await removeBackgroundForUpload(item.file, { folder: folderKey, requireTransparent })
    onStatus('resize')
    const framedUrl = await resizeToFrame(url, frame.width, frame.height, { centreContent: frame.centreContent })
    URL.revokeObjectURL(url)
    onStatus('save')
    // resizeToFrame always outputs PNG, so the name follows.
    const saved = await saveAssetToLibrary(folderKey, name.replace(/\.[^.]+$/, '') + '.png', framedUrl, merchant)
    URL.revokeObjectURL(framedUrl)
    if (!saved) throw new Error('Could not save to the library')
  }

  return (
    <div style={{ marginBottom: 8 }}>
      <button
        onClick={chooseFiles}
        disabled={loadingFiles}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 16px', borderRadius: 10,
          border: '1.5px dashed var(--border)', background: '#fff',
          cursor: loadingFiles ? 'default' : 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--dark)',
        }}
      >
        <div style={{ width: 28, height: 28, background: 'var(--dark)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {loadingFiles ? <Spinner size={14} color="#fff" /> : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          )}
        </div>
        {label}
      </button>
      {error && (
        <div style={{ marginTop: 6, fontSize: 11, color: '#B91C1C' }}>✕ {error}</div>
      )}
      {pending && (
        <UploadModal
          label={label}
          removesBackground={removesBackground}
          initialItems={pending}
          merchants={merchants}
          defaultMerchant={defaultMerchant}
          onUploadItem={uploadItem}
          onClose={uploadedSomething => {
            setPending(null)
            if (uploadedSomething) onUploaded()
          }}
        />
      )}
    </div>
  )
}

// Same look as Header.jsx's SignOutConfirmModal - deleting an asset is
// permanent (it's removed from Blob storage), and the delete button used to
// fire straight away on one click.
function DeleteAssetConfirmModal({ name, onConfirm, onClose }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={onClose}
    >
      <div
        style={{ background: '#fff', borderRadius: 16, padding: 28, maxWidth: 340, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', textAlign: 'center' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--dark)', marginBottom: 6 }}>Delete this asset?</div>
        <div style={{ fontSize: 13, color: 'var(--mid)', lineHeight: 1.6, marginBottom: 20, overflowWrap: 'anywhere' }}>
          "{name}" will be permanently removed from the library. This can't be undone.
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onClose}
            style={{ flex: 1, padding: '11px', fontSize: 13, fontWeight: 700, background: '#fff', color: 'var(--dark)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{ flex: 1, padding: '11px', fontSize: 13, fontWeight: 700, background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

function AssetCard({ asset, onDelete, onRename, onMove, allMerchants, showMerchant }) {
  const [dims, setDims] = useState(null)
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(asset.name)
  const [renaming, setRenaming] = useState(false)
  const [movingMerchant, setMovingMerchant] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

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
            title={`${asset.name} - click to rename`}
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
        onClick={() => setConfirmingDelete(true)}
        title="Delete"
        aria-label={`Delete ${asset.name}`}
        style={{
          position: 'absolute', top: 8, right: 8,
          width: 30, height: 30, borderRadius: 8,
          background: '#fff', color: 'var(--mid)', border: '1px solid var(--border)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = '#DC2626'; e.currentTarget.style.borderColor = '#FCA5A5' }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--mid)'; e.currentTarget.style.borderColor = 'var(--border)' }}
      >
        <HugeiconsIcon icon={Delete02Icon} size={16} />
      </button>
      {confirmingDelete && (
        <DeleteAssetConfirmModal
          name={asset.name}
          onClose={() => setConfirmingDelete(false)}
          onConfirm={() => { setConfirmingDelete(false); onDelete(asset) }}
        />
      )}
    </div>
  )
}

export default function LibraryPage({ onBack }) {
  const [assets, setAssets] = useState([])
  const [loading, setLoading] = useState(true)
  // Defaults to "All merchants", not GENERAL_MERCHANT - Julia's report,
  // 2026-09-22: opening Assets landed on the "General" filter by default,
  // which only ever shows the handful of assets with no merchant tag, and
  // read as "my assets are all gone" since most real uploads ARE tagged to
  // a specific merchant. GENERAL_MERCHANT is still a real, selectable
  // filter option - just no longer the first thing anyone sees.
  const [merchant, setMerchant] = useState(() => localStorage.getItem(LAST_MERCHANT_KEY) || ALL_MERCHANTS)
  const [typeFilter, setTypeFilter] = useState(ALL_TYPES)
  const [search, setSearch] = useState('')

  async function refresh() {
    setAssets(await getLibraryAssets())
    setLoading(false)
  }

  useEffect(() => { refresh() }, [])

  function handleMerchantChange(next) {
    // Snap to an existing merchant's exact casing when typing a new one that
    // matches case-insensitively - mirrors the server-side snap that happens
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

  // Moves an asset to a different merchant folder - e.g. consolidating a
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

  // Default pre-fill for the upload picker's "existing merchant" dropdown -
  // whatever's currently being viewed, if it's a real merchant.
  const defaultUploadMerchant = merchant === ALL_MERCHANTS ? (merchants[0] || GENERAL_MERCHANT) : merchant

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'auto' }}>

      {/* Page header */}
      <div style={{ borderBottom: '1px solid var(--border)', padding: `28px ${PAGE_PADDING_X} 24px`, background: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--dark)' }}>Assets</h1>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--mid)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit', flexShrink: 0 }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--mid)' }}
            >
              ← Back
            </button>
          )}
        </div>
        <p style={{ margin: '6px 0 12px', fontSize: 13, color: 'var(--mid)' }}>
          {loading ? 'Loading…' : assets.length === 0
            ? 'Your uploaded logos and photos, ready to reuse across designs.'
            : `${assets.length} saved asset${assets.length === 1 ? '' : 's'}`}
        </p>

        {/* Merchant - filters which assets are shown below. Which merchant a
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
          <ChoiceButton active={typeFilter === ALL_TYPES} onClick={() => setTypeFilter(ALL_TYPES)}>All types</ChoiceButton>
          {Object.entries(FOLDERS).map(([key, label]) => (
            <ChoiceButton key={key} active={typeFilter === key} onClick={() => setTypeFilter(key)}>{label}</ChoiceButton>
          ))}
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name…"
            style={{ marginLeft: 'auto', fontSize: 13, padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: '#fff', width: 200 }}
          />
        </div>

        <div style={{ fontSize: 12, color: 'var(--mid)', marginBottom: 8 }}>{AUTO_REMOVE_BG_NOTE} QR codes are kept as they are.</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {UPLOADABLE_FOLDERS.map(f => (
            <UploadCard key={f.key} folderKey={f.key} label={f.label} requireTransparent={f.requireTransparent} merchants={merchants} defaultMerchant={defaultUploadMerchant} onUploaded={refresh} />
          ))}
        </div>
      </div>

      {loading ? (
        <PageSpinner label="Loading assets…" />
      ) : assets.length === 0 ? (
        <EmptyState />
      ) : viewAssets.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
          <div style={{ fontSize: 13, color: 'var(--mid)', textAlign: 'center' }}>
            No assets match {search.trim() ? `"${search.trim()}"` : 'these filters'}.
          </div>
        </div>
      ) : (
        <div style={{ padding: `32px ${PAGE_PADDING_X}` }}>
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
