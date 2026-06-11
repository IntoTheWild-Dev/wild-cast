import { useState } from 'react'

// Placeholder suggestions — replace with real API call in /api/ai-suggest.js
const MOCK_SUGGESTIONS = {
  de: {
    headline: ['WIE WÄR\'S MIT MEHR UMSATZ?', 'DEIN BURGER WARTET.', 'JETZT 2FÜR1 SICHERN'],
    offer: ['2FÜR1 auf alles', '26% Rabatt heute', 'WOLTREX10 — 10€ Rabatt'],
    sub_headline: ['Nur für kurze Zeit. Jetzt bestellen auf Wolt.', 'Saftig. Frisch. In Minuten bei dir.', 'Bestell jetzt — In Minuten geliefert.'],
    tc: ['*Angebot gültig bis 31.12.2026. Nicht kombinierbar.', '*Nur über Wolt. Solange der Vorrat reicht.', '*Gilt für ausgewählte Gerichte. Details in der App.'],
  },
  en: {
    headline: ['HOW ABOUT MORE ORDERS?', 'YOUR BURGER IS WAITING.', 'GET 2FOR1 NOW'],
    offer: ['2FOR1 on everything', '26% off today', 'WOLTREX10 — €10 off'],
    sub_headline: ['Limited time only. Order now on Wolt.', 'Juicy. Fresh. At your door in minutes.', 'Order now — delivered in minutes.'],
    tc: ['*Offer valid until 31.12.2026. Cannot be combined.', '*Wolt only. While stocks last.', '*Valid on selected items. See app for details.'],
  },
}

export default function AISuggest({ field, lang, onApply }) {
  const [open, setOpen] = useState(false)

  const suggestions = MOCK_SUGGESTIONS[lang]?.[field] ?? []

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          fontSize: 11, fontWeight: 600, color: 'var(--primary)',
          background: 'var(--primary-glow)', border: '1px solid rgba(223,111,109,0.25)',
          borderRadius: 6, padding: '4px 10px', cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        <span>✦</span> AI Suggest
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          minWidth: 280, overflow: 'hidden',
        }}>
          <div style={{ padding: '10px 12px 6px', fontSize: 11, fontWeight: 600, color: 'var(--light)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Suggestions ({lang.toUpperCase()})
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
      )}
    </div>
  )
}
