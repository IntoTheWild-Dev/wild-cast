import { useState, useEffect, useRef } from 'react'
import { activationHeaders } from '../lib/activationKey'
import { PAGE_PADDING_X, stickyPageBar } from '../lib/layout'
import useIsMobile from '../lib/useIsMobile'
import PageSpinner from './PageSpinner'
import FloatingNav from './FloatingNav'

// Print colours (agency only, 2026-10-23). The brand's swatch table, like
// InDesign's Swatches panel: a screen colour (HEX/RGB) and the exact CMYK the
// print PDF uses for it. Fields are linked through PSO Coated v3 (the export's
// press profile): type in any one and the others fill in. A locked side is
// never overwritten by a conversion, so official pairs that aren't a
// conversion of each other (Wolt Blue #00C2E8 = 75/0/10/0) can be kept.
// Backed by api/brand-colors.js; the export reads the saved table.

const BRAND = 'wolt'
const CH = ['c', 'm', 'y', 'k']

const hexToRgb = hex => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}
const rgbToHex = ({ r, g, b }) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, '0')).join('').toUpperCase()

async function api(body) {
  const res = await fetch('/api/brand-colors', {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...activationHeaders() },
    body: body ? JSON.stringify({ brand: BRAND, ...body }) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}

const toRow = (c, i) => ({
  id: `${c.hex}-${i}-${Math.random()}`,
  label: c.label, hex: c.hex, hexDraft: c.hex, rgb: hexToRgb(c.hex), cmyk: { ...c.cmyk },
  lockHex: c.lockHex !== false, lockCmyk: c.lockCmyk !== false, preview: null,
})

const inputStyle = { fontSize: 13, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: '#fff', color: 'var(--dark)', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }
const labelStyle = { fontSize: 10, fontWeight: 700, color: 'var(--mid)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }
const btn = (primary, disabled) => ({
  fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 8, cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit',
  border: primary ? 'none' : '1px solid var(--border)', background: primary ? 'var(--primary)' : '#fff', color: primary ? '#fff' : 'var(--dark)', opacity: disabled ? 0.5 : 1,
})

function Lock({ on, onToggle, what }) {
  return (
    <button type="button" onClick={onToggle} aria-pressed={on}
      title={on ? `${what} is locked: conversions won't change it. Click to unlock.` : `${what} follows the other values. Click to lock.`}
      style={{ border: '1px solid var(--border)', background: on ? 'var(--dark)' : '#fff', color: on ? '#fff' : 'var(--mid)', borderRadius: 6, fontSize: 11, fontWeight: 700, padding: '3px 8px', cursor: 'pointer', fontFamily: 'inherit' }}>
      {on ? 'Locked' : 'Linked'}
    </button>
  )
}

function NumberField({ value, max, onChange, label }) {
  return (
    <input type="number" min={0} max={max} value={value} aria-label={label}
      onChange={e => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
      style={{ ...inputStyle, padding: '6px 4px', textAlign: 'center' }} />
  )
}

export default function PrintColorsPage({ onBack, onHome }) {
  const isMobile = useIsMobile()
  const [rows, setRows] = useState([])
  const [defaults, setDefaults] = useState([])
  const [meta, setMeta] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const timers = useRef({})
  const rowsRef = useRef(rows)
  rowsRef.current = rows

  useEffect(() => {
    api().then(d => {
      setRows(d.colors.map(toRow)); setDefaults(d.defaults); setMeta(d)
    }).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [])

  // Screen preview of what the CMYK prints like, for every row on load.
  useEffect(() => {
    rows.forEach(r => { if (!r.preview) refreshPreview(r.id, r.cmyk) })
  }, [rows.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (id, fn) => setRows(prev => prev.map(r => (r.id === id ? { ...r, ...fn(r) } : r)))

  function refreshPreview(id, cmyk) {
    api({ action: 'convert', cmyk }).then(out => patch(id, () => ({ preview: out.hex }))).catch(() => {})
  }

  // Debounced conversion after the user types; applies only to unlocked sides.
  function linkFrom(id, source, value) {
    clearTimeout(timers.current[id])
    timers.current[id] = setTimeout(async () => {
      try {
        const out = await api({ action: 'convert', [source]: value })
        if (source === 'cmyk') {
          patch(id, r => (r.lockHex ? { preview: out.hex } : { hex: out.hex, hexDraft: out.hex, rgb: out.rgb, preview: out.hex }))
        } else {
          // The print preview only changes if the CMYK followed the new screen colour.
          patch(id, r => (r.lockCmyk ? {} : { cmyk: out.cmyk }))
          const row = rowsRef.current.find(x => x.id === id)
          if (row && !row.lockCmyk) refreshPreview(id, out.cmyk)
        }
      } catch (e) { setError(e.message) }
    }, 300)
  }

  function editHex(id, text) {
    setDirty(true); setNotice('')
    const rgb = hexToRgb(text)
    patch(id, () => (rgb ? { hexDraft: text, hex: rgbToHex(rgb), rgb } : { hexDraft: text }))
    if (rgb) linkFrom(id, 'hex', rgbToHex(rgb))
  }
  function editRgb(id, ch, v) {
    setDirty(true); setNotice('')
    const row = rows.find(r => r.id === id)
    const rgb = { ...row.rgb, [ch]: Math.max(0, Math.min(255, v | 0)) }
    const hex = rgbToHex(rgb)
    patch(id, () => ({ rgb, hex, hexDraft: hex }))
    linkFrom(id, 'rgb', rgb)
  }
  function editCmyk(id, ch, v) {
    setDirty(true); setNotice('')
    const row = rows.find(r => r.id === id)
    const cmyk = { ...row.cmyk, [ch]: Math.max(0, Math.min(100, v)) }
    patch(id, () => ({ cmyk }))
    linkFrom(id, 'cmyk', cmyk)
  }

  function addColor() {
    setDirty(true)
    const r = toRow({ label: 'New colour', hex: '#808080', cmyk: { c: 0, m: 0, y: 0, k: 50 }, lockHex: false, lockCmyk: false }, rows.length)
    setRows(prev => [...prev, r])
    linkFrom(r.id, 'hex', r.hex)
  }

  async function save() {
    setSaving(true); setError(''); setNotice('')
    try {
      const bad = rows.find(r => !hexToRgb(r.hexDraft))
      if (bad) throw new Error(`"${bad.label}": HEX must look like #00C2E8`)
      const saved = await api({ action: 'save', colors: rows.map(r => ({ label: r.label, hex: r.hex, cmyk: r.cmyk, lockHex: r.lockHex, lockCmyk: r.lockCmyk })) })
      setMeta(m => ({ ...m, updatedAt: saved.updatedAt, updatedBy: saved.updatedBy }))
      setDirty(false); setNotice('Saved. The next print export uses these colours.')
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  function resetToDefaults() {
    setRows(defaults.map(toRow)); setDirty(true); setNotice('Reset to the built-in colours. Click Save to apply.')
  }

  if (loading) return <PageSpinner />

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <div style={{ borderBottom: '1px solid var(--border)', padding: `20px ${PAGE_PADDING_X}`, background: '#fff', ...stickyPageBar(isMobile) }}>
        <h1 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 700, color: 'var(--dark)' }}>Print colours</h1>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--mid)', maxWidth: 720, lineHeight: 1.5 }}>
          When a design uses one of these screen colours exactly, the print PDF uses the CMYK you set here, like an InDesign swatch.
          Type in any field and the others fill in through PSO Coated v3. <b>Locked</b> values are never changed by a conversion.
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" style={btn(true, saving || !dirty)} disabled={saving || !dirty} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
          <button type="button" style={btn(false)} onClick={addColor}>Add colour</button>
          <button type="button" style={btn(false)} onClick={resetToDefaults}>Reset to built-in</button>
          <span style={{ fontSize: 12, color: dirty ? '#B45309' : 'var(--mid)' }}>
            {dirty ? 'Unsaved changes' : meta?.updatedAt ? `Last saved ${new Date(meta.updatedAt).toLocaleString()}${meta.updatedBy ? ` by ${meta.updatedBy}` : ''}` : 'Using the built-in colours'}
          </span>
        </div>
        {error && <p role="alert" style={{ margin: '10px 0 0', fontSize: 13, color: '#B91C1C' }}>{error}</p>}
        {notice && <p style={{ margin: '10px 0 0', fontSize: 13, color: '#15803D' }}>{notice}</p>}
      </div>

      <div style={{ padding: `20px ${PAGE_PADDING_X} 80px`, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {rows.length === 0 && <p style={{ fontSize: 13, color: 'var(--mid)' }}>No print colours. Exports convert every colour through the press profile.</p>}
        {rows.map(r => (
          <div key={r.id} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div title="Left: screen colour. Right: how the CMYK prints (simulated)." style={{ display: 'flex', width: 72, height: 72, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{ flex: 1, background: r.hex }} />
              <div style={{ flex: 1, background: r.preview || r.hex }} />
            </div>

            <div style={{ flex: '1 1 160px', minWidth: 140 }}>
              <div style={labelStyle}>Name</div>
              <input value={r.label} onChange={e => { setDirty(true); const label = e.target.value; patch(r.id, () => ({ label })) }} style={inputStyle} />
            </div>

            <div style={{ flex: '1 1 260px', minWidth: 220 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ ...labelStyle, marginBottom: 0 }}>Screen · HEX / RGB</span>
                <Lock on={r.lockHex} what="The screen colour" onToggle={() => { setDirty(true); patch(r.id, x => ({ lockHex: !x.lockHex })) }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 1fr', gap: 6 }}>
                <input value={r.hexDraft} onChange={e => editHex(r.id, e.target.value)} aria-label="HEX"
                  style={{ ...inputStyle, borderColor: hexToRgb(r.hexDraft) ? 'var(--border)' : '#FCA5A5', fontFamily: 'ui-monospace, monospace' }} />
                {['r', 'g', 'b'].map(ch => <NumberField key={ch} label={ch.toUpperCase()} max={255} value={r.rgb?.[ch] ?? 0} onChange={v => editRgb(r.id, ch, v)} />)}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 1fr', gap: 6, fontSize: 10, color: 'var(--mid)', textAlign: 'center', marginTop: 2 }}>
                <span>HEX</span><span>R</span><span>G</span><span>B</span>
              </div>
            </div>

            <div style={{ flex: '1 1 240px', minWidth: 200 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ ...labelStyle, marginBottom: 0 }}>Print · CMYK %</span>
                <Lock on={r.lockCmyk} what="The print CMYK" onToggle={() => { setDirty(true); patch(r.id, x => ({ lockCmyk: !x.lockCmyk })) }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                {CH.map(ch => <NumberField key={ch} label={ch.toUpperCase()} max={100} value={r.cmyk[ch]} onChange={v => editCmyk(r.id, ch, v)} />)}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, fontSize: 10, color: 'var(--mid)', textAlign: 'center', marginTop: 2 }}>
                {CH.map(ch => <span key={ch}>{ch.toUpperCase()}</span>)}
              </div>
            </div>

            <button type="button" onClick={() => { setDirty(true); setRows(prev => prev.filter(x => x.id !== r.id)) }} title="Remove this colour"
              style={{ ...btn(false), padding: '6px 10px', alignSelf: 'center', color: '#B91C1C' }}>Remove</button>
          </div>
        ))}
      </div>
      <FloatingNav onBack={onBack} onHome={onHome} />
    </div>
  )
}
