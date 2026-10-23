import { useState, useEffect, useRef } from 'react'
import { PAGE_PADDING_X, stickyPageBar } from '../../lib/layout'
import useIsMobile from '../../lib/useIsMobile'
import PageSpinner from '../../components/PageSpinner'
import FloatingNav from '../../components/FloatingNav'
import { printColorsApi as api, hexToRgb, rgbToHex, fmtCmyk } from './api'

// Print colours module (agency only, removable - see
// api/_lib/printColors/README.md). The brand's swatch table, like InDesign's
// Swatches panel, plus the calibration flow:
//   1. Calibration sheet: print patches around the current value.
//   2. Pick the patch that matches the reference -> its CMYK is filled in.
//   3. Approve once a print confirms it -> copy the code snippet into
//      api/_lib/brandColors.js so it becomes the permanent default.
// Printer presets hold per-printer adjustments and file labelling; the
// brand's default printer is what every export uses.

const CH = ['c', 'm', 'y', 'k']

const toRow = (c, i) => ({
  id: `${c.hex}-${i}-${Math.random()}`,
  label: c.label, hex: c.hex, hexDraft: c.hex, rgb: hexToRgb(c.hex), cmyk: { ...c.cmyk },
  lockHex: c.lockHex !== false, lockCmyk: c.lockCmyk !== false,
  status: c.status === 'approved' ? 'approved' : 'draft', approvedBy: c.approvedBy, approvedAt: c.approvedAt,
  preview: null, patchCode: '',
})

