import { useState, useEffect, useRef } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { SquareLock02Icon, SquareUnlock02Icon, Download01Icon, CheckmarkCircle02Icon, Delete02Icon, Add01Icon, Cancel01Icon } from '@hugeicons/core-free-icons'
import { PAGE_PADDING_X, stickyPageBar } from '../../lib/layout'
import useIsMobile from '../../lib/useIsMobile'
import { showConfirm } from '../../lib/dialog'
import PageSpinner from '../../components/PageSpinner'
import FloatingNav from '../../components/FloatingNav'
import { printColorsApi as api, hexToRgb, rgbToHex, fmtCmyk } from './api'
import { setPrintColorsDirty } from './leaveGuard'

// Print colours module (agency only, removable - see
// api/_lib/printColors/README.md). Three tabs:
//   Colours  - the brand's swatches (screen HEX/RGB <-> print CMYK, linked
//              through PSO Coated v3, with locks) and a guided Calibrate
//              panel per colour: sheet -> patch -> approve.
//   Printers - which printer every export is made for; optional per-printer
//              colour adjustments and file labelling.
//   History  - who changed what.

const CH = ['c', 'm', 'y', 'k']
const PATCH_RE = /^[A-F][1-5]$/
const GUIDE_KEY = 'wildcast_print_colors_guide'

const adjustments = p => { const n = Object.keys(p.overrides || {}).length; return n === 0 ? 'Brand colours' : n === 1 ? '1 colour adjusted' : `${n} colours adjusted` }
// File labelling per printer (api/_lib/printColors/relabel.js). Same ink
// values in every case; only how the file names itself to the printer.
const LABEL_OPTIONS = [
  ['pdfx4', 'Standard PDF/X-4', 'The usual print standard. The colour profile is named by its registered condition, FOGRA51.'],
  ['indesign', 'Like InDesign', 'PDF/X-4 labelled exactly like an InDesign export (profile named "PSO Coated v3"). Same colours.'],
  ['plain', 'Plain PDF', "Not marked PDF/X. Only for a printer that converts PDF/X files when it shouldn't."],
]
const LABEL_SHORT = { pdfx4: 'standard PDF/X-4', indesign: 'PDF/X-4 labelled like InDesign', plain: 'plain PDF, not PDF/X' }
const slug = name => String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)

const toRow = (c, i) => ({
  id: `${c.hex}-${i}-${Math.random().toString(36).slice(2)}`,
  label: c.label, hex: c.hex, hexDraft: c.hex, rgb: hexToRgb(c.hex), cmyk: { ...c.cmyk },
  lockHex: c.lockHex !== false, lockCmyk: c.lockCmyk !== false,
  status: c.status === 'approved' ? 'approved' : 'draft', approvedBy: c.approvedBy, approvedAt: c.approvedAt,
  preview: null,
})

const readPref = () => { try { return localStorage.getItem(GUIDE_KEY) !== 'closed' } catch { return true } }
const writePref = open => { try { localStorage.setItem(GUIDE_KEY, open ? 'open' : 'closed') } catch { /* private mode */ } }

// ── Styles ──────────────────────────────────────────────────────────────────
const S = {
  input: { fontSize: 13, padding: '7px 9px', borderRadius: 7, border: '1px solid var(--border)', background: '#fff', color: 'var(--dark)', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box', outline: 'none' },
  label: { fontSize: 10.5, fontWeight: 700, color: 'var(--mid)', textTransform: 'uppercase', letterSpacing: '0.06em' },
  card: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 16 },
  hint: { margin: 0, fontSize: 13, color: 'var(--mid)', lineHeight: 1.55, maxWidth: 720 },
  h2: { margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--dark)' },
}
function btn(kind = 'secondary', disabled = false) {
  const base = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 8, cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit', opacity: disabled ? 0.45 : 1, whiteSpace: 'nowrap' }
  if (kind === 'primary') return { ...base, border: 'none', background: 'var(--primary)', color: '#fff' }
  if (kind === 'success') return { ...base, border: '1px solid #16A34A', background: '#16A34A', color: '#fff' }
  if (kind === 'ghost') return { ...base, border: 'none', background: 'none', color: 'var(--mid)', padding: '6px 8px' }
  if (kind === 'danger') return { ...base, border: 'none', background: 'none', color: '#B91C1C', padding: '6px 8px' }
  return { ...base, border: '1px solid var(--border)', background: '#fff', color: 'var(--dark)' }
}

