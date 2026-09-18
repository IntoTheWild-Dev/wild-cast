import { useState, useEffect } from 'react'
import Select from './Select'

function formatDateTime(ts) {
  return new Date(ts).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}
import AISuggest from './AISuggest'
import { hasTransparency, cropToContent } from '../lib/image'
import { assetFolderForZone, getLibraryAssets, uniqueMerchants, uploadImageForZone, GENERAL_MERCHANT } from '../lib/assetLibrary'
import { findCloseSuggestion } from '../lib/fuzzyMatch'
import { PLACEHOLDER_PARTNERS } from '../lib/briefConstants'

const ALL_MERCHANTS = '__all__'

const CHAR_LIMITS = { headline: 20, offer: 20, sub_headline: 25, tc: 120, restaurant_name: 30, cta: 60 }

// No live template has a sticker-type zone yet, but the underlying id/folder/
// Library category stay "sticker" throughout the codebase (assetLibrary.js,
// assetFolderForZone) once one gets built - only what a partner actually
// reads in the editor should say "Discount" instead (Julia's ask,
// 2026-09-08: the word "sticker" isn't used internally and confuses testers).
function imageZoneLabel(zone) {
  if (zone.id?.includes('sticker')) return 'Discount'
  return zone.label ?? zone.id
}

// The per-field explainer paragraphs that used to live here (FIELD_HINTS /
// OPT_B_HEADLINE_HINT) were removed from the field rows entirely (Julia's
// ask, 2026-09-18: too much text under every field) - each field's
// placeholder text now carries the example instead.

// Session-only display order for the Edit content panel's text/image steps -
// lets a partner drag e.g. "Offer" above "Sub-headline" for their own
// editing convenience. Purely cosmetic (only changes which numbered step a
// field appears as in this panel, never the zone's x/y on the canvas) and
// intentionally not persisted with the project - resets to the template's
// natural order next time this editor is opened (Julia's ask, 2026-09-18).
function useOrderedKeys(naturalKeys) {
  const naturalSig = naturalKeys.join('|')
  const [sig, setSig] = useState(naturalSig)
  const [order, setOrder] = useState(naturalKeys)
  // Adjusts state during render (not an effect) when the template's own
  // field set changes (e.g. switching templates) - resets the drag order
  // back to natural immediately, in the same render, rather than flashing
  // the stale order for one frame first.
  if (sig !== naturalSig) {
    setSig(naturalSig)
    setOrder(naturalKeys)
  }
  function reorder(draggedKey, targetKey) {
    if (draggedKey === targetKey) return
    setOrder(prev => {
      const from = prev.indexOf(draggedKey)
      const to = prev.indexOf(targetKey)
      if (from === -1 || to === -1) return prev
      const next = [...prev]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
  }
  return [order, reorder]
}

function GripIcon() {
  return (
    <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true">
      <circle cx="2.5" cy="2.5" r="1.4" /><circle cx="7.5" cy="2.5" r="1.4" />
      <circle cx="2.5" cy="8" r="1.4" /><circle cx="7.5" cy="8" r="1.4" />
      <circle cx="2.5" cy="13.5" r="1.4" /><circle cx="7.5" cy="13.5" r="1.4" />
    </svg>
  )
}

// Wraps a StepFieldRow/ImageUpload with a drag handle - native HTML5 drag
// and drop rather than a library, matching the rest of this codebase's
// hand-rolled UI. The handle alone is draggable (not the whole row), so
// selecting/editing text inside the field's own input never gets mistaken
// for a drag.
function ReorderableStep({ isDragging, isDragOver, dragSource, dropTarget, children }) {
  return (
    <div
      {...dropTarget}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 2,
        opacity: isDragging ? 0.4 : 1,
        outline: isDragOver ? '2px dashed var(--primary)' : 'none',
        outlineOffset: 4, borderRadius: 10, transition: 'opacity 0.15s',
      }}
    >
      <span
        {...dragSource}
        title="Drag to reorder"
        style={{ cursor: 'grab', color: 'var(--light)', flexShrink: 0, marginTop: 7, padding: '2px 1px', touchAction: 'none' }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--mid)' }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--light)' }}
      >
        <GripIcon />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  )
}

function OptionalBadge() {
  return <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--mid)', background: '#F3F4F6', padding: '2px 7px', borderRadius: 100 }}>If necessary *</span>
}

// A pill reading "Required" next to every mandatory field's label added up
// to a lot of the same word repeated down the panel - Julia's ask,
// 2026-09-18: swap it for the plain asterisk convention instead.
function RequiredBadge() {
  return <span style={{ color: 'var(--primary)', fontWeight: 700 }} title="Required">*</span>
}

