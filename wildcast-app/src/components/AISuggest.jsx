import { useState } from 'react'

// variant="pill" (default) - small colored pill, used inline next to a field
// (FieldEditor.jsx). variant="button-group" - matches BriefingForm.jsx's
// plain-outlined ChoiceButton style, for sitting alongside "Write my own" /
// "Choose preset" as one consistent row of mode buttons.
//
// context - optional brief details (businessType, about, objective,
// partnerName) passed through to the backend so suggestions are grounded in
// the actual brief, not just the field type. Omitted by FieldEditor.jsx,
// which doesn't have easy access to the full brief.
//
// credits/onCreditUsed - each generation is a real Claude API call we pay
// for, so it costs the activation key one credit (mirrors the export credit
// deduction in App.jsx). Both are undefined when no activation is in scope,
// which leaves generation ungated rather than blocking on a false 0.
//
// mode="improve" - a separate "Improve with AI" affordance next to the
// default "Generate" mode: instead of writing fresh copy from the brief, it
// sends whatever the partner already typed (seedText) as `seed`, and
// api/ai-suggest.js polishes it or translates it into the target language
// instead of inventing something new. Never cached (seedText can change
// between opens), so every open re-checks credits and refetches.
export default function AISuggest({ field, lang, onApply, variant = 'pill', context = {}, credits, onCreditUsed, mode = 'generate', seedText = '' }) {
  const [open, setOpen] = useState(false)
  const [dropLang, setDropLang] = useState(lang)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  // Cache per language so toggling DE/EN back and forth doesn't refetch.
  const [byLang, setByLang] = useState({})
  // Tracks whether "Suggest more" has already been used for a given
  // language - capped at one extra round per open, so at most 2 credits
  // (initial + one more) can be spent per language per generation.
  const [moreUsed, setMoreUsed] = useState({})

  const activeLang = dropLang
  const suggestions = byLang[activeLang] ?? []

  const isImprove = mode === 'improve'
  const trimmedSeed = seedText.trim()

  async function fetchSuggestions(l, { more = false } = {}) {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ai-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field, lang: l, context,
          ...(isImprove ? { seed: trimmedSeed } : {}),
          ...(more ? { exclude: byLang[l] ?? [] } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'AI suggest failed')
      // "Suggest more" appends to what's already shown rather than
      // replacing it, so earlier options stay pickable.
      setByLang(prev => ({ ...prev, [l]: more ? [...(prev[l] ?? []), ...(data.suggestions ?? [])] : (data.suggestions ?? []) }))
      if (more) setMoreUsed(prev => ({ ...prev, [l]: true }))
      onCreditUsed?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function handleSuggestMore() {
    if (moreUsed[activeLang] || !canGenerate('more')) return
    fetchSuggestions(activeLang, { more: true })
  }

  // Improve mode never trusts the cache - seedText can change between
  // opens, so a stale byLang entry would silently show suggestions for
  // whatever was typed last time.
  function needsFetch(l) {
    return isImprove || !byLang[l]
  }

  // Gate before any actual API call (a cache hit in byLang is free - no
  // fetch happens, so no confirmation needed to reopen it).
  function canGenerate(kind = 'initial') {
    if (credits != null && credits <= 0) {
      alert('You have no credits remaining for AI suggestions. Contact Wild Stack to get more.')
      return false
    }
    const message = kind === 'more'
      ? 'Get one more round of suggestions? This uses 1 credit.'
      : isImprove ? 'Improve/translate this line? This uses 1 credit.' : 'Generate 6 AI suggestions? This uses 1 credit.'
    return window.confirm(message)
  }

  function handleToggle() {
    if (isImprove && !trimmedSeed) return
    const willOpen = !open
    if (willOpen && needsFetch(lang) && !canGenerate()) return
    setOpen(willOpen)
    if (willOpen) {
      setDropLang(lang)
      if (needsFetch(lang)) fetchSuggestions(lang)
    }
  }

  function handleLangSwitch(e, l) {
    e.stopPropagation()
    if (needsFetch(l) && !canGenerate()) return
    setDropLang(l)
    if (needsFetch(l)) fetchSuggestions(l)
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

  const disabled = isImprove && !trimmedSeed

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        style={{ ...buttonStyle, ...(disabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
        title={disabled ? 'Type something first' : 'Uses 1 credit per generation'}
      >
        <span>{isImprove ? '✨' : '✦'}</span> {isImprove ? 'Improve with AI' : 'AI Suggest'}
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
                {isImprove ? 'Improve & Translate' : 'Suggestions'}
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
                No suggestions came back - try again.
              </div>
            )}

            {!loading && !error && !isImprove && suggestions.length > 0 && !moreUsed[activeLang] && (
              <button
                type="button"
                onClick={handleSuggestMore}
                title="Uses 1 credit"
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '10px 14px', fontSize: 12, fontWeight: 600, color: 'var(--primary)',
                  background: 'transparent', border: 'none', borderTop: '1px solid var(--border)', cursor: 'pointer',
                }}
              >
                + Suggest more (1 credit)
              </button>
            )}

            <div style={{ padding: '8px 14px', fontSize: 11, color: 'var(--light)', borderTop: '1px solid var(--border)', fontStyle: 'italic' }}>
              AI copy - review before publishing
            </div>
          </div>
        </>
      )}
    </div>
  )
}
