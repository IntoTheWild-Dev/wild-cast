import { useState } from 'react'
import { TEMPLATES } from '../data/templates'

// ── Template data ─────────────────────────────────────────────────────────────
const ALL_TEMPLATES = [
  {
    label: 'Restaurant Flyer · Option A',
    category: 'restaurant', format: 'Flyer',
    groupThumb: '/templates/tile-restaurant-flyer.png',
    thumb: '/templates/Preview&Catalogue_A6 _ 105x148 mm Example.png',
    live: true,
    templateIdGuided:        'wen-cheng-flyer2-simple',
    templateIdGuidedText:    'wen-cheng-flyer1-simple',
    templateIdDesigner:      'wen-cheng-flyer2',
    templateIdDesignerText:  'wen-cheng-flyer1',
  },
  {
    label: 'Restaurant Flyer · Option B',
    category: 'restaurant', format: 'Flyer',
    thumb: '/templates/opt-b-preview.png',
    live: true,
    templateIdGuided:        'opt-b-flyer2-simple',
    templateIdGuidedText:    'opt-b-flyer1-simple',
    templateIdDesigner:      'opt-b-flyer2',
    templateIdDesignerText:  'opt-b-flyer1',
  },
  { label: 'Restaurant Flyer · Option C', category: 'restaurant', format: 'Flyer',       live: false },
  { label: 'Restaurant Flyer · Option D', category: 'restaurant', format: 'Flyer',       live: false },
  { label: 'Restaurant Flyer · Option E', category: 'restaurant', format: 'Flyer',       live: false },
  { label: 'Restaurant Poster · Option A', category: 'restaurant', format: 'Poster',     live: false },
  { label: 'Restaurant Poster · Option B', category: 'restaurant', format: 'Poster',     live: false },
  { label: 'Restaurant Poster · Option C', category: 'restaurant', format: 'Poster',     live: false },
  { label: 'Restaurant Poster · Option D', category: 'restaurant', format: 'Poster',     live: false },
  { label: 'Restaurant Poster · Option E', category: 'restaurant', format: 'Poster',     live: false },
  { label: 'Restaurant Wild Poster · Option A', category: 'restaurant', format: 'Wild Poster', live: false },
  { label: 'Restaurant Wild Poster · Option B', category: 'restaurant', format: 'Wild Poster', live: false },
  { label: 'Restaurant Wild Poster · Option C', category: 'restaurant', format: 'Wild Poster', live: false },
  { label: 'Restaurant Wild Poster · Option D', category: 'restaurant', format: 'Wild Poster', live: false },
  { label: 'Restaurant Wild Poster · Option E', category: 'restaurant', format: 'Wild Poster', live: false },
  { label: 'Retail Flyer · Option A', category: 'retail', format: 'Flyer', live: false },
  { label: 'Retail Flyer · Option B', category: 'retail', format: 'Flyer', live: false },
  { label: 'Retail Flyer · Option C', category: 'retail', format: 'Flyer', live: false },
  { label: 'Retail Flyer · Option D', category: 'retail', format: 'Flyer', live: false },
  { label: 'Retail Flyer · Option E', category: 'retail', format: 'Flyer', live: false },
  { label: 'Retail Poster · Option A', category: 'retail', format: 'Poster', live: false },
  { label: 'Retail Poster · Option B', category: 'retail', format: 'Poster', live: false },
  { label: 'Retail Poster · Option C', category: 'retail', format: 'Poster', live: false },
  { label: 'Retail Poster · Option D', category: 'retail', format: 'Poster', live: false },
  { label: 'Retail Poster · Option E', category: 'retail', format: 'Poster', live: false },
  { label: 'Retail Wild Poster · Option A', category: 'retail', format: 'Wild Poster', live: false },
  { label: 'Retail Wild Poster · Option B', category: 'retail', format: 'Wild Poster', live: false },
  { label: 'Retail Wild Poster · Option C', category: 'retail', format: 'Wild Poster', live: false },
  { label: 'Retail Wild Poster · Option D', category: 'retail', format: 'Wild Poster', live: false },
  { label: 'Retail Wild Poster · Option E', category: 'retail', format: 'Wild Poster', live: false },
]

