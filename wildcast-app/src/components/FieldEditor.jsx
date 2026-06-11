import { useState } from 'react'
import AISuggest from './AISuggest'

const CHAR_LIMITS = { headline: 30, offer: 20, sub_headline: 60, tc: 120 }

function OptionalBadge() {
  return <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--mid)', background: '#F3F4F6', padding: '2px 7px', borderRadius: 100 }}>If necessary *</span>
}

function RequiredBadge() {
  return <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--primary)', background: 'var(--primary-glow)', padding: '2px 7px', borderRadius: 100 }}>Required</span>
}

function FieldRow({ label, fieldKey, value, onChange, lang, required, optional, multiline }) {
  const limit = CHAR_LIMITS[fieldKey]
  const over = limit && value.length > limit

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--dark)' }}>{label}</span>
          {required && <RequiredBadge />}
          {optional && <OptionalBadge />}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <AISuggest field={fieldKey} lang={lang} onApply={val => onChange(val)} />
          {limit && (
            <span style={{ fontSize: 11, color: over ? '#EF4444' : 'var(--light)', fontVariantNumeric: 'tabular-nums' }}>
              {value.length}/{limit}
            </span>
          )}
        </div>
      </div>
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
    </div>
  )
}

function ImageUpload({ label, hint, required, optional, value, onChange, square }) {
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
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--dark)' }}>{label}</span>
        {required && <RequiredBadge />}
        {optional && <OptionalBadge />}
      </div>
      <div
        onClick={handleClick}
        style={{ border: `1.5px dashed ${value ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 10, padding: '16px', cursor: 'pointer', background: value ? 'var(--primary-glow)' : '#FAFAF8', display: 'flex', alignItems: 'center', gap: 12, transition: 'all 0.15s' }}
      >
        {value ? (
          <>
            <img src={value} alt="" style={{ width: square ? 48 : 48, height: 48, objectFit: 'cover', borderRadius: square ? 4 : 6 }} />
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
    </div>
  )
}

export default function FieldEditor({ fields, onChange, lang, onLangChange, onPreview, onExport, template }) {
  const hasQr = template?.hasQr ?? false
  const [expanded, setExpanded] = useState(false)
  const width = expanded ? 520 : 360

  return (
    <div style={{ width, flexShrink: 0, background: 'var(--surface)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', transition: 'width 0.2s ease' }}>

      {/* Panel header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Expand/collapse toggle — inside the panel, never clipped */}
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
            <div style={{ fontSize: 12, color: 'var(--mid)', marginTop: 1 }}>{template?.name ?? 'Promo Flyer'} · A6</div>
          </div>
          {/* Language toggle */}
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

        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--light)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Text fields</div>

        <FieldRow label="Headline" fieldKey="headline" value={fields.headline} onChange={v => onChange('headline', v)} lang={lang} required />
        <FieldRow label="Offer / Promo sticker" fieldKey="offer" value={fields.offer} onChange={v => onChange('offer', v)} lang={lang} optional />
        <FieldRow label="Sub-headline" fieldKey="sub_headline" value={fields.sub_headline} onChange={v => onChange('sub_headline', v)} lang={lang} />
        <FieldRow label="T&amp;C" fieldKey="tc" value={fields.tc} onChange={v => onChange('tc', v)} lang={lang} multiline optional />

        <div style={{ height: 1, background: 'var(--border)', margin: '8px 0 20px' }} />
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--light)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Media</div>

        <ImageUpload label="Brand Logo" hint="PNG with transparent background · SVG ideal" required value={fields.logoUrl} onChange={(url) => onChange('logoUrl', url)} />
        <ImageUpload label="Product Photo" hint="JPG/PNG · min 150dpi · 1:1 ratio ideal" required value={fields.photoUrl} onChange={(url) => onChange('photoUrl', url)} />

        {hasQr && (
          <ImageUpload label="QR Code" hint="PNG · square · transparent background ideal" optional square value={fields.qrUrl} onChange={(url) => onChange('qrUrl', url)} />
        )}

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

        <div style={{ background: '#FAFAF8', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 11, color: 'var(--mid)', lineHeight: 1.5 }}>
          <strong style={{ color: 'var(--dark)' }}>* If necessary</strong> — fields marked this way are optional. Leave blank if not applicable to this campaign.
        </div>

      </div>

      {/* Export footer */}
      <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          onClick={onPreview}
          style={{ width: '100%', padding: '11px', fontSize: 14, fontWeight: 600, background: 'transparent', color: 'var(--primary)', border: '1.5px solid var(--primary)', borderRadius: 10, cursor: 'pointer', transition: 'background 0.15s' }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-glow)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          Preview
        </button>
        <button
          onClick={onExport}
          style={{ width: '100%', padding: '13px', fontSize: 14, fontWeight: 700, background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', transition: 'background 0.15s' }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-dark)'}
          onMouseLeave={e => e.currentTarget.style.background = 'var(--primary)'}
        >
          Export PDF
        </button>
        <div style={{ fontSize: 11, color: 'var(--light)', textAlign: 'center' }}>CMYK · 3mm bleed · print-ready</div>
      </div>

    </div>
  )
}
