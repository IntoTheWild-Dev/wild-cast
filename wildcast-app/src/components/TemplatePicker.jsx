import { useState } from 'react'

// ── Template data ────────────────────────────────────────────────────────────
const TEMPLATES = [
  {
    id: 'wen-cheng-flyer1-simple',
    name: 'Flyer 1',
    desc: 'Step-by-step guided editing — fill in your headline, sub-headline and offer. Layout is locked so your flyer always looks on-brand.',
    tags: ['A6', 'CMYK', '3mm bleed'],
    type: 'text-only',
    mode: 'non-designer',
    cat: 'restaurant',
    format: 'Flyer',
    thumb: '/catalogue/flyer1-preview.png',
    live: true,
  },
  {
    id: 'wen-cheng-flyer2-simple',
    name: 'Flyer 2',
    desc: 'Step-by-step guided editing — upload your logo and food photo, fill in your text. Layout is locked so your flyer always looks on-brand.',
    tags: ['A6', 'CMYK', '3mm bleed'],
    type: 'text-image',
    mode: 'non-designer',
    cat: 'restaurant',
    format: 'Flyer',
    thumb: '/catalogue/flyer2-preview.png',
    live: true,
  },
  {
    id: 'wen-cheng-flyer1',
    name: 'Flyer 1',
    desc: 'Full control over headline, city tagline and offer. Move, resize and restyle any element.',
    tags: ['A6', 'CMYK', '3mm bleed'],
    type: 'text-only',
    mode: 'designer',
    cat: 'restaurant',
    format: 'Flyer',
    thumb: '/catalogue/flyer1-preview.png',
    live: true,
  },
  {
    id: 'wen-cheng-flyer2',
    name: 'Flyer 2',
    desc: 'Full control over food photo, logo and all text fields. Drag, resize and restyle anything.',
    tags: ['A6', 'CMYK', '3mm bleed'],
    type: 'text-image',
    mode: 'designer',
    cat: 'restaurant',
    format: 'Flyer',
    thumb: '/catalogue/flyer2-preview.png',
    live: true,
  },
]

// ── Catalogue data (browse-first view) ───────────────────────────────────────
// Each option can map to a specific templateId (non-designer by default)
const CATALOGUE = [
  {
    category: 'Restaurant',
    formats: [
      {
        name: 'Flyer',
        options: [
          {
            label: 'Option A',
            thumb: '/catalogue/flyer2-preview.png',
            altThumb: '/catalogue/flyer1-preview.png',
            templateId: 'wen-cheng-flyer2-simple',
            designerTemplateId: 'wen-cheng-flyer2',
            live: true,
          },
          { label: 'Option B', live: false },
        ],
      },
      {
        name: 'Poster',
        options: [
          { label: 'Option A', live: false },
          { label: 'Option B', live: false },
        ],
      },
      {
        name: 'Wild Poster',
        options: [
          { label: 'Option A', live: false },
        ],
      },
    ],
  },
  {
    category: 'Retail',
    formats: [
      {
        name: 'Flyer',
        options: [{ label: 'Option A', live: false }],
      },
    ],
  },
]

// ── Small helpers ─────────────────────────────────────────────────────────────
const STEPS = [
  { n: 1, title: 'Pick a template', sub: 'Promo, Opening, Seasonal' },
  { n: 2, title: 'Fill in your content', sub: 'Headline, offer, photo' },
  { n: 3, title: 'Export PDF', sub: 'CMYK, print-ready, instant' },
  { n: 4, title: 'Send to your printer', sub: 'Done — no back-and-forth' },
]

const MODE_BADGE = {
  designer:       { label: 'Designer Mode',     bg: 'rgba(2,6,24,0.72)', color: '#fff' },
  'non-designer': { label: 'Non-Designer Mode', bg: 'var(--primary)',     color: '#fff' },
}

const ALL_FORMATS = ['Flyer', 'Poster', 'Wild Poster']

function FilterChip({ label, active, onClick, comingSoon }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '5px 13px', borderRadius: 100, fontSize: 12, fontWeight: 500,
        cursor: 'pointer', transition: 'all 0.15s',
        border: active ? '1.5px solid var(--primary)' : '1.5px solid var(--border)',
        background: active ? 'var(--primary-glow)' : 'transparent',
        color: comingSoon ? 'var(--light)' : active ? 'var(--primary-dark)' : 'var(--mid)',
        opacity: comingSoon ? 0.7 : 1,
      }}
    >
      {active && !comingSoon && <span style={{ fontSize: 9 }}>✓</span>}
      {label}
      {comingSoon && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--light)' }}>· soon</span>}
    </button>
  )
}

