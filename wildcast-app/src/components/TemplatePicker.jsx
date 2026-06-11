import { useState, useRef } from 'react'
import PdfThumbnail from './PdfThumbnail'

const TEMPLATES = [
  {
    id: 'promo-partner',
    name: 'Promo Flyer Partner',
    desc: 'Merchant-branded flyer for discount campaigns, 2-for-1 deals, and limited-time offers.',
    tags: ['A6', 'CMYK', '3mm bleed'],
    cat: 'restaurant',
    pdfPath: '/Example templates/260217_Wolt_Q126CTX_Flyer_Vertical_A6+3mmBleed_V1_Bamberg.pdf',
    hasQr: false,
    live: true,
  },
  {
    id: 'promo-generic',
    name: 'Promo Flyer Generic',
    desc: 'City-campaign flyer with QR code. Ideal for area-wide Wolt promotions.',
    tags: ['A6', 'CMYK', '3mm bleed', 'QR'],
    cat: 'restaurant',
    pdfPath: '/Example templates/260217_Wolt_Q126CTX_Flyer_Vertical_A6+3mmBleed_V2_DessauRoßlau.pdf',
    hasQr: true,
    live: true,
  },
  {
    id: 'new-opening',
    name: 'New Opening',
    desc: 'Announce your Wolt launch to the neighbourhood.',
    tags: ['A5', 'CMYK'],
    cat: 'restaurant',
    thumb: '/Example templates/Catalogue Restaurant POster/250827_WEN-CHENG-Hamburg_A1_3mm-bleed_WILDPOSTER-A.png',
    live: false,
  },
  {
    id: 'upload',
    name: 'Upload Template',
    desc: 'Bring your own Figma export or press-ready PDF. Map your editable fields and go.',
    tags: ['PDF', 'AI', 'Any size'],
    cat: null,
    live: false,
    upload: true,
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
  const [uploadCat, setUploadCat] = useState('restaurant')
  const fileInputRef = useRef(null)

  function toggleCat(cat) {
    setActiveCats(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    )
  }

  function handleUploadFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    onSelect({
      id: 'custom-upload',
      name: file.name.replace(/\.pdf$/i, ''),
      desc: 'Custom uploaded template',
      tags: [uploadCat.charAt(0).toUpperCase() + uploadCat.slice(1), 'PDF'],
      cat: uploadCat,
      pdfPath: URL.createObjectURL(file),
      hasQr: false,
      live: true,
    })
    e.target.value = ''
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
              border: t.upload ? '1.5px dashed var(--border)' : '1px solid var(--border)',
              overflow: 'hidden', cursor: t.live ? 'pointer' : 'default',
              transition: 'transform 0.15s, box-shadow 0.15s',
              opacity: !t.live && !t.upload ? 0.75 : 1,
            }}
            onMouseEnter={e => { if (t.live) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.1)' } }}
            onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
          >
            {/* Thumbnail */}
            <div style={{ height: 220, overflow: 'hidden', position: 'relative', background: '#f3f4f6' }}>
              {t.upload ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, background: '#FAFAF8', cursor: 'pointer' }}
                >
                  <input ref={fileInputRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={handleUploadFile} />
                  <div style={{ width: 52, height: 52, background: 'var(--dark)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--mid)' }}>Drag &amp; drop or <span style={{ color: 'var(--primary)', fontWeight: 600 }}>browse files</span></div>
                  <div style={{ fontSize: 11, color: 'var(--light)' }}>PDF · Up to 50MB</div>
                </div>
              ) : t.pdfPath ? (
                <PdfThumbnail pdfPath={t.pdfPath} />
              ) : (
                <img src={t.thumb} alt={t.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              )}
              {!t.live && !t.upload && (
                <div style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(2,6,24,0.75)', color: '#fff', fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 100 }}>Coming soon</div>
              )}
              {t.hasQr && (
                <div style={{ position: 'absolute', bottom: 10, left: 10, background: 'var(--primary)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 100 }}>QR</div>
              )}
            </div>

            {/* Card body */}
            <div style={{ padding: '18px 20px 20px' }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{t.name}</div>
              <div style={{ fontSize: 13, color: 'var(--mid)', marginBottom: 14, lineHeight: 1.45 }}>{t.desc}</div>
              {t.upload ? (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--mid)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Tag as</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {['restaurant', 'retail'].map(cat => (
                      <button
                        key={cat}
                        onClick={e => { e.stopPropagation(); setUploadCat(cat) }}
                        style={{
                          padding: '5px 12px', borderRadius: 100, fontSize: 12, fontWeight: 600,
                          cursor: 'pointer', transition: 'all 0.15s',
                          border: uploadCat === cat ? '1.5px solid var(--primary)' : '1.5px solid var(--border)',
                          background: uploadCat === cat ? 'var(--primary-glow)' : 'transparent',
                          color: uploadCat === cat ? 'var(--primary-dark)' : 'var(--mid)',
                        }}
                      >
                        {uploadCat === cat && '✓ '}{cat.charAt(0).toUpperCase() + cat.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {t.tags.map(tag => (
                      <span key={tag} style={{ fontSize: 11, fontWeight: 600, color: 'var(--mid)', background: '#F3F4F6', padding: '3px 8px', borderRadius: 100 }}>{tag}</span>
                    ))}
                  </div>
                  {t.live && <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)', flexShrink: 0, marginLeft: 8 }}>Use ↗</span>}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
