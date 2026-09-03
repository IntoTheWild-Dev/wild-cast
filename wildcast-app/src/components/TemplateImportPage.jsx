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

// One zone's editable fields. Redesigned 2026-08-13 (Julia: "very cramped,
// hard to see") - was a single flex-wrap row cramming X/Y/W/H/Size/Rotate
// together with 48-52px-wide inputs that clipped their own decimal values
// (e.g. "44.1" rendering as "44,"). Now a proper labeled grid with room for
// full values, and a colored dot matching the zone's outline color on the
// preview so a zone here is easy to match back to its box up there.
function ZoneCard({ z, onChange }) {
  const numberInputStyle = {
    width: '100%', padding: '8px 10px', fontSize: 13, fontFamily: 'inherit',
    border: '1.5px solid var(--border)', borderRadius: 7, outline: 'none', boxSizing: 'border-box',
  }
  const fieldLabelStyle = { display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--mid)', marginBottom: 4 }

  return (
    <div style={{ padding: 14, border: '1px solid var(--border)', borderRadius: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: zoneColor(z), flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--dark)' }}>{z.id}</span>
        <span style={{ fontSize: 11, color: 'var(--light)' }}>{z.type === 'image' ? 'image' : 'text'}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {['x', 'y', 'width', 'height'].map(dim => (
          <label key={dim}>
            <span style={fieldLabelStyle}>{dim === 'width' ? 'W' : dim === 'height' ? 'H' : dim.toUpperCase()}</span>
            <input
              type="number"
              value={z[dim] ?? ''}
              onChange={e => onChange({ [dim]: e.target.value === '' ? 0 : Number(e.target.value) })}
              style={numberInputStyle}
            />
          </label>
        ))}
      </div>

      {z.type === 'text' && (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          <label style={{ width: 90 }}>
            <span style={fieldLabelStyle}>Font size</span>
            <input
              type="number"
              value={z.fontSize ?? ''}
              onChange={e => onChange({ fontSize: e.target.value === '' ? null : Number(e.target.value) })}
              style={numberInputStyle}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--dark)', cursor: 'pointer', paddingBottom: 8 }}>
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

  // Records worth reviewing here - real Figma imports (drafts or already
  // live) with actual zone geometry, not the synthetic Option A/B override
  // records TemplatePicker.jsx uses just for its archive toggle. Drafts
  // first - those are the ones actually waiting on a decision - then most
  // recent first within each group.
  const reviewable = (customRecords ?? [])
    .filter(r => !r.archived && !r.isOverrideOnly && r.zones)
    .sort((a, b) => (a.live === b.live ? 0 : a.live ? 1 : -1) || (b.createdAt || '').localeCompare(a.createdAt || ''))

  function selectForReview(slotKey) {
    setResult(reviewable.find(r => r.slotKey === slotKey) || null)
    setZoneEdits({})
    setZonesSaved(false)
    setError('')
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

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)' }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 380px) 1fr', gap: 28, alignItems: 'start' }}>
            {/* Left: preview, sticky so it stays in view while scrolling the zone list on the right */}
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

            {/* Right: everything editable + the actions that act on it */}
            <div>
              {result.needsReview?.length > 0 && (
                <div style={{ padding: '10px 12px', background: '#FFF8E1', border: '1px solid #FFD54F', borderRadius: 8, fontSize: 12, color: '#795548', marginBottom: 16 }}>
                  ⚠ These zones had no live text in Figma to read font info from, so they're using a fallback size - double-check them: {result.needsReview.join(', ')}
                </div>
              )}

              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--dark)', marginBottom: 2 }}>Zone settings</div>
              <div style={{ fontSize: 11, color: 'var(--mid)', marginBottom: 10 }}>
                Position (X/Y) and size (W/H) are in canvas units, {CANVAS_W}×{CANVAS_H} - matches the boxes drawn on the preview.
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                {zonesWithEdits().map(z => (
                  <ZoneCard key={z.id} z={z} onChange={patch => updateZoneEdit(z.id, patch)} />
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