// ── Catalogue view ────────────────────────────────────────────────────────────
function CatalogueView({ onSelect, onClose }) {
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 32px 64px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 36 }}>
        <button
          onClick={onClose}
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--mid)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', transition: 'all 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--mid)' }}
        >
          ← Back
        </button>
        <div>
          <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--dark)', margin: 0 }}>Template Catalogue</h2>
          <p style={{ fontSize: 13, color: 'var(--mid)', margin: '4px 0 0' }}>Browse all available template designs and select the one you want to edit.</p>
        </div>
      </div>

      {/* Categories */}
      {CATALOGUE.map(cat => (
        <div key={cat.category} style={{ marginBottom: 52 }}>
          {/* Category heading */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--dark)', margin: 0 }}>{cat.category}</h3>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>

          {/* Formats */}
          {cat.formats.map(fmt => (
            <div key={fmt.name} style={{ marginBottom: 36 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--mid)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>{fmt.name}</div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 20 }}>
                {fmt.options.map((opt, i) => {
                  if (!opt.live) {
                    return (
                      <div key={i} style={{ borderRadius: 14, border: '1px dashed var(--border)', overflow: 'hidden', opacity: 0.6 }}>
                        <div style={{ height: 260, background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
                          <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--light)" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6M9 12h6M9 15h4"/></svg>
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--light)' }}>Coming soon</span>
                        </div>
                        <div style={{ padding: '16px 18px 18px' }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--mid)' }}>{fmt.name} · {opt.label}</div>
                          <div style={{ fontSize: 12, color: 'var(--light)', marginTop: 4 }}>Template in progress</div>
                        </div>
                      </div>
                    )
                  }

                  return (
                    <div
                      key={i}
                      style={{ borderRadius: 14, border: '1.5px solid var(--border)', overflow: 'hidden', background: 'var(--surface)', transition: 'transform 0.15s, box-shadow 0.15s' }}
                      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.1)' }}
                      onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
                    >
                      {/* Preview image */}
                      <div style={{ height: 260, overflow: 'hidden', background: '#00C2CB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <img src={opt.thumb} alt={opt.label} style={{ height: '100%', width: '100%', objectFit: 'cover', objectPosition: 'top' }} />
                      </div>

                      <div style={{ padding: '16px 18px 18px' }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--dark)', marginBottom: 4 }}>{fmt.name} · {opt.label}</div>
                        <div style={{ fontSize: 12, color: 'var(--mid)', marginBottom: 16, lineHeight: 1.45 }}>{cat.category} · A6 · CMYK · 3mm bleed</div>

                        {/* Mode buttons */}
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            onClick={() => onSelect(TEMPLATES.find(t => t.id === opt.templateId))}
                            style={{ flex: 1, padding: '9px 0', fontSize: 12, fontWeight: 700, background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', transition: 'background 0.15s' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-dark)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'var(--primary)'}
                          >
                            Guided ↗
                          </button>
                          <button
                            onClick={() => onSelect(TEMPLATES.find(t => t.id === opt.designerTemplateId))}
                            style={{ flex: 1, padding: '9px 0', fontSize: 12, fontWeight: 700, background: 'transparent', color: 'var(--dark)', border: '1.5px solid var(--border)', borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s' }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--dark)'; e.currentTarget.style.background = '#F3F4F6' }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'transparent' }}
                          >
                            Designer ↗
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// ── Main picker ───────────────────────────────────────────────────────────────
export default function TemplatePicker({ onSelect }) {
  const [activeCats,    setActiveCats]    = useState(['restaurant', 'retail'])
  const [activeFormats, setActiveFormats] = useState(['Flyer', 'Poster', 'Wild Poster'])
  const [showCatalogue, setShowCatalogue] = useState(false)

  function toggleCat(cat) {
    setActiveCats(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat])
  }
  function toggleFormat(fmt) {
    setActiveFormats(prev => prev.includes(fmt) ? prev.filter(f => f !== fmt) : [...prev, fmt])
  }

  if (showCatalogue) {
    return (
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <CatalogueView
          onSelect={t => { setShowCatalogue(false); onSelect(t) }}
          onClose={() => setShowCatalogue(false)}
        />
      </div>
    )
  }

  const visible = TEMPLATES.filter(t =>
    (!t.cat    || activeCats.includes(t.cat)) &&
    (!t.format || activeFormats.includes(t.format))
  )

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '52px 32px 64px' }}>

        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>Wolt Partner Tools</div>
        <h1 style={{ fontSize: 38, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--dark)', marginBottom: 10 }}>Pick your template.</h1>
        <p style={{ fontSize: 15, color: 'var(--mid)', marginBottom: 36, maxWidth: 520 }}>Choose a design, fill in your content, and download a print-ready PDF in minutes — no designer needed.</p>

        {/* How it works */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 24px', display: 'flex', alignItems: 'center', marginBottom: 36, flexWrap: 'wrap', gap: 8 }}>
          {STEPS.map((s, i) => (
            <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--primary)', color: '#fff', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{s.n}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{s.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--mid)' }}>{s.sub}</div>
                </div>
              </div>
              {i < STEPS.length - 1 && <span style={{ color: 'var(--dark)', fontSize: 16, margin: '0 8px' }}>→</span>}
            </div>
          ))}
        </div>

        {/* View Catalogue button */}
        <div style={{ marginBottom: 20 }}>
          <button
            onClick={() => setShowCatalogue(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '10px 20px', fontSize: 13, fontWeight: 700,
              background: 'var(--dark)', color: '#fff',
              border: 'none', borderRadius: 10, cursor: 'pointer',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#1a1a1a'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--dark)'}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
            </svg>
            View Catalogue
          </button>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--mid)', textTransform: 'uppercase', letterSpacing: '0.08em', minWidth: 72 }}>Category</span>
            {['restaurant', 'retail'].map(cat => (
              <FilterChip
                key={cat}
                label={cat.charAt(0).toUpperCase() + cat.slice(1)}
                active={activeCats.includes(cat)}
                onClick={() => toggleCat(cat)}
              />
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--mid)', textTransform: 'uppercase', letterSpacing: '0.08em', minWidth: 72 }}>Format</span>
            {ALL_FORMATS.map(fmt => {
              const comingSoon = fmt === 'Wild Poster' || fmt === 'Poster'
              return (
                <FilterChip
                  key={fmt}
                  label={fmt}
                  active={activeFormats.includes(fmt)}
                  onClick={() => toggleFormat(fmt)}
                  comingSoon={comingSoon}
                />
              )
            })}
          </div>
        </div>

        {/* Template grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20 }}>
          {visible.map(t => {
            const badge = MODE_BADGE[t.mode]
            return (
              <div
                key={t.id}
                onClick={() => t.live && onSelect(t)}
                style={{
                  background: 'var(--surface)', borderRadius: 14,
                  border: t.mode === 'non-designer' ? '1.5px solid var(--primary)' : '1px solid var(--border)',
                  overflow: 'hidden', cursor: t.live ? 'pointer' : 'default',
                  transition: 'transform 0.15s, box-shadow 0.15s',
                  opacity: t.live ? 1 : 0.75,
                }}
                onMouseEnter={e => { if (t.live) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.1)' } }}
                onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
              >
                {/* Thumbnail */}
                <div style={{ height: 220, overflow: 'hidden', position: 'relative', background: '#00C2CB' }}>
                  {t.thumb && (
                    <img src={t.thumb} alt={t.name} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
                  )}
                  {badge && (
                    <div style={{ position: 'absolute', top: 10, left: 10, background: badge.bg, color: badge.color, fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 100 }}>
                      {badge.label}
                    </div>
                  )}
                  {t.type && (
                    <div style={{ position: 'absolute', bottom: 10, left: 10, background: t.type === 'text-image' ? 'var(--dark)' : 'rgba(2,6,24,0.55)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 100 }}>
                      {t.type === 'text-image' ? 'Text + Image' : 'Text only'}
                    </div>
                  )}
                </div>

                {/* Card body */}
                <div style={{ padding: '18px 20px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{t.name}</div>
                    {t.format && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--mid)', background: '#F3F4F6', padding: '2px 7px', borderRadius: 100 }}>{t.format}</span>}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--mid)', marginBottom: 14, lineHeight: 1.45 }}>{t.desc}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {t.tags.map(tag => (
                        <span key={tag} style={{ fontSize: 11, fontWeight: 600, color: 'var(--mid)', background: '#F3F4F6', padding: '3px 8px', borderRadius: 100 }}>{tag}</span>
                      ))}
                    </div>
                    {t.live && <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)', flexShrink: 0, marginLeft: 8 }}>Use ↗</span>}
                  </div>
                </div>
              </div>
            )
          })}

          {visible.length === 0 && (
            <div style={{ gridColumn: '1 / -1', padding: '48px 0', textAlign: 'center', color: 'var(--light)', fontSize: 14 }}>
              No templates yet for this selection — more coming soon.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