function AlignControl({ align, onAlign }) {
  return (
    <div style={{ display: 'flex', background: '#F3F4F6', borderRadius: 6, padding: '1px 2px', gap: 1 }}>
      {['left', 'center', 'right'].map(a => (
        <button
          key={a}
          onClick={() => onAlign(a)}
          style={{
            width: 20, height: 20, border: 'none', borderRadius: 4, cursor: 'pointer',
            background: align === a ? 'var(--dark)' : 'transparent',
            color: align === a ? '#fff' : 'var(--mid)',
            fontSize: 10, fontWeight: 700, lineHeight: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onMouseEnter={e => { if (align !== a) e.currentTarget.style.background = '#E5E7EB' }}
          onMouseLeave={e => { if (align !== a) e.currentTarget.style.background = 'transparent' }}
        >
          {a === 'left' ? 'L' : a === 'center' ? 'C' : 'R'}
        </button>
      ))}
    </div>
  )
}

function SizeControl({ size, onSize }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 1, background: '#F3F4F6', borderRadius: 6, padding: '1px 3px' }}>
      <button
        onClick={() => onSize(size - 1)}
        style={{ width: 20, height: 20, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 14, color: 'var(--mid)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, lineHeight: 1 }}
        onMouseEnter={e => e.currentTarget.style.background = '#E5E7EB'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >−</button>
      <span style={{ fontSize: 10, fontVariantNumeric: 'tabular-nums', minWidth: 26, textAlign: 'center', color: 'var(--mid)', fontWeight: 600 }}>{size}pt</span>
      <button
        onClick={() => onSize(size + 1)}
        style={{ width: 20, height: 20, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 14, color: 'var(--mid)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, lineHeight: 1 }}
        onMouseEnter={e => e.currentTarget.style.background = '#E5E7EB'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >+</button>
    </div>
  )
}

// Same arrow-button layout as ImageUpload's Position control below - reused
// here for text zones (headline/sub_headline) in the restricted review mode,
// where a canvas drag isn't available (see TemplateCanvas.jsx's textPositions).
function NudgeControl({ onNudge }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, paddingLeft: 34 }}>
      <span style={{ fontSize: 11, color: 'var(--mid)', fontWeight: 600 }}>Position</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 1, background: '#F3F4F6', borderRadius: 6, padding: '1px 3px' }}>
        {[
          { dir: '←', axis: 'x', delta: -4 },
          { dir: '→', axis: 'x', delta: 4 },
          { dir: '↑', axis: 'y', delta: -4 },
          { dir: '↓', axis: 'y', delta: 4 },
        ].map(({ dir, axis, delta }) => (
          <button
            key={dir}
            onClick={() => onNudge(axis, delta)}
            title={`Nudge ${dir === '←' ? 'left' : dir === '→' ? 'right' : dir === '↑' ? 'up' : 'down'}`}
            style={{ width: 20, height: 20, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'var(--mid)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, lineHeight: 1 }}
            onMouseEnter={e => e.currentTarget.style.background = '#E5E7EB'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >{dir}</button>
        ))}
      </div>
    </div>
  )
}

// ── Unified numbered field row (both modes) ─────────────────────────────────
// showControls=true adds font-size, alignment and reset position (designer mode)
// showSize=true adds just the font-size control (guided mode)
// readOnly=true (restricted review mode) locks the text value itself and hides
// AI Suggest - only Scale (showSize) and onNudge, if passed, stay available.
function StepFieldRow({ step, label, fieldKey, value, onChange, lang, required, optional, multiline, showControls, showSize, fontSize, onFontSize, align, onAlign, onResetPosition, readOnly, onNudge, credits, onCreditUsed, placeholder, suggestFrom }) {
  const limit = CHAR_LIMITS[fieldKey]
  const over = limit && value.length > limit
  const fieldPlaceholder = placeholder ?? `Enter ${label.toLowerCase()}…`
  // Gentle "Did you mean X?" hint, not a blocking popup - Julia's ask,
  // 2026-09-15: catch a small typo (e.g. "Wen Chen" missing the "g") right
  // where it's typed, without interrupting typing the way a popup would.
  // suggestFrom is a known-good list (e.g. PLACEHOLDER_PARTNERS) to compare
  // against; findCloseSuggestion only returns something when value is a
  // near-but-not-exact match, never while it's already spelled right or too
  // different to plausibly be the same name (see lib/fuzzyMatch.js).
  const suggestion = suggestFrom ? findCloseSuggestion(value, suggestFrom) : null

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Step header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
        <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--primary)', color: '#fff', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
          {step}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--dark)' }}>{label}</span>
            {required && <RequiredBadge />}
            {optional && <OptionalBadge />}
            {limit && (
              <span style={{ marginLeft: 'auto', fontSize: 11, color: over ? '#EF4444' : 'var(--light)', fontVariantNumeric: 'tabular-nums' }}>
                {value.length}/{limit}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Controls row - full (designer) or size-only (guided/restricted) */}
      {(showControls || showSize) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, paddingLeft: 34 }}>
          {showControls && align != null && <AlignControl align={align} onAlign={onAlign} />}
          {fontSize != null && <SizeControl size={fontSize} onSize={onFontSize} />}
          {showControls && (
            <button
              onClick={onResetPosition}
              title="Reset position to default"
              style={{ width: 20, height: 20, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--light)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, lineHeight: 1, flexShrink: 0 }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--primary)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--light)' }}
            >↺</button>
          )}
        </div>
      )}

      {onNudge && <NudgeControl onNudge={onNudge} />}

      {/* Input */}
      {multiline ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          readOnly={readOnly}
          maxLength={limit}
          rows={3}
          placeholder={fieldPlaceholder}
          style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', fontSize: 13, border: `1px solid ${over ? '#EF4444' : 'var(--border)'}`, borderRadius: 8, outline: 'none', resize: 'vertical', background: readOnly ? '#F3F4F6' : 'var(--surface)', color: 'var(--dark)', fontFamily: 'inherit', lineHeight: 1.5, cursor: readOnly ? 'default' : 'text', overflowWrap: 'break-word', wordBreak: 'break-word' }}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          readOnly={readOnly}
          maxLength={limit}
          placeholder={fieldPlaceholder}
          style={{ width: '100%', padding: '10px 12px', fontSize: 13, border: `1px solid ${over ? '#EF4444' : 'var(--border)'}`, borderRadius: 8, outline: 'none', background: readOnly ? '#F3F4F6' : 'var(--surface)', color: 'var(--dark)', fontFamily: 'inherit', cursor: readOnly ? 'default' : 'text' }}
        />
      )}
      {suggestion && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 12, color: 'var(--mid)' }}>
          <span>Did you mean <strong style={{ color: 'var(--dark)' }}>{suggestion}</strong>?</span>
          <button
            type="button"
            onClick={() => onChange(suggestion)}
            style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
          >
            Use this
          </button>
        </div>
      )}
      {!readOnly && (
        // position:relative here (not on AISuggest itself) so its dropdown
        // anchors to this full-width row instead of whichever narrow button
        // triggered it - keeps a 300px dropdown from starting left of the
        // panel's own edge and getting clipped (see AISuggest.jsx).
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 6, position: 'relative' }}>
          <AISuggest field={fieldKey} lang={lang} onApply={val => onChange(val)} credits={credits} onCreditUsed={onCreditUsed} />
          <AISuggest field={fieldKey} lang={lang} onApply={val => onChange(val)} mode="improve" seedText={value} credits={credits} onCreditUsed={onCreditUsed} />
        </div>
      )}
    </div>
  )
}

