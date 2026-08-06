import { useState } from 'react'

// Starter copy — same "pick from a short curated list" pattern as
// AISuggest.jsx, but a fixed library instead of generated suggestions.
// Placeholder content: Julia/Annika should swap these for real
// on-brand presets.
const PRESETS = {
  de: {
    headline: ['JETZT NEU', 'NUR HEUTE', 'FRISCH ERÖFFNET', 'JETZT BESTELLEN'],
    subline: ['NEU IN DEINER STADT', 'JETZT AUF WOLT', 'EXKLUSIV AUF WOLT', 'AB SOFORT VERFÜGBAR'],
  },
  en: {
    headline: ['JUST LANDED', 'TODAY ONLY', 'NOW OPEN', 'ORDER NOW'],
    subline: ['NEW IN YOUR CITY', 'NOW ON WOLT', 'EXCLUSIVELY ON WOLT', 'AVAILABLE NOW'],
  },
}

export default function PresetPicker({ field, lang, onApply }) {
  const [open, setOpen] = useState(false)
  const [dropLang, setDropLang] = useState(lang)

  const activeLang = dropLang
  const presets = PRESETS[activeLang]?.[field] ?? []

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => { setDropLang(lang); setOpen(o => !o) }}
        style={{
          padding: '8px 14px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer',
          border: '1.5px solid var(--border)', background: '#fff', color: 'var(--dark)',
          display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
        }}
      >
        <span>☰</span> Choose preset
      </button>

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} />

          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            minWidth: 260, overflow: 'hidden',
          }}>
            <div style={{ padding: '10px 12px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--light)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Presets
              </span>
              <div style={{ display: 'flex', background: '#F3F4F6', borderRadius: 6, padding: 2, gap: 1 }}>
                {['de', 'en'].map(l => (
                  <button
                    key={l}
                    onClick={e => { e.stopPropagation(); setDropLang(l) }}
                    style={{
                      fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 5,
                      border: 'none', cursor: 'pointer',
                      background: activeLang === l ? 'var(--primary)' : 'transparent',
                      color: activeLang === l ? '#fff' : 'var(--mid)',
                      transition: 'all 0.12s',
                    }}
                  >
                    {l.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {presets.map((p, i) => (
              <div
                key={i}
                onClick={() => { onApply(p); setOpen(false) }}
                style={{
                  padding: '10px 14px', fontSize: 13, color: 'var(--dark)',
                  cursor: 'pointer', borderTop: '1px solid var(--border)',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#F9F8F5'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {p}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
