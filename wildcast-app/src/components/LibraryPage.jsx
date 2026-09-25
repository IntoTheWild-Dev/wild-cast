import { useState, useEffect, useMemo, Fragment } from 'react'
import Select from './Select'
import ChoiceButton from './ChoiceButton'
import { HugeiconsIcon } from '@hugeicons/react'
import { Delete02Icon } from '@hugeicons/core-free-icons'
import { FOLDERS, GENERAL_MERCHANT, getLibraryAssets, saveAssetToLibrary, deleteLibraryAsset, renameLibraryAsset, uniqueMerchants, removeBackgroundForUpload, LIBRARY_MAX_DIM } from '../lib/assetLibrary'
import { FRAME_PRESETS, imageSize, resizeToFrame } from '../lib/image'
import { AUTO_REMOVE_BG_NOTE, shouldRemoveBackground } from '../lib/removeBackground'

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
// Also picks the output frame size, like wild-scale: two presets or Custom.
// Custom is the default and starts at the uploaded image's own size (capped
// to what the Library stores - LIBRARY_MAX_DIM), so doing nothing keeps the
// image as it is. That's why the file is chosen BEFORE this opens.
function MerchantPickerModal({ label, merchants, defaultMerchant, onCancel, onConfirm, removesBackground, fileName, originalSize, previewUrl }) {
  const hasExisting = merchants.length > 0
  const [mode, setMode] = useState(hasExisting ? 'existing' : 'new')
  const [existingChoice, setExistingChoice] = useState(defaultMerchant || merchants[0] || '')
  const [newName, setNewName] = useState('')

  const cap = Math.min(1, LIBRARY_MAX_DIM / Math.max(originalSize.width, originalSize.height))
  const defaultSize = { width: Math.round(originalSize.width * cap), height: Math.round(originalSize.height * cap) }
  const [preset, setPreset] = useState(null) // null = Custom
  const [customSize, setCustomSize] = useState(defaultSize)
  const frame = preset ?? customSize
  const clampDim = v => Math.min(LIBRARY_MAX_DIM, Math.max(1, parseInt(v, 10) || 1))

  // Upload runs while this modal stays open, step by step, so the partner
  // can see what's happening (background removal alone takes a few seconds).
  // Nothing can close it mid-way - backdrop and Cancel are disabled until it
  // either finishes (parent closes it) or fails (error shown, can retry).
  const steps = [
    ...(removesBackground ? [{ id: 'remove-bg', label: 'Removing background' }] : []),
    { id: 'resize', label: `Resizing to ${frame.width} × ${frame.height}px` },
    { id: 'save', label: 'Saving to library' },
  ]
  const [processing, setProcessing] = useState(false)
  const [currentStep, setCurrentStep] = useState(null)
  const [stepError, setStepError] = useState(null)
  const merchantName = mode === 'new' ? newName.trim() : existingChoice
  const canSubmit = !!merchantName && !processing

  async function handleUpload() {
    setProcessing(true)
    setStepError(null)
    try {
      await onConfirm(merchantName, { ...frame, centreContent: !!preset }, setCurrentStep)
    } catch (err) {
      setStepError(err.message)
      setProcessing(false)
    }
  }

  const subject = label.replace(/^Upload (a|an) /i, '')

  return (
    <div
      onClick={processing ? undefined : onCancel}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
    >
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 32, width: 680, maxWidth: '100%', maxHeight: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--dark)', marginBottom: 4 }}>Who is this {subject.toLowerCase()} for?</div>
        <div style={{ fontSize: 12, color: 'var(--mid)', marginBottom: removesBackground ? 10 : 16 }}>Assets are organized by merchant so they don't get mixed up.</div>
        {removesBackground && (
          <div style={{ fontSize: 12, color: 'var(--dark)', background: 'var(--primary-glow)', borderRadius: 8, padding: '8px 10px', marginBottom: 16, lineHeight: 1.45 }}>
            {AUTO_REMOVE_BG_NOTE}
          </div>
        )}

        {/* Preview of the chosen file as-is, before background removal and
            framing run - so a wrong file can be cancelled without uploading. */}
        <div style={{ marginBottom: 18 }}>
          {/* Just the image itself, no frame or checkerboard behind it -
              scaled down to fit (never cropped), centred. */}
          <img src={previewUrl} alt={fileName} style={{ display: 'block', maxWidth: '100%', maxHeight: 300, width: 'auto', height: 'auto', margin: '0 auto' }} />
          <div style={{ fontSize: 12, color: 'var(--mid)', marginTop: 8, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {fileName} · original {originalSize.width} × {originalSize.height}px
          </div>
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

        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--dark)' }}>Custom / Original size (e.g. for logos)</div>
        <div style={{ fontSize: 11, color: 'var(--mid)', margin: '2px 0 8px' }}>
          {preset ? 'Select Custom / Original above to edit.' : `Starts at the image's own size. Max ${LIBRARY_MAX_DIM}px per side.`}
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
                    value={frame[dim]}
                    readOnly={!!preset}
                    onChange={e => setCustomSize(s => ({ ...s, [dim]: clampDim(e.target.value) }))}
                    style={{ width: '100%', padding: '9px 30px 9px 12px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', outline: 'none', boxSizing: 'border-box', background: preset ? '#F9FAFB' : '#fff', color: preset ? 'var(--light)' : 'var(--dark)', cursor: preset ? 'not-allowed' : 'text' }}
                  />
                  <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--light)' }}>px</span>
                </span>
              </label>
            </Fragment>
          ))}
        </div>

        {/* Progress - one row per step, shown once Upload is clicked */}
        {(processing || stepError) && (
          <div style={{ marginTop: 20, padding: '12px 14px', borderRadius: 10, background: '#FAFAF8', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {steps.map((step, i) => {
              const activeIndex = steps.findIndex(s => s.id === currentStep)
              const state = activeIndex === -1 ? 'waiting'
                : i < activeIndex ? 'done'
                : i === activeIndex ? (stepError ? 'error' : 'active')
                : 'waiting'
              return (
                <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: state === 'active' ? 700 : 500, color: state === 'waiting' ? 'var(--light)' : state === 'error' ? '#B91C1C' : 'var(--dark)' }}>
                  <StepIcon state={state} />
                  {step.label}{state === 'active' ? '…' : ''}
                </div>
              )
            })}
            {stepError && (
              <div style={{ fontSize: 12, color: '#B91C1C', lineHeight: 1.5, paddingLeft: 28 }}>{stepError}</div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <button
            onClick={onCancel}
            disabled={processing}
            style={{ flex: 1, padding: '11px', fontSize: 13, fontWeight: 700, background: '#fff', color: processing ? 'var(--light)' : 'var(--dark)', border: '1px solid var(--border)', borderRadius: 8, cursor: processing ? 'not-allowed' : 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!canSubmit}
            style={{
              flex: 1, padding: '11px', fontSize: 13, fontWeight: 700, borderRadius: 8, border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              background: !merchantName ? '#E5E7EB' : 'var(--primary)',
              color: !merchantName ? 'var(--mid)' : '#fff',
              opacity: processing ? 0.85 : 1,
              cursor: processing ? 'progress' : !merchantName ? 'not-allowed' : 'pointer',
            }}
          >
            {processing && <Spinner />}
            {processing ? 'Uploading…' : stepError ? 'Try again' : 'Upload'}
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

function StepIcon({ state }) {
  const box = { width: 18, height: 18, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }
  if (state === 'active') return <span style={box}><Spinner size={14} color="var(--primary)" /></span>
  if (state === 'done') {
    return (
      <span style={{ ...box, background: '#16A34A' }}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </span>
    )
  }
  if (state === 'error') return <span style={{ ...box, background: '#DC2626', color: '#fff', fontSize: 11, fontWeight: 800 }}>!</span>
  return <span style={{ ...box, border: '1.5px solid var(--border)', boxSizing: 'border-box' }} />
}

function UploadCard({ folderKey, label, requireTransparent, merchants, defaultMerchant, onUploaded }) {
  const [error, setError] = useState(null)
  // { file, size } once a file is chosen - the modal needs its real size to
  // prefill Custom, so the file picker opens first now.
  const [pending, setPending] = useState(null)

  function chooseFile() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async e => {
      const file = e.target.files[0]
      if (!file) return
      setError(null)
      // Kept alive while the modal is open - it's the preview image there.
      const url = URL.createObjectURL(file)
      try {
        setPending({ file, size: await imageSize(url), previewUrl: url })
      } catch (err) {
        URL.revokeObjectURL(url)
        setError(err.message)
      }
    }
    input.click()
  }

  function closePending() {
    if (pending) URL.revokeObjectURL(pending.previewUrl)
    setPending(null)
  }

  // Called by the modal, which stays open and shows each step via onStep.
  // Throws on failure so the modal can show the error and offer a retry;
  // only closes the modal once everything has succeeded.
  async function runUpload(merchant, frame, onStep) {
    const { file } = pending
    if (shouldRemoveBackground(folderKey)) onStep('remove-bg')
    const { url, name } = await removeBackgroundForUpload(file, { folder: folderKey, requireTransparent })
    onStep('resize')
    const framedUrl = await resizeToFrame(url, frame.width, frame.height, { centreContent: frame.centreContent })
    URL.revokeObjectURL(url)
    onStep('save')
    // resizeToFrame always outputs PNG, so the name follows.
    const saved = await saveAssetToLibrary(folderKey, name.replace(/\.[^.]+$/, '') + '.png', framedUrl, merchant)
    URL.revokeObjectURL(framedUrl)
    if (!saved) throw new Error('Could not save to the library - please try again.')
    closePending()
    onUploaded()
  }

  return (
    <div style={{ marginBottom: 8 }}>
      <button
        onClick={chooseFile}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 16px', borderRadius: 10,
          border: '1.5px dashed var(--border)', background: '#fff',
          cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--dark)',
        }}
      >
        <div style={{ width: 28, height: 28, background: 'var(--dark)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
        </div>
        {label}
      </button>
      {error && (
        <div style={{ marginTop: 6, fontSize: 11, color: '#B91C1C' }}>✕ {error}</div>
      )}
      {pending && (
        <MerchantPickerModal
          label={label}
          removesBackground={shouldRemoveBackground(folderKey)}
          fileName={pending.file.name}
          originalSize={pending.size}
          previewUrl={pending.previewUrl}
          merchants={merchants}
          defaultMerchant={defaultMerchant}
          onCancel={closePending}
          onConfirm={runUpload}
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
      <div style={{ borderBottom: '1px solid var(--border)', padding: '28px 40px 24px', background: '#fff' }}>
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
