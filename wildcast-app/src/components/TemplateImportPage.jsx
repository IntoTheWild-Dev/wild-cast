import { useState } from 'react'
import Select from './Select'
import { templateAssetSrc } from '../lib/customTemplates'
import { activationHeaders } from '../lib/activationKey'

// Matches every live template config's canvasW/canvasH (src/data/templateZones.js)
// and the record api/import-figma-plugin.js builds — no single shared
// constant exists for it anywhere in the app, this just follows the same
// hardcoded-316x441 convention already used everywhere else.
const CANVAS_W = 316
const CANVAS_H = 441

// Draws each zone's actual box on top of the imported background, in the
// same 316x441 coordinate space the geometry itself is already in — lets a
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
            border: `1.5px dashed ${z.type === 'image' ? '#3B82F6' : 'var(--primary)'}`,
            background: z.type === 'image' ? 'rgba(59,130,246,0.12)' : 'rgba(223,111,109,0.12)',
            pointerEvents: 'none',
          }}
        >
          <span style={{
            position: 'absolute', top: -1, left: -1, fontSize: 9, fontWeight: 700, lineHeight: 1,
            padding: '2px 4px', color: '#fff', background: z.type === 'image' ? '#3B82F6' : 'var(--primary)',
          }}>
            {z.id}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function TemplateImportPage({ customRecords, onRefetch, onOptimisticPatch }) {
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [publishing, setPublishing] = useState(false)
  // Per-zone overrides staged in the "Zone settings" review panel below,
  // keyed by zone id — lets a designer correct font size/rotation right here
  // instead of pixel-hunting via screenshots and waiting on a code change.
  // Figma's own point size is what's extracted (see api/_lib/figma-import.js),
  // but a zone with no live text to sample from still needs a human's call.
  const [zoneEdits, setZoneEdits] = useState({})
  const [savingZones, setSavingZones] = useState(false)
  const [zonesSaved, setZonesSaved] = useState(false)

  // Records worth reviewing here — real Figma imports (drafts or already
  // live) with actual zone geometry, not the synthetic Option A/B override
  // records TemplatePicker.jsx uses just for its archive toggle. Drafts
  // first — those are the ones actually waiting on a decision — then most
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

  // Merges staged zoneEdits on top of the import result — what's actually
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
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 32px 64px' }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--dark)', marginBottom: 4 }}>
          Review Figma imports
        </h1>
        <p style={{ fontSize: 13, color: 'var(--mid)', marginBottom: 20 }}>
          Designer-only. Check the zone layout an import pulled from Figma, then publish it to the catalogue.
        </p>

        <div style={{ display: 'flex', gap: 10, padding: '12px 14px', background: 'var(--primary-glow)', border: '1px solid var(--primary)', borderRadius: 10, marginBottom: 28 }}>
          <span style={{ fontSize: 16, lineHeight: 1 }}>🔌</span>
          <div style={{ fontSize: 12.5, color: 'var(--dark)', lineHeight: 1.6 }}>
            <strong>Importing happens in Figma.</strong> Open the master file, select a frame (with <code>zone:&lt;id&gt;</code> layers), and run "WildCast Import" from the Plugins menu. It lands here as a draft — pick it below to review and publish.
          </div>
        </div>

        <div style={{ marginBottom: 32 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--dark)', marginBottom: 6 }}>Import to review</label>
          <Select
            value={result?.slotKey || ''}
            onChange={e => selectForReview(e.target.value)}
            disabled={!reviewable.length}
            style={{ width: '100%', padding: '10px 12px', fontSize: 13, fontFamily: 'inherit', border: '1.5px solid var(--border)', borderRadius: 8, outline: 'none', background: '#fff' }}
          >
            <option value="">{reviewable.length ? 'Select an import…' : 'No imports yet — run the plugin in Figma first'}</option>
            {reviewable.map(r => (
              <option key={r.slotKey} value={r.slotKey}>{r.label} — {r.live ? 'Live' : 'Draft'}</option>
            ))}
          </Select>
        </div>

        {error && (
          <div style={{ padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, fontSize: 13, color: '#B91C1C', marginBottom: 24 }}>
            {error}
          </div>
        )}

        {result && (
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <ZoneOverlay zones={zonesWithEdits()} backgroundUrl={result.backgroundUrl} />
            <div style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--dark)' }}>{result.label}</span>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 100,
                  background: result.live ? '#D1FAE5' : '#FEF3C7',
                  color: result.live ? '#065F46' : '#92400E',
                }}>
                  {result.live ? 'Live' : 'Draft'}
                </span>
              </div>

              <div style={{ fontSize: 12, color: 'var(--mid)', marginBottom: 12 }}>
                {result.zones.length} zone(s): {result.zones.map(z => z.id).join(', ')}
              </div>

              {result.needsReview?.length > 0 && (
                <div style={{ padding: '8px 10px', background: '#FFF8E1', border: '1px solid #FFD54F', borderRadius: 8, fontSize: 11, color: '#795548', marginBottom: 16 }}>
                  ⚠ These zones had no live text to read font info from — double-check fontSize/rotation below: {result.needsReview.join(', ')}
                </div>
              )}

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--dark)', marginBottom: 2 }}>Zone settings</div>
                <div style={{ fontSize: 11, color: 'var(--mid)', marginBottom: 8 }}>
                  Position (X/Y) and size (W/H) are in canvas units, {CANVAS_W}×{CANVAS_H} — matches the boxes drawn on the preview above.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {zonesWithEdits().map(z => (
                    <div key={z.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--dark)', minWidth: 66 }}>{z.id}</span>
                      {['x', 'y', 'width', 'height'].map(dim => (
                        <label key={dim} style={{ fontSize: 11, color: 'var(--mid)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          {dim === 'width' ? 'W' : dim === 'height' ? 'H' : dim.toUpperCase()}
                          <input
                            type="number"
                            value={z[dim] ?? ''}
                            onChange={e => updateZoneEdit(z.id, { [dim]: e.target.value === '' ? 0 : Number(e.target.value) })}
                            style={{ width: 48, padding: '4px 6px', fontSize: 12, fontFamily: 'inherit', border: '1.5px solid var(--border)', borderRadius: 6, outline: 'none' }}
                          />
                        </label>
                      ))}
                      {z.type === 'text' && (
                        <>
                          <label style={{ fontSize: 11, color: 'var(--mid)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            Size
                            <input
                              type="number"
                              value={z.fontSize ?? ''}
                              onChange={e => updateZoneEdit(z.id, { fontSize: e.target.value === '' ? null : Number(e.target.value) })}
                              style={{ width: 52, padding: '4px 6px', fontSize: 12, fontFamily: 'inherit', border: '1.5px solid var(--border)', borderRadius: 6, outline: 'none' }}
                            />
                          </label>
                          <label style={{ fontSize: 11, color: 'var(--mid)', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={z.rotate === -90}
                              onChange={e => updateZoneEdit(z.id, { rotate: e.target.checked ? -90 : undefined, textWidth: e.target.checked ? z.height : undefined })}
                            />
                            Rotate 90°
                          </label>
                        </>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  onClick={handleSaveZones}
                  disabled={savingZones || Object.keys(zoneEdits).length === 0}
                  style={{
                    marginTop: 8, padding: '8px 14px', fontSize: 12, fontWeight: 700, borderRadius: 8, border: 'none',
                    background: savingZones || Object.keys(zoneEdits).length === 0 ? '#E5E7EB' : 'var(--dark)',
                    color: savingZones || Object.keys(zoneEdits).length === 0 ? 'var(--mid)' : '#fff',
                    cursor: savingZones || Object.keys(zoneEdits).length === 0 ? 'not-allowed' : 'pointer',
                  }}
                >
                  {savingZones ? 'Saving…' : zonesSaved ? 'Saved ✓' : 'Save zone settings'}
                </button>
              </div>

              {!result.live && (
                <button
                  onClick={handlePublish}
                  disabled={publishing}
                  style={{ padding: '10px 18px', fontSize: 13, fontWeight: 700, borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', cursor: publishing ? 'not-allowed' : 'pointer' }}
                >
                  {publishing ? 'Publishing…' : 'Publish — make this live'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
