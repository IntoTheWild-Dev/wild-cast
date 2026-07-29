import { useState, useEffect } from 'react'
import { BASE_TEMPLATES } from './TemplatePicker'
import { templateAssetSrc } from '../lib/customTemplates'

function slugify(label) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Figma tokens expire every few months — this used to mean a Vercel env var
// edit + redeploy each time. Now stored in Blob and updatable right here.
function FigmaTokenSettings() {
  const [tokenStatus, setTokenStatus] = useState(null) // { configured, source, updatedAt }
  const [editing, setEditing] = useState(false)
  const [draftToken, setDraftToken] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  async function refresh() {
    try {
      const res = await fetch('/api/import-figma-template')
      setTokenStatus(await res.json())
    } catch {
      setTokenStatus(null)
    }
  }

  useEffect(() => { refresh() }, [])

  async function handleSave(e) {
    e.preventDefault()
    if (!draftToken.trim()) return
    setSaving(true)
    setSaveError('')
    try {
      const res = await fetch('/api/import-figma-template', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: draftToken.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not save token')
      setDraftToken('')
      setEditing(false)
      await refresh()
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', marginBottom: 28, background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--dark)' }}>Figma access token</div>
          <div style={{ fontSize: 12, color: 'var(--mid)', marginTop: 2 }}>
            {tokenStatus == null
              ? 'Checking…'
              : tokenStatus.configured
                ? `✓ Configured${tokenStatus.updatedAt ? ` — updated ${formatDate(tokenStatus.updatedAt)}` : ' (from server env var)'}`
                : '⚠ Not configured — imports will fail until one is set'}
          </div>
        </div>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            style={{ padding: '7px 14px', fontSize: 12, fontWeight: 600, borderRadius: 7, border: '1px solid var(--border)', background: '#fff', color: 'var(--dark)', cursor: 'pointer' }}
          >
            {tokenStatus?.configured ? 'Update token' : 'Set token'}
          </button>
        )}
      </div>

      {editing && (
        <form onSubmit={handleSave} style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <input
            type="password"
            value={draftToken}
            onChange={e => setDraftToken(e.target.value)}
            placeholder="figd_… (Figma → Settings → Personal access tokens)"
            autoFocus
            style={{ flex: 1, padding: '9px 12px', fontSize: 13, fontFamily: 'inherit', border: '1.5px solid var(--border)', borderRadius: 8, outline: 'none' }}
          />
          <button
            type="submit"
            disabled={saving || !draftToken.trim()}
            style={{ padding: '9px 16px', fontSize: 12, fontWeight: 700, borderRadius: 8, border: 'none', background: saving || !draftToken.trim() ? '#E5E7EB' : 'var(--primary)', color: saving || !draftToken.trim() ? 'var(--mid)' : '#fff', cursor: saving || !draftToken.trim() ? 'not-allowed' : 'pointer' }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => { setEditing(false); setDraftToken(''); setSaveError('') }}
            style={{ padding: '9px 12px', fontSize: 12, fontWeight: 600, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--mid)', cursor: 'pointer' }}
          >
            Cancel
          </button>
        </form>
      )}
      {saveError && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#B91C1C' }}>{saveError}</div>
      )}
    </div>
  )
}

