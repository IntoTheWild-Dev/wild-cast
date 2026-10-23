// Print colours module: saved settings per brand (Vercel Blob,
// settings/print-colors/<brand>.json). See README.md in this folder.
//
// Record shape:
//   colors:   [{ hex, label, cmyk:{c,m,y,k}, lockHex, lockCmyk,
//                status:'draft'|'approved', approvedBy, approvedAt }]
//   printers: [{ id, name, label:'pdfx4'|'indesign', overrides:{ '#HEX': {c,m,y,k} } }]
//   defaultPrinter: 'standard' | printer id
//   history:  [{ at, by, summary }]   newest first, capped
// The code table in api/_lib/brandColors.js is the fallback whenever nothing
// is saved, Blob is unreachable, or the module is switched off.
import process from 'node:process'
import { list, put } from '@vercel/blob'
import { getBrandLibrary, hexToRgb } from '../brandColors.js'

const MAX_COLORS = 24
const MAX_PRINTERS = 12
const MAX_HISTORY = 50
export const STANDARD_PRINTER = { id: 'standard', name: 'Standard (PSO Coated v3, PDF/X-4)', label: 'pdfx4', overrides: {} }

const pathFor = brand => `settings/print-colors/${brand}.json`

export function normalizeBrand(brand) {
  const key = String(brand || '').trim().toLowerCase()
  return /^[a-z0-9-]{1,40}$/.test(key) ? key : null
}

function cleanCmyk(raw, where) {
  const cmyk = {}
  for (const ch of ['c', 'm', 'y', 'k']) {
    const v = Number(raw?.[ch])
    if (!Number.isFinite(v) || v < 0 || v > 100) throw new Error(`${where}: ${ch.toUpperCase()} must be 0-100`)
    cmyk[ch] = Math.round(v * 10) / 10
  }
  return cmyk
}

const cleanHex = hex => (hexToRgb(hex) ? '#' + String(hex).replace('#', '').trim().toUpperCase() : null)

// Throws plain-word Errors (shown to the admin as-is); returns clean data.
export function validateColors(colors) {
  if (!Array.isArray(colors)) throw new Error('colors must be a list')
  if (colors.length > MAX_COLORS) throw new Error(`At most ${MAX_COLORS} print colours`)
  const seen = new Set()
  return colors.map((e, i) => {
    const hex = cleanHex(e?.hex)
    if (!hex) throw new Error(`Colour ${i + 1}: HEX must look like #00C2E8`)
    if (seen.has(hex)) throw new Error(`${hex} is listed twice`)
    seen.add(hex)
    const approved = e?.status === 'approved'
    return {
      hex, cmyk: cleanCmyk(e?.cmyk, hex),
      label: String(e?.label || '').trim().slice(0, 40) || hex,
      lockHex: e?.lockHex !== false, lockCmyk: e?.lockCmyk !== false,
      status: approved ? 'approved' : 'draft',
      approvedBy: approved ? (e.approvedBy || null) : null,
      approvedAt: approved ? (e.approvedAt || null) : null,
    }
  })
}

export function validatePrinters(printers, colorHexes) {
  if (!Array.isArray(printers)) throw new Error('printers must be a list')
  if (printers.length > MAX_PRINTERS) throw new Error(`At most ${MAX_PRINTERS} printers`)
  const ids = new Set(['standard'])
  return printers.map((p, i) => {
    const name = String(p?.name || '').trim().slice(0, 60)
    if (!name) throw new Error(`Printer ${i + 1} needs a name`)
    let id = String(p?.id || name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || `printer-${i + 1}`
    while (ids.has(id)) id += '-2'
    ids.add(id)
    const overrides = {}
    for (const [rawHex, cmyk] of Object.entries(p?.overrides || {})) {
      const hex = cleanHex(rawHex)
      if (!hex) throw new Error(`${name}: bad colour ${rawHex}`)
      if (colorHexes && !colorHexes.has(hex)) continue  // colour was removed from the table
      overrides[hex] = cleanCmyk(cmyk, `${name} ${hex}`)
    }
    return { id, name, label: p?.label === 'indesign' ? 'indesign' : 'pdfx4', overrides }
  })
}

function defaultsFor(brand) {
  return validateColors(getBrandLibrary(brand).map(c => ({ ...c, status: 'approved', approvedBy: 'built-in' })))
}

async function readSaved(brand) {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) return null
  const path = pathFor(brand)
  const { blobs } = await list({ prefix: path, token })
  const match = blobs.find(b => b.pathname === path)
  if (!match) return null
  const r = await fetch(match.url + (match.url.includes('?') ? '&' : '?') + `_t=${Date.now()}`, { headers: { Authorization: `Bearer ${token}` } })
  return r.ok ? r.json() : null
}

