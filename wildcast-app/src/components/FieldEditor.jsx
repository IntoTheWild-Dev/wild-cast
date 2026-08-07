import { useState, useEffect } from 'react'

function formatDateTime(ts) {
  return new Date(ts).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}
import AISuggest from './AISuggest'
import { hasTransparency, cropToContent } from '../lib/image'
import { assetFolderForZone, saveAssetToLibrary, getLibraryAssets, uniqueMerchants, GENERAL_MERCHANT } from '../lib/assetLibrary'

const ALL_MERCHANTS = '__all__'

const CHAR_LIMITS = { headline: 20, offer: 20, sub_headline: 25, tc: 120, restaurant_name: 30, cta: 60 }

const FIELD_HINTS = {
  headline:         "Your main line, e.g. 'DREAMTEAM'",
  sub_headline:     "City or location line, e.g. 'POTSDAMS NEUES'",
  restaurant_name:  "Your restaurant name, e.g. 'Wen Cheng'",
  offer:            "Your promotion, e.g. '30% SPAREN'",
  tc:               'Small-print terms, rotated vertically on the flyer',
  cta:              "Second line under the app-download prompt, e.g. 'Lieblingsessen bei Burger King bestellen.'",
}

function OptionalBadge() {
  return <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--mid)', background: '#F3F4F6', padding: '2px 7px', borderRadius: 100 }}>If necessary *</span>
}

function RequiredBadge() {
  return <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--primary)', background: 'var(--primary-glow)', padding: '2px 7px', borderRadius: 100 }}>Required</span>
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

