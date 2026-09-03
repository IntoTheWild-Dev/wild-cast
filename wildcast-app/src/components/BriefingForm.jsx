import { useRef, useState } from 'react'
import TemplateCandidatePicker from './TemplateCandidatePicker'
import TemplatePreviewModal, { TEMPLATE_PREVIEW_GROUPS } from './TemplatePreviewModal'
import AISuggest from './AISuggest'
import PresetPicker from './PresetPicker'
import LibraryAssetPickerField from './LibraryAssetPickerField'
import WordCarousel from './WordCarousel'
import Select from './Select'
import { HugeiconsIcon } from '@hugeicons/react'
import { CheckmarkSquare01Icon, SquareIcon } from '@hugeicons/core-free-icons'
import { GENERAL_MERCHANT } from '../lib/assetLibrary'
import { ADD_NEW, PLACEHOLDER_PARTNERS, OBJECTIVES, FORMATS, DEFAULT_BRIEF, resolvePartnerName } from '../lib/briefConstants'

// Flattened lookup so picking a preview card can pre-fill the brief's
// format/business-type answers - see TemplatePreviewModal.jsx for the
// grouped source data.
const TEMPLATE_PREVIEW_OPTIONS = TEMPLATE_PREVIEW_GROUPS.flatMap(g =>
  g.options.map(o => ({ ...o, format: g.format, businessType: g.businessType }))
)

