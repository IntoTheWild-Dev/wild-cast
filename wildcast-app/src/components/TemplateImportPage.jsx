import { useState } from 'react'
import Select from './Select'
import { templateAssetSrc } from '../lib/customTemplates'
import { activationHeaders } from '../lib/activationKey'

// Matches every live template config's canvasW/canvasH (src/data/templateZones.js)
// and the record api/import-figma-plugin.js builds - no single shared
// constant exists for it anywhere in the app, this just follows the same
// hardcoded-316x441 convention already used everywhere else.
const CANVAS_W = 316
const CANVAS_H = 441

const zoneColor = z => (z.type === 'image' ? '#3B82F6' : 'var(--primary)')

// Draws each zone's actual box on top of the imported background, in the
// same 316x441 coordinate space the geometry itself is already in - lets a
// designer SEE a misaligned box instead of only guessing from raw numbers
// (Julia's ask, 2026-08-07: the previous review panel had no way to spot or
// fix a bad import short of redoing it in Figma).
function ZoneOverlay({ zones, backgroundUrl }) {
  return (
    <div style={{ position: 'relative' }}>
      <img src={templateAssetSrc(backgroundUrl)} alt="" style={{ width: '100%', display: 'block', background: '#F3F4F6' }} />
      {zones.map(z => (
        <div
          key={z.id}
          style={{
            position: 'absolute',
            left: `${(z.x / CANVAS_W) * 100}%`,
            top: `${(z.y / CANVAS_H) * 100}%`,
            width: `${(z.width / CANVAS_W) * 100}%`,
            height: `${(z.height / CANVAS_H) * 100}%`,
            border: `1.5px dashed ${zoneColor(z)}`,
            background: z.type === 'image' ? 'rgba(59,130,246,0.12)' : 'rgba(223,111,109,0.12)',
            pointerEvents: 'none',
          }}
        >
          <span style={{
            position: 'absolute', top: -1, left: -1, fontSize: 9, fontWeight: 700, lineHeight: 1,
            padding: '2px 4px', color: '#fff', background: zoneColor(z),
          }}>
            {z.id}
          </span>
        </div>
      ))}
    </div>
  )
}

// A labeled value with BOTH a slider (quick, visual adjustment) and a number
// input (exact value) side by side - Julia's ask, 2026-09-11: raw X/Y/W/H
// number boxes alone felt "a little bit confusing" to work with. The slider
// covers "roughly here, drag until it looks right"; the number stays for
// "I know the exact value I want."
function SliderField({ label, value, min, max, step = 1, onChange, width }) {
  return (
    <div style={width ? { width } : undefined}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--mid)' }}>{label}</span>
        <input
          type="number"
          value={value ?? ''}
          onChange={e => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
          style={{ width: 58, padding: '3px 6px', fontSize: 12, fontFamily: 'inherit', border: '1.5px solid var(--border)', borderRadius: 6, outline: 'none', textAlign: 'right', boxSizing: 'border-box' }}
        />
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value ?? 0}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--primary)', display: 'block' }}
      />
    </div>
  )
}