// Output ICC profiles for CMYK export (api/export-cmyk.js has the matching
// ICC_PROFILES map + bundled .icc files). fogra39 stays the default so
// existing exports don't change unless a merchant/print shop asks for the
// newer standard.
const ICC_PROFILE_OPTIONS = [
  { id: 'fogra51', label: 'FOGRA51', hint: 'PSO Coated v3 · ISO 12647-2:2013' },
  { id: 'fogra39', label: 'FOGRA39', hint: 'ISO Coated v2 · ISO 12647-2:2004' },
]

// ── Image upload ─────────────────────────────────────────────────────────────
// Canvas is 316×441px = A6 105×148mm → canvas PPI ≈ 76.4
// For 300 DPI print the image needs ~3.93× the zone's canvas pixel width/height.
const CANVAS_PPI = 316 / (105 / 25.4)

function ImageUpload({ step, label, hint, required, optional, value, onChange, square, onResetPosition, scalePercent, onScaleChange, onNudge, minWidth, minHeight, requireTransparent, folder, merchant, autoCropContent, restricted }) {
  const [resWarning, setResWarning] = useState(null)
  const [bgError, setBgError] = useState(null)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [librarySearch, setLibrarySearch] = useState('')
  const [libraryMerchantFilter, setLibraryMerchantFilter] = useState(merchant)
  const [libraryAssets, setLibraryAssets] = useState([])

  const libraryFolder = folder ?? 'other'

  async function refreshLibrary() {
    const assets = await getLibraryAssets()
    setLibraryAssets(assets.filter(a => a.folder === libraryFolder))
  }

  useEffect(() => { refreshLibrary() }, [libraryFolder]) // eslint-disable-line react-hooks/exhaustive-deps

  const libraryMerchants = uniqueMerchants(libraryAssets)

  // Default the library modal's merchant filter to whichever restaurant is
  // currently being edited (re-applied on every open, in case the restaurant
  // name changed since last time) - most of the time that's exactly what you
  // want to reuse from. But `merchant` here is just the free-text restaurant_name
  // field, which won't always match the (sometimes abbreviated, e.g. "McD")
  // merchant tag a partner picked when they originally uploaded an asset -
  // when it doesn't match any real tag, a raw `<select value=merchant>` with
  // no matching <option> silently falls back to displaying "All merchants"
  // (the first option) while React's own state stays on the unmatched value,
  // so the list still filters (to nothing) as if that literal text were
  // selected. Only default to `merchant` when it's a tag that actually exists.
  function openLibrary() {
    setLibraryMerchantFilter(libraryMerchants.includes(merchant) ? merchant : ALL_MERCHANTS)
    setLibraryOpen(true)
  }
  const filteredLibraryAssets = libraryAssets
    .filter(a => libraryMerchantFilter === ALL_MERCHANTS || (a.merchant || GENERAL_MERCHANT) === libraryMerchantFilter)
    .filter(a => !librarySearch.trim() || a.name.toLowerCase().includes(librarySearch.trim().toLowerCase()))

  // The displayed min-resolution text always matches the real 300 DPI check below -
  // never hardcode a pixel count in a zone's hint string, it will drift from this.
  const fullHint = minWidth && minHeight ? `${hint} · min ${minWidth}×${minHeight}px` : hint

  function applyImage(url, name) {
    onChange(url, name)
    if (minWidth && minHeight) {
      const img = new Image()
      img.onload = () => {
        if (img.naturalWidth < minWidth || img.naturalHeight < minHeight) {
          const effectiveDpi = Math.round((img.naturalWidth / (minWidth / 300)))
          setResWarning(`Low resolution - approx. ${effectiveDpi} DPI (300 DPI recommended for print). Images may appear pixelated when printed.`)
        } else {
          setResWarning(null)
        }
      }
      img.src = url
    }
  }

  // Shared with TemplateCanvas.jsx's drag-and-drop-onto-a-zone path
  // (uploadImageForZone in lib/assetLibrary.js) - same validation/autocrop/
  // library-save pipeline either way, just a different entry point for the file.
  async function handleFile(file) {
    setBgError(null)
    try {
      const { url, name } = await uploadImageForZone(file, { requireTransparent, autoCropContent, folder: libraryFolder, merchant })
      refreshLibrary()
      applyImage(url, name)
    } catch (err) {
      setBgError(err.message)
    }
  }

  const handleClick = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = e => {
      const file = e.target.files[0]
      if (file) handleFile(file)
    }
    input.click()
  }

  const handlePickFromLibrary = async asset => {
    setBgError(null)
    if (requireTransparent && !(await hasTransparency(asset.src))) {
      setBgError('This image has a background - please pick a transparent PNG.')
      return
    }
    // Covers library assets uploaded before this cropping existed - cropToContent
    // is a no-op (returns the same url) if it's already a tight fit.
    const src = autoCropContent ? await cropToContent(asset.src) : asset.src
    applyImage(src, asset.name)
    setLibraryOpen(false)
  }

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Step header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
        <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--dark)', color: '#fff', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
          {step}
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--dark)' }}>{label}</span>
            {required && <RequiredBadge />}
            {optional && <OptionalBadge />}
            {value && onResetPosition && (
              <button
                onClick={e => { e.stopPropagation(); onResetPosition() }}
                title="Reset image position"
                style={{ marginLeft: 4, fontSize: 13, color: 'var(--mid)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 2px', lineHeight: 1, transition: 'color 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--primary)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--mid)' }}
              >↺</button>
            )}
          </div>
          {fullHint && <div style={{ fontSize: 11, color: 'var(--mid)', marginTop: 2 }}>{fullHint}</div>}
        </div>
      </div>
      <div
        onClick={restricted ? undefined : handleClick}
        style={{ border: `1.5px dashed ${value ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 10, padding: '16px', cursor: restricted ? 'default' : 'pointer', background: value ? 'var(--primary-glow)' : '#FAFAF8', display: 'flex', alignItems: 'center', gap: 12, transition: 'all 0.15s' }}
      >
        {value ? (
          <>
            <img src={value} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: square ? 4 : 6 }} />
            <span style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 600 }}>{restricted ? 'Uploaded ✓' : 'Uploaded ✓ - click to replace'}</span>
          </>
        ) : (
          <>
            <div style={{ width: 40, height: 40, background: 'var(--dark)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--dark)' }}>{restricted ? 'No image' : 'Click to upload'}</div>
              <div style={{ fontSize: 11, color: 'var(--light)', marginTop: 2 }}>{fullHint}</div>
            </div>
          </>
        )}
      </div>

      {/* Library picker toggle - only shown when this zone's folder already has saved assets */}
      {!restricted && libraryAssets.length > 0 && (
        <button
          onClick={openLibrary}
          style={{ marginTop: 6, background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: 'var(--primary)', padding: 0 }}
        >
          or choose from library →
        </button>
      )}
      {libraryOpen && (
        <div
          onClick={() => setLibraryOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 14, padding: 20, width: 560, maxWidth: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--dark)', flex: 1 }}>Choose from library</div>
              <button
                onClick={() => setLibraryOpen(false)}
                style={{ width: 26, height: 26, border: 'none', background: '#F3F4F6', borderRadius: '50%', cursor: 'pointer', fontSize: 14, color: 'var(--mid)', lineHeight: 1 }}
              >×</button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <input
                type="text"
                value={librarySearch}
                onChange={e => setLibrarySearch(e.target.value)}
                placeholder="Search by name…"
                autoFocus
                style={{ flex: 1, fontSize: 13, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', outline: 'none' }}
              />
              {libraryMerchants.length > 1 && (
                <Select
                  value={libraryMerchantFilter}
                  onChange={e => setLibraryMerchantFilter(e.target.value)}
                  style={{ fontSize: 13, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', color: 'var(--dark)' }}
                >
                  <option value={ALL_MERCHANTS}>All merchants</option>
                  {libraryMerchants.map(m => <option key={m} value={m}>{m}</option>)}
                </Select>
              )}
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {filteredLibraryAssets.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--mid)', textAlign: 'center', padding: '30px 0' }}>
                  No assets match{librarySearch.trim() ? ` "${librarySearch.trim()}"` : ' this filter'}.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                  {filteredLibraryAssets.map(asset => (
                    <div key={asset.id} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <img
                        src={asset.src}
                        alt={asset.name}
                        title={asset.name}
                        onClick={() => handlePickFromLibrary(asset)}
                        style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 6, cursor: 'pointer', border: '1.5px solid var(--border)', transition: 'border-color 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary)'}
                        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                      />
                      <div style={{ fontSize: 10, color: 'var(--mid)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={asset.name}>
                        {asset.name}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Background rejection - shown when a transparent-PNG zone gets a flattened/promo image */}
      {bgError && (
        <div style={{ marginTop: 8, padding: '8px 10px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, fontSize: 11, color: '#B91C1C', lineHeight: 1.5 }}>
          ✕ {bgError}
        </div>
      )}

      {/* Low-resolution warning - shown when uploaded image is below 300 DPI for print */}
      {resWarning && (
        <div style={{ marginTop: 8, padding: '8px 10px', background: '#FFF8E1', border: '1px solid #FFD54F', borderRadius: 8, fontSize: 11, color: '#795548', lineHeight: 1.5 }}>
          ⚠ {resWarning}
        </div>
      )}

      {/* Image scale control - shown after upload when in guided mode */}
      {value && onScaleChange && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, paddingLeft: 2 }}>
          <span style={{ fontSize: 11, color: 'var(--mid)', fontWeight: 600, flex: 1 }}>Scale</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 1, background: '#F3F4F6', borderRadius: 6, padding: '1px 3px' }}>
            <button
              onClick={e => { e.stopPropagation(); onScaleChange(Math.max(20, (scalePercent ?? 100) - 5)) }}
              disabled={(scalePercent ?? 100) <= 20}
              style={{ width: 20, height: 20, border: 'none', background: 'transparent', cursor: (scalePercent ?? 100) <= 20 ? 'default' : 'pointer', fontSize: 14, color: (scalePercent ?? 100) <= 20 ? 'var(--light)' : 'var(--mid)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, lineHeight: 1 }}
              onMouseEnter={e => e.currentTarget.style.background = '#E5E7EB'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >−</button>
            <span style={{ fontSize: 10, fontVariantNumeric: 'tabular-nums', minWidth: 34, textAlign: 'center', color: 'var(--mid)', fontWeight: 600 }}>{scalePercent ?? 100}%</span>
            <button
              onClick={e => { e.stopPropagation(); onScaleChange(Math.min(300, (scalePercent ?? 100) + 5)) }}
              disabled={(scalePercent ?? 100) >= 300}
              style={{ width: 20, height: 20, border: 'none', background: 'transparent', cursor: (scalePercent ?? 100) >= 300 ? 'default' : 'pointer', fontSize: 14, color: (scalePercent ?? 100) >= 300 ? 'var(--light)' : 'var(--mid)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, lineHeight: 1 }}
              onMouseEnter={e => e.currentTarget.style.background = '#E5E7EB'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >+</button>
          </div>
        </div>
      )}

      {/* Nudge control - repositions the photo within its zone. The image can
          never be nudged far enough to reveal empty space behind it, so how
          far it can move depends on Scale: at 100% there's often only a few
          clicks' worth of room before it silently stops (by design, not a
          bug) - the hint below is the only feedback for that today. */}
      {value && onNudge && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, paddingLeft: 2 }}>
          <span style={{ fontSize: 11, color: 'var(--mid)', fontWeight: 600, flex: 1 }}>Position</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 1, background: '#F3F4F6', borderRadius: 6, padding: '1px 3px' }}>
            {[
              { dir: '←', axis: 'x', delta: -4 },
              { dir: '→', axis: 'x', delta: 4 },
              { dir: '↑', axis: 'y', delta: -4 },
              { dir: '↓', axis: 'y', delta: 4 },
            ].map(({ dir, axis, delta }) => (
              <button
                key={dir}
                onClick={e => { e.stopPropagation(); onNudge(axis, delta) }}
                title={`Nudge ${dir === '←' ? 'left' : dir === '→' ? 'right' : dir === '↑' ? 'up' : 'down'}`}
                style={{ width: 20, height: 20, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'var(--mid)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, lineHeight: 1 }}
                onMouseEnter={e => e.currentTarget.style.background = '#E5E7EB'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >{dir}</button>
            ))}
          </div>
        </div>
      )}
      {value && onNudge && (
        <div style={{ fontSize: 10, color: 'var(--light)', marginTop: 4, paddingLeft: 2 }}>
          If Position stops moving, bump Scale up first for more room to nudge.
        </div>
      )}
    </div>
  )
}

// ── Main export ──────────────────────────────────────────────────────────────
export default function FieldEditor({ fields, onChange, lang, onLangChange, onExport, exporting, template, templateConfig, fontSizes, onFontSizeChange, alignments, onAlignChange, onResetZone, imageScales, onImageScaleChange, imagePositions, onImageOffsetChange, onTextNudge, restricted, mode, onSave, saving, saveStatus, onSendForReview, comments, currentProjectId, projectName, credits, onCreditUsed, iccProfile, onIccProfileChange }) {
  const [expanded, setExpanded] = useState(false)
  const imageZones = templateConfig?.zones?.filter(z => z.type === 'image') ?? []
  const isNonDesigner = mode === 'non-designer'
  const showControls = !isNonDesigner

  function effectiveFontSize(zoneId, fallback) {
    if (fontSizes?.[zoneId] != null) return fontSizes[zoneId]
    const zone = templateConfig?.zones?.find(z => z.id === zoneId)
    return zone?.fontSize ?? fallback
  }

  function effectiveAlign(zoneId, fallback) {
    if (alignments?.[zoneId] != null) return alignments[zoneId]
    const zone = templateConfig?.zones?.find(z => z.id === zoneId)
    return zone?.align ?? fallback
  }

  // Drag-to-reorder for the panel's steps (see useOrderedKeys above) - text
  // fields and image zones are reordered as two separate groups, same as
  // they're already visually separated by the divider below.
  const textFieldKeys = ['headline', 'sub_headline', 'restaurant_name', 'offer', 'tc', 'cta']
    .filter(k => k === 'headline' || templateConfig?.zones?.some(z => z.id === k))
  const imageZoneKeys = imageZones.map(z => z.id)
  const [textOrder, reorderText] = useOrderedKeys(textFieldKeys)
  const [imageOrder, reorderImages] = useOrderedKeys(imageZoneKeys)
  const [draggingKey, setDraggingKey] = useState(null)
  const [dragOverKey, setDragOverKey] = useState(null)

  function dragSourceProps(key) {
    return {
      draggable: true,
      onDragStart: e => { setDraggingKey(key); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', key) },
      onDragEnd: () => { setDraggingKey(null); setDragOverKey(null) },
    }
  }

  function dropTargetProps(key, reorderFn) {
    return {
      onDragOver: e => { e.preventDefault(); if (draggingKey && draggingKey !== key) setDragOverKey(key) },
      onDragLeave: () => setDragOverKey(prev => (prev === key ? null : prev)),
      onDrop: e => {
        e.preventDefault()
        if (draggingKey) reorderFn(draggingKey, key)
        setDraggingKey(null)
        setDragOverKey(null)
      },
    }
  }

  function renderTextStep(key, step) {
    switch (key) {
      case 'headline':
        return (
          <StepFieldRow
            step={step} label="Headline" fieldKey="headline"
            value={fields.headline} onChange={v => onChange('headline', v)} lang={lang} required
            placeholder={template?.id === 'opt-b-flyer2-simple' ? "z.B. MCDONALD'S?" : undefined}
            credits={credits} onCreditUsed={onCreditUsed}
            readOnly={restricted}
            showControls={showControls && !restricted} showSize={isNonDesigner || restricted}
            fontSize={effectiveFontSize('headline', 50)} onFontSize={s => onFontSizeChange('headline', s)}
            align={effectiveAlign('headline', 'center')} onAlign={a => onAlignChange('headline', a)}
            onResetPosition={() => onResetZone?.('headline')}
            // Guided mode's canvas is locked (no drag) same as restricted review -
            // Headline needs the same Position nudge Offer already got (2026-09-08)
            // or there's no way to fix overlap without switching to Designer mode
            // (Julia's ask, 2026-09-11).
            onNudge={(isNonDesigner || restricted) ? (axis, delta) => onTextNudge?.('headline', axis, delta) : undefined}
          />
        )
      case 'sub_headline':
        return (
          <StepFieldRow
            step={step} label="Sub-headline" fieldKey="sub_headline"
            value={fields.sub_headline} onChange={v => onChange('sub_headline', v)} lang={lang}
            credits={credits} onCreditUsed={onCreditUsed}
            readOnly={restricted}
            showControls={showControls && !restricted} showSize={isNonDesigner || restricted}
            fontSize={effectiveFontSize('sub_headline', 20)} onFontSize={s => onFontSizeChange('sub_headline', s)}
            align={effectiveAlign('sub_headline', 'center')} onAlign={a => onAlignChange('sub_headline', a)}
            onResetPosition={() => onResetZone?.('sub_headline')}
            onNudge={(isNonDesigner || restricted) ? (axis, delta) => onTextNudge?.('sub_headline', axis, delta) : undefined}
          />
        )
      case 'restaurant_name':
        return (
          <StepFieldRow
            step={step} label="Restaurant name" fieldKey="restaurant_name"
            value={fields.restaurant_name} onChange={v => onChange('restaurant_name', v)} lang={lang} required
            credits={credits} onCreditUsed={onCreditUsed}
            readOnly={restricted}
            showControls={false} showSize={false}
            fontSize={20}
            align="right"
            suggestFrom={PLACEHOLDER_PARTNERS}
          />
        )
      case 'offer':
        return (
          <StepFieldRow
            step={step} label="Offer" fieldKey="offer"
            value={fields.offer} onChange={v => onChange('offer', v)} lang={lang} optional
            placeholder="z.B. 30% Rabatt"
            credits={credits} onCreditUsed={onCreditUsed}
            readOnly={restricted}
            showControls={showControls && !restricted} showSize={isNonDesigner || restricted}
            fontSize={effectiveFontSize('offer', 36)} onFontSize={s => onFontSizeChange('offer', s)}
            align={effectiveAlign('offer', 'center')} onAlign={a => onAlignChange('offer', a)}
            onResetPosition={() => onResetZone?.('offer')}
            // Guided mode's canvas is locked (no drag), same as restricted
            // review - Offer needs the same Position nudge that headline/
            // sub_headline restricted mode already has, or there's no way to
            // fix overlap without switching to Designer mode (Julia's ask,
            // 2026-09-08).
            onNudge={(isNonDesigner || restricted) ? (axis, delta) => onTextNudge?.('offer', axis, delta) : undefined}
          />
        )
      case 'tc':
        return (
          <StepFieldRow
            step={step} label="T&amp;Cs" fieldKey="tc"
            value={fields.tc} onChange={v => onChange('tc', v)} lang={lang} multiline optional
            credits={credits} onCreditUsed={onCreditUsed}
            readOnly={restricted}
            showControls={showControls && !restricted}
            fontSize={effectiveFontSize('tc', 5)} onFontSize={s => onFontSizeChange('tc', s)}
            align={effectiveAlign('tc', 'left')} onAlign={a => onAlignChange('tc', a)}
            onResetPosition={() => onResetZone?.('tc')}
            // Was missing this even though headline/sub_headline/offer all
            // already had it - Julia's ask, 2026-09-16, to make Position
            // nudge available on T&Cs too in guided mode, same as the others.
            onNudge={(isNonDesigner || restricted) ? (axis, delta) => onTextNudge?.('tc', axis, delta) : undefined}
          />
        )
      case 'cta':
        return (
          <StepFieldRow
            step={step} label="App download line" fieldKey="cta"
            value={fields.cta} onChange={v => onChange('cta', v)} lang={lang} required
            placeholder="z.B. Lieblingsessen bei McDonald's bestellen."
            credits={credits} onCreditUsed={onCreditUsed}
            readOnly={restricted}
            showControls={showControls && !restricted} showSize={isNonDesigner && !restricted}
            fontSize={effectiveFontSize('cta', 11)} onFontSize={s => onFontSizeChange('cta', s)}
            align={effectiveAlign('cta', 'center')} onAlign={a => onAlignChange('cta', a)}
            onResetPosition={() => onResetZone?.('cta')}
          />
        )
      default:
        return null
    }
  }

  const width = expanded ? 520 : 360

  return (
    <div style={{ width, flexShrink: 0, background: 'var(--surface)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', transition: 'width 0.2s ease' }}>

      {/* Panel header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => setExpanded(e => !e)}
            title={expanded ? 'Collapse panel' : 'Expand panel'}
            style={{
              width: 28, height: 28, borderRadius: 6, flexShrink: 0,
              border: '1px solid var(--border)', background: 'transparent',
              cursor: 'pointer', display: 'flex', alignItems: 'center',
              justifyContent: 'center', color: 'var(--mid)', fontSize: 13,
              transition: 'border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--mid)' }}
          >
            {expanded ? '›' : '‹'}
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--dark)' }}>Edit content</div>
            <div style={{ fontSize: 12, color: 'var(--mid)', marginTop: 1 }}>
              {template?.name ?? 'Promo Flyer'} · A6
              {isNonDesigner && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: 'var(--primary)', background: 'var(--primary-glow)', padding: '1px 6px', borderRadius: 100 }}>{restricted ? 'Review' : 'Guided'}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', background: '#F3F4F6', borderRadius: 8, padding: 3, gap: 2, flexShrink: 0 }}>
            {['de', 'en'].map(l => (
              <button key={l} onClick={() => onLangChange(l)} style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', background: lang === l ? 'var(--primary)' : 'transparent', color: lang === l ? '#fff' : 'var(--mid)', transition: 'all 0.15s' }}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Scrollable fields */}
      <div style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', padding: '20px 24px' }}>

        {/* Project name now lives centered in the header above the canvas,
            not here (Julia's ask, 2026-09-18) - see App.jsx's breadcrumb
            bar. `projectName` is still a prop of this component (used below
            for the merchant-name fallback), just no longer rendered here. */}

        {/* Intro banner for non-designer */}
        {isNonDesigner && (
          <div style={{ background: 'var(--primary-glow)', border: '1px solid var(--primary)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--primary-dark)', marginBottom: 24, lineHeight: 1.5 }}>
            {restricted
              ? 'This design was generated from your brief. Nudge the headline, subline or images into place, then send it for review - text and images are locked.'
              : 'Fill in each step below - your text will appear on the preview automatically.'}
          </div>
        )}

        {/* Text fields - same numbered layout for both modes. Drag the grip
            handle to reorder (hidden in restricted review mode, where
            everything else is locked too) - see useOrderedKeys/ReorderableStep
            above (Julia's ask, 2026-09-18). */}
        {textOrder.map((key, i) => (
          restricted ? (
            <div key={key}>{renderTextStep(key, i + 1)}</div>
          ) : (
            <ReorderableStep
              key={key}
              isDragging={draggingKey === key}
              isDragOver={dragOverKey === key && !!draggingKey && draggingKey !== key}
              dragSource={dragSourceProps(key)}
              dropTarget={dropTargetProps(key, reorderText)}
            >
              {renderTextStep(key, i + 1)}
            </ReorderableStep>
          )
        ))}

        {imageZones.length > 0 && (
          <>
            <div style={{ height: 1, background: 'var(--border)', margin: '4px 0 24px' }} />
            {imageOrder.map((id, i) => {
              const zone = imageZones.find(z => z.id === id)
              if (!zone) return null
              const upload = (
                <ImageUpload
                  step={textOrder.length + 1 + i}
                  label={imageZoneLabel(zone)}
                  hint={zone.hint ?? 'JPG or PNG'}
                  value={fields[`${zone.id}Url`]}
                  onChange={url => onChange(`${zone.id}Url`, url)}
                  square={zone.id === 'logo' || zone.id === 'qr'}
                  onResetPosition={() => onResetZone?.(zone.id)}
                  scalePercent={imageScales?.[zone.id] ?? 100}
                  onScaleChange={(pct) => onImageScaleChange?.(zone.id, pct)}
                  onNudge={(axis, delta) => onImageOffsetChange?.(zone.id, axis, delta)}
                  minWidth={Math.round(zone.width * 300 / CANVAS_PPI)}
                  minHeight={Math.round(zone.height * 300 / CANVAS_PPI)}
                  requireTransparent={zone.hint?.toLowerCase().includes('transparent')}
                  folder={assetFolderForZone(zone.id)}
                  // Templates without a restaurant_name field (e.g. Figma imports
                  // that don't define one) have nothing to auto-tag the merchant
                  // with - fall back to the project name instead of dumping
                  // everything into "General", still with zero extra clicks.
                  merchant={(fields.restaurant_name || '').trim() || (projectName || '').trim() || GENERAL_MERCHANT}
                  autoCropContent={zone.id === 'qr'}
                  restricted={restricted}
                />
              )
              return restricted ? (
                <div key={zone.id}>{upload}</div>
              ) : (
                <ReorderableStep
                  key={zone.id}
                  isDragging={draggingKey === zone.id}
                  isDragOver={dragOverKey === zone.id && !!draggingKey && draggingKey !== zone.id}
                  dragSource={dragSourceProps(zone.id)}
                  dropTarget={dropTargetProps(zone.id, reorderImages)}
                >
                  {upload}
                </ReorderableStep>
              )
            })}
          </>
        )}

        <div style={{ height: 1, background: 'var(--border)', margin: '8px 0 20px' }} />
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--light)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Print settings</div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--dark)', marginBottom: 6 }}>ICC Profile</div>
          {/* Both options actually change the export now (api/export-cmyk.js
              picks the matching bundled .icc + OutputIntent) - unlike the old
              fixed FOGRA39-only display, this is a real choice. FOGRA39 stays
              the default since it's what every export used before this. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ICC_PROFILE_OPTIONS.map(opt => {
              const active = (iccProfile ?? 'fogra39') === opt.id
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onIccProfileChange?.(opt.id)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
                    padding: '10px 12px', fontSize: 13, textAlign: 'left', cursor: 'pointer',
                    border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 8,
                    background: active ? 'var(--primary-glow)' : 'var(--surface)', color: 'var(--dark)',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
                    <span style={{ color: active ? '#16a34a' : 'var(--light)', fontWeight: 700 }}>✓</span>
                    {opt.label}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--mid)', paddingLeft: 22 }}>{opt.hint}</span>
                </button>
              )
            })}
          </div>
        </div>

      </div>

      {/* Action footer: Export PDF → Send for Review → Save (restricted review
          mode hides Export PDF only - Save stays, and returns to the "pick a
          design" screen so a merchant wanting both A and B isn't stuck) */}
      <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {!restricted && (
          <>
            <button
              onClick={onExport}
              disabled={exporting}
              style={{ width: '100%', padding: '13px', fontSize: 14, fontWeight: 700, background: exporting ? 'var(--mid)' : 'var(--primary)', color: '#fff', border: 'none', borderRadius: 10, cursor: exporting ? 'default' : 'pointer', transition: 'background 0.15s' }}
              onMouseEnter={e => { if (!exporting) e.currentTarget.style.background = 'var(--primary-dark)' }}
              onMouseLeave={e => { if (!exporting) e.currentTarget.style.background = 'var(--primary)' }}
            >
              {exporting ? 'Exporting…' : 'Export PDF'}
            </button>
          </>
        )}

        <button
          onClick={onSendForReview}
          disabled={saving}
          style={restricted ? {
            width: '100%', padding: '13px', fontSize: 14, fontWeight: 700,
            background: saving ? 'var(--mid)' : 'var(--primary)', color: '#fff', border: 'none',
            borderRadius: 10, cursor: saving ? 'default' : 'pointer', transition: 'background 0.15s',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          } : {
            width: '100%', padding: '10px', fontSize: 13, fontWeight: 600,
            background: '#fff', color: 'var(--dark)',
            border: '1.5px solid var(--border)',
            borderRadius: 10, cursor: saving ? 'default' : 'pointer', transition: 'all 0.15s',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
          onMouseEnter={e => { if (!saving && !restricted) e.currentTarget.style.borderColor = 'var(--dark)' }}
          onMouseLeave={e => { if (!saving && !restricted) e.currentTarget.style.borderColor = 'var(--border)' }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
          </svg>
          Send for Review
        </button>

        <button
          onClick={onSave}
          disabled={saving}
          title={restricted ? 'Saves this design (findable later in Designs) and takes you back to pick the other option' : undefined}
          style={{
            width: '100%', padding: '10px', fontSize: 13, fontWeight: 600,
            background: '#fff', color: saveStatus === 'saved' ? '#16a34a' : 'var(--dark)',
            border: `1.5px solid ${saveStatus === 'saved' ? '#16a34a' : 'var(--border)'}`,
            borderRadius: 10, cursor: saving ? 'default' : 'pointer', transition: 'all 0.15s',
          }}
          onMouseEnter={e => { if (!saving && saveStatus !== 'saved') { e.currentTarget.style.borderColor = 'var(--dark)' } }}
          onMouseLeave={e => { if (!saving && saveStatus !== 'saved') { e.currentTarget.style.borderColor = 'var(--border)' } }}
        >
          {saving ? 'Saving…' : saveStatus === 'saved' ? '✓ Saved' : restricted ? 'Save & pick another design' : 'Save'}
        </button>

        <div style={{ fontSize: 11, color: 'var(--light)', textAlign: 'center' }}>CMYK · 3mm bleed · print-ready</div>
      </div>

    </div>
  )
}