// ── Small pieces ────────────────────────────────────────────────────────────
function Icon({ icon, size = 16 }) {
  return <HugeiconsIcon icon={icon} size={size} strokeWidth={1.8} />
}

function LockButton({ on, onToggle, what }) {
  return (
    <button type="button" onClick={onToggle} aria-pressed={on} aria-label={`${on ? 'Unlock' : 'Lock'} ${what}`}
      title={on ? `${what} is locked: changing the other side won't change it` : `${what} follows the other side automatically`}
      style={{ ...btn('ghost'), padding: '2px 6px', fontSize: 11.5, color: on ? 'var(--dark)' : 'var(--mid)', gap: 4 }}>
      <Icon icon={on ? SquareLock02Icon : SquareUnlock02Icon} size={14} />{on ? 'Locked' : 'Linked'}
    </button>
  )
}

function StatusBadge({ row }) {
  const ok = row.status === 'approved'
  return (
    <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.04em', borderRadius: 100, padding: '2px 8px', background: ok ? '#DCFCE7' : '#FEF3C7', color: ok ? '#166534' : '#92400E' }}>
      {ok ? 'APPROVED' : 'DRAFT'}
    </span>
  )
}

// Plain numeric text field: no spinner arrows, clamps on change.
function Num({ value, max, onChange, label }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10.5, color: 'var(--mid)', textAlign: 'center', minWidth: 0 }}>
      <input type="text" inputMode="numeric" value={value} aria-label={label}
        onChange={e => { const v = e.target.value.replace(/[^0-9.]/g, ''); onChange(v === '' ? 0 : Math.max(0, Math.min(max, Number(v)))) }}
        onFocus={e => e.target.select()}
        style={{ ...S.input, padding: '7px 4px', textAlign: 'center' }} />
      {label}
    </label>
  )
}

function CmykFields({ value, onChange }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
      {CH.map(ch => <Num key={ch} label={ch.toUpperCase()} max={100} value={value[ch]} onChange={v => onChange({ ...value, [ch]: v })} />)}
    </div>
  )
}

function Swatch({ screen, print, size = 56 }) {
  return (
    <div title="Left: on screen. Right: how it prints (simulated)." style={{ display: 'flex', width: size, height: size, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', flexShrink: 0 }}>
      <div style={{ flex: 1, background: screen }} />
      <div style={{ flex: 1, background: print || screen }} />
    </div>
  )
}

function Toast({ toast, onClose, lifted }) {
  if (!toast) return null
  const bad = toast.kind === 'error'
  return (
    <div role={bad ? 'alert' : 'status'} style={{ position: 'fixed', left: '50%', bottom: lifted ? 196 : 84, transform: 'translateX(-50%)', zIndex: 300, maxWidth: 'calc(100vw - 32px)', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: bad ? '#7F1D1D' : '#14532D', color: '#fff', fontSize: 13, boxShadow: '0 8px 24px rgba(0,0,0,0.18)' }}>
      <span>{toast.text}</span>
      <button type="button" onClick={onClose} aria-label="Dismiss" style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0, display: 'flex' }}><Icon icon={Cancel01Icon} size={14} /></button>
    </div>
  )
}