// One zone's editable fields, collapsed into an accordion - only the header
// row (dot + id + type) shows until clicked. Redesigned 2026-09-11 (Julia:
// scrolling down to reach a zone further down the list, e.g. sub_headline,
// scrolled the design preview out of view too, with no way to see both at
// once). Every zone fully expanded by default made the column tall enough
// that this was unavoidable regardless of the preview's own sticky
// positioning - collapsing by default keeps the whole list short enough
// that reaching any zone rarely needs much scrolling at all. Needs-review
// zones (no live text in Figma to read font info from) start expanded,
// since those are the ones that actually need a look.
function ZoneCard({ z, expanded, onToggle, needsReview, onChange }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
      <button
        type="button"
        onClick={onToggle}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
      >
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: zoneColor(z), flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--dark)' }}>{z.id}</span>
        <span style={{ fontSize: 11, color: 'var(--light)' }}>{z.type === 'image' ? 'image' : 'text'}</span>
        {needsReview && (
          <span style={{ fontSize: 10, fontWeight: 700, color: '#92400E', background: '#FEF3C7', padding: '2px 7px', borderRadius: 100 }}>
            Check font
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--light)', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▾</span>
      </button>

      {expanded && (
        <div style={{ padding: '2px 14px 16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px 20px' }}>
            <SliderField label="X" value={z.x} min={-50} max={CANVAS_W + 50} onChange={v => onChange({ x: v })} />
            <SliderField label="Y" value={z.y} min={-50} max={CANVAS_H + 50} onChange={v => onChange({ y: v })} />
            <SliderField label="W" value={z.width} min={1} max={CANVAS_W + 100} onChange={v => onChange({ width: v })} />
            <SliderField label="H" value={z.height} min={1} max={CANVAS_H + 100} onChange={v => onChange({ height: v })} />
          </div>

          {z.type === 'text' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
              <SliderField label="Font size" value={z.fontSize} min={6} max={120} onChange={v => onChange({ fontSize: v })} width={170} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--dark)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={z.rotate === -90}
                  onChange={e => onChange({ rotate: e.target.checked ? -90 : undefined, textWidth: e.target.checked ? z.height : undefined })}
                />
                Rotate 90°
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function TemplateImportPage({ customRecords, onRefetch, onOptimisticPatch }) {
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [publishing, setPublishing] = useState(false)
  // Per-zone overrides staged in the "Zone settings" review panel below,
  // keyed by zone id - lets a designer correct font size/rotation right here
  // instead of pixel-hunting via screenshots and waiting on a code change.
  // Figma's own point size is what's extracted (see api/_lib/figma-import.js),
  // but a zone with no live text to sample from still needs a human's call.
  const [zoneEdits, setZoneEdits] = useState({})
  const [savingZones, setSavingZones] = useState(false)
  const [zonesSaved, setZonesSaved] = useState(false)
  // Which zone cards are expanded - see ZoneCard's comment for why this
  // defaults to "just the needs-review ones" rather than all-open or all-closed.
  const [expandedZoneIds, setExpandedZoneIds] = useState(() => new Set())

  // Records worth reviewing here - real Figma imports (drafts or already
  // live) with actual zone geometry, not the synthetic Option A/B override
  // records TemplatePicker.jsx uses just for its archive toggle. Drafts
  // first - those are the ones actually waiting on a decision - then most
  // recent first within each group.
  const reviewable = (customRecords ?? [])
    .filter(r => !r.archived && !r.isOverrideOnly && r.zones)
    .sort((a, b) => (a.live === b.live ? 0 : a.live ? 1 : -1) || (b.createdAt || '').localeCompare(a.createdAt || ''))

  function selectForReview(slotKey) {
    const record = reviewable.find(r => r.slotKey === slotKey) || null
    setResult(record)
    setZoneEdits({})
    setZonesSaved(false)
    setError('')
    setExpandedZoneIds(new Set(record?.needsReview ?? []))
  }

  function toggleZoneExpanded(zoneId) {
    setExpandedZoneIds(prev => {
      const next = new Set(prev)
      next.has(zoneId) ? next.delete(zoneId) : next.add(zoneId)
      return next
    })
  }

  // Merges staged zoneEdits on top of the import result - what's actually
  // shown in the review panel and what gets saved.
  function zonesWithEdits() {
    if (!result) return []
    return result.zones.map(z => zoneEdits[z.id] ? { ...z, ...zoneEdits[z.id] } : z)
  }

  function updateZoneEdit(zoneId, patch) {
    setZoneEdits(prev => ({ ...prev, [zoneId]: { ...prev[zoneId], ...patch } }))
    setZonesSaved(false)
  }

  async function handleSaveZones() {
    if (!result) return
    setSavingZones(true)
    setError('')
    try {
      const zones = zonesWithEdits()
      const res = await fetch('/api/publish-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...activationHeaders() },
        body: JSON.stringify({ slotKey: result.slotKey, action: 'updateZones', zones }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not save zone settings')
      setResult(r => ({ ...r, zones: data.zones }))
      setZoneEdits({})
      setZonesSaved(true)
      onOptimisticPatch?.(result.slotKey, { zones: data.zones })
      onRefetch?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingZones(false)
    }
  }

  async function handlePublish() {
    if (!result) return
    setPublishing(true)
    try {
      const res = await fetch('/api/publish-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...activationHeaders() },
        body: JSON.stringify({ slotKey: result.slotKey, action: 'publish' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Publish failed')
      setResult(r => ({ ...r, live: true, archived: false }))
      onOptimisticPatch?.(result.slotKey, { live: true, archived: false })
      onRefetch?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setPublishing(false)
    }
  }

  const linkButtonStyle = { fontSize: 11, fontWeight: 600, color: 'var(--primary)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: 'var(--bg)' }}>
      <div style={{ maxWidth: 1160, margin: '0 auto', padding: '40px 32px 64px' }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--dark)', marginBottom: 4 }}>
          Review Figma imports
        </h1>
        <p style={{ fontSize: 13, color: 'var(--mid)', marginBottom: 20 }}>
          Designer-only. Check the zone layout an import pulled from Figma, then publish it to the catalogue.
        </p>

        <div style={{ display: 'flex', gap: 10, padding: '12px 14px', background: 'var(--primary-glow)', border: '1px solid var(--primary)', borderRadius: 10, marginBottom: 28 }}>
          <span style={{ fontSize: 16, lineHeight: 1 }}>🔌</span>
          <div style={{ fontSize: 12.5, color: 'var(--dark)', lineHeight: 1.6 }}>
            <strong>Importing happens in Figma.</strong> Open the master file, select a frame (with <code>zone:&lt;id&gt;</code> layers), and run "WildCast Import" from the Plugins menu. It lands here as a draft - pick it below to review and publish.
          </div>
        </div>

        <div style={{ marginBottom: 32, maxWidth: 420 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--dark)', marginBottom: 6 }}>Import to review</label>
          <Select
            value={result?.slotKey || ''}
            onChange={e => selectForReview(e.target.value)}
            disabled={!reviewable.length}
            style={{ width: '100%', padding: '10px 12px', fontSize: 13, fontFamily: 'inherit', border: '1.5px solid var(--border)', borderRadius: 8, outline: 'none', background: '#fff' }}
          >
            <option value="">{reviewable.length ? 'Select an import…' : 'No imports yet - run the plugin in Figma first'}</option>
            {reviewable.map(r => (
              <option key={r.slotKey} value={r.slotKey}>{r.label} - {r.live ? 'Live' : 'Draft'}</option>
            ))}
          </Select>
        </div>

        {error && (
          <div style={{ padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, fontSize: 13, color: '#B91C1C', marginBottom: 24 }}>
            {error}
          </div>
        )}

        {result && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 380px) 1fr', gap: 28 }}>
            {/* Left: preview, sticky so it stays in view while scrolling the zone list on the right.
                Deliberately NOT `position:sticky` directly on the grid item itself - a
                grid item that's ALSO the sticky element runs into real, hard-to-predict
                containing-block quirks (found live, 2026-09-11: even with the item
                correctly stretched to the row's full height, sticky still silently did
                nothing and just scrolled away with the page). The standard, reliable
                fix: let this outer div be a plain grid item (stretches to the row's
                full height via default align-items), and put the actual `position:
                sticky` on a plain block-level div INSIDE it instead - sidesteps the
                grid-item-as-sticky-element ambiguity entirely. */}
            <div>
              <div style={{ position: 'sticky', top: 24 }}>
                <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 14 }}>
                  <ZoneOverlay zones={zonesWithEdits()} backgroundUrl={result.backgroundUrl} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--dark)' }}>{result.label}</span>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 100,
                    background: result.live ? '#D1FAE5' : '#FEF3C7',
                    color: result.live ? '#065F46' : '#92400E',
                  }}>
                    {result.live ? 'Live' : 'Draft'}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--mid)' }}>
                  {result.zones.length} zone(s): {result.zones.map(z => z.id).join(', ')}
                </div>
              </div>
            </div>

            {/* Right: everything editable + the actions that act on it */}
            <div>
              {result.needsReview?.length > 0 && (
                <div style={{ padding: '10px 12px', background: '#FFF8E1', border: '1px solid #FFD54F', borderRadius: 8, fontSize: 12, color: '#795548', marginBottom: 16 }}>
                  ⚠ These zones had no live text in Figma to read font info from, so they're using a fallback size - double-check them: {result.needsReview.join(', ')}
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 2 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--dark)' }}>Zone settings</div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button type="button" style={linkButtonStyle} onClick={() => setExpandedZoneIds(new Set(zonesWithEdits().map(z => z.id)))}>Expand all</button>
                  <button type="button" style={linkButtonStyle} onClick={() => setExpandedZoneIds(new Set())}>Collapse all</button>
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--mid)', marginBottom: 10 }}>
                Position (X/Y) and size (W/H) are in canvas units, {CANVAS_W}×{CANVAS_H} - matches the boxes drawn on the preview. Click a zone to open it.
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                {zonesWithEdits().map(z => (
                  <ZoneCard
                    key={z.id}
                    z={z}
                    expanded={expandedZoneIds.has(z.id)}
                    onToggle={() => toggleZoneExpanded(z.id)}
                    needsReview={!!result.needsReview?.includes(z.id)}
                    onChange={patch => updateZoneEdit(z.id, patch)}
                  />
                ))}
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={handleSaveZones}
                  disabled={savingZones || Object.keys(zoneEdits).length === 0}
                  style={{
                    padding: '10px 16px', fontSize: 13, fontWeight: 700, borderRadius: 8, border: 'none',
                    background: savingZones || Object.keys(zoneEdits).length === 0 ? '#E5E7EB' : 'var(--dark)',
                    color: savingZones || Object.keys(zoneEdits).length === 0 ? 'var(--mid)' : '#fff',
                    cursor: savingZones || Object.keys(zoneEdits).length === 0 ? 'not-allowed' : 'pointer',
                  }}
                >
                  {savingZones ? 'Saving…' : zonesSaved ? 'Saved ✓' : 'Save zone settings'}
                </button>

                {!result.live && (
                  <button
                    onClick={handlePublish}
                    disabled={publishing}
                    style={{ padding: '10px 18px', fontSize: 13, fontWeight: 700, borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', cursor: publishing ? 'not-allowed' : 'pointer' }}
                  >
                    {publishing ? 'Publishing…' : 'Publish - make this live'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
