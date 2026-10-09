import { useState, useEffect, useRef, useMemo } from 'react'
import TemplateCanvas from './TemplateCanvas'
import Select from './Select'
import { PAGE_PADDING_X, stickyPageBar } from '../lib/layout'
import { sortIdsByFieldOrder } from '../lib/fieldOrder'
import { cropToContent, hasTransparency } from '../lib/image'
import { fitContent } from '../lib/briefToCandidates'
import { logoStartPct } from '../lib/logoStartScale'
import useIsMobile from '../lib/useIsMobile'
import { MAX_BATCH, newRow, rowsFromItems, rowName, buildRowFields, applyImageToAll } from '../lib/batch'
import { showPrompt } from '../lib/dialog'

// "Create many" (Julia's ask, 2026-10-09): one template, many designs at once.
// Text that's the same for every design is typed once at the top; below it,
// one card per design with its own images and name, and "+ Add design" to add
// another (dropping several files on it adds one design per file - the quick
// way to start from 10 logos). Every card is rendered off-screen with the same
// TemplateCanvas + getPng capture the Prompt Brief uses, and saved as its own
// design in the Design library (App.jsx saveCandidateForReview), where it goes
// through the normal review/approve/export flow.

// Same labels as FieldEditor.jsx's TEXT_FIELD_LABELS.
const TEXT_LABELS = {
  headline: 'Headline',
  sub_headline: 'Sub-headline',
  restaurant_name: 'Restaurant name',
  offer: 'Offer',
  tc: 'T&Cs',
  cta: 'App download line',
}

// TemplateCanvas's onReady fires once text is placed; image zones load a beat
// later (same wait as PromptBriefResultModal.jsx).
const CAPTURE_DELAY_MS = 1600

const NO_FOLDER = ''
const NEW_FOLDER = '__new__'

const inputStyle = { width: '100%', padding: '9px 12px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', background: '#fff', color: 'var(--dark)', boxSizing: 'border-box', fontFamily: 'inherit' }
const cardStyle = { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 20, overflow: 'hidden' }
// Card header with a divider line under it; no step numbers (Anang, 2026-10-09).
const cardHeader = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '14px 20px', borderBottom: '1px solid var(--border)', background: '#FAFAFA' }
const sectionTitle = { fontSize: 15, fontWeight: 700, color: 'var(--dark)' }
const cardBody = { padding: 20 }
const linkBtn = { background: 'none', border: 'none', padding: 0, fontSize: 11, fontWeight: 600, color: 'var(--primary)', cursor: 'pointer' }

function imageZoneLabel(zone) {
  if (zone.id?.includes('sticker')) return 'Discount'
  return zone.label ?? zone.id
}

// Raw File -> { name, url, warning }. Batch uploads are used as they are (no
// background-removal prompt per file); a zone that wants a cut-out gets a
// warning instead, and a QR code gets its quiet zone trimmed like the editor.
async function prepareFile(zone, file) {
  let url = URL.createObjectURL(file)
  if (zone.id === 'qr') url = await cropToContent(url)
  const mustBeTransparent = zone.hint?.toLowerCase().includes('transparent')
  const warning = mustBeTransparent && !(await hasTransparency(url)) ? 'Not transparent' : null
  return { name: file.name, url, warning }
}

const imageFiles = fileList => [...(fileList ?? [])].filter(f => f.type.startsWith('image/'))

function ImageSlot({ zone, item, canShare, onFile, onClear, onUseOnAll }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--light)', textTransform: 'uppercase', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={imageZoneLabel(zone)}>{imageZoneLabel(zone)}</div>
      <label
        title={item ? `${item.name} - click to replace` : `Add ${imageZoneLabel(zone).toLowerCase()}`}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const f = imageFiles(e.dataTransfer.files)[0]; if (f) onFile(f) }}
        style={{ position: 'relative', width: '100%', height: 72, borderRadius: 8, border: item ? '1px solid var(--border)' : '1.5px dashed var(--border)', background: item ? '#fff' : '#FAFAFA', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', overflow: 'hidden' }}
      >
        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = imageFiles(e.target.files)[0]; if (f) onFile(f); e.target.value = '' }} />
        {item
          ? <img src={item.url} alt={item.name} style={{ maxWidth: '90%', maxHeight: '90%', objectFit: 'contain' }} />
          : <span style={{ fontSize: 20, color: 'var(--light)', lineHeight: 1 }}>+</span>}
        {item && (
          <button
            type="button" title="Remove"
            onClick={e => { e.preventDefault(); e.stopPropagation(); onClear() }}
            style={{ position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: 9, border: 'none', background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 11, lineHeight: '18px', padding: 0, cursor: 'pointer' }}
          >×</button>
        )}
      </label>
      {item?.warning && <div style={{ fontSize: 10, color: '#B45309', marginTop: 3 }}>{item.warning}</div>}
      {item && canShare && <button type="button" style={{ ...linkBtn, marginTop: 3 }} onClick={onUseOnAll}>Use on all</button>}
    </div>
  )
}

