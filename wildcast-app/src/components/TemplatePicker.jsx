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

const CATEGORIES = ['restaurant', 'retail']
const FORMATS    = ['Flyer', 'Poster', 'Wild Poster']

// ── Layout picker modal ───────────────────────────────────────────────────────
function LayoutModal({ entry, onPick, onClose }) {
  const options = [
    {
      key: 'guided-text',
      type: 'Text only',
      desc: 'Headline, sub-headline, offer and T&Cs — no image upload needed.',
      templateId: entry.templateIdGuidedText,
      icon: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="11" x2="16" y2="11"/><line x1="4" y1="15" x2="18" y2="15"/><line x1="4" y1="19" x2="12" y2="19"/></svg>,
    },
    {
      key: 'guided-image',
      type: 'Text + Image',
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
    },
    {
      key: 'designer-image',
      type: 'Text + Image · Designer',
      desc: 'Full control with food photo and logo zones.',
      templateId: entry.templateIdDesigner,
      icon: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="3" width="18" height="14" rx="2"/><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>,
    },
  ]

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

// ── Filter chip ───────────────────────────────────────────────────────────────
function Chip({ label, active, onClick, soon }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 13px', borderRadius: 100, fontSize: 12, fontWeight: 500,
        cursor: soon ? 'default' : 'pointer',
        border: active ? '1.5px solid var(--primary)' : '1.5px solid var(--border)',
        background: active ? 'var(--primary-glow)' : 'transparent',
        color: soon ? 'var(--light)' : active ? 'var(--primary-dark)' : 'var(--mid)',
        transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 5,
      }}
    >
      {active && !soon && <span style={{ fontSize: 9 }}>✓</span>}
      {label}
      {soon && <span style={{ fontSize: 9, fontWeight: 700 }}>· soon</span>}
    </button>
  )
}

// ── Group card (homepage) ─────────────────────────────────────────────────────
function GroupCard({ group, onViewAll }) {
  const { members, liveCount } = group
  const total     = members.length
  const groupThumb = members.find(m => m.groupThumb)?.groupThumb ?? null

  return (
    <div
      onClick={onViewAll}
      style={{
        borderRadius: 14, overflow: 'hidden', cursor: 'pointer',
        border: '1.5px solid var(--border)',
        transition: 'transform 0.15s, box-shadow 0.15s',
        position: 'relative',
        aspectRatio: '33 / 28',
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(0,0,0,0.1)' }}
      onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
    >
      {groupThumb ? (
        <img src={groupThumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center bottom', display: 'block' }} />
      ) : (
        <div style={{ width: '100%', height: '100%', background: '#F3F4F6', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--light)" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6M9 12h6M9 15h4"/></svg>
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--light)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Coming soon</span>
        </div>
      )}

      {/* Badges */}
      <div style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(2,6,24,0.65)', backdropFilter: 'blur(4px)', color: '#fff', fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 100 }}>
        {total} designs
      </div>
      {liveCount > 0 && (
        <div style={{ position: 'absolute', top: 10, left: 10, background: 'var(--primary)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 100 }}>
          {liveCount} available
        </div>
      )}
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

// ── Main component ────────────────────────────────────────────────────────────
export default function TemplatePicker({ onSelect }) {
  const [search,        setSearch]        = useState('')
  const [cats,          setCats]          = useState(['restaurant', 'retail'])
  const [formats,       setFormats]       = useState(['Flyer', 'Poster', 'Wild Poster'])
  const [selectedGroup, setSelectedGroup] = useState(null)  // null = groups view

  function toggleCat(c)    { setCats(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]) }
  function toggleFormat(f) { setFormats(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]) }

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

  const q = search.toLowerCase()
  const visibleGroups = ALL_GROUPS.filter(g =>
    cats.includes(g.category) &&
    formats.includes(g.format) &&
    (q === '' || g.format.toLowerCase().includes(q) || g.category.includes(q))
  )

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 32px 64px' }}>

        {/* Page title */}
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Wolt Partner Tools</div>
        <h1 style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--dark)', marginBottom: 40 }}>Design. Export. Print.</h1>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 20 }}>
          <svg style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--light)', pointerEvents: 'none' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            type="text"
            placeholder="Search templates…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '12px 14px 12px 42px', fontSize: 14, fontFamily: 'inherit', border: '1.5px solid var(--border)', borderRadius: 12, background: '#fff', color: 'var(--dark)', outline: 'none', transition: 'border-color 0.15s', boxSizing: 'border-box' }}
            onFocus={e => e.target.style.borderColor = 'var(--primary)'}
            onBlur={e => e.target.style.borderColor = 'var(--border)'}
          />
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 20, marginBottom: 32, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--mid)', textTransform: 'uppercase', letterSpacing: '0.08em', marginRight: 2 }}>Category</span>
            {CATEGORIES.map(c => (
              <Chip key={c} label={c.charAt(0).toUpperCase() + c.slice(1)} active={cats.includes(c)} onClick={() => toggleCat(c)} />
            ))}
          </div>
          <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--mid)', textTransform: 'uppercase', letterSpacing: '0.08em', marginRight: 2 }}>Format</span>
            {FORMATS.map(f => (
              <Chip key={f} label={f} active={formats.includes(f)} onClick={() => toggleFormat(f)} soon={f !== 'Flyer'} />
            ))}
          </div>
        </div>

        {/* Group grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20 }}>
          {visibleGroups.map(g => (
            <GroupCard key={g.key} group={g} onViewAll={() => setSelectedGroup(g)} />
          ))}
          {visibleGroups.length === 0 && (
            <div style={{ gridColumn: '1 / -1', padding: '60px 0', textAlign: 'center', color: 'var(--light)', fontSize: 14 }}>
              No templates match — try different filters.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
