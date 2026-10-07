import { useRef, useState } from 'react'

// Real historical Wolt campaign copy pulled straight from the Google Sheet
// (api/presets.js) - no AI, no generation, exact lines that have already
// been used and approved. The instant/free/guaranteed-safe counterpart to
// AISuggest.jsx, which generates new tailored copy instead of reusing exact
// past lines. Sheet content is German-only, so there's no language toggle
// here (unlike AISuggest) - showing an empty "EN" tab would be misleading.
//
// partnerName - when set, results are scoped to that merchant's own past
// campaigns (matched server-side against the sheet's "Merchant" column), so
// picking "McD" doesn't surface an unrelated churro or bowl campaign line.
// Falls back to the full library when nothing matches that partner yet.
//
// maxChars - the field's §4.1 box fit at min pt (max_chars_min_pt); presets
// longer than it can't fill the box, so the server filters them out. When
// absent (template without AI field settings) no length filter is applied.
// role - the sub-headline's §4.1 role: 'setup' presets are the "Lockup:
// Sub-headline" halves, 'support' presets are standalone subline rows.
//
// Shown collapsed to this many entries first - free/no-AI-cost, so "More
// options" just reveals the rest of what's already fetched, no refetch.
const VISIBLE_COUNT = 4
const MENU_WIDTH = 260
const MENU_EDGE_GAP = 8

// The edit panel scrolls, so anything poking past its edge is clipped. Find
// the nearest ancestor that clips (or the viewport) to measure against.
function clippingRect(el) {
  for (let node = el?.parentElement; node; node = node.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(node)
    if (/(auto|scroll|hidden|clip)/.test(overflowX + overflowY)) return node.getBoundingClientRect()
  }
  return { left: 0, right: window.innerWidth }
}

// Where to put the menu (left offset from the button, and width) so it stays
// fully inside the clipping panel. The button sits right-aligned in its row
// and the panel can be narrower than the menu, so neither a fixed left: 0
// nor right: 0 fits every case - the menu is shifted, then narrowed if the
// panel itself is too small.
function menuPlacement(wrap) {
  const btn = wrap.getBoundingClientRect()
  const clip = clippingRect(wrap)
  const minX = clip.left + MENU_EDGE_GAP
  const maxX = clip.right - MENU_EDGE_GAP
  const width = Math.max(0, Math.min(MENU_WIDTH, maxX - minX))
  const x = Math.max(minX, Math.min(btn.left, maxX - width))
  return { left: x - btn.left, width }
}

export default function PresetPicker({ field, onApply, partnerName, vertical, maxChars, role }) {
  const [open, setOpen] = useState(false)
  const [presets, setPresets] = useState(null)
  const [fetchedFor, setFetchedFor] = useState(undefined)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showAll, setShowAll] = useState(false)
  const [placement, setPlacement] = useState({ left: 0, width: MENU_WIDTH })
  const wrapRef = useRef(null)

  async function fetchPresets() {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ field })
      if (partnerName) params.set('partner', partnerName)
      if (vertical) params.set('vertical', vertical)
      if (maxChars) params.set('max_chars_min_pt', String(maxChars))
      if (role) params.set('role', role)
      const res = await fetch(`/api/presets?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not load presets')
      setPresets(data.presets ?? [])
      setFetchedFor(`${vertical ?? ''}|${partnerName}|${maxChars ?? ''}|${role ?? ''}`)
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
      setShowAll(false)
      if (wrapRef.current) setPlacement(menuPlacement(wrapRef.current))
      if (presets === null || fetchedFor !== `${vertical ?? ''}|${partnerName}|${maxChars ?? ''}|${role ?? ''}`) fetchPresets()
    }
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
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
            position: 'absolute', top: 'calc(100% + 6px)', zIndex: 50,
            left: placement.left, width: placement.width, boxSizing: 'border-box',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            maxHeight: 320, overflowY: 'auto',
          }}>
            <div style={{ padding: '10px 12px 8px' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--light)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {partnerName ? `Past copy - ${partnerName}` : 'Real past Wolt copy'}
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

            {!loading && !error && (showAll ? (presets ?? []) : (presets ?? []).slice(0, VISIBLE_COUNT)).map((p, i) => (
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

            {!loading && !error && !showAll && (presets?.length ?? 0) > VISIBLE_COUNT && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '10px 14px', fontSize: 12, fontWeight: 600, color: 'var(--primary)',
                  background: 'transparent', border: 'none', borderTop: '1px solid var(--border)', cursor: 'pointer',
                }}
              >
                + More options ({presets.length - VISIBLE_COUNT} more)
              </button>
            )}

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