export default function BatchCreator({ template, config, activation, onSaveDesign, onBack, onDone }) {
  const isMobile = useIsMobile()
  const zones = useMemo(() => config?.zones ?? [], [config])
  const textZoneIds = useMemo(() => sortIdsByFieldOrder(zones.filter(z => z.type === 'text').map(z => z.id)), [zones])
  const imageZones = useMemo(() => {
    const byId = Object.fromEntries(zones.filter(z => z.type === 'image').map(z => [z.id, z]))
    return sortIdsByFieldOrder(Object.keys(byId)).map(id => byId[id])
  }, [zones])
  const imageZoneIds = useMemo(() => imageZones.map(z => z.id), [imageZones])
  // Files dropped on "+ Add design" go into the first image zone (the logo on
  // every current template).
  const bulkZone = imageZones[0] ?? null
  // A restaurant name differs per partner, so the card's name field fills it
  // (and names the design) instead of it being shared text.
  const perRowName = textZoneIds.includes('restaurant_name')
  const sharedTextIds = textZoneIds.filter(id => id !== 'restaurant_name')

  const [sharedText, setSharedText] = useState({})
  const [rows, setRows] = useState(() => [newRow()])
  const [previews, setPreviews] = useState({}) // sig -> { png, imageScales, imagePositions }
  const [job, setJob] = useState(null) // the design currently rendering off-screen
  const [saving, setSaving] = useState(null) // { done, total }
  const [savedSigs, setSavedSigs] = useState(() => new Set())
  const [error, setError] = useState(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const exportRef = useRef(null)
  const captureTimer = useRef(null)

  // Design library folder - same personal folders as PromptBriefResultModal.jsx.
  const ownerKey = activation?.key
  const [folders, setFolders] = useState([])
  const [folder, setFolder] = useState(NO_FOLDER)
  const [folderError, setFolderError] = useState(null)
  useEffect(() => {
    if (!ownerKey) return
    let cancelled = false
    fetch('/api/folders', { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        const mine = (data.owners ?? []).find(o => o.ownerEmail === ownerKey)
        if (!cancelled) setFolders([...(mine?.folders ?? [])].sort((a, b) => a.localeCompare(b)))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [ownerKey])

  async function handleFolderChange(value) {
    setFolderError(null)
    if (value !== NEW_FOLDER) { setFolder(value); return }
    const name = (await showPrompt('New folder name', { confirmLabel: 'Create' }))?.trim()
    if (!name) return
    const existing = folders.find(f => f.toLowerCase() === name.toLowerCase())
    if (existing) { setFolder(existing); return }
    try {
      const res = await fetch('/api/folders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerEmail: ownerKey, ownerName: activation?.clientName, folderName: name }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not create folder')
      setFolders([...(data.folders ?? [])].sort((a, b) => a.localeCompare(b)))
      setFolder(data.folders?.find(f => f.toLowerCase() === name.toLowerCase()) ?? name)
    } catch (err) {
      setFolderError(err.message)
    }
  }

  // Omnes Cond zones are always uppercase on the artwork (App.jsx handleFieldChange).
  function caseFor(id, value) {
    return zones.find(z => z.id === id)?.fontFamily === 'omnes-cond' ? value.toUpperCase() : value
  }

  const designs = useMemo(() => rows.map((row, i) => {
    const name = rowName(row, imageZoneIds, i)
    const text = perRowName ? { ...sharedText, restaurant_name: caseFor('restaurant_name', name) } : sharedText
    const fields = buildRowFields({ sharedText: text, images: row.images, imageZoneIds })
    return { row, index: i, name, fields, sig: JSON.stringify(fields) }
    // caseFor only reads zones
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [rows, imageZoneIds, perRowName, sharedText, zones])

  // Render queue: one hidden canvas, one design at a time. Any edit changes a
  // design's sig, so only the designs that actually changed get re-rendered.
  useEffect(() => {
    if (job || saving) return
    const next = designs.find(d => !previews[d.sig])
    if (!next) return
    let cancelled = false
    ;(async () => {
      const { scales, positions } = await fitContent(zones, next.fields)
      // A logo starts at the template's own Scale, centred (App.jsx handleFieldChange).
      const logoPct = next.fields.logoUrl ? logoStartPct(template.id) : null
      if (logoPct) { scales.logo = logoPct; positions.logo = { x: 0, y: 0 } }
      if (!cancelled) setJob({ sig: next.sig, fields: next.fields, imageScales: scales, imagePositions: positions })
    })()
    return () => { cancelled = true }
  }, [designs, previews, job, saving, zones, template.id])

  useEffect(() => () => clearTimeout(captureTimer.current), [])

  function handleCanvasReady() {
    const current = job
    clearTimeout(captureTimer.current)
    captureTimer.current = setTimeout(() => {
      const png = exportRef.current?.getPng?.()
      if (png) setPreviews(prev => ({ ...prev, [current.sig]: { png, imageScales: current.imageScales, imagePositions: current.imagePositions } }))
      setJob(null)
    }, CAPTURE_DELAY_MS)
  }

  function updateRow(id, patch) {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch(r) } : r)))
  }

  async function setImage(rowId, zone, file) {
    const item = await prepareFile(zone, file)
    updateRow(rowId, r => ({ images: { ...r.images, [zone.id]: item } }))
  }

  function clearImage(rowId, zoneId) {
    updateRow(rowId, r => {
      const images = { ...r.images }
      delete images[zoneId]
      return { images }
    })
  }

  function addDesign() {
    setError(null)
    if (rows.length >= MAX_BATCH) { setError(`Up to ${MAX_BATCH} designs at once.`); return }
    setRows(prev => [...prev, newRow()])
  }

  // Several files at once -> one new design per file. An untouched empty
  // card (the page starts with one) is replaced rather than left blank.
  async function addDesignsFromFiles(fileList) {
    setError(null)
    const files = imageFiles(fileList)
    if (!files.length || !bulkZone) return
    const items = await Promise.all(files.map(f => prepareFile(bulkZone, f)))
    setRows(prev => {
      const keep = prev.filter(r => r.name || Object.keys(r.images).length)
      const added = rowsFromItems(items, bulkZone.id, keep.length)
      if (added.length < items.length) setError(`Up to ${MAX_BATCH} designs at once - the extra files were left out.`)
      return [...keep, ...added]
    })
  }

  function removeDesign(id) {
    setRows(prev => (prev.length > 1 ? prev.filter(r => r.id !== id) : [newRow()]))
  }

  const allPreviewed = designs.length > 0 && designs.every(d => previews[d.sig])
  const canSave = allPreviewed && !saving && !!onSaveDesign
  const previewedCount = designs.filter(d => previews[d.sig]).length

  async function handleSave() {
    if (!canSave) return
    setError(null)
    const todo = designs.filter(d => !savedSigs.has(d.sig))
    setSaving({ done: 0, total: todo.length })
    const chosenFolder = folder || null
    try {
      for (const [n, d] of todo.entries()) {
        const p = previews[d.sig]
        await onSaveDesign({
          fields: d.fields, png: p.png, imageScales: p.imageScales, imagePositions: p.imagePositions,
          name: `${d.name} – ${template.name}`, folder: chosenFolder,
        })
        setSavedSigs(prev => new Set(prev).add(d.sig))
        setSaving({ done: n + 1, total: todo.length })
      }
      onDone?.({ count: designs.length, folder: chosenFolder })
    } catch (err) {
      setError(`Saving stopped: ${err.message}. The designs already saved are in the Design library - press Save again to save the rest.`)
    } finally {
      setSaving(null)
    }
  }

  return (
    <div style={{ flex: 1, background: 'var(--bg)' }}>
      {/* Page title bar stays put under the app header while the designs scroll (Anang, 2026-10-09). */}
      <div style={{ ...stickyPageBar(isMobile), borderBottom: '1px solid var(--border)', padding: `28px ${PAGE_PADDING_X} 24px`, background: '#fff' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', padding: 0, fontSize: 13, color: 'var(--mid)', cursor: 'pointer', marginBottom: 10 }}>← Back to templates</button>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--dark)' }}>Create many · {template.name}</h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--mid)', maxWidth: 640, lineHeight: 1.5 }}>
          Type the text every design shares once, then fill one card per design. Each card is saved as its own design.
        </p>
      </div>

      <div style={{ padding: `24px ${PAGE_PADDING_X} 60px` }}>
        {sharedTextIds.length > 0 && (
          <div style={cardStyle}>
            <div style={cardHeader}><div style={sectionTitle}>Text for every design</div></div>
            {/* Two equal columns filling the card (Anang, 2026-10-09); T&Cs spans both. */}
            <div style={{ ...cardBody, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
              {sharedTextIds.map(id => {
                const zone = zones.find(z => z.id === id)
                const multiLine = id === 'tc'
                const props = {
                  id: `batch-${id}`,
                  value: sharedText[id] ?? '',
                  placeholder: zone?.placeholder ?? '',
                  onChange: e => setSharedText(prev => ({ ...prev, [id]: caseFor(id, e.target.value) })),
                  style: multiLine ? { ...inputStyle, minHeight: 64, resize: 'vertical' } : inputStyle,
                }
                return (
                  <div key={id} style={multiLine ? { gridColumn: '1 / -1' } : undefined}>
                    <label htmlFor={`batch-${id}`} style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--mid)', marginBottom: 6 }}>{TEXT_LABELS[id] ?? zone?.label ?? id}</label>
                    {multiLine ? <textarea {...props} /> : <input {...props} />}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div style={cardStyle}>
          <div style={cardHeader}>
            <div style={sectionTitle}>Designs ({designs.length})</div>
            <div style={{ fontSize: 12, color: 'var(--mid)' }}>
              {previewedCount < designs.length ? `Rendering previews… ${previewedCount} of ${designs.length}` : 'All previews ready'}
            </div>
          </div>

          <div style={cardBody}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))', gap: 16 }}>
            {designs.map(d => {
              const p = previews[d.sig]
              return (
                <div key={d.row.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, display: 'flex', gap: 14 }}>
                  <div style={{ width: 110, flexShrink: 0, alignSelf: 'flex-start', borderRadius: 6, overflow: 'hidden', background: '#F3F4F6' }}>
                    {/* Height follows the render, so every template's own page shape shows uncropped. */}
                    {p
                      ? <img src={p.png} alt={d.name} style={{ display: 'block', width: '100%', height: 'auto' }} />
                      : <div style={{ aspectRatio: '1191 / 1679', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--light)' }}>Rendering…</div>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--mid)' }}>
                        Design {d.index + 1}{savedSigs.has(d.sig) && <span style={{ color: '#047857', marginLeft: 6 }}>· Saved</span>}
                      </span>
                      <button type="button" title="Remove this design" onClick={() => removeDesign(d.row.id)} style={{ ...linkBtn, color: 'var(--mid)', fontSize: 12 }}>Remove</button>
                    </div>
                    <label htmlFor={`batch-name-${d.row.id}`} style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--light)', textTransform: 'uppercase', marginBottom: 4 }}>
                      {perRowName ? 'Restaurant name' : 'Design name'}
                    </label>
                    <input
                      id={`batch-name-${d.row.id}`}
                      value={d.row.name}
                      placeholder={d.name}
                      onChange={e => updateRow(d.row.id, () => ({ name: e.target.value }))}
                      style={{ ...inputStyle, marginBottom: 10 }}
                    />
                    {/* Slots fill the card in two equal columns - no empty space on the right. */}
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(2, imageZones.length) || 1}, minmax(0, 1fr))`, gap: 10 }}>
                      {imageZones.map(zone => (
                        <ImageSlot
                          key={zone.id}
                          zone={zone}
                          item={d.row.images[zone.id]}
                          canShare={rows.length > 1}
                          onFile={file => setImage(d.row.id, zone, file)}
                          onClear={() => clearImage(d.row.id, zone.id)}
                          onUseOnAll={() => setRows(prev => applyImageToAll(prev, zone.id, d.row.images[zone.id]))}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )
            })}

            <div
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); addDesignsFromFiles(e.dataTransfer.files) }}
              style={{ border: '1.5px dashed var(--border)', borderRadius: 12, padding: 14, minHeight: 170, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, background: '#FAFAFA', textAlign: 'center' }}
            >
              <button
                type="button" onClick={addDesign}
                style={{ padding: '9px 18px', fontSize: 13, fontWeight: 700, borderRadius: 100, border: '1px solid var(--primary)', background: '#fff', color: 'var(--primary)', cursor: 'pointer' }}
              >+ Add design</button>
              {bulkZone && (
                <div style={{ fontSize: 12, color: 'var(--mid)', lineHeight: 1.5, maxWidth: 240 }}>
                  or{' '}
                  <label style={{ color: 'var(--primary)', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}>
                    add several {imageZoneLabel(bulkZone).toLowerCase()}s at once
                    <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => { addDesignsFromFiles(e.target.files); e.target.value = '' }} />
                  </label>
                  {' '}- one design per file. You can also drop them here.
                </div>
              )}
            </div>
          </div>
          {error && <div style={{ fontSize: 12, color: '#B91C1C', marginTop: 12 }}>{error}</div>}
          </div>
        </div>

      </div>

      {/* Sticky save bar (Anang, 2026-10-09) - always in reach however long the
          list of designs gets. The folder is picked in the confirm popup. Needs
          the page itself (body) to scroll, hence no overflow on the root div. */}
      <div style={{ position: 'sticky', bottom: 0, zIndex: 20, background: '#fff', borderTop: '1px solid var(--border)', padding: `14px ${PAGE_PADDING_X}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, color: 'var(--mid)' }}>
          <strong style={{ color: 'var(--dark)' }}>{designs.length} design{designs.length === 1 ? '' : 's'}</strong>
          {' · '}{previewedCount < designs.length ? `Rendering previews… ${previewedCount} of ${designs.length}` : 'Ready to save'}
        </div>
        <button
          onClick={() => { setError(null); setConfirmOpen(true) }}
          disabled={!canSave}
          style={{ padding: '11px 22px', fontSize: 14, fontWeight: 700, borderRadius: 8, border: 'none', background: canSave ? 'var(--primary)' : 'var(--border)', color: '#fff', cursor: canSave ? 'pointer' : 'default' }}
        >
          Save {designs.length} design{designs.length === 1 ? '' : 's'}
        </button>
      </div>

      {confirmOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={() => !saving && setConfirmOpen(false)}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 440, maxWidth: '100%', boxShadow: '0 24px 80px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--dark)', margin: '0 0 4px', letterSpacing: '-0.02em' }}>
              Save {designs.length} design{designs.length === 1 ? '' : 's'}?
            </h3>
            <p style={{ fontSize: 13, color: 'var(--mid)', margin: '0 0 20px', lineHeight: 1.5 }}>
              Each one is saved as its own design in the Design library - open it there to fine-tune, send for review and export.
            </p>
            {ownerKey && (
              <div style={{ marginBottom: 20 }}>
                <label htmlFor="batch-folder" style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--mid)', marginBottom: 6 }}>Save to folder</label>
                <Select id="batch-folder" value={folder} disabled={!!saving} onChange={e => handleFolderChange(e.target.value)} style={{ ...inputStyle, width: '100%' }}>
                  <option value={NO_FOLDER}>No folder</option>
                  {folders.map(f => <option key={f} value={f}>{f}</option>)}
                  <option value={NEW_FOLDER}>+ New folder…</option>
                </Select>
                {folderError && <div style={{ fontSize: 12, color: '#B91C1C', marginTop: 6 }}>Couldn't create folder: {folderError}</div>}
              </div>
            )}
            {error && <div style={{ fontSize: 12, color: '#B91C1C', marginBottom: 14, lineHeight: 1.5 }}>{error}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={() => setConfirmOpen(false)}
                disabled={!!saving}
                style={{ padding: '10px 18px', fontSize: 13, fontWeight: 600, borderRadius: 8, border: '1px solid var(--border)', background: '#fff', color: 'var(--dark)', cursor: saving ? 'default' : 'pointer' }}
              >Cancel</button>
              <button
                onClick={handleSave}
                disabled={!canSave}
                style={{ padding: '10px 18px', fontSize: 13, fontWeight: 700, borderRadius: 8, border: 'none', background: canSave ? 'var(--primary)' : 'var(--border)', color: '#fff', cursor: canSave ? 'pointer' : 'default' }}
              >
                {saving ? `Saving ${Math.min(saving.done + 1, saving.total)} of ${saving.total}…` : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {job && (
        <div style={{ position: 'absolute', left: -9999, top: 0, width: 1, height: 1, overflow: 'hidden' }}>
          <TemplateCanvas
            key={job.sig}
            config={config}
            fields={job.fields}
            imageScales={job.imageScales}
            imagePositions={job.imagePositions}
            templateId={template.id}
            mode="non-designer"
            exportRef={exportRef}
            onReady={handleCanvasReady}
          />
        </div>
      )}
    </div>
  )
}