// Full settings for the admin screen (and the export, via index.js).
export async function loadSettings(brand) {
  const key = normalizeBrand(brand)
  if (!key) throw new Error('Unknown brand')
  const saved = await readSaved(key)
  const colors = saved?.colors ? validateColors(saved.colors) : defaultsFor(key)
  const hexes = new Set(colors.map(c => c.hex))
  const printers = saved?.printers ? validatePrinters(saved.printers, hexes) : []
  const defaultPrinter = printers.some(p => p.id === saved?.defaultPrinter) ? saved.defaultPrinter : 'standard'
  return {
    brand: key, colors, printers, defaultPrinter,
    defaults: defaultsFor(key),
    history: Array.isArray(saved?.history) ? saved.history.slice(0, MAX_HISTORY) : [],
    updatedAt: saved?.updatedAt ?? null, updatedBy: saved?.updatedBy ?? null,
  }
}

function describeChanges(before, after) {
  const out = []
  const old = new Map(before.colors.map(c => [c.hex, c]))
  const fmt = c => `${c.cmyk.c}/${c.cmyk.m}/${c.cmyk.y}/${c.cmyk.k}`
  for (const c of after.colors) {
    const o = old.get(c.hex)
    if (!o) out.push(`added ${c.label} ${c.hex} = ${fmt(c)}`)
    else {
      if (fmt(o) !== fmt(c)) out.push(`${c.label}: ${fmt(o)} → ${fmt(c)}`)
      if (o.status !== c.status) out.push(`${c.label}: ${c.status}`)
    }
    old.delete(c.hex)
  }
  for (const c of old.values()) out.push(`removed ${c.label} ${c.hex}`)
  const oldP = new Map(before.printers.map(p => [p.id, JSON.stringify(p)]))
  for (const p of after.printers) if (oldP.get(p.id) !== JSON.stringify(p)) out.push(`printer ${p.name} updated`)
  if (before.defaultPrinter !== after.defaultPrinter) out.push(`default printer → ${after.defaultPrinter}`)
  return out.join('; ') || 'no changes'
}

// Saves colours + printers. Approval is stamped server-side: a colour sent
// as 'approved' that wasn't approved before (or whose CMYK changed) gets
// this caller and time; changing an approved colour's CMYK makes it a draft
// again unless the same save re-approves it.
export async function saveSettings(brand, { colors, printers = [], defaultPrinter = 'standard' }, by) {
  const key = normalizeBrand(brand)
  if (!key) throw new Error('Unknown brand')
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("Print colours can't be saved here: storage isn't connected.")
  const before = await loadSettings(key)
  const prev = new Map(before.colors.map(c => [c.hex, c]))
  const now = new Date().toISOString()
  const cleanColors = validateColors(colors).map(c => {
    const o = prev.get(c.hex)
    const sameValue = o && JSON.stringify(o.cmyk) === JSON.stringify(c.cmyk)
    if (c.status !== 'approved') return c
    if (o?.status === 'approved' && sameValue) return { ...c, approvedBy: o.approvedBy, approvedAt: o.approvedAt }
    return { ...c, approvedBy: by, approvedAt: now }
  })
  const hexes = new Set(cleanColors.map(c => c.hex))
  const cleanPrinters = validatePrinters(printers, hexes)
  const record = {
    brand: key, colors: cleanColors, printers: cleanPrinters,
    defaultPrinter: cleanPrinters.some(p => p.id === defaultPrinter) ? defaultPrinter : 'standard',
    updatedAt: now, updatedBy: by,
  }
  record.history = [{ at: now, by, summary: describeChanges(before, record) }, ...before.history].slice(0, MAX_HISTORY)
  await put(pathFor(key), JSON.stringify(record), {
    access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json',
    token: process.env.BLOB_READ_WRITE_TOKEN,
  })
  return { ...record, defaults: before.defaults }
}

// The ready-to-paste entry for api/_lib/brandColors.js ("Approve → code").
export function codeSnippet(brand, colors) {
  const approved = colors.filter(c => c.status === 'approved')
  const rows = approved.map(c => [
    '    {',
    `      hex: '${c.hex}',`,
    `      // ${c.label}. Approved ${c.approvedAt ? c.approvedAt.slice(0, 10) : ''} by ${c.approvedBy || 'unknown'} (Print colours setting).`,
    `      cmyk: { c: ${c.cmyk.c}, m: ${c.cmyk.m}, y: ${c.cmyk.y}, k: ${c.cmyk.k} },`,
    `      label: '${c.label.replace(/'/g, "\\'")}',`,
    '    },',
  ].join('\n'))
  return `  ${brand}: [\n${rows.join('\n')}\n  ],`
}