export default function TemplateImportPage({ customRecords, onRefetch, onOptimisticPatch }) {
  const [figmaUrl, setFigmaUrl] = useState('')
  const [slotLabel, setSlotLabel] = useState('')
  const [status, setStatus] = useState('idle') // idle | importing | done | error
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [publishing, setPublishing] = useState(false)
  // A separate, explicit pop-up right after import — the inline "Draft"
  // badge below was easy to miss, and it wasn't clear an import is always
  // safe (never live) until you deliberately choose to publish it.
  const [showDraftModal, setShowDraftModal] = useState(false)
  const [actionSlot, setActionSlot] = useState(null)
  const [actionError, setActionError] = useState('')
  // Per-zone overrides staged in the "Zone settings" review panel below,
  // keyed by zone id — lets a designer correct font size/rotation right here
  // instead of pixel-hunting via screenshots and waiting on a code change.
  // Figma's own point size is what's extracted (see api/_lib/figma-import.js),
  // but a zone with no live text to sample from still needs a human's call.
  const [zoneEdits, setZoneEdits] = useState({})
  const [savingZones, setSavingZones] = useState(false)
  const [zonesSaved, setZonesSaved] = useState(false)

  // Every "coming soon" slot is a valid import target — Option A/B are hardcoded
  // and never show up here, so an import can never clobber a real live template.
  // A custom slot that's already LIVE is excluded too (BASE_TEMPLATES' own
  // live:false never changes for these, so this can't be read off it alone) —
  // draft and archived custom slots stay valid targets, so re-importing over
  // an unpublished or archived draft is still allowed.
  const liveSlotKeys = new Set((customRecords ?? []).filter(r => r.live).map(r => r.slotKey))
  const emptySlots = BASE_TEMPLATES.filter(t => !t.live && !liveSlotKeys.has(slugify(t.label)))
  const selectedSlot = emptySlots.find(s => s.label === slotLabel)

  // "Previously imported" grouped by category + format (same grouping the
  // Templates catalogue already uses) instead of one long flat list — this
  // was Julia's ask once there were enough imports to make the flat list
  // unwieldy. Sorted alphabetically for a stable, predictable order.
  const recordGroups = Object.entries(
    (customRecords ?? []).reduce((groups, r) => {
      const cap = r.cat ? r.cat.charAt(0).toUpperCase() + r.cat.slice(1) : 'Other'
      const label = r.format ? `${cap} ${r.format}` : cap
      ;(groups[label] ??= []).push(r)
      return groups
    }, {})
  ).sort(([a], [b]) => a.localeCompare(b))

  async function handleImport(e) {
    e.preventDefault()
    if (!selectedSlot || !figmaUrl.trim()) return
    setStatus('importing')
    setError('')
    setResult(null)

    try {
      const slotKey = slugify(selectedSlot.label)
      const res = await fetch('/api/import-figma-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          figmaUrl: figmaUrl.trim(),
          slotKey,
          label: selectedSlot.label,
          cat: selectedSlot.category,
          format: selectedSlot.format,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Import failed')
      setResult(data)
      setZoneEdits({})
      setZonesSaved(false)
      setStatus('done')
      setShowDraftModal(true)
      onOptimisticPatch?.(slotKey, data)
      onRefetch?.()
    } catch (err) {
      setError(err.message)
      setStatus('error')
    }
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
        headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
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

  async function handlePublishFromModal() {
    await handlePublish()
    setShowDraftModal(false)
  }

  // Used by the "Previously imported" list — publish/unpublish/archive/restore
  // any past record, not just the one currently shown in the result panel above.
  async function handleRecordAction(record, action) {
    // An override record (Option A/B) has no `.live` field of its own — it's
    // "live" to partners whenever it isn't archived, since the underlying
    // template is always hardcoded-visible unless this flag hides it.
    const isVisibleToPartners = record.isOverrideOnly ? !record.archived : record.live
    if (action === 'archive' && isVisibleToPartners) {
      const ok = window.confirm(
        `"${record.label}" is currently live — partners can see it. Archive it anyway? It disappears from the catalogue immediately; you can restore it as a draft later.`
      )
      if (!ok) return
    }
    setActionSlot(record.slotKey)
    setActionError('')
    try {
      const res = await fetch('/api/publish-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotKey: record.slotKey, action }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Action failed')
      // Apply the response immediately — Vercel Blob's list()-based reads
      // (which is what customRecords/onRefetch ultimately come from) can lag
      // behind a write by up to ~30s, which made a working action look like
      // it needed several clicks before this.
      onOptimisticPatch?.(record.slotKey, { live: data.live, archived: data.archived, isOverrideOnly: data.isOverrideOnly, label: record.label })
      onRefetch?.()
    } catch (err) {
      setActionError(err.message)
    } finally {
      setActionSlot(null)
    }
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)' }}>
      {showDraftModal && result && (
        <div
          onClick={() => setShowDraftModal(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 24, width: 420, maxWidth: '100%' }}>
            <div style={{ fontSize: 20, marginBottom: 8 }}>📝</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--dark)', marginBottom: 6 }}>Saved as a draft</div>
            <div style={{ fontSize: 13, color: 'var(--mid)', lineHeight: 1.5, marginBottom: 20 }}>
              "{result.label}" is imported but <strong>not visible to partners yet</strong> — only you can see it here, on this page. Review the background and zones below whenever you like, then publish when you're happy with it.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setShowDraftModal(false)}
                style={{ flex: 1, padding: '11px', fontSize: 13, fontWeight: 600, borderRadius: 8, border: '1.5px solid var(--border)', background: '#fff', color: 'var(--dark)', cursor: 'pointer' }}
              >
                Keep as draft — review first
              </button>
              <button
                onClick={handlePublishFromModal}
                disabled={publishing}
                style={{ flex: 1, padding: '11px', fontSize: 13, fontWeight: 700, borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', cursor: publishing ? 'default' : 'pointer' }}
              >
                {publishing ? 'Publishing…' : 'Publish now'}
              </button>
            </div>
          </div>
        </div>
      )}
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 32px 64px' }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--dark)', marginBottom: 4 }}>
          Import from Figma
        </h1>
        <p style={{ fontSize: 13, color: 'var(--mid)', marginBottom: 28 }}>
          Designer-only. Pulls zone geometry + a real bleed background from a Figma master (named <code>zone:&lt;id&gt;</code> boxes) into an empty catalogue slot. Lands as a draft — publish it yourself once you've checked it over.
        </p>

        <FigmaTokenSettings />

        <form onSubmit={handleImport} style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 32 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--dark)', marginBottom: 6 }}>Figma frame URL</label>
            <input
              type="text"
              value={figmaUrl}
              onChange={e => setFigmaUrl(e.target.value)}
              placeholder="https://www.figma.com/design/.../?node-id=..."
              style={{ width: '100%', padding: '10px 12px', fontSize: 13, fontFamily: 'inherit', border: '1.5px solid var(--border)', borderRadius: 8, outline: 'none' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--dark)', marginBottom: 6 }}>Target slot (must be empty)</label>
            <select
              value={slotLabel}
              onChange={e => setSlotLabel(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', fontSize: 13, fontFamily: 'inherit', border: '1.5px solid var(--border)', borderRadius: 8, outline: 'none', background: '#fff' }}
            >
              <option value="">Select a slot…</option>
              {emptySlots.map(s => (
                <option key={s.label} value={s.label}>{s.label}</option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={status === 'importing' || !selectedSlot || !figmaUrl.trim()}
            style={{
              padding: '11px', fontSize: 13, fontWeight: 700, borderRadius: 8, border: 'none',
              background: status === 'importing' || !selectedSlot || !figmaUrl.trim() ? '#E5E7EB' : 'var(--primary)',
              color: status === 'importing' || !selectedSlot || !figmaUrl.trim() ? 'var(--mid)' : '#fff',
              cursor: status === 'importing' || !selectedSlot || !figmaUrl.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {status === 'importing' ? 'Importing…' : 'Import'}
          </button>
        </form>

        {error && (
          <div style={{ padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, fontSize: 13, color: '#B91C1C', marginBottom: 24 }}>
            {error}
          </div>
        )}

        {result && (
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <img src={templateAssetSrc(result.backgroundUrl)} alt="" style={{ width: '100%', display: 'block', background: '#F3F4F6' }} />
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
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--dark)', marginBottom: 8 }}>Zone settings</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {zonesWithEdits().filter(z => z.type === 'text').map(z => (
                    <div key={z.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--dark)', flex: 1 }}>{z.id}</span>
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

        {customRecords?.length > 0 && (
          <div style={{ marginTop: 40 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--dark)', marginBottom: 12 }}>Previously imported</h2>
            {actionError && (
              <div style={{ padding: '8px 12px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, fontSize: 12, color: '#B91C1C', marginBottom: 10 }}>
                {actionError}
              </div>
            )}
            {recordGroups.map(([groupLabel, records]) => (
              <details key={groupLabel} open style={{ marginBottom: 10 }}>
                <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--dark)', padding: '8px 4px', listStyle: 'none' }}>
                  {groupLabel} <span style={{ fontWeight: 500, color: 'var(--mid)' }}>({records.length})</span>
                </summary>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
                  {records.map(r => {
                // Override records (see api/publish-template.js) exist only for
                // Option A/B — hardcoded static templates with no real draft/
                // live data of their own, just an archived on/off switch.
                const status = r.archived ? 'Archived' : r.isOverrideOnly ? 'Built-in' : r.live ? 'Live' : 'Draft'
                const statusStyle = r.archived
                  ? { background: '#F3F4F6', color: 'var(--mid)' }
                  : (r.isOverrideOnly || r.live)
                    ? { background: '#D1FAE5', color: '#065F46' }
                    : { background: '#FEF3C7', color: '#92400E' }
                const busy = actionSlot === r.slotKey
                const btnStyle = {
                  padding: '6px 11px', fontSize: 11, fontWeight: 700, borderRadius: 7,
                  border: '1px solid var(--border)', background: '#fff', color: 'var(--dark)',
                  cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1, whiteSpace: 'nowrap',
                }
                return (
                  <div key={r.slotKey} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, opacity: r.archived ? 0.65 : 1 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--dark)', flex: 1 }}>{r.label}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 100, ...statusStyle }}>
                      {status}
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {r.archived ? (
                        <button disabled={busy} onClick={() => handleRecordAction(r, 'restore')} style={btnStyle}>
                          {busy ? '…' : 'Restore'}
                        </button>
                      ) : r.isOverrideOnly ? (
                        <button disabled={busy} onClick={() => handleRecordAction(r, 'archive')} style={btnStyle}>
                          {busy ? '…' : 'Archive'}
                        </button>
                      ) : r.live ? (
                        <>
                          <button disabled={busy} onClick={() => handleRecordAction(r, 'unpublish')} style={btnStyle}>
                            {busy ? '…' : 'Unpublish'}
                          </button>
                          <button disabled={busy} onClick={() => handleRecordAction(r, 'archive')} style={btnStyle}>
                            {busy ? '…' : 'Archive'}
                          </button>
                        </>
                      ) : (
                        <>
                          <button disabled={busy} onClick={() => handleRecordAction(r, 'publish')} style={{ ...btnStyle, border: 'none', background: 'var(--primary)', color: '#fff' }}>
                            {busy ? '…' : 'Publish'}
                          </button>
                          <button disabled={busy} onClick={() => handleRecordAction(r, 'archive')} style={btnStyle}>
                            {busy ? '…' : 'Archive'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )
                  })}
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
