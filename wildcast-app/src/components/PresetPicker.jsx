import { useState } from 'react'

// Real historical Wolt campaign copy pulled straight from the Google Sheet
// (api/presets.js) — no AI, no generation, exact lines that have already
// been used and approved. The instant/free/guaranteed-safe counterpart to
// AISuggest.jsx, which generates new tailored copy instead of reusing exact
// past lines. Sheet content is German-only, so there's no language toggle
// here (unlike AISuggest) — showing an empty "EN" tab would be misleading.
export default function PresetPicker({ field, onApply }) {
  const [open, setOpen] = useState(false)
  const [presets, setPresets] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function fetchPresets() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/presets?field=${encodeURIComponent(field)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not load presets')
      setPresets(data.presets ?? [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function handleToggle() {
    const willOpen = !open
    setOpen(willOpen)
    if (willOpen && presets === null) fetchPresets()
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={handleToggle}
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
            minWidth: 260, maxHeight: 320, overflowY: 'auto',
          }}>
            <div style={{ padding: '10px 12px 8px' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--light)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Real past Wolt copy
              </span>
            </div>

            {loading && (
              <div style={{ padding: '16px 14px', fontSize: 13, color: 'var(--mid)', textAlign: 'center' }}>
                Loading…
              </div>
            )}

            {!loading && error && (
              <div style={{ padding: '12px 14px', fontSize: 12, color: '#B91C1C' }}>
                {error}
                <button
                  type="button"
                  onClick={fetchPresets}
                  style={{ display: 'block', marginTop: 6, background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--primary)', padding: 0 }}
                >
                  Retry
                </button>
              </div>
            )}

            {!loading && !error && (presets ?? []).map((p, i) => (
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

            {!loading && !error && presets?.length === 0 && (
              <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--light)' }}>
                No past examples for this field yet.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
