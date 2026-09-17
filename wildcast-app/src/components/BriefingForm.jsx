import { useState } from 'react'
import WordCarousel from './WordCarousel'
import ChoiceButton from './ChoiceButton'
import { ADD_NEW, PLACEHOLDER_PARTNERS, OBJECTIVES, FORMATS, FORMAT_TEMPLATE_GROUP, DEFAULT_BRIEF } from '../lib/briefConstants'
import { liveFormatsFor, entryForGuidedId } from './TemplatePicker'
import TemplatePreviewModal from './TemplatePreviewModal'

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

// pickedOption/onOpenTemplateModal: TemplatePickStep renders right here, between
// the hero copy and the tip box - Julia's ask (2026-09-10): the hero's own
// headline/subline should read first, with "Pick your template" right after
// it, not above everything (its very first placement, above the whole
// hero+form grid).
// showTemplateStep=false: used by LandingPage.jsx's new 3-button home screen
// (Julia's ask, 2026-09-11) - the "pick your template" step now only lives
// inside the actual brief flow (reached via "Start from scratch"), not on
// the landing page itself, which just routes to that flow instead of
// starting it directly.
export function HeroColumn({ pickedOption, onOpenTemplateModal, showTemplateStep = true }) {
  return (
    <div>
      <h1 style={{ fontSize: 42, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--dark)', margin: '0 0 20px', lineHeight: 1.08 }}>
        We help <WordCarousel words={['design', 'export', 'print']} style={{ color: 'var(--primary)' }} />
      </h1>
      <p style={{ fontSize: 15, color: 'var(--mid)', lineHeight: 1.6, maxWidth: 420, marginBottom: 36 }}>
        Tell us what you need, the same way you'd brief a designer - we'll show you templates that fit, ready to fill in live.
      </p>

      {showTemplateStep && <TemplatePickStep pickedOption={pickedOption} onOpenTemplateModal={onOpenTemplateModal} />}

      {/* Made much bigger/bolder with a real standalone button (was a small
          inline text link) - Julia's ask, 2026-09-15: Wild Scale needed to
          be "in your face," easy to miss at the old size. */}
      <div
        style={{
          background: 'var(--primary-glow)', border: '1.5px solid var(--primary)', borderRadius: 16,
          padding: '22px 24px', marginBottom: 36, maxWidth: 420,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ color: 'var(--primary)', fontSize: 20, lineHeight: 1 }}>✦</span>
          <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--dark)' }}>Before you upload</span>
        </div>
        <p style={{ fontSize: 14, color: 'var(--dark)', margin: '0 0 18px', lineHeight: 1.6 }}>
          Product photos should be high resolution - use Wild Scale's <strong>Print</strong> preset
          (2400×2400px) - with the background removed (transparent PNG).
        </p>
        <a
          href="https://scale.wildstack.studio"
          target="_blank"
          rel="noreferrer"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            width: '100%', padding: '16px 20px', fontSize: 16, fontWeight: 400, borderRadius: 12,
            background: 'var(--primary)', color: '#fff', textDecoration: 'none', boxSizing: 'border-box',
          }}
        >
          Prep your assets with WildScale →
        </a>
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

// Step 1, above the whole hero+form layout - picking a template is now the
// FIRST thing a partner does, not a step at the end of the form (Julia's
// ask, 2026-09-10: the flow used to end with a separate "pick your
// template" screen after the brief; now that happens up front instead, and
// submitting the brief goes straight to the "Choose your mode" popup).
// Shows the plain call-to-action button until something's picked, then
// swaps to a compact "selected" state with a way to change it.
function TemplatePickStep({ pickedOption, onOpenTemplateModal }) {
  return (
    <div style={{ marginBottom: 30 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
        Step 1 · Required
      </div>
      {pickedOption ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <img
            src={pickedOption.thumb} alt={pickedOption.label}
            style={{ width: 52, height: 73, objectFit: 'cover', borderRadius: 8, border: '1.5px solid var(--primary)', flexShrink: 0 }}
          />
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--dark)' }}>{pickedOption.label.split(' · ').pop()} selected</div>
            <button
              type="button"
              onClick={onOpenTemplateModal}
              style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, marginTop: 2, textDecoration: 'underline' }}
            >
              Change template
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={onOpenTemplateModal}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '13px 22px', fontSize: 14, fontWeight: 700, borderRadius: 10, cursor: 'pointer',
            border: '1.5px solid var(--primary)', background: '#fff', color: 'var(--primary)',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6M9 12h6M9 15h4"/></svg>
          Pick your template
        </button>
      )}
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