// Derive unique groups from ALL_TEMPLATES preserving order
const ALL_GROUPS = (() => {
  const seen = new Set()
  const groups = []
  for (const t of ALL_TEMPLATES) {
    const key = `${t.category}__${t.format}`
    if (!seen.has(key)) {
      seen.add(key)
      const members = ALL_TEMPLATES.filter(x => x.category === t.category && x.format === t.format)
      const hero    = members.find(x => x.live) ?? null
      const liveCount = members.filter(x => x.live).length
      groups.push({ category: t.category, format: t.format, key, members, hero, liveCount })
    }
  }
  return groups
})()

// ── Layout picker modal ───────────────────────────────────────────────────────
function LayoutModal({ entry, onPick, onClose }) {
  // Text-only modes are disabled for now (design decision — not worth maintaining
  // both text-only and text+image variants per flyer). Kept in the list with
  // disabled:true rather than deleted so they're easy to re-enable later.
  const options = [
    {
      key: 'guided-text',
      type: 'Text only',
      desc: 'Headline, sub-headline, offer and T&Cs — no image upload needed.',
      templateId: entry.templateIdGuidedText,
      icon: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="11" x2="16" y2="11"/><line x1="4" y1="15" x2="18" y2="15"/><line x1="4" y1="19" x2="12" y2="19"/></svg>,
      disabled: true,
    },
    {
      key: 'guided-image',
      type: 'Text + Image · Guided',
      desc: 'Headline, sub-headline, offer, plus a food photo and your logo.',
      templateId: entry.templateIdGuided,
      icon: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="3" width="18" height="14" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/><line x1="4" y1="21" x2="20" y2="21"/></svg>,
    },
    {
      key: 'designer-text',
      type: 'Text only · Designer',
      desc: 'Full control — move, resize and restyle any element freely.',
      templateId: entry.templateIdDesignerText,
      icon: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>,
      disabled: true,
    },
    {
      key: 'designer-image',
      type: 'Text + Image · Designer',
      desc: 'Full control with food photo and logo zones.',
      templateId: entry.templateIdDesigner,
      icon: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="3" width="18" height="14" rx="2"/><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>,
    },
  ].filter(opt => !opt.disabled)

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 18, padding: '32px 28px 28px', width: '100%', maxWidth: 480, boxShadow: '0 24px 80px rgba(0,0,0,0.2)' }}
      >
        <h3 style={{ fontSize: 20, fontWeight: 800, color: 'var(--dark)', margin: '0 0 4px', letterSpacing: '-0.02em' }}>Choose your mode</h3>
        <p style={{ fontSize: 13, color: 'var(--mid)', margin: '0 0 24px' }}>{entry.label}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {options.map(opt => (
            <button
              key={opt.key}
              onClick={() => onPick(opt.templateId)}
              style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 18px', borderRadius: 12, textAlign: 'left', border: '1.5px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', transition: 'all 0.15s', width: '100%' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.background = 'var(--primary-glow)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface)' }}
            >
              <div style={{ color: 'var(--primary)', flexShrink: 0 }}>{opt.icon}</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--dark)', marginBottom: 2 }}>{opt.type}</div>
                <div style={{ fontSize: 12, color: 'var(--mid)', lineHeight: 1.45 }}>{opt.desc}</div>
              </div>
              <svg style={{ marginLeft: 'auto', flexShrink: 0, color: 'var(--light)' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          ))}
        </div>
        <button
          onClick={onClose}
          style={{ marginTop: 16, width: '100%', padding: '10px 0', fontSize: 13, fontWeight: 600, color: 'var(--mid)', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Options view (drilled in) ─────────────────────────────────────────────────
function OptionsView({ group, onBack, onSelect }) {
  const [modal, setModal] = useState(null)
  const { format, category, members } = group
  const cap = category.charAt(0).toUpperCase() + category.slice(1)
  const liveCount = members.filter(x => x.live).length

  function handlePick(templateId) {
    const template = TEMPLATES.find(t => t.id === templateId)
    if (template) onSelect(template)
    setModal(null)
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 32px 64px' }}>

        {/* Back + heading */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 32 }}>
          <button
            onClick={onBack}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--mid)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0, fontFamily: 'inherit' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--mid)' }}
          >
            ← All templates
          </button>
          <div>
            <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--dark)', margin: 0 }}>
              {cap} {format}
            </h2>
            <p style={{ fontSize: 13, color: 'var(--mid)', margin: '3px 0 0' }}>
              {liveCount > 0 ? `${liveCount} available now · ${members.length - liveCount} coming soon` : `${members.length} designs coming soon`}
            </p>
          </div>
        </div>

        {modal && <LayoutModal entry={modal} onPick={handlePick} onClose={() => setModal(null)} />}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 20 }}>
          {members.map((t, i) => t.live ? (
            <div
              key={i}
              onClick={() => setModal(t)}
              style={{ background: '#fff', borderRadius: 14, border: '1.5px solid var(--border)', overflow: 'hidden', cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.1)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
            >
              <div style={{ height: 240, background: '#00C2CB', overflow: 'hidden' }}>
                <img src={t.thumb} alt={t.label} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
              </div>
              <div style={{ padding: '16px 18px 18px' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--dark)', marginBottom: 3 }}>{t.label}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                  <div style={{ display: 'flex', gap: 5 }}>
                    {['A6', 'CMYK', '3mm bleed'].map(tag => (
                      <span key={tag} style={{ fontSize: 10, fontWeight: 600, color: 'var(--mid)', background: '#F3F4F6', padding: '2px 7px', borderRadius: 100 }}>{tag}</span>
                    ))}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>Open ↗</span>
                </div>
              </div>
            </div>
          ) : (
            <div
              key={i}
              style={{ background: '#fff', borderRadius: 14, border: '1px dashed var(--border)', overflow: 'hidden', opacity: 0.55 }}
            >
              <div style={{ height: 240, background: '#F3F4F6', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--light)" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6M9 12h6M9 15h4"/></svg>
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--light)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Coming soon</span>
              </div>
              <div style={{ padding: '16px 18px 18px' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--mid)' }}>{t.label}</div>
                <div style={{ fontSize: 12, color: 'var(--light)', marginTop: 4 }}>Template in progress</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Hero feature bullets ──────────────────────────────────────────────────────
const FEATURES = [
  {
    title: 'Pre-approved templates',
    desc: 'On-brand designs, ready to customize — no designer needed.',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6M9 12h6M9 15h4"/></svg>,
  },
  {
    title: 'Edit text & photos in minutes',
    desc: 'Swap in your own copy, logo and food photos.',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>,
  },
  {
    title: 'Print-ready CMYK export',
    desc: 'PDF/X-4 with 3mm bleed — send straight to print.',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  },
  {
    title: 'Logos & photos saved for reuse',
    desc: 'Everything you upload lands in your library automatically.',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="14" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
  },
]

// ── Format options (briefing form) ────────────────────────────────────────────
const FORMAT_OPTIONS = [
  { value: 'Flyer', desc: 'A6 print flyer' },
  { value: 'Poster', desc: 'Larger in-store poster', soon: true },
  { value: 'Wild Poster', desc: 'Statement window poster', soon: true },
]

// ── Category option (briefing form) ───────────────────────────────────────────
function CategoryOption({ label, desc, soon, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 12, width: '100%',
        border: active ? '1.5px solid var(--primary)' : '1.5px solid var(--border)',
        background: active ? 'var(--primary-glow)' : '#fff',
        cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s', fontFamily: 'inherit',
      }}
    >
      <div style={{
        width: 18, height: 18, borderRadius: '50%', flexShrink: 0, boxSizing: 'border-box',
        border: active ? '5px solid var(--primary)' : '1.5px solid var(--border)',
        background: '#fff', transition: 'all 0.15s',
      }} />
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--dark)', display: 'flex', alignItems: 'center', gap: 7 }}>
          {label}
          {soon && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--light)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>· soon</span>}
        </div>
        <div style={{ fontSize: 12, color: 'var(--mid)', marginTop: 1 }}>{desc}</div>
      </div>
    </button>
  )
}

// ── Briefing form (homepage, right column) ────────────────────────────────────
function BriefingForm({ onSubmit }) {
  const [businessName, setBusinessName] = useState('')
  const [category, setCategory] = useState(null)
  const [format, setFormat] = useState(null)
  const [error, setError] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    if (!category || !format) { setError('Please select your business type and format to continue.'); return }
    setError('')
    onSubmit({ businessName, category, format })
  }

  return (
    <form onSubmit={handleSubmit} style={{ border: '1.5px dashed var(--border)', borderRadius: 16, padding: 28, background: '#FAFAF8' }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--dark)', marginBottom: 4 }}>Fill in your briefing form</div>
      <p style={{ fontSize: 12, color: 'var(--mid)', margin: '0 0 22px' }}>We'll show you the right templates to start with.</p>

      <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--dark)', display: 'block', marginBottom: 6 }}>Business name</label>
      <input
        type="text"
        value={businessName}
        onChange={e => setBusinessName(e.target.value)}
        placeholder="e.g. Wen Cheng"
        style={{ width: '100%', padding: '10px 12px', fontSize: 13, fontFamily: 'inherit', border: '1.5px solid var(--border)', borderRadius: 8, outline: 'none', marginBottom: 22, background: '#fff', color: 'var(--dark)', boxSizing: 'border-box' }}
        onFocus={e => e.target.style.borderColor = 'var(--primary)'}
        onBlur={e => e.target.style.borderColor = 'var(--border)'}
      />

      <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--dark)', display: 'block', marginBottom: 8 }}>Business type</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 22 }}>
        <CategoryOption label="Restaurant" desc="Menus, offers, food flyers" active={category === 'restaurant'} onClick={() => { setCategory('restaurant'); setError('') }} />
        <CategoryOption label="Retail" desc="Products, promotions, in-store flyers" active={category === 'retail'} onClick={() => { setCategory('retail'); setError('') }} />
      </div>

      <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--dark)', display: 'block', marginBottom: 8 }}>Format</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {FORMAT_OPTIONS.map(f => (
          <CategoryOption key={f.value} label={f.value} desc={f.desc} soon={f.soon} active={format === f.value} onClick={() => { setFormat(f.value); setError('') }} />
        ))}
      </div>

      {error && <div style={{ fontSize: 12, color: '#EF4444', marginTop: 12 }}>{error}</div>}

      <button
        type="submit"
        style={{ width: '100%', marginTop: 22, padding: '13px', fontSize: 14, fontWeight: 700, background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', transition: 'background 0.15s' }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-dark)'}
        onMouseLeave={e => e.currentTarget.style.background = 'var(--primary)'}
      >
        Show my templates →
      </button>
    </form>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TemplatePicker({ onSelect }) {
  const [selectedGroup, setSelectedGroup] = useState(null)  // null = hero/briefing view

  // Options view
  if (selectedGroup) {
    return (
      <OptionsView
        group={selectedGroup}
        onBack={() => setSelectedGroup(null)}
        onSelect={onSelect}
      />
    )
  }

  function handleBriefSubmit({ category, format }) {
    const group = ALL_GROUPS.find(g => g.category === category && g.format === format)
    if (group) setSelectedGroup(group)
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '64px 32px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 56, alignItems: 'center' }}>

          {/* Left: hero copy */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>Wolt Partner Tools</div>
            <h1 style={{ fontSize: 42, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--dark)', margin: 0, lineHeight: 1.08 }}>Design. Export.</h1>
            <h1 style={{ fontSize: 42, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--primary)', margin: '0 0 20px', lineHeight: 1.08 }}>Print.</h1>
            <p style={{ fontSize: 15, color: 'var(--mid)', lineHeight: 1.6, maxWidth: 420, marginBottom: 36 }}>
              Turn your menu or product updates into print-ready flyers in minutes — no designer needed.
            </p>

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

          {/* Right: briefing form */}
          <BriefingForm onSubmit={handleBriefSubmit} />
        </div>
      </div>
    </div>
  )
}
