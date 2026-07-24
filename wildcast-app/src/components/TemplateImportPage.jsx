import { useState, useEffect } from 'react'
import { BASE_TEMPLATES } from './TemplatePicker'

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

export default function TemplateImportPage({ customRecords, onRefetch }) {
  const [figmaUrl, setFigmaUrl] = useState('')
  const [slotLabel, setSlotLabel] = useState('')
  const [status, setStatus] = useState('idle') // idle | importing | done | error
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [publishing, setPublishing] = useState(false)

  // Every "coming soon" slot is a valid import target — Option A/B are hardcoded
  // and never show up here, so an import can never clobber a real live template.
  const emptySlots = BASE_TEMPLATES.filter(t => !t.live)
  const selectedSlot = emptySlots.find(s => s.label === slotLabel)

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
      setStatus('done')
      onRefetch?.()
    } catch (err) {
      setError(err.message)
      setStatus('error')
    }
  }

  async function handlePublish() {
    if (!result) return
    setPublishing(true)
    try {
      const res = await fetch('/api/publish-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotKey: result.slotKey, live: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Publish failed')
      setResult(r => ({ ...r, live: true }))
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
            <img src={result.backgroundUrl} alt="" style={{ width: '100%', display: 'block', background: '#F3F4F6' }} />
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
                  ⚠ These zones had no live text to read font info from — double-check fontSize/fontFamily in the editor: {result.needsReview.join(', ')}
                </div>
              )}

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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {customRecords.map(r => (
                <div key={r.slotKey} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--dark)', flex: 1 }}>{r.label}</span>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 100,
                    background: r.live ? '#D1FAE5' : '#FEF3C7',
                    color: r.live ? '#065F46' : '#92400E',
                  }}>
                    {r.live ? 'Live' : 'Draft'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
