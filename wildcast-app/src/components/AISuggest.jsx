import { useState } from 'react'

const MOCK_SUGGESTIONS = {
  de: {
    headline: ['DREAMTEAM', 'NUR HEUTE', 'JETZT NEU'],
    sub_headline: ['POTSDAMS NEUES', 'EXKLUSIV AUF WOLT', 'NEU IN DEINER STADT'],
    offer: ['30% SPAREN', '2FÜR1 HEUTE', 'GRATIS LIEFERUNG'],
    tc: ['*Gültig für Neukunden ohne bisherige Bestellungen auf Wolt. 14 Tage ab Kontoerstellung. Gilt für die erste Bestellung mit Lieferung ab 15 €. Nicht kombinierbar.', '*Nur über Wolt App. Solange der Vorrat reicht. Details in der App.'],
  },
  en: {
    headline: ['DREAMTEAM', 'TODAY ONLY', 'BRAND NEW'],
    sub_headline: ['POTSDAM\'S NEWEST', 'EXCLUSIVELY ON WOLT', 'NEW IN YOUR CITY'],
    offer: ['SAVE 30%', '2FOR1 TODAY', 'FREE DELIVERY'],
    tc: ['*Valid for new customers with no previous Wolt orders. 14 days from account creation. First delivery order of €15+. Cannot be combined.', '*Wolt app only. While stocks last. See app for details.'],
  },
}

// variant="pill" (default) — small colored pill, used inline next to a field
// (FieldEditor.jsx). variant="button-group" — matches BriefingForm.jsx's
// plain-outlined ChoiceButton style, for sitting alongside "Write my own" /
// "Choose preset" as one consistent row of mode buttons.
export default function AISuggest({ field, lang, onApply, variant = 'pill' }) {
  const [open, setOpen] = useState(false)
  const [dropLang, setDropLang] = useState(lang)

  // Sync dropdown language when panel language changes (unless user overrode it)
  const activeLang = dropLang

  const suggestions = MOCK_SUGGESTIONS[activeLang]?.[field] ?? []

  const buttonStyle = variant === 'button-group'
    ? {
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 13, fontWeight: 600, color: 'var(--dark)',
        background: '#fff', border: '1.5px solid var(--border)',
        borderRadius: 8, padding: '8px 14px', cursor: 'pointer', whiteSpace: 'nowrap',
      }
    : {
        display: 'flex', alignItems: 'center', gap: 5,
        fontSize: 11, fontWeight: 600, color: 'var(--primary)',
        background: 'var(--primary-glow)', border: '1px solid rgba(223,111,109,0.25)',
        borderRadius: 6, padding: '4px 10px', cursor: 'pointer', whiteSpace: 'nowrap',
      }

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => { setDropLang(lang); setOpen(o => !o) }}
        style={buttonStyle}
      >
        <span>✦</span> AI Suggest
      </button>

      {open && (
        <>
          {/* Backdrop to close */}
          <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} />

          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 50,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            minWidth: 300, overflow: 'hidden',
          }}>
            {/* Header with language toggle */}
            <div style={{ padding: '10px 12px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--light)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Suggestions
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

            {suggestions.map((s, i) => (
              <div
                key={i}
                onClick={() => { onApply(s); setOpen(false) }}
                style={{
                  padding: '10px 14px', fontSize: 13, color: 'var(--dark)',
                  cursor: 'pointer', borderTop: '1px solid var(--border)',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#F9F8F5'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {s}
              </div>
            ))}

            <div style={{ padding: '8px 14px', fontSize: 11, color: 'var(--light)', borderTop: '1px solid var(--border)', fontStyle: 'italic' }}>
              AI copy — review before publishing
            </div>
          </div>
        </>
      )}
    </div>
  )
}
