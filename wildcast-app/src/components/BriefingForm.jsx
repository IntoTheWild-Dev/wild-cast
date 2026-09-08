import { useState } from 'react'
import WordCarousel from './WordCarousel'
import Select from './Select'
import { HugeiconsIcon } from '@hugeicons/react'
import { CheckmarkSquare01Icon, SquareIcon } from '@hugeicons/core-free-icons'
import { ADD_NEW, PLACEHOLDER_PARTNERS, OBJECTIVES, FORMATS, DEFAULT_BRIEF, resolvePartnerName } from '../lib/briefConstants'

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

function HeroColumn() {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>Wolt Partner Tools</div>
      <h1 style={{ fontSize: 42, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--dark)', margin: '0 0 20px', lineHeight: 1.08 }}>
        We help <WordCarousel words={['design', 'export', 'print']} style={{ color: 'var(--primary)' }} />
      </h1>
      <p style={{ fontSize: 15, color: 'var(--mid)', lineHeight: 1.6, maxWidth: 420, marginBottom: 36 }}>
        Tell us what you need, the same way you'd brief a designer - we'll show you templates that fit, ready to fill in live.
      </p>

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

// Single-screen brief - just enough context to pick the right template
// (partner, business type, objective, formats). Everything about the actual
// artwork (headline, subline, sticker, food photo, T&Cs, QR) used to live
// here across two more steps, but now gets filled live in the editor once a
// template + mode is picked, so this form only ever has one screen and one
// action: hand off to the template picker (Julia's workflow change,
// 2026-09-08).
export default function BriefingForm({ submitted, onSubmitted }) {
  // Seed from `submitted` (the last-submitted snapshot) rather than always
  // DEFAULT_BRIEF. BriefingForm fully unmounts whenever screen leaves 'brief'
  // and remounts fresh when you come back (e.g. via the logo, or the
  // template picker's "Edit answers") - without this, `brief` would reset to
  // blank even though `submitted` still holds the real answers.
  const [brief, setBrief] = useState(() => submitted ?? DEFAULT_BRIEF)

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
    brief.formats.length > 0

  function handleSubmit(e) {
    e.preventDefault()
    if (!isValid) return
    onSubmitted({ ...brief })
  }

  return (
    <div style={{ flex: 1, background: 'var(--bg)', overflow: 'auto' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '64px 32px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 56, alignItems: 'start' }}>

          <HeroColumn />

          <form
            onSubmit={handleSubmit}
            // Pressing Enter in a plain text <input> natively submits the
            // enclosing form (since a submit button exists) - block it there;
            // textareas/selects/the submit button itself are untouched.
            onKeyDown={e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault() }}
            style={{ background: '#fff', borderRadius: 16, border: '1px solid var(--border)', padding: '32px' }}
          >
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--dark)', marginBottom: 20 }}>Brief your design</div>

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
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {FORMATS.map(f => (
                  <ChoiceButton key={f.value} active={brief.formats.includes(f.value)} onClick={() => toggleFormat(f.value)} checkbox>{f.label}</ChoiceButton>
                ))}
              </div>
            </Field>

            {/* Option A's flyer shows a restaurant name on the artwork - only ask
                for it when Flyer is actually picked. Defaults to Partner name if
                left blank, but the display name can differ (e.g. partner "McD"
                internally, flyer reads "McDonald's Zentrum"). */}
            {brief.formats.includes('flyer') && (
              <Field label="Restaurant name" hint="Only used on Option A - leave blank to just use the partner name above.">
                <input style={inputStyle} placeholder={partnerName || 'e.g. Wen Cheng'} value={brief.restaurantName} onChange={e => set('restaurantName', e.target.value)} />
              </Field>
            )}

            <button type="submit" disabled={!isValid} style={{
              width: '100%', padding: '13px', fontSize: 14, fontWeight: 700, borderRadius: 10, border: 'none', cursor: isValid ? 'pointer' : 'not-allowed',
              background: isValid ? 'var(--primary)' : '#E5E7EB', color: isValid ? '#fff' : 'var(--mid)',
            }}>
              Pick your template →
            </button>
            {!isValid && <div style={{ fontSize: 12, color: 'var(--mid)', textAlign: 'center', marginTop: 8 }}>Fill in the fields above to continue.</div>}
          </form>

        </div>
      </div>
    </div>
  )
}
