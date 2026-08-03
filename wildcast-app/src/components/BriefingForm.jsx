import { useState } from 'react'
import TemplateCandidatePicker from './TemplateCandidatePicker'
import AISuggest from './AISuggest'
import LibraryAssetPickerField from './LibraryAssetPickerField'
import { GENERAL_MERCHANT } from '../lib/assetLibrary'
import { ADD_NEW, PLACEHOLDER_PARTNERS, OBJECTIVES, FORMATS, DEFAULT_BRIEF, resolvePartnerName } from '../lib/briefConstants'

const inputStyle = { width: '100%', padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', border: '1.5px solid var(--border)', borderRadius: 8, outline: 'none', boxSizing: 'border-box' }

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--dark)', marginBottom: 4 }}>{label}</label>
      {hint && <div style={{ fontSize: 12, color: 'var(--mid)', marginBottom: 8 }}>{hint}</div>}
      {children}
    </div>
  )
}

function ChoiceButton({ active, onClick, children, checkbox }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '8px 14px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer',
        border: `1.5px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
        background: active ? 'var(--primary-glow)' : '#fff',
        color: active ? 'var(--primary-dark)' : 'var(--dark)',
        transition: 'all 0.15s',
      }}
    >
      {checkbox ? (active ? '☑ ' : '☐ ') : null}{children}
    </button>
  )
}

export default function BriefingForm({ onPick, onSendForReview }) {
  const [brief, setBrief] = useState(DEFAULT_BRIEF)
  const [submitted, setSubmitted] = useState(null)

  function set(key, value) { setBrief(prev => ({ ...prev, [key]: value })) }

  function toggleFormat(value) {
    setBrief(prev => ({
      ...prev,
      formats: prev.formats.includes(value) ? prev.formats.filter(f => f !== value) : [...prev.formats, value],
    }))
  }

  const selectedObjective = OBJECTIVES.find(o => o.value === brief.objective)
  const partnerFilled = brief.partner === ADD_NEW ? brief.partnerNew.trim().length > 0 : brief.partner.length > 0
  const partnerName = resolvePartnerName(brief)

  const isValid =
    partnerFilled &&
    brief.businessType &&
    brief.about.trim() &&
    brief.objective &&
    (!selectedObjective?.followUp || brief.objectiveFollowUp.trim()) &&
    brief.formats.length > 0 &&
    brief.headline.trim()

  function handleSubmit(e) {
    e.preventDefault()
    if (!isValid) return
    setSubmitted({ ...brief })
  }

  if (submitted) {
    return (
      <TemplateCandidatePicker
        brief={submitted}
        onEdit={() => setSubmitted(null)}
        onPick={onPick}
        onSendForReview={onSendForReview}
      />
    )
  }

  return (
    <div style={{ flex: 1, background: 'var(--bg)', overflow: 'auto' }}>
      <div style={{ borderBottom: '1px solid var(--border)', padding: '28px 40px 24px', background: '#fff' }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--dark)' }}>Brief your design</h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--mid)', maxWidth: 520 }}>
          Tell us what you need, the same way you'd brief a designer — we'll turn it into finished designs to choose from.
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ maxWidth: 640, margin: '0 auto', padding: '32px 24px 60px' }}>

        <Field label="Partner name">
          <select style={inputStyle} value={brief.partner} onChange={e => set('partner', e.target.value)}>
            <option value="" disabled>Select a partner…</option>
            {PLACEHOLDER_PARTNERS.map(p => <option key={p} value={p}>{p}</option>)}
            <option value={ADD_NEW}>+ Add new partner</option>
          </select>
          {brief.partner === ADD_NEW && (
            <input style={{ ...inputStyle, marginTop: 8 }} placeholder="New partner name" value={brief.partnerNew} onChange={e => set('partnerNew', e.target.value)} />
          )}
        </Field>

        <Field label="Business type">
          <div style={{ display: 'flex', gap: 10 }}>
            {['Restaurant', 'Retail'].map(t => (
              <ChoiceButton key={t} active={brief.businessType === t} onClick={() => set('businessType', t)}>{t}</ChoiceButton>
            ))}
          </div>
        </Field>

        <Field label="What is this brief about?" hint="A short intro — helps us pick the right template.">
          <textarea style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }} value={brief.about} onChange={e => set('about', e.target.value)} placeholder="e.g. We're opening a second location in Koblenz…" />
        </Field>

        <Field label="What is the objective?">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {OBJECTIVES.map(o => (
              <ChoiceButton key={o.value} active={brief.objective === o.value} onClick={() => set('objective', o.value)}>{o.label}</ChoiceButton>
            ))}
          </div>
          {selectedObjective?.followUp && (
            <input style={{ ...inputStyle, marginTop: 10 }} placeholder={selectedObjective.followUp} value={brief.objectiveFollowUp} onChange={e => set('objectiveFollowUp', e.target.value)} />
          )}
        </Field>

        <Field label="Formats needed" hint="Pick all that apply.">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {FORMATS.map(f => (
              <ChoiceButton key={f.value} active={brief.formats.includes(f.value)} onClick={() => toggleFormat(f.value)} checkbox>{f.label}</ChoiceButton>
            ))}
          </div>
        </Field>

        <div style={{ borderTop: '1px solid var(--border)', margin: '28px 0 24px', paddingTop: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--mid)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>Copy</div>

          <Field label="Headline">
            <input style={inputStyle} value={brief.headline} onChange={e => set('headline', e.target.value)} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
              <AISuggest field="headline" lang="de" onApply={v => set('headline', v)} />
            </div>
          </Field>

          <Field label="Subline">
            <input style={inputStyle} value={brief.subline} onChange={e => set('subline', e.target.value)} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
              <AISuggest field="sub_headline" lang="de" onApply={v => set('subline', v)} />
            </div>
          </Field>

          <div style={{ marginBottom: 22 }}>
            {brief.stickerRequestMode ? (
              <Field label="Sticker" hint="Describe the new sticker you need — we'll add it to the library.">
                <input style={inputStyle} placeholder="e.g. '26% OFF' badge" value={brief.stickerRequest} onChange={e => set('stickerRequest', e.target.value)} />
                <button type="button" onClick={() => set('stickerRequestMode', false)} style={{ marginTop: 6, background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: 'var(--mid)', padding: 0 }}>
                  ← choose from library instead
                </button>
              </Field>
            ) : (
              <>
                <LibraryAssetPickerField
                  label="Sticker"
                  hint="Choose from preselected stickers, or request a new one."
                  folder="stickers"
                  merchant={GENERAL_MERCHANT}
                  value={brief.stickerAsset}
                  onSelect={a => set('stickerAsset', a)}
                />
                <button type="button" onClick={() => set('stickerRequestMode', true)} style={{ marginTop: 6, background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: 'var(--primary)', padding: 0 }}>
                  + Request a new sticker
                </button>
              </>
            )}
          </div>

          <LibraryAssetPickerField
            label="Food photo"
            hint="Pick a photo from your library — helps when a partner has more than one dish to choose from."
            folder="product-images"
            merchant={partnerName || GENERAL_MERCHANT}
            value={brief.foodPhotoAsset}
            onSelect={a => set('foodPhotoAsset', a)}
          />

          <Field label="T&Cs">
            <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={brief.tcs} onChange={e => set('tcs', e.target.value)} />
          </Field>

          <Field label="QR code needed?">
            <div style={{ display: 'flex', gap: 10 }}>
              <ChoiceButton active={brief.qrNeeded === true} onClick={() => set('qrNeeded', true)}>Yes</ChoiceButton>
              <ChoiceButton active={brief.qrNeeded === false} onClick={() => set('qrNeeded', false)}>No</ChoiceButton>
            </div>
          </Field>
          {brief.qrNeeded === true && (
            <LibraryAssetPickerField
              label="QR code"
              hint="Choose the QR code from your library."
              folder="qr-codes"
              merchant={partnerName || GENERAL_MERCHANT}
              value={brief.qrAsset}
              onSelect={a => set('qrAsset', a)}
            />
          )}
        </div>

        <button type="submit" disabled={!isValid} style={{
          width: '100%', padding: '13px', fontSize: 14, fontWeight: 700, borderRadius: 10, border: 'none', cursor: isValid ? 'pointer' : 'not-allowed',
          background: isValid ? 'var(--primary)' : '#E5E7EB', color: isValid ? '#fff' : 'var(--mid)',
        }}>
          Submit brief
        </button>
        {!isValid && <div style={{ fontSize: 12, color: 'var(--mid)', textAlign: 'center', marginTop: 8 }}>Fill in the fields above to continue.</div>}
      </form>
    </div>
  )
}