// Same arrow-button layout as ImageUpload's Position control below — reused
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
// AI Suggest — only Scale (showSize) and onNudge, if passed, stay available.
function StepFieldRow({ step, label, fieldKey, value, onChange, lang, required, optional, multiline, showControls, showSize, fontSize, onFontSize, align, onAlign, onResetPosition, readOnly, onNudge, credits, onCreditUsed }) {
  const limit = CHAR_LIMITS[fieldKey]
  const hint = FIELD_HINTS[fieldKey]
  const over = limit && value.length > limit

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
          {hint && <div style={{ fontSize: 11, color: 'var(--mid)', marginTop: 2 }}>{hint}</div>}
        </div>
      </div>

      {/* Controls row — full (designer) or size-only (guided/restricted) */}
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
          placeholder={`Enter ${label.toLowerCase()}…`}
          style={{ width: '100%', padding: '10px 12px', fontSize: 13, border: `1px solid ${over ? '#EF4444' : 'var(--border)'}`, borderRadius: 8, outline: 'none', resize: 'vertical', background: readOnly ? '#F3F4F6' : 'var(--surface)', color: 'var(--dark)', fontFamily: 'inherit', lineHeight: 1.5, cursor: readOnly ? 'default' : 'text' }}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          readOnly={readOnly}
          maxLength={limit}
          placeholder={`Enter ${label.toLowerCase()}…`}
          style={{ width: '100%', padding: '10px 12px', fontSize: 13, border: `1px solid ${over ? '#EF4444' : 'var(--border)'}`, borderRadius: 8, outline: 'none', background: readOnly ? '#F3F4F6' : 'var(--surface)', color: 'var(--dark)', fontFamily: 'inherit', cursor: readOnly ? 'default' : 'text' }}
        />
      )}
      {!readOnly && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 6 }}>
          <AISuggest field={fieldKey} lang={lang} onApply={val => onChange(val)} credits={credits} onCreditUsed={onCreditUsed} />
          <AISuggest field={fieldKey} lang={lang} onApply={val => onChange(val)} mode="improve" seedText={value} credits={credits} onCreditUsed={onCreditUsed} />
        </div>
      )}
    </div>
  )
}

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

  // Default the library modal's merchant filter to whichever restaurant is
  // currently being edited (re-applied on every open, in case the restaurant
  // name changed since last time) — most of the time that's exactly what you
  // want to reuse from.
  function openLibrary() {
    setLibraryMerchantFilter(merchant)
    setLibraryOpen(true)
  }

  const libraryMerchants = uniqueMerchants(libraryAssets)
  const filteredLibraryAssets = libraryAssets
    .filter(a => libraryMerchantFilter === ALL_MERCHANTS || (a.merchant || GENERAL_MERCHANT) === libraryMerchantFilter)
    .filter(a => !librarySearch.trim() || a.name.toLowerCase().includes(librarySearch.trim().toLowerCase()))

  // The displayed min-resolution text always matches the real 300 DPI check below —
  // never hardcode a pixel count in a zone's hint string, it will drift from this.
  const fullHint = minWidth && minHeight ? `${hint} · min ${minWidth}×${minHeight}px` : hint

  function applyImage(url, name) {
    onChange(url, name)
    if (minWidth && minHeight) {
      const img = new Image()
      img.onload = () => {
        if (img.naturalWidth < minWidth || img.naturalHeight < minHeight) {
          const effectiveDpi = Math.round((img.naturalWidth / (minWidth / 300)))
          setResWarning(`Low resolution — approx. ${effectiveDpi} DPI (300 DPI recommended for print). Images may appear pixelated when printed.`)
        } else {
          setResWarning(null)
        }
      }
      img.src = url
    }
  }

  const handleClick = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async e => {
      const file = e.target.files[0]
      if (!file) return
      setBgError(null)

      if (requireTransparent && file.type !== 'image/png') {
        setBgError('This image has a background — please upload a transparent PNG.')
        return
      }

      let url = URL.createObjectURL(file)

      if (requireTransparent) {
        const transparent = await hasTransparency(url)
        if (!transparent) {
          setBgError('This image has a background — please upload a transparent PNG.')
          URL.revokeObjectURL(url)
          return
        }
      }

      // Many QR generators export with a big white "quiet zone" margin baked
      // into the file — crop it away so a plain "contain" fit fills the zone
      // tightly instead of leaving visible gaps, no manual scale/position
      // needed from a non-designer partner.
      if (autoCropContent) url = await cropToContent(url)

      saveAssetToLibrary(libraryFolder, file.name, url, merchant).then(refreshLibrary)
      applyImage(url, file.name)
    }
    input.click()
  }

  const handlePickFromLibrary = async asset => {
    setBgError(null)
    if (requireTransparent && !(await hasTransparency(asset.src))) {
      setBgError('This image has a background — please pick a transparent PNG.')
      return
    }
    // Covers library assets uploaded before this cropping existed — cropToContent
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
            <span style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 600 }}>{restricted ? 'Uploaded ✓' : 'Uploaded ✓ — click to replace'}</span>
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

      {/* Library picker toggle — only shown when this zone's folder already has saved assets */}
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
                <select
                  value={libraryMerchantFilter}
                  onChange={e => setLibraryMerchantFilter(e.target.value)}
                  style={{ fontSize: 13, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', color: 'var(--dark)' }}
                >
                  <option value={ALL_MERCHANTS}>All merchants</option>
                  {libraryMerchants.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
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

      {/* Background rejection — shown when a transparent-PNG zone gets a flattened/promo image */}
      {bgError && (
        <div style={{ marginTop: 8, padding: '8px 10px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, fontSize: 11, color: '#B91C1C', lineHeight: 1.5 }}>
          ✕ {bgError}
        </div>
      )}

      {/* Low-resolution warning — shown when uploaded image is below 300 DPI for print */}
      {resWarning && (
        <div style={{ marginTop: 8, padding: '8px 10px', background: '#FFF8E1', border: '1px solid #FFD54F', borderRadius: 8, fontSize: 11, color: '#795548', lineHeight: 1.5 }}>
          ⚠ {resWarning}
        </div>
      )}

      {/* Image scale control — shown after upload when in guided mode */}
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

      {/* Nudge control — repositions the photo within its zone. The image can
          never be nudged far enough to reveal empty space behind it, so how
          far it can move depends on Scale: at 100% there's often only a few
          clicks' worth of room before it silently stops (by design, not a
          bug) — the hint below is the only feedback for that today. */}
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
export default function FieldEditor({ fields, onChange, lang, onLangChange, onExport, exporting, template, templateConfig, fontSizes, onFontSizeChange, alignments, onAlignChange, onResetZone, imageScales, onImageScaleChange, imagePositions, onImageOffsetChange, onTextNudge, restricted, mode, onSave, saving, saveStatus, onSendForReview, comments, currentProjectId, projectName, onProjectNameChange, credits, onCreditUsed }) {
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

        {/* Project name */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--mid)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            Project name
          </label>
          <input
            type="text"
            value={projectName ?? ''}
            onChange={e => onProjectNameChange(e.target.value)}
            placeholder="e.g. Wen Cheng – Wolt Promo June"
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '9px 12px', fontSize: 13, fontFamily: 'inherit',
              border: '1px solid var(--border)', borderRadius: 8,
              background: '#fff', color: 'var(--dark)', outline: 'none',
              transition: 'border-color 0.15s',
            }}
            onFocus={e => e.target.style.borderColor = 'var(--primary)'}
            onBlur={e => e.target.style.borderColor = 'var(--border)'}
          />
          <div style={{ fontSize: 11, color: 'var(--mid)', marginTop: 5 }}>
            Used as the PDF filename and label in your Designs tab.
          </div>
        </div>

        {/* Intro banner for non-designer */}
        {isNonDesigner && (
          <div style={{ background: 'var(--primary-glow)', border: '1px solid var(--primary)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--primary-dark)', marginBottom: 24, lineHeight: 1.5 }}>
            {restricted
              ? 'This design was generated from your brief. Nudge the headline, subline or images into place, then send it for review — text and images are locked.'
              : 'Fill in each step below — your text will appear on the preview automatically.'}
          </div>
        )}

        {/* Text fields — same numbered layout for both modes */}
        <StepFieldRow
          step={1} label="Headline" fieldKey="headline"
          value={fields.headline} onChange={v => onChange('headline', v)} lang={lang} required
          credits={credits} onCreditUsed={onCreditUsed}
          readOnly={restricted}
          showControls={showControls && !restricted} showSize={isNonDesigner || restricted}
          fontSize={effectiveFontSize('headline', 50)} onFontSize={s => onFontSizeChange('headline', s)}
          align={effectiveAlign('headline', 'center')} onAlign={a => onAlignChange('headline', a)}
          onResetPosition={() => onResetZone?.('headline')}
          onNudge={restricted ? (axis, delta) => onTextNudge?.('headline', axis, delta) : undefined}
        />
        {templateConfig?.zones?.some(z => z.id === 'sub_headline') && (
          <StepFieldRow
            step={2} label="Sub-headline" fieldKey="sub_headline"
            value={fields.sub_headline} onChange={v => onChange('sub_headline', v)} lang={lang}
            credits={credits} onCreditUsed={onCreditUsed}
            readOnly={restricted}
            showControls={showControls && !restricted} showSize={isNonDesigner || restricted}
            fontSize={effectiveFontSize('sub_headline', 20)} onFontSize={s => onFontSizeChange('sub_headline', s)}
            align={effectiveAlign('sub_headline', 'center')} onAlign={a => onAlignChange('sub_headline', a)}
            onResetPosition={() => onResetZone?.('sub_headline')}
            onNudge={restricted ? (axis, delta) => onTextNudge?.('sub_headline', axis, delta) : undefined}
          />
        )}
        {templateConfig?.zones?.some(z => z.id === 'restaurant_name') && (
          <StepFieldRow
            step={3} label="Restaurant name" fieldKey="restaurant_name"
            value={fields.restaurant_name} onChange={v => onChange('restaurant_name', v)} lang={lang} required
            credits={credits} onCreditUsed={onCreditUsed}
            readOnly={restricted}
            showControls={false} showSize={false}
            fontSize={20}
            align="right"
          />
        )}
        {templateConfig?.zones?.some(z => z.id === 'offer') && (
          <StepFieldRow
            step={4} label="Offer" fieldKey="offer"
            value={fields.offer} onChange={v => onChange('offer', v)} lang={lang} optional
            credits={credits} onCreditUsed={onCreditUsed}
            readOnly={restricted}
            showControls={showControls && !restricted} showSize={isNonDesigner || restricted}
            fontSize={effectiveFontSize('offer', 36)} onFontSize={s => onFontSizeChange('offer', s)}
            align={effectiveAlign('offer', 'center')} onAlign={a => onAlignChange('offer', a)}
            onResetPosition={() => onResetZone?.('offer')}
            onNudge={restricted ? (axis, delta) => onTextNudge?.('offer', axis, delta) : undefined}
          />
        )}
        {templateConfig?.zones?.some(z => z.id === 'tc') && (
          <StepFieldRow
            step={5} label="T&amp;Cs" fieldKey="tc"
            value={fields.tc} onChange={v => onChange('tc', v)} lang={lang} multiline optional
            credits={credits} onCreditUsed={onCreditUsed}
            readOnly={restricted}
            showControls={showControls && !restricted}
            fontSize={effectiveFontSize('tc', 5)} onFontSize={s => onFontSizeChange('tc', s)}
            align={effectiveAlign('tc', 'left')} onAlign={a => onAlignChange('tc', a)}
            onResetPosition={() => onResetZone?.('tc')}
          />
        )}
        {templateConfig?.zones?.some(z => z.id === 'cta') && (
          <StepFieldRow
            step={5} label="App download line" fieldKey="cta"
            value={fields.cta} onChange={v => onChange('cta', v)} lang={lang} required
            credits={credits} onCreditUsed={onCreditUsed}
            readOnly={restricted}
            showControls={showControls && !restricted} showSize={isNonDesigner && !restricted}
            fontSize={effectiveFontSize('cta', 11)} onFontSize={s => onFontSizeChange('cta', s)}
            align={effectiveAlign('cta', 'center')} onAlign={a => onAlignChange('cta', a)}
            onResetPosition={() => onResetZone?.('cta')}
          />
        )}

        {imageZones.length > 0 && (
          <>
            <div style={{ height: 1, background: 'var(--border)', margin: '4px 0 24px' }} />
            {imageZones.map((zone, i) => (
              <ImageUpload
                key={zone.id}
                step={6 + i}
                label={zone.label ?? zone.id}
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
                // with — fall back to the project name instead of dumping
                // everything into "General", still with zero extra clicks.
                merchant={(fields.restaurant_name || '').trim() || (projectName || '').trim() || GENERAL_MERCHANT}
                autoCropContent={zone.id === 'qr'}
                restricted={restricted}
              />
            ))}
          </>
        )}

        <div style={{ height: 1, background: 'var(--border)', margin: '8px 0 20px' }} />
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--light)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Print settings</div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--dark)', marginBottom: 6 }}>ICC Profile</div>
          {/* Every export is FOGRA39 — the only client is Wolt DE (Germany), so
              this was never a real choice. A dropdown offering other profiles
              (GRACoL/SWOP/Japan Color) wasn't wired to anything anyway — the
              export always used FOGRA39 regardless of what was selected — so
              showing it as a fixed value is more honest than a fake picker. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--dark)' }}>
            <span style={{ color: '#16a34a', fontWeight: 700 }}>✓</span>
            FOGRA39 (European offset)
          </div>
        </div>

      </div>

      {/* Action footer: Export PDF → Send for Review → Save (restricted review
          mode hides Export PDF only — Save stays, and returns to the "pick a
          design" screen so a merchant wanting both A and B isn't stuck) */}
      <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {!restricted && (
          <button
            onClick={onExport}
            disabled={exporting}
            style={{ width: '100%', padding: '13px', fontSize: 14, fontWeight: 700, background: exporting ? 'var(--mid)' : 'var(--primary)', color: '#fff', border: 'none', borderRadius: 10, cursor: exporting ? 'default' : 'pointer', transition: 'background 0.15s' }}
            onMouseEnter={e => { if (!exporting) e.currentTarget.style.background = 'var(--primary-dark)' }}
            onMouseLeave={e => { if (!exporting) e.currentTarget.style.background = 'var(--primary)' }}
          >
            {exporting ? 'Exporting…' : 'Export PDF'}
          </button>
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