// ── Calibrate panel (one colour) ────────────────────────────────────────────
// base = the value the printed sheet was made from. It lives in the page (not
// here) so switching tabs or using a patch never changes what the codes mean.
function CalibratePanel({ row, base, onNewSheet, onUsePatch, onApprove, onClose, notify }) {
  const [grid, setGrid] = useState(null)
  const [code, setCode] = useState('')
  const [preview, setPreview] = useState(null)  // { code, hex } of the last converted patch
  const [downloading, setDownloading] = useState(false)
  const want = code.trim().toUpperCase()
  const patch = PATCH_RE.test(want) ? grid?.patches.find(p => p.code === want) : null

  const baseKey = fmtCmyk(base)
  useEffect(() => { api({ action: 'grid', cmyk: base }).then(setGrid).catch(e => notify(e.message, 'error')) }, [baseKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const moved = baseKey !== fmtCmyk(row.cmyk)
  useEffect(() => {
    if (patch) api({ action: 'convert', cmyk: patch.cmyk }).then(o => setPreview({ code: patch.code, hex: o.hex })).catch(() => {})
  }, [patch?.code]) // eslint-disable-line react-hooks/exhaustive-deps
  const previewHex = preview && patch && preview.code === patch.code ? preview.hex : null

  async function download() {
    setDownloading(true)
    try {
      const fresh = { ...row.cmyk }
      const blob = await api({ action: 'sheet', label: row.label, hex: row.hex, cmyk: fresh })
      onNewSheet(fresh)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `calibration-${slug(row.label) || 'colour'}.pdf`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    } catch (e) { notify(e.message, 'error') } finally { setDownloading(false) }
  }

  const step = (n, title, children) => (
    <div style={{ display: 'flex', gap: 12 }}>
      <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--dark)', color: '#fff', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{n}</span>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--dark)' }}>{title}</div>
        {children}
      </div>
    </div>
  )

  return (
    <div style={{ marginTop: 14, padding: 16, borderRadius: 10, background: '#F8FAFC', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={S.label}>Calibrate {row.label}</span>
        <button type="button" onClick={onClose} style={btn('ghost')} aria-label="Close calibration"><Icon icon={Cancel01Icon} size={15} /></button>
      </div>

      {step(1, 'Print the calibration sheet', <>
        <p style={S.hint}>Print it at 100 % on the printer you're matching, with your normal colour settings. The sheet is built around {fmtCmyk(row.cmyk)} (patch D3, outlined).</p>
        <div><button type="button" style={btn('secondary', downloading)} disabled={downloading} onClick={download}><Icon icon={Download01Icon} />{downloading ? 'Preparing…' : 'Download sheet (PDF)'}</button></div>
      </>)}

      {step(2, 'Type the patch that matches your reference', <>
        <p style={S.hint}>Hold the print next to the InDesign print or brand book, in daylight. Judge the paper, not the screen. Codes refer to the sheet made from <b>{baseKey}</b>{moved ? '. The colour has changed since, so download a new sheet if you printed a newer one' : ''}.</p>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={code} onChange={e => setCode(e.target.value.slice(0, 2))} placeholder="e.g. C4" aria-label="Patch code"
            onKeyDown={e => { if (e.key === 'Enter' && patch) onUsePatch(patch) }}
            style={{ ...S.input, width: 90, fontSize: 15, fontWeight: 700, textTransform: 'uppercase', textAlign: 'center', borderColor: want && !patch ? '#FCA5A5' : 'var(--border)' }} />
          {patch ? (
            <>
              <Swatch screen={previewHex || row.hex} print={previewHex} size={40} />
              <span style={{ fontSize: 13 }}><b>{patch.code}</b> · CMYK {fmtCmyk(patch.cmyk)}</span>
              <button type="button" style={btn('primary')} onClick={() => onUsePatch(patch)}>Use this patch</button>
            </>
          ) : (
            <span style={{ fontSize: 12.5, color: want ? '#B91C1C' : 'var(--mid)' }}>{want ? 'Rows A–F, columns 1–5, e.g. C4' : 'The preview shows here.'}</span>
          )}
        </div>
      </>)}

      {step(3, 'Check a real flyer, then approve', <>
        <p style={S.hint}>Save, and exports use the new value. Print one real flyer. When it looks right, approve it (approving also saves).</p>
        <div><button type="button" style={btn('success', row.status === 'approved')} disabled={row.status === 'approved'} onClick={onApprove}>
          <Icon icon={CheckmarkCircle02Icon} />{row.status === 'approved' ? 'Approved' : `Save & approve ${fmtCmyk(row.cmyk)}`}
        </button></div>
      </>)}
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function PrintColorsPage({ onBack, onHome }) {
  const isMobile = useIsMobile()
  const [tab, setTab] = useState('colours')
  const [rows, setRows] = useState([])
  const [printers, setPrinters] = useState([])
  const [defaultPrinter, setDefaultPrinter] = useState('standard')
  const [server, setServer] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [toast, setToast] = useState(null)
  const [calibrating, setCalibrating] = useState(null)
  const [guideOpen, setGuideOpen] = useState(readPref)
  const [showCode, setShowCode] = useState(false)
  const [sheetBase, setSheetBase] = useState({})  // hex -> CMYK the printed sheet was made from
  const timers = useRef({})
  const toastTimer = useRef(null)
  const rowsRef = useRef(rows)
  rowsRef.current = rows

  const notify = (text, kind = 'ok') => {
    setToast({ text, kind })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), kind === 'error' ? 8000 : 4000)
  }

  function applyServer(d) {
    setServer(d)
    setRows(d.colors.map(toRow))
    setPrinters(d.printers)
    setDefaultPrinter(d.defaultPrinter)
    setDirty(false)
  }

  const fetchSettings = () => api().then(applyServer).catch(e => setLoadError(e.message)).finally(() => setLoading(false))
  useEffect(() => { fetchSettings() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  function retry() { setLoading(true); setLoadError(''); fetchSettings() }

  // Unsaved-changes guards: the app's own navigation (leaveGuard) + closing the tab.
  useEffect(() => {
    setPrintColorsDirty(dirty)
    if (!dirty) return
    const onBeforeUnload = e => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])
  useEffect(() => () => setPrintColorsDirty(false), [])

  useEffect(() => {
    rows.forEach(r => { if (!r.preview) refreshPreview(r.id, r.cmyk) })
  }, [rows.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const touch = () => setDirty(true)
  const patchRow = (id, fn) => setRows(prev => prev.map(r => (r.id === id ? { ...r, ...fn(r) } : r)))
  const cmykChanged = r => (r.status === 'approved' ? { status: 'draft' } : {})

  function refreshPreview(id, cmyk) {
    api({ action: 'convert', cmyk }).then(out => patchRow(id, () => ({ preview: out.hex }))).catch(() => {})
  }

  function linkFrom(id, source, value) {
    clearTimeout(timers.current[id])
    timers.current[id] = setTimeout(async () => {
      try {
        const out = await api({ action: 'convert', [source]: value })
        if (source === 'cmyk') {
          patchRow(id, r => (r.lockHex ? { preview: out.hex } : { hex: out.hex, hexDraft: out.hex, rgb: out.rgb, preview: out.hex }))
        } else {
          patchRow(id, r => (r.lockCmyk ? {} : { cmyk: out.cmyk, ...cmykChanged(r) }))
          const row = rowsRef.current.find(x => x.id === id)
          if (row && !row.lockCmyk) refreshPreview(id, out.cmyk)
        }
      } catch (e) { notify(e.message, 'error') }
    }, 300)
  }

  function editHex(id, text) {
    touch()
    const rgb = hexToRgb(text)
    patchRow(id, () => (rgb ? { hexDraft: text, hex: rgbToHex(rgb), rgb } : { hexDraft: text }))
    if (rgb) linkFrom(id, 'hex', rgbToHex(rgb))
  }
  function editRgb(id, ch, v) {
    touch()
    const row = rows.find(r => r.id === id)
    const rgb = { ...row.rgb, [ch]: Math.round(v) }
    const hex = rgbToHex(rgb)
    patchRow(id, () => ({ rgb, hex, hexDraft: hex }))
    linkFrom(id, 'rgb', rgb)
  }
  function setCmyk(id, cmyk) {
    touch()
    patchRow(id, r => ({ cmyk, ...cmykChanged(r) }))
    linkFrom(id, 'cmyk', cmyk)
  }

  async function save(nextRows = rows, okText = 'Saved. The next export uses these settings.') {
    const bad = nextRows.find(r => !hexToRgb(r.hexDraft))
    if (bad) { notify(`"${bad.label}": HEX must look like #00C2E8`, 'error'); return false }
    setSaving(true)
    try {
      const saved = await api({
        action: 'save', defaultPrinter,
        colors: nextRows.map(r => ({ label: r.label, hex: r.hex, cmyk: r.cmyk, lockHex: r.lockHex, lockCmyk: r.lockCmyk, status: r.status })),
        printers,
      })
      // Keep the open calibration panel on the same colour after the reload.
      const openHex = rows.find(r => r.id === calibrating)?.hex
      applyServer(saved)
      if (openHex) setCalibrating(prev => (prev ? `hex:${openHex}` : prev))
      notify(okText)
      return true
    } catch (e) { notify(e.message, 'error'); return false } finally { setSaving(false) }
  }

  function applyPatch(row, p) {
    setCmyk(row.id, p.cmyk)
    notify(`${row.label} set to patch ${p.code} (${fmtCmyk(p.cmyk)}). Save to use it in exports.`)
  }

  async function approve(row) {
    const next = rows.map(r => (r.id === row.id ? { ...r, status: 'approved' } : r))
    await save(next, `${row.label} approved at ${fmtCmyk(row.cmyk)}.`)
  }
  async function unapprove(row) {
    await save(rows.map(r => (r.id === row.id ? { ...r, status: 'draft' } : r)), `${row.label} is a draft again.`)
  }

  async function removeColor(row) {
    if (!(await showConfirm(`Remove ${row.label} (${row.hex})? Exports will convert this colour through the press profile instead.`, { title: 'Remove colour?', confirmLabel: 'Remove' }))) return
    touch()
    setRows(prev => prev.filter(x => x.id !== row.id))
    if (calibrating === row.id) setCalibrating(null)
  }
  async function resetColors() {
    if (!(await showConfirm('Replace the list with the built-in colours? Nothing is saved until you click Save.', { title: 'Reset to built-in?', confirmLabel: 'Reset' }))) return
    touch()
    setRows((server?.defaults ?? []).map(toRow))
    setCalibrating(null)
  }
  function addColor() {
    touch()
    const r = toRow({ label: 'New colour', hex: '#808080', cmyk: { c: 0, m: 0, y: 0, k: 50 }, lockHex: false, lockCmyk: false }, rows.length)
    setRows(prev => [...prev, r])
    linkFrom(r.id, 'hex', r.hex)
  }

  // Printers get their id from the name, so a new one can be picked as
  // default before it's saved (the server derives the same id).
  function addPrinter() {
    touch()
    const taken = new Set(['standard', ...printers.map(p => p.id)])
    let n = printers.length + 1
    while (taken.has(`printer-${n}`)) n++
    setPrinters(prev => [...prev, { id: `printer-${n}`, name: `Printer ${n}`, label: 'pdfx4', overrides: {} }])
  }
  const editPrinter = (i, fn) => { touch(); setPrinters(prev => prev.map((p, j) => (j === i ? { ...p, ...fn(p) } : p))) }
  async function removePrinter(i) {
    const p = printers[i]
    if (!(await showConfirm(`Remove ${p.name}?${defaultPrinter === p.id ? ' Exports will go back to Standard.' : ''}`, { title: 'Remove printer?', confirmLabel: 'Remove' }))) return
    touch()
    setPrinters(prev => prev.filter((_, j) => j !== i))
    if (defaultPrinter === p.id) setDefaultPrinter('standard')
  }

  const toggleGuide = () => setGuideOpen(o => { writePref(!o); return !o })

  if (loading) return <PageSpinner />
  if (loadError) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--bg)' }}>
        <div style={{ ...S.card, maxWidth: 420, textAlign: 'center' }}>
          <h1 style={{ margin: '0 0 8px', fontSize: 17 }}>Couldn't load print colours</h1>
          <p style={{ ...S.hint, margin: '0 auto 16px' }}>{loadError}</p>
          <button type="button" style={btn('primary')} onClick={retry}>Try again</button>
        </div>
        <FloatingNav onBack={onBack} onHome={onHome} />
      </div>
    )
  }

  const openId = calibrating?.startsWith('hex:') ? rows.find(r => `hex:${r.hex}` === calibrating)?.id : calibrating
  const approvedCount = rows.filter(r => r.status === 'approved').length
  const printerOptions = [{ ...(server?.standardPrinter ?? { id: 'standard' }), id: 'standard', name: 'Standard', desc: 'Brand colours, standard PDF/X-4 file. Right for any properly calibrated printer.' },
    ...printers.map(p => ({ ...p, desc: `${adjustments(p)} · ${LABEL_SHORT[p.label] ?? LABEL_SHORT.pdfx4}` }))]
  const activePrinterName = defaultPrinter !== 'standard' ? printers.find(p => p.id === defaultPrinter)?.name : null
  const tabs = [['colours', 'Colours'], ['printers', 'Printers'], ['history', 'History']]

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ borderBottom: '1px solid var(--border)', padding: `20px ${PAGE_PADDING_X} 0`, background: '#fff', ...stickyPageBar(isMobile) }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: '1 1 320px' }}>
            <h1 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: 'var(--dark)' }}>Print colours</h1>
            <p style={S.hint}>The exact CMYK each brand colour prints with, for every Wolt template.{activePrinterName ? <> Exports are made for <b>{activePrinterName}</b>.</> : null}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: dirty ? '#B45309' : 'var(--mid)' }}>
              {dirty ? 'Unsaved changes' : server?.updatedAt ? `Saved ${new Date(server.updatedAt).toLocaleDateString()}` : 'Built-in colours'}
            </span>
            <button type="button" style={btn('primary', saving || !dirty)} disabled={saving || !dirty} onClick={() => save()}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
        <div role="tablist" style={{ display: 'flex', gap: 4, marginTop: 14 }}>
          {tabs.map(([id, name]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
              style={{ fontSize: 13, fontWeight: 600, padding: '9px 12px', border: 'none', borderBottom: `2px solid ${tab === id ? 'var(--primary)' : 'transparent'}`, background: 'none', color: tab === id ? 'var(--dark)' : 'var(--mid)', cursor: 'pointer', fontFamily: 'inherit' }}>
              {name}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: `20px ${PAGE_PADDING_X} 110px`, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* ── Colours ──────────────────────────────────────────────────── */}
        {tab === 'colours' && <>
          <div style={{ ...S.card, background: '#F8FAFC', padding: guideOpen ? 16 : '10px 16px' }}>
            <button type="button" onClick={toggleGuide} aria-expanded={guideOpen}
              style={{ ...btn('ghost'), padding: 0, color: 'var(--dark)', fontWeight: 700, width: '100%', justifyContent: 'space-between', whiteSpace: 'normal', textAlign: 'left', gap: 12 }}>
              How to get a colour right <span style={{ color: 'var(--mid)', fontWeight: 500, fontSize: 12 }}>{guideOpen ? 'Hide' : 'Show'}</span>
            </button>
            {guideOpen && (
              <ol style={{ margin: '10px 0 0', paddingLeft: 20, listStyle: 'decimal', fontSize: 13, color: 'var(--dark)', lineHeight: 1.7 }}>
                <li>Click <b>Calibrate</b> on a colour and print the sheet on the printer you're matching.</li>
                <li>Type the patch that matches your reference (InDesign print or brand book), then <b>Save</b>. Exports use it from then on.</li>
                <li>Print one real flyer. If it's right, <b>approve</b> it. Do this once per brand, and every template follows.</li>
              </ol>
            )}
          </div>

          {rows.length === 0 && <div style={{ ...S.card, textAlign: 'center', color: 'var(--mid)', fontSize: 13 }}>No brand colours. Exports convert every colour through the press profile.</div>}

          {rows.map(r => (
            <div key={r.id} style={{ ...S.card, borderColor: openId === r.id ? 'var(--dark)' : 'var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <Swatch screen={r.hex} print={r.preview} />
                <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                  <input value={r.label} aria-label="Colour name" onChange={e => { touch(); const label = e.target.value; patchRow(r.id, () => ({ label })) }}
                    style={{ ...S.input, border: '1px solid transparent', padding: '4px 6px', marginLeft: -6, fontSize: 15, fontWeight: 700 }}
                    onFocus={e => { e.target.style.borderColor = 'var(--border)' }} onBlur={e => { e.target.style.borderColor = 'transparent' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
                    <StatusBadge row={r} />
                    <span style={{ fontSize: 12, color: 'var(--mid)' }}>
                      {r.status !== 'approved' ? 'Not yet confirmed by a print' : r.approvedBy === 'built-in' ? 'Official brand value' : `by ${r.approvedBy || 'the team'}${r.approvedAt ? `, ${new Date(r.approvedAt).toLocaleDateString()}` : ''}`}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  {r.status === 'approved' && <button type="button" style={btn('ghost')} onClick={() => unapprove(r)}>Undo approval</button>}
                  <button type="button" style={btn(openId === r.id ? 'primary' : 'secondary')} onClick={() => { if (openId !== r.id) setSheetBase(m => (m[r.hex] ? m : { ...m, [r.hex]: { ...r.cmyk } })); setCalibrating(openId === r.id ? null : r.id) }}>Calibrate</button>
                  <button type="button" style={btn('danger')} onClick={() => removeColor(r)} aria-label={`Remove ${r.label}`} title="Remove colour"><Icon icon={Delete02Icon} /></button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginTop: 14 }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={S.label}>On screen</span>
                    <LockButton on={r.lockHex} what="The screen colour" onToggle={() => { touch(); patchRow(r.id, x => ({ lockHex: !x.lockHex })) }} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.5fr repeat(3, minmax(0, 1fr))', gap: 6 }}>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10.5, color: 'var(--mid)', textAlign: 'center' }}>
                      <input value={r.hexDraft} onChange={e => editHex(r.id, e.target.value)} aria-label="HEX" spellCheck={false}
                        style={{ ...S.input, textAlign: 'center', fontFamily: 'ui-monospace, monospace', borderColor: hexToRgb(r.hexDraft) ? 'var(--border)' : '#FCA5A5' }} />
                      HEX
                    </label>
                    {['r', 'g', 'b'].map(ch => <Num key={ch} label={ch.toUpperCase()} max={255} value={r.rgb?.[ch] ?? 0} onChange={v => editRgb(r.id, ch, v)} />)}
                  </div>
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={S.label}>In print · CMYK %</span>
                    <LockButton on={r.lockCmyk} what="The print CMYK" onToggle={() => { touch(); patchRow(r.id, x => ({ lockCmyk: !x.lockCmyk })) }} />
                  </div>
                  <CmykFields value={r.cmyk} onChange={cmyk => setCmyk(r.id, cmyk)} />
                </div>
              </div>

              {openId === r.id && (
                <CalibratePanel key={r.hex} row={r} notify={notify} base={sheetBase[r.hex] ?? r.cmyk} onNewSheet={b => setSheetBase(m => ({ ...m, [r.hex]: b }))}
                  onClose={() => setCalibrating(null)} onUsePatch={p => applyPatch(r, p)} onApprove={() => approve(r)} />
              )}
            </div>
          ))}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" style={btn()} onClick={addColor}><Icon icon={Add01Icon} />Add colour</button>
            <button type="button" style={btn('ghost')} onClick={resetColors}>Reset to built-in</button>
          </div>

          <div style={{ ...S.card, marginTop: 12, padding: '12px 16px' }}>
            <button type="button" onClick={() => setShowCode(s => !s)} aria-expanded={showCode}
              style={{ ...btn('ghost'), padding: 0, width: '100%', justifyContent: 'space-between', color: 'var(--dark)', fontWeight: 600, whiteSpace: 'normal', textAlign: 'left', gap: 12 }}>
              For developers: make approved colours permanent <span style={{ fontSize: 12, color: 'var(--mid)', fontWeight: 500, whiteSpace: 'nowrap' }}>{approvedCount} approved · {showCode ? 'Hide' : 'Show'}</span>
            </button>
            {showCode && <>
              <p style={{ ...S.hint, marginTop: 10 }}>Paste into <code>api/_lib/brandColors.js</code> so these become the built-in default (reviewed in a PR, kept even if this setting is removed).{dirty ? ' Save first to include your latest changes.' : ''}</p>
              <pre style={{ margin: '10px 0', padding: 12, background: '#0F172A', color: '#E2E8F0', borderRadius: 8, fontSize: 12, overflowX: 'auto' }}>{server?.snippet}</pre>
              <button type="button" style={btn()} onClick={() => navigator.clipboard?.writeText(server?.snippet || '').then(() => notify('Code copied.'), () => notify('Copy failed. Select the code and copy it.', 'error'))}>Copy code</button>
            </>}
          </div>
        </>}

        {/* ── Printers ─────────────────────────────────────────────────── */}
        {tab === 'printers' && <>
          <p style={S.hint}>Every export is made for one printer. Keep <b>Standard</b> unless a specific print shop needs different values or InDesign-style file labelling.</p>
          <div role="radiogroup" aria-label="Default printer" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {printerOptions.map(p => {
              const on = defaultPrinter === p.id
              return (
                <button key={p.id} type="button" role="radio" aria-checked={on} aria-label={`${p.name}: ${p.desc}`} onClick={() => { if (!on) { touch(); setDefaultPrinter(p.id) } }}
                  style={{ ...S.card, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', borderColor: on ? 'var(--primary)' : 'var(--border)', boxShadow: on ? '0 0 0 1px var(--primary)' : 'none' }}>
                  <span style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${on ? 'var(--primary)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {on && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary)' }} />}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--dark)' }}>{p.name}{on ? ' · used for exports' : ''}</span>
                    <span style={{ display: 'block', fontSize: 12.5, color: 'var(--mid)' }}>{p.desc}</span>
                  </span>
                </button>
              )
            })}
          </div>

          {printers.map((p, i) => (
            <div key={p.id} style={{ ...S.card, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <label style={{ flex: '1 1 240px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={S.label}>Printer name</span>
                  <input value={p.name} onChange={e => { const name = e.target.value; editPrinter(i, () => ({ name })) }} style={S.input} />
                </label>
                <button type="button" style={btn('danger')} onClick={() => removePrinter(i)}><Icon icon={Delete02Icon} />Remove</button>
              </div>

              <div>
                <div style={{ ...S.label, marginBottom: 6 }}>File labelling</div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                  {LABEL_OPTIONS.map(([val, title, desc]) => (
                    <label key={val} style={{ display: 'flex', gap: 10, padding: 12, borderRadius: 8, border: `1px solid ${p.label === val ? 'var(--dark)' : 'var(--border)'}`, cursor: 'pointer' }}>
                      <input type="radio" aria-label={title} name={`label-${p.id}`} checked={p.label === val} onChange={() => editPrinter(i, () => ({ label: val }))} style={{ marginTop: 2 }} />
                      <span><span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>{title}</span><span style={{ display: 'block', fontSize: 12, color: 'var(--mid)', lineHeight: 1.45 }}>{desc}</span></span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ ...S.label, marginBottom: 6 }}>Colour adjustments for this printer</div>
                <p style={{ ...S.hint, marginBottom: 8, fontSize: 12.5 }}>Only if this printer needs a different value. Everything else uses the brand colour.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {rows.map(r => {
                    const o = p.overrides?.[r.hex]
                    return (
                      <div key={r.id} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ width: 16, height: 16, borderRadius: 4, background: r.hex, border: '1px solid var(--border)', flexShrink: 0 }} />
                        <span style={{ fontSize: 13, flex: '1 1 160px' }}>{r.label} <span style={{ color: 'var(--mid)' }}>· brand {fmtCmyk(r.cmyk)}</span></span>
                        {o ? (
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <div style={{ width: 220 }}><CmykFields value={o} onChange={v => editPrinter(i, x => ({ overrides: { ...x.overrides, [r.hex]: v } }))} /></div>
                            <button type="button" style={btn('ghost')} onClick={() => editPrinter(i, x => { const next = { ...x.overrides }; delete next[r.hex]; return { overrides: next } })}>Use brand value</button>
                          </div>
                        ) : (
                          <button type="button" style={btn()} onClick={() => editPrinter(i, x => ({ overrides: { ...x.overrides, [r.hex]: { ...r.cmyk } } }))}>Adjust</button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          ))}
          <div><button type="button" style={btn()} onClick={addPrinter}><Icon icon={Add01Icon} />Add printer</button></div>
        </>}

        {/* ── History ──────────────────────────────────────────────────── */}
        {tab === 'history' && (
          <div style={S.card}>
            {(server?.history ?? []).length === 0
              ? <span style={{ fontSize: 13, color: 'var(--mid)' }}>No changes saved yet.</span>
              : server.history.map((h, i) => (
                <div key={i} style={{ padding: '10px 0', borderTop: i ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ fontSize: 12, color: 'var(--mid)' }}>{new Date(h.at).toLocaleString()} · {h.by}</div>
                  <div style={{ fontSize: 13, color: 'var(--dark)', marginTop: 2 }}>{h.summary}</div>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Phones: the header doesn't stick, so keep Save in reach while there are changes. */}
      {isMobile && dirty && (
        <button type="button" onClick={() => save()} disabled={saving}
          style={{ ...btn('primary', saving), position: 'fixed', right: 16, bottom: 140, zIndex: 290, padding: '12px 20px', borderRadius: 100, boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      )}
      <Toast toast={toast} onClose={() => setToast(null)} lifted={isMobile && dirty} />
      <FloatingNav onBack={onBack} onHome={onHome} />
    </div>
  )
}
