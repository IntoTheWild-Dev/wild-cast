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
import { sortIdsByFieldOrder } from '../lib/fieldOrder'

const ALL_MERCHANTS = '__all__'

const CHAR_LIMITS = { headline: 20, offer: 20, sub_headline: 25, tc: 120, restaurant_name: 30, cta: 60 }

// Matches the label each case in renderTextStep's switch passes to
// StepFieldRow - used by the accordion's collapsed row, which needs a
// field's label without rendering its full step.
const TEXT_FIELD_LABELS = {
  headline: 'Headline',
  sub_headline: 'Sub-headline',
  restaurant_name: 'Restaurant name',
  offer: 'Offer',
  tc: 'T&Cs',
  cta: 'App download line',
}

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
// No wrapping div/label of its own (Julia's ask, 2026-09-18: Position needs
// to sit inline on the same row as Scale/font-size, not stacked below it) -
// the caller supplies the "Position" label and lays this out alongside its
// other controls.
function NudgeArrows({ onNudge }) {
  return (
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
  )
}

// A collapsed accordion row - one line, click anywhere to expand into the
// full StepFieldRow/ImageUpload below (Julia's editor redesign, 2026-09-18,
// per Annika's mockup: "collapse finished fields to a single line"). Shows a
// ✓ once the field has content, a plain empty circle otherwise - matches the
// numbered chip's coral so it reads as the same "step" system, not a new one.
function CollapsedFieldRow({ label, ready, preview, thumb, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
        padding: '10px 12px', marginBottom: 8, textAlign: 'left',
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
        cursor: 'pointer', transition: 'border-color 0.15s', fontFamily: 'inherit',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
    >
      <span style={{
        width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: ready ? 'var(--primary)' : 'transparent',
        border: ready ? 'none' : '1.5px solid var(--border)',
        color: '#fff', fontSize: 11, fontWeight: 700,
      }}>
        {ready ? '✓' : ''}
      </span>
      {thumb && <img src={thumb} alt="" style={{ width: 24, height: 24, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />}
      <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--dark)', flexShrink: 0 }}>{label}</span>
        {preview && (
          <span style={{ fontSize: 12, color: 'var(--mid)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {preview}
          </span>
        )}
      </span>
      <span style={{ color: 'var(--light)', fontSize: 12, flexShrink: 0 }}>⌄</span>
    </button>
  )
}

// ── Unified numbered field row (both modes) ─────────────────────────────────
// showControls=true adds font-size, alignment and reset position (designer mode)
// showSize=true adds just the font-size control (guided mode)
// readOnly=true (restricted review mode) locks the text value itself and hides
// AI Suggest - only Scale (showSize) and onNudge, if passed, stay available.
function StepFieldRow({ step, label, fieldKey, value, onChange, lang, required, optional, multiline, showControls, showSize, fontSize, onFontSize, align, onAlign, onResetPosition, readOnly, onNudge, credits, onCreditUsed, placeholder, suggestFrom, onFocusField, vertical }) {
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

      {/* Controls row - font size/align (designer) or size-only (guided/
          restricted), Position now inline on the same row instead of a
          separate one below it (Julia's ask, 2026-09-18). */}
      {(showControls || showSize || onNudge) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, paddingLeft: 34, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
          {onNudge && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--mid)', fontWeight: 600 }}>Position</span>
              <NudgeArrows onNudge={onNudge} />
            </div>
          )}
        </div>
      )}

      {/* Input - focus/blur report this field up to App.jsx's activeZoneId
          (Annika's ask, 2026-09-18: light up the matching zone on the
          canvas while typing here) - see TemplateCanvas.jsx's own effect
          keyed on that prop for the actual highlight. */}
      {multiline ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => onFocusField?.(fieldKey)}
          onBlur={() => onFocusField?.(null)}
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
          onFocus={() => onFocusField?.(fieldKey)}
          onBlur={() => onFocusField?.(null)}
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
          {/* One button, not two (Julia's editor redesign, 2026-09-18) -
              AISuggest itself decides generate-vs-improve from seedText.
              vertical ("Restaurant"/"Retail" from the brief) strictly scopes
              which KB examples and rules it retrieves - without it the
              backend falls back to the unfiltered library. */}
          <AISuggest field={fieldKey} lang={lang} onApply={val => onChange(val)} seedText={value} credits={credits} onCreditUsed={onCreditUsed} context={{ vertical }} />
        </div>
      )}
    </div>
  )
}