const inputStyle = { width: '100%', padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', border: '1.5px solid var(--border)', borderRadius: 8, outline: 'none', boxSizing: 'border-box' }

// Left-column hero copy - reused from the old landing page (TemplatePicker.jsx's
// now-unused mode="hero" path) per Julia's ask (2026-08-03) to bring back that
// left-text/right-form layout for the new briefing form.
const FEATURES = [
  {
    title: 'Pre-approved templates',
    desc: 'On-brand designs, ready to customize - no designer needed.',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6M9 12h6M9 15h4"/></svg>,
  },
  {
    title: 'Edit text & photos in minutes',
    desc: 'Swap in your own copy, logo and food photos.',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>,
  },
  {
    title: 'Print-ready CMYK export',
    desc: 'PDF/X-4 with 3mm bleed - send straight to print.',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  },
  {
    title: 'Logos & photos saved for reuse',
    desc: 'Everything you upload lands in your library automatically.',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="14" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
  },
]

function HeroColumn({ onPickTemplate, selectedCount }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>Wolt Partner Tools</div>
      <h1 style={{ fontSize: 42, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--dark)', margin: '0 0 20px', lineHeight: 1.08 }}>
        We help <WordCarousel words={['design', 'export', 'print']} style={{ color: 'var(--primary)' }} />
      </h1>
      <p style={{ fontSize: 15, color: 'var(--mid)', lineHeight: 1.6, maxWidth: 420, marginBottom: 24 }}>
        Tell us what you need, the same way you'd brief a designer - we'll turn it into finished designs to choose from.
      </p>
      <button
        type="button"
        onClick={onPickTemplate}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 36,
          padding: '11px 20px', fontSize: 13, fontWeight: 700, borderRadius: 10, cursor: 'pointer',
          border: '1.5px solid var(--primary)', background: '#fff', color: 'var(--primary)',
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6M9 12h6M9 15h4"/></svg>
        {selectedCount > 0 ? `Templates picked (${selectedCount})` : 'Pick your template first'}
      </button>

      <div
        style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          background: 'var(--primary-glow)', border: '1px solid var(--border)', borderRadius: 12,
          padding: '14px 16px', marginBottom: 36, maxWidth: 420,
        }}
      >
        <span style={{ color: 'var(--primary)', fontSize: 16, lineHeight: '20px' }}>✦</span>
        <p style={{ fontSize: 13, color: 'var(--dark)', margin: 0, lineHeight: 1.5 }}>
          <strong>Before you upload:</strong> product photos should be high
          resolution - use Wild Scale's <strong>Print</strong> preset
          (2400×2400px) - with the background removed (transparent PNG).{' '}
          <a
            href="https://scale.wildstack.studio"
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--primary)', fontWeight: 700, textDecoration: 'underline' }}
          >
            Prep your assets with Wild Scale →
          </a>
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {FEATURES.map(f => (
          <div key={f.title} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--primary-glow)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {f.icon}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--dark)' }}>{f.title}</div>
              <div style={{ fontSize: 12, color: 'var(--mid)', marginTop: 1 }}>{f.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

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
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '8px 14px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer',
        border: `1.5px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
        background: active ? 'var(--primary-glow)' : '#fff',
        color: active ? 'var(--primary-dark)' : 'var(--dark)',
        transition: 'all 0.15s',
      }}
    >
      {checkbox ? <HugeiconsIcon icon={active ? CheckmarkSquare01Icon : SquareIcon} size={15} /> : null}{children}
    </button>
  )
}

export default function BriefingForm({ submitted, onSubmitted, onPick, onSendForReview, savedCandidateIds, savedCandidatePreviews, credits, onCreditUsed }) {
  // Seed from `submitted` (the last-submitted snapshot) rather than always
  // DEFAULT_BRIEF. BriefingForm fully unmounts whenever screen leaves 'brief'
  // (e.g. clicking Edit on a candidate opens the editor) and remounts fresh
  // when you come back - without this, `brief` would reset to blank even
  // though `submitted` still holds the real answers, so clicking "Edit
  // answers" after that round trip showed an empty form instead of what was
  // actually submitted (Julia's report, 2026-08-04).
  const [brief, setBrief] = useState(() => submitted ?? DEFAULT_BRIEF)
  const [step, setStep] = useState(1)
  const headlineInputRef = useRef(null)
  const sublineInputRef = useRef(null)
  const [showTemplateModal, setShowTemplateModal] = useState(false)

  function set(key, value) { setBrief(prev => ({ ...prev, [key]: value })) }

  // Stored on `brief` itself (not separate local state) so it survives the
  // round trip through onSubmitted({...brief}) into TemplateCandidatePicker,
  // which uses it (via getMatchingTemplateIds) to only generate the
  // design(s) actually picked here instead of always generating both
  // Option A and B (Julia's fix request, 2026-08-20).
  function toggleTemplatePick(id) {
    setBrief(prevBrief => {
      const prev = prevBrief.preSelectedTemplateIds
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      const picked = TEMPLATE_PREVIEW_OPTIONS.filter(o => next.includes(o.id))
      return {
        ...prevBrief,
        preSelectedTemplateIds: next,
        businessType: picked.length > 0 ? (prevBrief.businessType || picked[0].businessType) : prevBrief.businessType,
        formats: picked.length > 0 ? Array.from(new Set([...prevBrief.formats, ...picked.map(p => p.format)])) : prevBrief.formats,
      }
      return next
    })
  }

  function toggleFormat(value) {
    setBrief(prev => ({
      ...prev,
      formats: prev.formats.includes(value) ? prev.formats.filter(f => f !== value) : [...prev.formats, value],
    }))
  }

  const selectedObjective = OBJECTIVES.find(o => o.value === brief.objective)
  const partnerFilled = brief.partner === ADD_NEW ? brief.partnerNew.trim().length > 0 : brief.partner.length > 0
  const partnerName = resolvePartnerName(brief)
  const aiContext = { businessType: brief.businessType, about: brief.about, objective: selectedObjective?.label, partnerName }

  // Split per-step so "Next" can gate on just that step's fields - the full
  // isValid (below) still gates final submit exactly like before.
  const step1Valid =
    partnerFilled &&
    brief.businessType &&
    brief.about.trim() &&
    brief.objective &&
    (!selectedObjective?.followUp || brief.objectiveFollowUp.trim()) &&
    brief.formats.length > 0
  const step2Valid = brief.headline.trim().length > 0

  const isValid = step1Valid && step2Valid

  function handleSubmit(e) {
    e.preventDefault()
    if (!isValid) return
    onSubmitted({ ...brief })
  }

  function goNext(fromStep) {
    if (fromStep === 1 && !step1Valid) return
    if (fromStep === 2 && !step2Valid) return
    setStep(fromStep + 1)
  }

  if (submitted) {
    return (
      <TemplateCandidatePicker
        brief={submitted}
        onEdit={() => onSubmitted(null)}
        onPick={onPick}
        onSendForReview={onSendForReview}
        savedIds={savedCandidateIds}
        savedPreviews={savedCandidatePreviews}
      />
    )
  }

  return (
    <div style={{ flex: 1, background: 'var(--bg)', overflow: 'auto' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '64px 32px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 56, alignItems: 'start' }}>

          <HeroColumn onPickTemplate={() => setShowTemplateModal(true)} selectedCount={brief.preSelectedTemplateIds.length} />

          <div style={{ position: 'relative' }}>
          <form
            onSubmit={handleSubmit}
            // Pressing Enter in a plain text <input> natively submits the
            // enclosing form (since a submit button exists) - with a form this
            // long, that reads as "it randomly jumped to the picker halfway
            // through." Block it there; textareas/selects/the submit button
            // itself are untouched (Enter in a textarea just adds a newline).
            onKeyDown={e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault() }}
            style={{ background: '#fff', borderRadius: 16, border: '1px solid var(--border)', padding: '32px' }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--dark)' }}>Brief your design</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--mid)' }}>Step {step} of 3</div>
            </div>

        {step === 1 && (
          <>
        <Field label="Partner name">
          <Select style={inputStyle} value={brief.partner} onChange={e => set('partner', e.target.value)}>
            <option value="" disabled>Select a partner…</option>
            {PLACEHOLDER_PARTNERS.map(p => <option key={p} value={p}>{p}</option>)}
            <option value={ADD_NEW}>+ Add new partner</option>
          </Select>
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

        <Field label="What is this brief about?" hint="A short intro - helps us pick the right template.">
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
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            {FORMATS.map(f => (
              <ChoiceButton key={f.value} active={brief.formats.includes(f.value)} onClick={() => toggleFormat(f.value)} checkbox>{f.label}</ChoiceButton>
            ))}
          </div>
          {brief.preSelectedTemplateIds.length === 0 ? (
            <button
              type="button"
              onClick={() => setShowTemplateModal(true)}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--primary)', padding: 0, textDecoration: 'underline' }}
            >
              Not sure? Pick your template →
            </button>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--mid)' }}>
              Picked: {TEMPLATE_PREVIEW_OPTIONS.filter(o => brief.preSelectedTemplateIds.includes(o.id)).map(o => o.name).join(', ')} -{' '}
              <button
                type="button"
                onClick={() => setShowTemplateModal(true)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--primary)', padding: 0, textDecoration: 'underline' }}
              >
                change
              </button>
            </div>
          )}
        </Field>

        {/* Option A's flyer shows a restaurant name on the artwork - only ask
            for it when Flyer is actually picked. Defaults to Partner name if
            left blank (buildCandidateFields), but the display name can differ
            (e.g. partner "McD" internally, flyer reads "McDonald's Zentrum"). */}
        {brief.formats.includes('flyer') && (
          <Field label="Restaurant name" hint="Only used on Option A - leave blank to just use the partner name above.">
            <input style={inputStyle} placeholder={partnerName || 'e.g. Wen Cheng'} value={brief.restaurantName} onChange={e => set('restaurantName', e.target.value)} />
          </Field>
        )}

        <button type="button" onClick={() => goNext(1)} disabled={!step1Valid} style={{
          width: '100%', padding: '13px', fontSize: 14, fontWeight: 700, borderRadius: 10, border: 'none', cursor: step1Valid ? 'pointer' : 'not-allowed',
          background: step1Valid ? 'var(--primary)' : '#E5E7EB', color: step1Valid ? '#fff' : 'var(--mid)',
        }}>
          Next
        </button>
        {!step1Valid && <div style={{ fontSize: 12, color: 'var(--mid)', textAlign: 'center', marginTop: 8 }}>Fill in the fields above to continue.</div>}
          </>
        )}

        {step === 2 && (
          <div>
          <button type="button" onClick={() => setStep(1)} style={{ marginBottom: 20, background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--mid)', padding: 0 }}>
            ← Back
          </button>

          <Field label="Headline" hint="The bigger line - sits below the subline on the flyer.">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              <ChoiceButton onClick={() => headlineInputRef.current?.focus()}>✎ Write my own</ChoiceButton>
              <PresetPicker field="headline" onApply={v => set('headline', v)} partnerName={partnerName} />
              <AISuggest field="headline" lang="de" onApply={v => set('headline', v)} variant="button-group" context={aiContext} credits={credits} onCreditUsed={onCreditUsed} />
              <AISuggest field="headline" lang="de" onApply={v => set('headline', v)} variant="button-group" mode="improve" seedText={brief.headline} credits={credits} onCreditUsed={onCreditUsed} />
            </div>
            <input ref={headlineInputRef} style={inputStyle} placeholder="e.g. Fresh pasta, made daily" value={brief.headline} onChange={e => set('headline', e.target.value)} />
          </Field>

          <Field label="Subline" hint="The smaller line - sits above the headline on the flyer.">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              <ChoiceButton onClick={() => sublineInputRef.current?.focus()}>✎ Write my own</ChoiceButton>
              <PresetPicker field="subline" onApply={v => set('subline', v)} partnerName={partnerName} />
              <AISuggest field="sub_headline" lang="de" onApply={v => set('subline', v)} variant="button-group" context={aiContext} credits={credits} onCreditUsed={onCreditUsed} />
              <AISuggest field="sub_headline" lang="de" onApply={v => set('subline', v)} variant="button-group" mode="improve" seedText={brief.subline} credits={credits} onCreditUsed={onCreditUsed} />
            </div>
            <input ref={sublineInputRef} style={inputStyle} placeholder="e.g. Order now on Wolt" value={brief.subline} onChange={e => set('subline', e.target.value)} />
          </Field>

          <Field label="Call to action (Option B only)" hint="The line under 'Jetzt Wolt App downloaden und' on Option B. Leave blank to reuse Subline.">
            <input style={inputStyle} placeholder={brief.subline || 'e.g. NEU IN DEINER STADT'} value={brief.cta} onChange={e => set('cta', e.target.value)} />
          </Field>

          <button type="button" onClick={() => goNext(2)} disabled={!step2Valid} style={{
            width: '100%', padding: '13px', fontSize: 14, fontWeight: 700, borderRadius: 10, border: 'none', cursor: step2Valid ? 'pointer' : 'not-allowed',
            background: step2Valid ? 'var(--primary)' : '#E5E7EB', color: step2Valid ? '#fff' : 'var(--mid)',
          }}>
            Next
          </button>
          {!step2Valid && <div style={{ fontSize: 12, color: 'var(--mid)', textAlign: 'center', marginTop: 8 }}>Fill in the headline to continue.</div>}
          </div>
        )}

        {step === 3 && (
          <div>
          <button type="button" onClick={() => setStep(2)} style={{ marginBottom: 20, background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--mid)', padding: 0 }}>
            ← Back
          </button>

          <div style={{ marginBottom: 22 }}>
            {brief.stickerRequestMode ? (
              <Field label="Sticker" hint="Describe the new sticker you need - we'll add it to the library.">
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
                  requireTransparent
                />
                <button type="button" onClick={() => set('stickerRequestMode', true)} style={{ marginTop: 6, background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: 'var(--primary)', padding: 0 }}>
                  + Request a new sticker
                </button>
              </>
            )}
          </div>

          <LibraryAssetPickerField
            label="Food photo"
            hint="Pick a photo from your library - helps when a partner has more than one dish to choose from."
            folder="product-images"
            merchant={partnerName || GENERAL_MERCHANT}
            value={brief.foodPhotoAsset}
            onSelect={a => set('foodPhotoAsset', a)}
            requireTransparent
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

        <button type="submit" disabled={!isValid} style={{
          width: '100%', padding: '13px', fontSize: 14, fontWeight: 700, borderRadius: 10, border: 'none', cursor: isValid ? 'pointer' : 'not-allowed',
          background: isValid ? 'var(--primary)' : '#E5E7EB', color: isValid ? '#fff' : 'var(--mid)',
        }}>
          Submit brief
        </button>
        {!isValid && <div style={{ fontSize: 12, color: 'var(--mid)', textAlign: 'center', marginTop: 8 }}>Fill in the fields above to continue.</div>}
          </div>
        )}
          </form>

          {showTemplateModal && (
            <TemplatePreviewModal
              selectedIds={brief.preSelectedTemplateIds}
              onToggle={toggleTemplatePick}
              onClose={() => setShowTemplateModal(false)}
            />
          )}
          </div>

        </div>
      </div>
    </div>
  )
}
