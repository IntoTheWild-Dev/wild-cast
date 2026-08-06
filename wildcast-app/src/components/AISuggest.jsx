import { useState } from 'react'

// variant="pill" (default) — small colored pill, used inline next to a field
// (FieldEditor.jsx). variant="button-group" — matches BriefingForm.jsx's
// plain-outlined ChoiceButton style, for sitting alongside "Write my own" /
// "Choose preset" as one consistent row of mode buttons.
//
// context — optional brief details (businessType, about, objective,
// partnerName) passed through to the backend so suggestions are grounded in
// the actual brief, not just the field type. Omitted by FieldEditor.jsx,
// which doesn't have easy access to the full brief.
export default function AISuggest({ field, lang, onApply, variant = 'pill', context = {} }) {
  const [open, setOpen] = useState(false)
  const [dropLang, setDropLang] = useState(lang)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  // Cache per language so toggling DE/EN back and forth doesn't refetch.
  const [byLang, setByLang] = useState({})

  const activeLang = dropLang
  const suggestions = byLang[activeLang] ?? []

  async function fetchSuggestions(l) {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ai-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field, lang: l, context }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'AI suggest failed')
      setByLang(prev => ({ ...prev, [l]: data.suggestions ?? [] }))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function handleToggle() {
    const willOpen = !open
    setOpen(willOpen)
    if (willOpen) {
      setDropLang(lang)
      if (!byLang[lang]) fetchSuggestions(lang)
    }
  }

  function handleLangSwitch(e, l) {
    e.stopPropagation()
    setDropLang(l)
    if (!byLang[l]) fetchSuggestions(l)
  }

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
      <button type="button" onClick={handleToggle} style={buttonStyle}>
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
                    onClick={e => handleLangSwitch(e, l)}
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

            {loading && (
              <div style={{ padding: '16px 14px', fontSize: 13, color: 'var(--mid)', textAlign: 'center' }}>
                Generating…
              </div>
            )}

            {!loading && error && (
              <div style={{ padding: '12px 14px', fontSize: 12, color: '#B91C1C' }}>
                {error}
                <button
                  type="button"
                  onClick={() => fetchSuggestions(activeLang)}
                  style={{ display: 'block', marginTop: 6, background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--primary)', padding: 0 }}
                >
                  Retry
                </button>
              </div>
            )}

            {!loading && !error && suggestions.map((s, i) => (
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

            {!loading && !error && suggestions.length === 0 && (
              <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--light)' }}>
                No suggestions came back — try again.
              </div>
            )}

            <div style={{ padding: '8px 14px', fontSize: 11, color: 'var(--light)', borderTop: '1px solid var(--border)', fontStyle: 'italic' }}>
              AI copy — review before publishing
            </div>
          </div>
        </>
      )}
    </div>
  )
}