// Output ICC profile for CMYK export (api/export-cmyk.js has the matching
// ICC_PROFILES map + bundled .icc files). FOGRA39 was removed as a choice
// (Julia's ask, 2026-09-18) - FOGRA51 is now the only, fixed profile every
// export uses (App.jsx's iccProfile default was updated to match).
const ICC_PROFILE = { label: 'FOGRA51', hint: 'PSO Coated v3 · ISO 12647-2:2013' }

// ── Image upload ─────────────────────────────────────────────────────────────
// Canvas is 316×441px = A6 105×148mm → canvas PPI ≈ 76.4
// For 300 DPI print the image needs ~3.93× the zone's canvas pixel width/height.
const CANVAS_PPI = 316 / (105 / 25.4)

function ImageUpload({ step, label, required, optional, value, onChange, square, onResetPosition, scalePercent, onScaleChange, onNudge, minWidth, minHeight, requireTransparent, folder, merchant, autoCropContent, restricted, zoneId, onFocusField }) {
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
        </div>
      </div>

      {/* Upload and "choose from library" side by side as two equal buttons,
          not a big drop zone with a small text link stacked underneath it -
          Julia's ask, 2026-09-18. */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={restricted ? undefined : handleClick}
          onMouseEnter={() => onFocusField?.(zoneId)}
          onMouseLeave={() => onFocusField?.(null)}
          disabled={restricted}
          style={{ flex: 1, minWidth: 0, border: `1.5px dashed ${value ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 10, padding: '10px 8px', cursor: restricted ? 'default' : 'pointer', background: value ? 'var(--primary-glow)' : '#FAFAF8', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, transition: 'all 0.15s', fontFamily: 'inherit', textAlign: 'center' }}
        >
          {value ? (
            <img src={value} alt="" style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: square ? 4 : 6, flexShrink: 0 }} />
          ) : (
            <div style={{ width: 28, height: 28, background: 'var(--dark)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </div>
          )}
          <span style={{ fontSize: 11, fontWeight: 600, color: value ? 'var(--primary)' : 'var(--dark)', lineHeight: 1.3 }}>
            {value ? (restricted ? 'Uploaded ✓' : 'Click to replace') : (restricted ? 'No image' : 'Click to upload')}
          </span>
        </button>

        {!restricted && (
          <button
            type="button"
            onClick={openLibrary}
            onMouseEnter={() => onFocusField?.(zoneId)}
            onMouseLeave={() => onFocusField?.(null)}
            style={{ flex: 1, minWidth: 0, border: '1.5px dashed var(--border)', borderRadius: 10, padding: '10px 8px', cursor: 'pointer', background: '#FAFAF8', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, transition: 'all 0.15s', fontFamily: 'inherit', textAlign: 'center' }}
          >
            <div style={{ width: 28, height: 28, background: 'var(--dark)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>
              </svg>
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--dark)', lineHeight: 1.3 }}>
              Choose from library
            </span>
          </button>
        )}
      </div>
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

      {/* Scale and Position inline on one row (Julia's ask, 2026-09-18),
          instead of two stacked rows. The image can never be nudged far
          enough to reveal empty space behind it, so how far it can move
          depends on Scale: at 100% there's often only a few clicks' worth
          of room before it silently stops (by design, not a bug) - the
          hint below is the only feedback for that today. */}
      {value && (onScaleChange || onNudge) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 8, paddingLeft: 2, flexWrap: 'wrap' }}>
          {onScaleChange && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--mid)', fontWeight: 600 }}>Scale</span>
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
          {onNudge && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--mid)', fontWeight: 600 }}>Position</span>
              <NudgeArrows onNudge={(axis, delta) => onNudge(axis, delta)} />
            </div>
          )}
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
export default function FieldEditor({ fields, onChange, lang, onExport, exporting, template, templateConfig, fontSizes, onFontSizeChange, alignments, onAlignChange, onResetZone, imageScales, onImageScaleChange, imagePositions, onImageOffsetChange, onTextNudge, restricted, mode, onSave, saving, saveStatus, onSendForReview, comments, currentProjectId, projectName, credits, onCreditUsed, onFocusField, vertical, reviewSent }) {
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

  const textFieldKeys = ['headline', 'sub_headline', 'restaurant_name', 'offer', 'tc', 'cta']
    .filter(k => k === 'headline' || templateConfig?.zones?.some(z => z.id === k))
  const imageZoneKeys = imageZones.map(z => z.id)
  // Interleaved so this panel's step numbers match TemplateCanvas.jsx's
  // on-canvas zone labels (Logo, Subline, Headline, Photo, ... - see
  // lib/fieldOrder.js for the shared order both sort by), not grouped into
  // "all text fields, then all images" the way the two blocks below used to
  // render.
  const fieldOrder = sortIdsByFieldOrder([...textFieldKeys, ...imageZoneKeys])

  // Accordion: only one field expanded (full controls) at a time, every
  // other field collapses to a single summary line - Julia's editor
  // redesign, 2026-09-18, per Annika's mockup ("collapse finished fields to
  // a single line"). Defaults to the first field, resetting whenever the
  // template changes - same render-time-adjustment pattern as advancedMode
  // in App.jsx, avoiding an effect-based setState for the same reason.
  const [expandedFieldOrderSig, setExpandedFieldOrderSig] = useState(fieldOrder.join('|'))
  const [expandedKey, setExpandedKey] = useState(fieldOrder[0] ?? null)
  const fieldOrderSig = fieldOrder.join('|')
  if (expandedFieldOrderSig !== fieldOrderSig) {
    setExpandedFieldOrderSig(fieldOrderSig)
    setExpandedKey(fieldOrder[0] ?? null)
  }

  function isFieldReady(key) {
    const zone = imageZones.find(z => z.id === key)
    return zone ? !!fields[`${zone.id}Url`] : !!(fields[key] || '').trim()
  }

  function renderTextStep(key, step) {
    switch (key) {
      case 'headline':
        return (
          <StepFieldRow
            step={step} label="Headline" fieldKey="headline"
            onFocusField={onFocusField}
            vertical={vertical}
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
            onFocusField={onFocusField}
            vertical={vertical}
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
            onFocusField={onFocusField}
            vertical={vertical}
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
            onFocusField={onFocusField}
            vertical={vertical}
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
            onFocusField={onFocusField}
            vertical={vertical}
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
            onFocusField={onFocusField}
            vertical={vertical}
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
              {/* "Guided" pill removed - the Guided/Advanced toggle in
                  App.jsx's breadcrumb area already shows this now (Julia's
                  editor redesign, 2026-09-18). "Review" stays - restricted
                  mode has no toggle to duplicate it. */}
              {isNonDesigner && restricted && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: 'var(--primary)', background: 'var(--primary-glow)', padding: '1px 6px', borderRadius: 100 }}>Review</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable fields */}
      <div style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', padding: '20px 24px' }}>

        {/* Project name now lives centered in the header above the canvas,
            not here (Julia's ask, 2026-09-18) - see App.jsx's breadcrumb
            bar. `projectName` is still a prop of this component (used below
            for the merchant-name fallback), just no longer rendered here. */}

        {/* Accordion: the active field renders in full (same step number as
            TemplateCanvas.jsx's on-canvas zone labels - see fieldOrder
            above); every other field collapses to one summary line - Julia's
            editor redesign, 2026-09-18. */}
        {fieldOrder.map((key, i) => {
          const zone = imageZones.find(z => z.id === key)

          if (key !== expandedKey) {
            return (
              <CollapsedFieldRow
                key={key}
                label={zone ? imageZoneLabel(zone) : TEXT_FIELD_LABELS[key]}
                ready={isFieldReady(key)}
                preview={zone ? null : fields[key]}
                thumb={zone ? fields[`${zone.id}Url`] : null}
                onClick={() => setExpandedKey(key)}
              />
            )
          }

          if (zone) {
            return (
              <ImageUpload
                key={zone.id}
                step={i + 1}
                zoneId={zone.id}
                onFocusField={onFocusField}
                label={imageZoneLabel(zone)}
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
          }
          return <div key={key}>{renderTextStep(key, i + 1)}</div>
        })}

        <div style={{ height: 1, background: 'var(--border)', margin: '8px 0 20px' }} />
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--light)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Print settings</div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--dark)', marginBottom: 6 }}>ICC Profile</div>
          {/* No longer a choice (FOGRA39 removed, Julia's ask, 2026-09-18) -
              every export uses FOGRA51, shown here for reference only. */}
          <div style={{ padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--dark)' }}>{ICC_PROFILE.label}</div>
            <div style={{ fontSize: 11, color: 'var(--mid)', marginTop: 2 }}>{ICC_PROFILE.hint}</div>
          </div>
        </div>

      </div>

      {/* Action footer - Julia's editor redesign, 2026-09-18, per Annika's
          mockup: autosave replaces the manual Save button, leaving Send for
          Review as the one primary CTA, with Export PDF gated behind it.
          Restricted review mode is untouched - it never had autosave (a
          brief-generated candidate's own save flow is deliberately manual,
          see handleSaveAndReturnToPicker in App.jsx) and has no "Advanced"
          concept to gate export against. */}
      <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {restricted ? (
          <>
            <button
              onClick={onSendForReview}
              disabled={saving}
              style={{
                width: '100%', padding: '13px', fontSize: 14, fontWeight: 700,
                background: saving ? 'var(--mid)' : 'var(--primary)', color: '#fff', border: 'none',
                borderRadius: 10, cursor: saving ? 'default' : 'pointer', transition: 'background 0.15s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
              </svg>
              Send for Review
            </button>
            <button
              onClick={onSave}
              disabled={saving}
              title="Saves this design (findable later in Designs) and takes you back to pick the other option"
              style={{
                width: '100%', padding: '10px', fontSize: 13, fontWeight: 600,
                background: '#fff', color: saveStatus === 'saved' ? '#16a34a' : 'var(--dark)',
                border: `1.5px solid ${saveStatus === 'saved' ? '#16a34a' : 'var(--border)'}`,
                borderRadius: 10, cursor: saving ? 'default' : 'pointer', transition: 'all 0.15s',
              }}
            >
              {saving ? 'Saving…' : saveStatus === 'saved' ? '✓ Saved' : 'Save & pick another design'}
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onSendForReview}
              disabled={saving}
              style={{
                width: '100%', padding: '13px', fontSize: 14, fontWeight: 700,
                background: saving ? 'var(--mid)' : 'var(--primary)', color: '#fff', border: 'none',
                borderRadius: 10, cursor: saving ? 'default' : 'pointer', transition: 'background 0.15s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
              onMouseEnter={e => { if (!saving) e.currentTarget.style.background = 'var(--primary-dark)' }}
              onMouseLeave={e => { if (!saving) e.currentTarget.style.background = 'var(--primary)' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
              </svg>
              Send for Review
            </button>

            {reviewSent ? (
              <button
                onClick={onExport}
                disabled={exporting}
                style={{ width: '100%', padding: '10px', fontSize: 13, fontWeight: 600, background: '#fff', color: 'var(--dark)', border: '1.5px solid var(--border)', borderRadius: 10, cursor: exporting ? 'default' : 'pointer', transition: 'all 0.15s' }}
                onMouseEnter={e => { if (!exporting) e.currentTarget.style.borderColor = 'var(--dark)' }}
                onMouseLeave={e => { if (!exporting) e.currentTarget.style.borderColor = 'var(--border)' }}
              >
                {exporting ? 'Exporting…' : 'Export PDF'}
              </button>
            ) : (
              <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--light)', padding: '4px 0' }}>
                🔒 Export PDF - unlocks once you send for review
              </div>
            )}
          </>
        )}
      </div>

    </div>
  )
}
