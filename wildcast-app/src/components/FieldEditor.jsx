import { useState } from 'react'

function formatDateTime(ts) {
  return new Date(ts).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}
import AISuggest from './AISuggest'

const CHAR_LIMITS = { headline: 30, offer: 20, sub_headline: 60, tc: 120 }

const FIELD_HINTS = {
  headline:    "Your main line, e.g. 'DREAMTEAM'",
  sub_headline:"City or location line, e.g. 'POTSDAMS NEUES'",
  offer:       "Your promotion, e.g. '30% SPAREN'",
  tc:          'Small-print terms, rotated vertically on the flyer',
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

// ── Unified numbered field row (both modes) ─────────────────────────────────
// showControls=true adds font-size, alignment and reset position (designer mode)
// showSize=true adds just the font-size control (guided mode)
function StepFieldRow({ step, label, fieldKey, value, onChange, lang, required, optional, multiline, showControls, showSize, fontSize, onFontSize, align, onAlign, onResetPosition }) {
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

      {/* Controls row — full (designer) or size-only (guided) */}
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

      {/* Input */}
      {multiline ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          maxLength={limit}
          rows={3}
          placeholder={`Enter ${label.toLowerCase()}…`}
          style={{ width: '100%', padding: '10px 12px', fontSize: 13, border: `1px solid ${over ? '#EF4444' : 'var(--border)'}`, borderRadius: 8, outline: 'none', resize: 'vertical', background: 'var(--surface)', color: 'var(--dark)', fontFamily: 'inherit', lineHeight: 1.5 }}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          maxLength={limit}
          placeholder={`Enter ${label.toLowerCase()}…`}
          style={{ width: '100%', padding: '10px 12px', fontSize: 13, border: `1px solid ${over ? '#EF4444' : 'var(--border)'}`, borderRadius: 8, outline: 'none', background: 'var(--surface)', color: 'var(--dark)', fontFamily: 'inherit' }}
        />
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
        <AISuggest field={fieldKey} lang={lang} onApply={val => onChange(val)} />
      </div>
    </div>
  )
}

// ── Image upload ─────────────────────────────────────────────────────────────
function ImageUpload({ step, label, hint, required, optional, value, onChange, square, onResetPosition, scalePercent, onScaleChange }) {
  const handleClick = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = e => {
      const file = e.target.files[0]
      if (file) onChange(URL.createObjectURL(file), file.name)
    }
    input.click()
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
          {hint && <div style={{ fontSize: 11, color: 'var(--mid)', marginTop: 2 }}>{hint}</div>}
        </div>
      </div>
      <div
        onClick={handleClick}
        style={{ border: `1.5px dashed ${value ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 10, padding: '16px', cursor: 'pointer', background: value ? 'var(--primary-glow)' : '#FAFAF8', display: 'flex', alignItems: 'center', gap: 12, transition: 'all 0.15s' }}
      >
        {value ? (
          <>
            <img src={value} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: square ? 4 : 6 }} />
            <span style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 600 }}>Uploaded ✓ — click to replace</span>
          </>
        ) : (
          <>
            <div style={{ width: 40, height: 40, background: 'var(--dark)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--dark)' }}>Drop file or click to upload</div>
              <div style={{ fontSize: 11, color: 'var(--light)', marginTop: 2 }}>{hint}</div>
            </div>
          </>
        )}
      </div>

      {/* Image scale control — shown after upload when in guided mode */}
      {value && onScaleChange && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, paddingLeft: 2 }}>
          <span style={{ fontSize: 11, color: 'var(--mid)', fontWeight: 600, flex: 1 }}>Scale</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 1, background: '#F3F4F6', borderRadius: 6, padding: '1px 3px' }}>
            <button
              onClick={e => { e.stopPropagation(); onScaleChange(Math.max(20, (scalePercent ?? 100) - 10)) }}
              style={{ width: 20, height: 20, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 14, color: 'var(--mid)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, lineHeight: 1 }}
              onMouseEnter={e => e.currentTarget.style.background = '#E5E7EB'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >−</button>
            <span style={{ fontSize: 10, fontVariantNumeric: 'tabular-nums', minWidth: 34, textAlign: 'center', color: 'var(--mid)', fontWeight: 600 }}>{scalePercent ?? 100}%</span>
            <button
              onClick={e => { e.stopPropagation(); onScaleChange(Math.min(300, (scalePercent ?? 100) + 10)) }}
              style={{ width: 20, height: 20, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 14, color: 'var(--mid)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, lineHeight: 1 }}
              onMouseEnter={e => e.currentTarget.style.background = '#E5E7EB'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >+</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main export ──────────────────────────────────────────────────────────────
export default function FieldEditor({ fields, onChange, lang, onLangChange, onExport, exporting, template, templateConfig, fontSizes, onFontSizeChange, alignments, onAlignChange, onResetZone, imageScales, onImageScaleChange, mode, onSave, saving, saveStatus, onSendForReview, comments, currentProjectId, projectName, onProjectNameChange }) {
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
              {isNonDesigner && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: 'var(--primary)', background: 'var(--primary-glow)', padding: '1px 6px', borderRadius: 100 }}>Guided</span>}
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
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

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
            Fill in each step below — your text will appear on the preview automatically.
          </div>
        )}

        {/* Text fields — same numbered layout for both modes */}
        <StepFieldRow
          step={1} label="Headline" fieldKey="headline"
          value={fields.headline} onChange={v => onChange('headline', v)} lang={lang} required
          showControls={showControls} showSize={isNonDesigner}
          fontSize={effectiveFontSize('headline', 50)} onFontSize={s => onFontSizeChange('headline', s)}
          align={effectiveAlign('headline', 'center')} onAlign={a => onAlignChange('headline', a)}
          onResetPosition={() => onResetZone?.('headline')}
        />
        <StepFieldRow
          step={2} label="Sub-headline" fieldKey="sub_headline"
          value={fields.sub_headline} onChange={v => onChange('sub_headline', v)} lang={lang}
          showControls={showControls} showSize={isNonDesigner}
          fontSize={effectiveFontSize('sub_headline', 20)} onFontSize={s => onFontSizeChange('sub_headline', s)}
          align={effectiveAlign('sub_headline', 'center')} onAlign={a => onAlignChange('sub_headline', a)}
          onResetPosition={() => onResetZone?.('sub_headline')}
        />
        <StepFieldRow
          step={3} label="Offer" fieldKey="offer"
          value={fields.offer} onChange={v => onChange('offer', v)} lang={lang} optional
          showControls={showControls} showSize={isNonDesigner}
          fontSize={effectiveFontSize('offer', 36)} onFontSize={s => onFontSizeChange('offer', s)}
          align={effectiveAlign('offer', 'center')} onAlign={a => onAlignChange('offer', a)}
          onResetPosition={() => onResetZone?.('offer')}
        />
        <StepFieldRow
          step={4} label="T&amp;Cs" fieldKey="tc"
          value={fields.tc} onChange={v => onChange('tc', v)} lang={lang} multiline optional
          showControls={showControls}
          fontSize={effectiveFontSize('tc', 5)} onFontSize={s => onFontSizeChange('tc', s)}
          align={effectiveAlign('tc', 'left')} onAlign={a => onAlignChange('tc', a)}
          onResetPosition={() => onResetZone?.('tc')}
        />

        {imageZones.length > 0 && (
          <>
            <div style={{ height: 1, background: 'var(--border)', margin: '4px 0 24px' }} />
            {imageZones.map((zone, i) => (
              <ImageUpload
                key={zone.id}
                step={5 + i}
                label={zone.label ?? zone.id}
                hint={zone.hint ?? 'JPG or PNG'}
                value={fields[`${zone.id}Url`]}
                onChange={url => onChange(`${zone.id}Url`, url)}
                square={zone.id === 'logo'}
                onResetPosition={showControls ? () => onResetZone?.(zone.id) : null}
                scalePercent={isNonDesigner ? (imageScales?.[zone.id] ?? 100) : undefined}
                onScaleChange={isNonDesigner ? (pct) => onImageScaleChange?.(zone.id, pct) : null}
              />
            ))}
          </>
        )}

        <div style={{ height: 1, background: 'var(--border)', margin: '8px 0 20px' }} />
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--light)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Print settings</div>

        <div style={{ height: 1, background: 'var(--border)', margin: '8px 0 20px' }} />
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--light)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Print settings</div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--dark)', marginBottom: 6 }}>ICC Profile</div>
          <select style={{ width: '100%', padding: '10px 12px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--dark)', fontFamily: 'inherit' }}>
            <option>FOGRA39 (European offset)</option>
            <option>GRACoL 2013 (US web coated)</option>
            <option>SWOP</option>
            <option>Japan Color 2001</option>
          </select>
        </div>

      </div>

      {/* Action footer: Export PDF → Send for Review → Save */}
      <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          onClick={onExport}
          disabled={exporting}
          style={{ width: '100%', padding: '13px', fontSize: 14, fontWeight: 700, background: exporting ? 'var(--mid)' : 'var(--primary)', color: '#fff', border: 'none', borderRadius: 10, cursor: exporting ? 'default' : 'pointer', transition: 'background 0.15s' }}
          onMouseEnter={e => { if (!exporting) e.currentTarget.style.background = 'var(--primary-dark)' }}
          onMouseLeave={e => { if (!exporting) e.currentTarget.style.background = 'var(--primary)' }}
        >
          {exporting ? 'Exporting…' : 'Export PDF'}
        </button>

        <button
          onClick={onSendForReview}
          disabled={saving}
          style={{
            width: '100%', padding: '10px', fontSize: 13, fontWeight: 600,
            background: '#fff', color: 'var(--dark)',
            border: '1.5px solid var(--border)',
            borderRadius: 10, cursor: saving ? 'default' : 'pointer', transition: 'all 0.15s',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
          onMouseEnter={e => { if (!saving) e.currentTarget.style.borderColor = 'var(--dark)' }}
          onMouseLeave={e => { if (!saving) e.currentTarget.style.borderColor = 'var(--border)' }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
          </svg>
          Send for Review
        </button>

        <button
          onClick={onSave}
          disabled={saving}
          style={{
            width: '100%', padding: '10px', fontSize: 13, fontWeight: 600,
            background: '#fff', color: saveStatus === 'saved' ? '#16a34a' : 'var(--dark)',
            border: `1.5px solid ${saveStatus === 'saved' ? '#16a34a' : 'var(--border)'}`,
            borderRadius: 10, cursor: saving ? 'default' : 'pointer', transition: 'all 0.15s',
          }}
          onMouseEnter={e => { if (!saving && saveStatus !== 'saved') { e.currentTarget.style.borderColor = 'var(--dark)' } }}
          onMouseLeave={e => { if (!saving && saveStatus !== 'saved') { e.currentTarget.style.borderColor = 'var(--border)' } }}
        >
          {saving ? 'Saving…' : saveStatus === 'saved' ? '✓ Saved' : 'Save'}
        </button>

        <div style={{ fontSize: 11, color: 'var(--light)', textAlign: 'center' }}>CMYK · 3mm bleed · print-ready</div>
      </div>

    </div>
  )
}
