import { useState } from 'react'
import PdfThumbnail from './PdfThumbnail'

const TEMPLATES = [
  {
    id: 'wen-cheng-flyer1',
    name: 'Flyer 1',
    desc: 'Wen Cheng × Wolt Potsdam — discount campaign flyer. Headline, city tagline and offer are editable.',
    tags: ['A6', 'CMYK', '3mm bleed'],
    type: 'text-only',
    cat: 'restaurant',
    pdfPath: '/Example templates/260527_WEN-CHENG-Potsdam_A6_3mm-bleed_FLYER_1.pdf',
    hasQr: false,
    live: true,
  },
  {
    id: 'wen-cheng-flyer2',
    name: 'Flyer 2',
    desc: 'Wen Cheng × Wolt Potsdam — upload your own food photo and logo alongside all text fields.',
    tags: ['A6', 'CMYK', '3mm bleed'],
    type: 'text-image',
    cat: 'restaurant',
    pdfPath: '/Example templates/260527_WEN-CHENG-Potsdam_A6_3mm-bleed_FLYER_2.pdf',
    hasQr: false,
    live: true,
  },
]

const STEPS = [
  { n: 1, title: 'Pick a template', sub: 'Promo, Opening, Seasonal' },
  { n: 2, title: 'Fill in your content', sub: 'Headline, offer, photo' },
  { n: 3, title: 'Export PDF', sub: 'CMYK, print-ready, instant' },
  { n: 4, title: 'Send to your printer', sub: 'Done — no back-and-forth' },
]

export default function TemplatePicker({ onSelect }) {
  const [activeCats, setActiveCats] = useState(['restaurant', 'retail'])

  function toggleCat(cat) {
    setActiveCats(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    )
  }

  const visible = TEMPLATES.filter(t => !t.cat || activeCats.includes(t.cat))

  return (
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

      {/* Category filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--mid)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Category</span>
        {['restaurant', 'retail'].map(cat => {
          const active = activeCats.includes(cat)
          return (
            <button
              key={cat}
              onClick={() => toggleCat(cat)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 100, fontSize: 13, fontWeight: 500,
                cursor: 'pointer', transition: 'all 0.15s',
                border: active ? '1.5px solid var(--primary)' : '1.5px solid var(--border)',
                background: active ? 'var(--primary-glow)' : 'transparent',
                color: active ? 'var(--primary-dark)' : 'var(--mid)',
              }}
            >
              {active && <span style={{ fontSize: 10 }}>✓</span>}
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          )
        })}
      </div>

      {/* Template grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20 }}>
        {visible.map(t => (
          <div
            key={t.id}
            onClick={() => t.live && onSelect(t)}
            style={{
              background: 'var(--surface)', borderRadius: 14,
              border: '1px solid var(--border)',
              overflow: 'hidden', cursor: t.live ? 'pointer' : 'default',
              transition: 'transform 0.15s, box-shadow 0.15s',
              opacity: t.live ? 1 : 0.75,
            }}
            onMouseEnter={e => { if (t.live) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.1)' } }}
            onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
          >
            {/* Thumbnail */}
            <div style={{ height: 220, overflow: 'hidden', position: 'relative', background: '#f3f4f6' }}>
              {t.pdfPath ? (
                <PdfThumbnail pdfPath={t.pdfPath} />
              ) : t.thumb ? (
                <img src={t.thumb} alt={t.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : null}
              {!t.live && (
                <div style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(2,6,24,0.75)', color: '#fff', fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 100 }}>Coming soon</div>
              )}
              {t.type && (
                <div style={{ position: 'absolute', bottom: 10, left: 10, background: t.type === 'text-image' ? 'var(--dark)' : 'rgba(2,6,24,0.55)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 100 }}>
                  {t.type === 'text-image' ? 'Text + Image' : 'Text only'}
                </div>
              )}
            </div>

            {/* Card body */}
            <div style={{ padding: '18px 20px 20px' }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{t.name}</div>
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
        ))}
      </div>
    </div>
  )
}