const inputStyle = { fontSize: 13, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: '#fff', color: 'var(--dark)', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }
const labelStyle = { fontSize: 10, fontWeight: 700, color: 'var(--mid)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }
const card = { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }
const h2 = { margin: '8px 0 4px', fontSize: 15, fontWeight: 700, color: 'var(--dark)' }
const hint = { margin: '0 0 10px', fontSize: 12.5, color: 'var(--mid)', lineHeight: 1.5, maxWidth: 760 }
const btn = (primary, disabled) => ({
  fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 8, cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit',
  border: primary ? 'none' : '1px solid var(--border)', background: primary ? 'var(--primary)' : '#fff', color: primary ? '#fff' : 'var(--dark)', opacity: disabled ? 0.5 : 1,
})
const small = { ...btn(false), padding: '5px 10px', fontSize: 12 }

function Lock({ on, onToggle, what }) {
  return (
    <button type="button" onClick={onToggle} aria-pressed={on}
      title={on ? `${what} is locked: conversions won't change it. Click to unlock.` : `${what} follows the other values. Click to lock.`}
      style={{ border: '1px solid var(--border)', background: on ? 'var(--dark)' : '#fff', color: on ? '#fff' : 'var(--mid)', borderRadius: 6, fontSize: 11, fontWeight: 700, padding: '3px 8px', cursor: 'pointer', fontFamily: 'inherit' }}>
      {on ? 'Locked' : 'Linked'}
    </button>
  )
}

function Status({ row }) {
  const ok = row.status === 'approved'
  return (
    <span title={ok ? `Approved${row.approvedBy ? ` by ${row.approvedBy}` : ''}${row.approvedAt ? ` on ${row.approvedAt.slice(0, 10)}` : ''}` : 'Being tested. Approve it once a print confirms it.'}
      style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.04em', borderRadius: 100, padding: '2px 8px', background: ok ? '#DCFCE7' : '#FEF3C7', color: ok ? '#166534' : '#92400E' }}>
      {ok ? 'APPROVED' : 'DRAFT'}
    </span>
  )
}

function NumberField({ value, max, onChange, label }) {
  return (
    <input type="number" min={0} max={max} value={value} aria-label={label}
      onChange={e => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
      style={{ ...inputStyle, padding: '6px 4px', textAlign: 'center' }} />
  )
}

function CmykInputs({ value, onChange }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
      {CH.map(ch => (
        <label key={ch} style={{ fontSize: 10, color: 'var(--mid)', textAlign: 'center' }}>
          <NumberField label={ch.toUpperCase()} max={100} value={value[ch]} onChange={v => onChange({ ...value, [ch]: Math.max(0, Math.min(100, v)) })} />
          {ch.toUpperCase()}
        </label>
      ))}
    </div>
  )
}

export default function PrintColorsPage({ onBack, onHome }) {
  const isMobile = useIsMobile()
  const [rows, setRows] = useState([])
  const [printers, setPrinters] = useState([])
  const [defaultPrinter, setDefaultPrinter] = useState('standard')
  const [server, setServer] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showCode, setShowCode] = useState(false)
  const timers = useRef({})
  const rowsRef = useRef(rows)
  rowsRef.current = rows

  function applyServer(d) {
    setServer(d)
    setRows(d.colors.map(toRow))
    setPrinters(d.printers)
    setDefaultPrinter(d.defaultPrinter)
  }

  useEffect(() => {
    api().then(applyServer).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    rows.forEach(r => { if (!r.preview) refreshPreview(r.id, r.cmyk) })
  }, [rows.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const touch = () => { setDirty(true); setNotice(''); setError('') }
  const patch = (id, fn) => setRows(prev => prev.map(r => (r.id === id ? { ...r, ...fn(r) } : r)))

  function refreshPreview(id, cmyk) {
    api({ action: 'convert', cmyk }).then(out => patch(id, () => ({ preview: out.hex }))).catch(() => {})
  }

  // Any CMYK edit on an approved colour makes it a draft again.
  const cmykChanged = r => (r.status === 'approved' ? { status: 'draft' } : {})

  function linkFrom(id, source, value) {
    clearTimeout(timers.current[id])
    timers.current[id] = setTimeout(async () => {
      try {
        const out = await api({ action: 'convert', [source]: value })
        if (source === 'cmyk') {
          patch(id, r => (r.lockHex ? { preview: out.hex } : { hex: out.hex, hexDraft: out.hex, rgb: out.rgb, preview: out.hex }))
        } else {
          patch(id, r => (r.lockCmyk ? {} : { cmyk: out.cmyk, ...cmykChanged(r) }))
          const row = rowsRef.current.find(x => x.id === id)
          if (row && !row.lockCmyk) refreshPreview(id, out.cmyk)
        }
      } catch (e) { setError(e.message) }
    }, 300)
  }

  function editHex(id, text) {
    touch()
    const rgb = hexToRgb(text)
    patch(id, () => (rgb ? { hexDraft: text, hex: rgbToHex(rgb), rgb } : { hexDraft: text }))
    if (rgb) linkFrom(id, 'hex', rgbToHex(rgb))
  }
  function editRgb(id, ch, v) {
    touch()
    const row = rows.find(r => r.id === id)
    const rgb = { ...row.rgb, [ch]: Math.max(0, Math.min(255, v | 0)) }
    const hex = rgbToHex(rgb)
    patch(id, () => ({ rgb, hex, hexDraft: hex }))
    linkFrom(id, 'rgb', rgb)
  }
  function setCmyk(id, cmyk) {
    touch()
    patch(id, r => ({ cmyk, ...cmykChanged(r) }))
    linkFrom(id, 'cmyk', cmyk)
  }

  async function downloadSheet(r) {
    setError('')
    try {
      const blob = await api({ action: 'sheet', label: r.label, hex: r.hex, cmyk: r.cmyk })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `calibration-${r.label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
      patch(r.id, () => ({ sheetBase: { ...r.cmyk } }))
    } catch (e) { setError(e.message) }
  }

  // The code refers to the sheet that was printed, so use the CMYK the sheet
  // was made from (sheetBase), not whatever the fields show now.
  async function applyPatch(r) {
    setError('')
    try {
      const base = r.sheetBase ?? r.cmyk
      const grid = await api({ action: 'grid', cmyk: base })
      const hit = grid.patches.find(p => p.code === r.patchCode.trim().toUpperCase())
      if (!hit) throw new Error(`"${r.patchCode}" isn't on the sheet. Use a code like C4 (rows A-F, columns 1-5).`)
      setCmyk(r.id, hit.cmyk)
      patch(r.id, () => ({ patchCode: '' }))
      setNotice(`${r.label}: set to patch ${hit.code} (${fmtCmyk(hit.cmyk)}). Save, then approve once a print confirms it.`)
    } catch (e) { setError(e.message) }
  }

  function addColor() {
    touch()
    const r = toRow({ label: 'New colour', hex: '#808080', cmyk: { c: 0, m: 0, y: 0, k: 50 }, lockHex: false, lockCmyk: false }, rows.length)
    setRows(prev => [...prev, r])
    linkFrom(r.id, 'hex', r.hex)
  }

  function addPrinter() {
    touch()
    setPrinters(prev => [...prev, { id: '', name: `Printer ${prev.length + 1}`, label: 'pdfx4', overrides: {} }])
  }
  const editPrinter = (i, fn) => { touch(); setPrinters(prev => prev.map((p, j) => (j === i ? { ...p, ...fn(p) } : p))) }

  async function save() {
    setSaving(true); setError(''); setNotice('')
    try {
      const bad = rows.find(r => !hexToRgb(r.hexDraft))
      if (bad) throw new Error(`"${bad.label}": HEX must look like #00C2E8`)
      const saved = await api({
        action: 'save', defaultPrinter,
        colors: rows.map(r => ({ label: r.label, hex: r.hex, cmyk: r.cmyk, lockHex: r.lockHex, lockCmyk: r.lockCmyk, status: r.status })),
        printers,
      })
      applyServer(saved)
      setDirty(false); setNotice('Saved. The next print export uses these colours and the default printer.')
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  if (loading) return <PageSpinner />

  const approved = rows.filter(r => r.status === 'approved')
  const allPrinters = [server?.standardPrinter ?? { id: 'standard', name: 'Standard' }, ...printers]

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <div style={{ borderBottom: '1px solid var(--border)', padding: `20px ${PAGE_PADDING_X}`, background: '#fff', ...stickyPageBar(isMobile) }}>
        <h1 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 700, color: 'var(--dark)' }}>Print colours</h1>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--mid)', maxWidth: 760, lineHeight: 1.5 }}>
          When a design uses one of these screen colours exactly, the print PDF uses the CMYK set here, like an InDesign swatch. One setting per brand: every template uses it.
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" style={btn(true, saving || !dirty)} disabled={saving || !dirty} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
          <span style={{ fontSize: 12, color: dirty ? '#B45309' : 'var(--mid)' }}>
            {dirty ? 'Unsaved changes' : server?.updatedAt ? `Last saved ${new Date(server.updatedAt).toLocaleString()}${server.updatedBy ? ` by ${server.updatedBy}` : ''}` : 'Using the built-in colours'}
          </span>
        </div>
        {error && <p role="alert" style={{ margin: '10px 0 0', fontSize: 13, color: '#B91C1C' }}>{error}</p>}
        {notice && <p style={{ margin: '10px 0 0', fontSize: 13, color: '#15803D' }}>{notice}</p>}
      </div>

      <div style={{ padding: `20px ${PAGE_PADDING_X} 96px`, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* ── How it works ─────────────────────────────────────────────── */}
        <div style={{ ...card, background: '#F8FAFC' }}>
          <div style={{ ...labelStyle, marginBottom: 6 }}>How to get a colour right (once per brand)</div>
          <ol style={{ margin: 0, paddingLeft: 20, listStyle: 'decimal', fontSize: 13, color: 'var(--dark)', lineHeight: 1.7 }}>
            <li><b>Calibration sheet:</b> download it for the colour and print it on the printer you're tuning for.</li>
            <li><b>Pick the patch</b> that matches the reference (InDesign print or brand book) and type its code, e.g. C4. Judge the print, not the screen.</li>
            <li><b>Save.</b> The colour is a <i>draft</i> and the next export already uses it. Print a real flyer to check.</li>
            <li><b>Approve</b> once the print is right, then send the code snippet to a developer so it becomes the permanent default.</li>
          </ol>
        </div>

        {/* ── Brand colours ────────────────────────────────────────────── */}
        <h2 style={h2}>Brand colours</h2>
        <p style={hint}>Type in any field and the others fill in through PSO Coated v3. <b>Locked</b> values are never changed by a conversion. Left half of the swatch: screen colour. Right half: how the CMYK prints (simulated).</p>
        {rows.map(r => (
          <div key={r.id} style={{ ...card, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', width: 72, height: 72, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', flexShrink: 0 }}>
                <div style={{ flex: 1, background: r.hex }} />
                <div style={{ flex: 1, background: r.preview || r.hex }} />
              </div>
              <div style={{ flex: '1 1 160px', minWidth: 140 }}>
                <div style={{ ...labelStyle, display: 'flex', gap: 8, alignItems: 'center' }}>Name <Status row={r} /></div>
                <input value={r.label} onChange={e => { touch(); const label = e.target.value; patch(r.id, () => ({ label })) }} style={inputStyle} />
              </div>
              <div style={{ flex: '1 1 260px', minWidth: 220 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ ...labelStyle, marginBottom: 0 }}>Screen · HEX / RGB</span>
                  <Lock on={r.lockHex} what="The screen colour" onToggle={() => { touch(); patch(r.id, x => ({ lockHex: !x.lockHex })) }} />
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
                  <Lock on={r.lockCmyk} what="The print CMYK" onToggle={() => { touch(); patch(r.id, x => ({ lockCmyk: !x.lockCmyk })) }} />
                </div>
                <CmykInputs value={r.cmyk} onChange={cmyk => setCmyk(r.id, cmyk)} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <button type="button" style={small} onClick={() => downloadSheet(r)}>1 · Calibration sheet</button>
              <input value={r.patchCode} placeholder="Patch, e.g. C4" aria-label="Patch code"
                onChange={e => { const patchCode = e.target.value; patch(r.id, () => ({ patchCode })) }}
                onKeyDown={e => { if (e.key === 'Enter' && r.patchCode.trim()) applyPatch(r) }}
                style={{ ...inputStyle, width: 120 }} />
              <button type="button" style={{ ...small, opacity: r.patchCode.trim() ? 1 : 0.5 }} disabled={!r.patchCode.trim()} onClick={() => applyPatch(r)}>2 · Use patch</button>
              {r.status === 'approved'
                ? <button type="button" style={small} onClick={() => { touch(); patch(r.id, () => ({ status: 'draft' })) }}>Back to draft</button>
                : <button type="button" style={{ ...small, borderColor: '#16A34A', color: '#166534' }} onClick={() => { touch(); patch(r.id, () => ({ status: 'approved' })) }}>4 · Approve</button>}
              <span style={{ flex: 1 }} />
              <button type="button" onClick={() => { touch(); setRows(prev => prev.filter(x => x.id !== r.id)) }} style={{ ...small, color: '#B91C1C' }}>Remove</button>
            </div>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" style={btn(false)} onClick={addColor}>Add colour</button>
          <button type="button" style={btn(false)} onClick={() => { touch(); setRows((server?.defaults ?? []).map(toRow)); setNotice('Reset to the built-in colours. Click Save to apply.') }}>Reset to built-in</button>
        </div>

        {/* ── Printers ─────────────────────────────────────────────────── */}
        <h2 style={{ ...h2, marginTop: 20 }}>Printers</h2>
        <p style={hint}>
          <b>Standard</b> uses the brand colours above and a normal PDF/X-4 file. That's right for any properly calibrated printer. Add a printer only if one shop
          needs different values or InDesign-style file labelling. The <b>default printer</b> is what every export uses.
        </p>
        <div style={{ ...card, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ ...labelStyle, marginBottom: 0 }}>Default printer</span>
          <select value={defaultPrinter} onChange={e => { touch(); setDefaultPrinter(e.target.value) }} style={{ ...inputStyle, width: 'auto', minWidth: 260 }}>
            {allPrinters.map(p => <option key={p.id || p.name} value={p.id || p.name}>{p.name}</option>)}
          </select>
          {printers.some(p => !p.id) && <span style={{ fontSize: 12, color: 'var(--mid)' }}>Save first to pick a new printer.</span>}
        </div>
        {printers.map((p, i) => (
          <div key={i} style={{ ...card, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: '1 1 220px' }}>
                <div style={labelStyle}>Printer name</div>
                <input value={p.name} onChange={e => { const name = e.target.value; editPrinter(i, () => ({ name })) }} style={inputStyle} />
              </div>
              <div style={{ flex: '1 1 260px' }}>
                <div style={labelStyle}>File labelling</div>
                <select value={p.label} onChange={e => { const label = e.target.value; editPrinter(i, () => ({ label })) }} style={inputStyle}>
                  <option value="pdfx4">Standard PDF/X-4</option>
                  <option value="indesign">Like InDesign (not marked PDF/X, same colours)</option>
                </select>
              </div>
              <button type="button" style={{ ...small, color: '#B91C1C' }} onClick={() => { touch(); setPrinters(prev => prev.filter((_, j) => j !== i)); if (defaultPrinter === p.id) setDefaultPrinter('standard') }}>Remove printer</button>
            </div>
            <div style={labelStyle}>Colour adjustments for this printer (optional)</div>
            {rows.map(r => {
              const o = p.overrides?.[r.hex]
              return (
                <div key={r.id} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ width: 14, height: 14, borderRadius: 3, background: r.hex, border: '1px solid var(--border)' }} />
                  <span style={{ fontSize: 13, minWidth: 140 }}>{r.label} <span style={{ color: 'var(--mid)' }}>(brand {fmtCmyk(r.cmyk)})</span></span>
                  {o ? (
                    <>
                      <div style={{ width: 240 }}><CmykInputs value={o} onChange={v => editPrinter(i, x => ({ overrides: { ...x.overrides, [r.hex]: v } }))} /></div>
                      <button type="button" style={small} onClick={() => editPrinter(i, x => { const next = { ...x.overrides }; delete next[r.hex]; return { overrides: next } })}>Use brand value</button>
                    </>
                  ) : (
                    <button type="button" style={small} onClick={() => editPrinter(i, x => ({ overrides: { ...x.overrides, [r.hex]: { ...r.cmyk } } }))}>Adjust for this printer</button>
                  )}
                </div>
              )
            })}
          </div>
        ))}
        <div><button type="button" style={btn(false)} onClick={addPrinter}>Add printer</button></div>

        {/* ── Approved -> code ─────────────────────────────────────────── */}
        <h2 style={{ ...h2, marginTop: 20 }}>Make approved colours permanent</h2>
        <p style={hint}>Approved colours already apply to every export. To make them the permanent built-in default (reviewed, kept even if this setting is removed), a developer pastes this into <code>api/_lib/brandColors.js</code>.</p>
        <div style={card}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13 }}>{approved.length} approved colour{approved.length === 1 ? '' : 's'}{dirty ? ' (save first to update the snippet)' : ''}</span>
            <button type="button" style={small} onClick={() => setShowCode(s => !s)}>{showCode ? 'Hide code' : 'Show code'}</button>
            {showCode && <button type="button" style={small} onClick={() => navigator.clipboard?.writeText(server?.snippet || '').then(() => setNotice('Code copied.'))}>Copy</button>}
          </div>
          {showCode && <pre style={{ margin: '12px 0 0', padding: 12, background: '#0F172A', color: '#E2E8F0', borderRadius: 8, fontSize: 12, overflowX: 'auto' }}>{server?.snippet}</pre>}
        </div>

        {/* ── History ──────────────────────────────────────────────────── */}
        <h2 style={{ ...h2, marginTop: 20 }}>History</h2>
        <div style={card}>
          {(server?.history ?? []).length === 0
            ? <span style={{ fontSize: 13, color: 'var(--mid)' }}>No changes saved yet.</span>
            : server.history.slice(0, 15).map((h, i) => (
              <div key={i} style={{ fontSize: 12.5, padding: '6px 0', borderTop: i ? '1px solid var(--border)' : 'none' }}>
                <span style={{ color: 'var(--mid)' }}>{new Date(h.at).toLocaleString()} · {h.by}</span><br />{h.summary}
              </div>
            ))}
        </div>
      </div>
      <FloatingNav onBack={onBack} onHome={onHome} />
    </div>
  )
}