// Replaces the old window.alert('Please pick your template first.') with an
// in-app modal matching TemplatePreviewModal's overlay treatment - a native
// alert can't be styled and blocks the whole tab, which reads as a browser
// error rather than part of the product.
function NoTemplateModal({ onClose, onChooseTemplate }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(17,17,17,0.25)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 360, padding: 28, boxShadow: '0 24px 80px rgba(0,0,0,0.25)', textAlign: 'center' }}
      >
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--primary-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6M9 12h6M9 15h4"/></svg>
        </div>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--dark)', marginBottom: 8 }}>Pick your template first</div>
        <p style={{ fontSize: 13, color: 'var(--mid)', lineHeight: 1.5, marginBottom: 20 }}>
          Choose a template above so we know what to prepare, then come back to finish the brief.
        </p>
        <button
          type="button"
          onClick={onChooseTemplate}
          style={{ width: '100%', padding: '12px', fontSize: 14, fontWeight: 700, background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Choose a template
        </button>
      </div>
    </div>
  )
}

// Single-screen brief - just enough context to pick the right template
// (partner, business type, objective, formats). Everything about the actual
// artwork (headline, subline, sticker, food photo, T&Cs, QR) used to live
// here across two more steps, but now gets filled live in the editor once a
// template + mode is picked, so this form only ever has one screen and one
// action: hand off to the template picker (Julia's workflow change,
// 2026-09-08).
export default function BriefingForm({ submitted, onSubmitted, customCards, customRecords, onBack }) {
  // Seed from `submitted` (the last-submitted snapshot) rather than always
  // DEFAULT_BRIEF. BriefingForm fully unmounts whenever screen leaves 'brief'
  // and remounts fresh when you come back (e.g. via the logo, or the
  // template picker's "Edit answers") - without this, `brief` would reset to
  // blank even though `submitted` still holds the real answers.
  const [brief, setBrief] = useState(() => submitted ?? DEFAULT_BRIEF)
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [showNoTemplateModal, setShowNoTemplateModal] = useState(false)
  // Fires every time someone touches the form without having picked a
  // template yet - Julia's ask, 2026-09-10: "if someone missed the button
  // and goes straight to the form, make a popup come up." The Continue-time
  // check (handleSubmit below) was already there but only ever surfaced at
  // the very end - this catches it at the actual moment they skip Step 1.
  // Re-fires on every field until a template is picked (not just the
  // first) since it's a dismissible modal, not a blocking native alert.
  function warnIfNoTemplate() {
    if (brief.preSelectedTemplateIds.length) return
    setShowNoTemplateModal(true)
  }

  function set(key, value) {
    warnIfNoTemplate()
    setBrief(prev => ({ ...prev, [key]: value }))
  }

  function toggleFormat(value) {
    warnIfNoTemplate()
    setBrief(prev => ({
      ...prev,
      formats: prev.formats.includes(value) ? prev.formats.filter(f => f !== value) : [...prev.formats, value],
    }))
  }

  // Picking a template is a single, decisive choice now (not a "browse to
  // compare" step) - replaces any prior pick rather than toggling, and
  // closes the popup immediately. Also pre-fills the Business type/Formats
  // answers it implies (both live options today are Restaurant/Flyer), so a
  // partner who already knows which design they want doesn't have to
  // separately re-answer questions the pick already implies (Julia's ask,
  // 2026-09-10).
  function pickTemplate(id) {
    setBrief(prev => ({
      ...prev,
      preSelectedTemplateIds: [id],
      businessType: 'Restaurant',
      formats: prev.formats.includes('flyer') ? prev.formats : [...prev.formats, 'flyer'],
    }))
    setShowTemplateModal(false)
  }

  const pickedTemplateId = brief.preSelectedTemplateIds[0] ?? null
  // Same overlay resolution TemplatePreviewModal itself uses, so whatever's
  // pickable there (including a freshly-imported template) resolves here
  // too - no separate hardcoded list to keep in sync.
  const pickedOption = pickedTemplateId
    ? entryForGuidedId(pickedTemplateId, customCards, customRecords)
    : null

  const partnerFilled = brief.partner === ADD_NEW ? brief.partnerNew.trim().length > 0 : brief.partner.length > 0
  // Which format checkboxes actually have a live template to pick next -
  // same live-check the template picker itself uses, so a partner never
  // picks a "coming soon" format that just dead-ends there (checklist i10,
  // 2026-09-08). Empty until Business type is chosen - nothing's live for
  // an unknown category.
  const liveFormats = brief.businessType
    ? liveFormatsFor(brief.businessType.toLowerCase(), customCards, customRecords)
    : []
  const isFormatLive = value => liveFormats.includes(FORMAT_TEMPLATE_GROUP[value])

  const isValid =
    partnerFilled &&
    brief.businessType &&
    brief.about.trim() &&
    brief.objective &&
    brief.formats.length > 0

  function handleSubmit(e) {
    e.preventDefault()
    // Template pick is required and enforced with an explicit popup rather
    // than just disabling Submit (Julia's ask, 2026-09-10) - it's Step 1, so
    // a partner who skips it and fills the rest of the form should be told
    // plainly to go back and pick one, not left guessing why nothing happens.
    if (!pickedTemplateId) {
      setShowNoTemplateModal(true)
      return
    }
    if (!isValid) return
    onSubmitted(brief)
  }

  return (
    <div style={{ flex: 1, background: 'var(--bg)', overflow: 'auto' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '64px 32px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 56, alignItems: 'start' }}>

          <HeroColumn pickedOption={pickedOption} onOpenTemplateModal={() => setShowTemplateModal(true)} />

          <form
            onSubmit={handleSubmit}
            // Pressing Enter in a plain text <input> natively submits the
            // enclosing form (since a submit button exists) - block it there;
            // textareas/selects/the submit button itself are untouched.
            onKeyDown={e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault() }}
            style={{ background: '#fff', borderRadius: 16, border: '1px solid var(--border)', padding: '32px' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--dark)' }}>Brief your design</div>
              {/* Landing was the actual entry point (Julia's ask, 2026-09-11) and
                  the top nav has no item pointing back at it - without this, the
                  only way back from a brief already in progress was the logo
                  click, which doesn't read as an explicit "go back" affordance. */}
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

            <Field label="Partner name">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {PLACEHOLDER_PARTNERS.map(p => (
                  <ChoiceButton key={p} active={brief.partner === p} onClick={() => set('partner', p)}>{p}</ChoiceButton>
                ))}
                <ChoiceButton active={brief.partner === ADD_NEW} onClick={() => set('partner', ADD_NEW)}>+ Add new partner</ChoiceButton>
              </div>
              {brief.partner === ADD_NEW && (
                <input style={{ ...inputStyle, marginTop: 8 }} placeholder="New partner name" value={brief.partnerNew} onChange={e => set('partnerNew', e.target.value)} />
              )}
            </Field>

            <div style={{ fontSize: 12, color: 'var(--mid)', marginBottom: 22, lineHeight: 1.5 }}>
              A few more details to prepare your design for review, based on the template you picked above.
            </div>

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
            </Field>

            <Field label="Formats needed" hint={brief.businessType ? 'Pick all that apply.' : 'Pick a business type above to see what\'s available.'}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {FORMATS.map(f => (
                  <ChoiceButton
                    key={f.value}
                    active={brief.formats.includes(f.value)}
                    onClick={() => toggleFormat(f.value)}
                    checkbox
                    disabled={!isFormatLive(f.value)}
                  >
                    {f.label}
                  </ChoiceButton>
                ))}
              </div>
            </Field>

            <Field label="Project name" hint="Optional - labels the saved design and PDF filename in Designs. Leave blank and we'll name it for you.">
              <input
                style={inputStyle}
                value={brief.projectName}
                onChange={e => set('projectName', e.target.value)}
                placeholder="e.g. Wen Cheng – Wolt Promo June"
              />
            </Field>

            <button type="submit" disabled={!isValid} style={{
              width: '100%', padding: '13px', fontSize: 14, fontWeight: 700, borderRadius: 10, border: 'none', cursor: isValid ? 'pointer' : 'not-allowed',
              background: isValid ? 'var(--primary)' : '#E5E7EB', color: isValid ? '#fff' : 'var(--mid)',
            }}>
              Continue →
            </button>
            {!isValid && <div style={{ fontSize: 12, color: 'var(--mid)', textAlign: 'center', marginTop: 8 }}>Fill in the fields above to continue.</div>}
          </form>

        </div>
      </div>

      {showTemplateModal && (
        <TemplatePreviewModal
          selectedId={pickedTemplateId}
          onPick={pickTemplate}
          onClose={() => setShowTemplateModal(false)}
          customCards={customCards}
          customRecords={customRecords}
        />
      )}

      {showNoTemplateModal && (
        <NoTemplateModal
          onClose={() => setShowNoTemplateModal(false)}
          onChooseTemplate={() => { setShowNoTemplateModal(false); setShowTemplateModal(true) }}
        />
      )}
    </div>
  )
}
