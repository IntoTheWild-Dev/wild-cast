// Brand color library — Phase 1 of the WildCast print-color fix (see
// wildcast-print-export-color-findings.md / the 2026-09-25 developer brief).
//
// Problem this solves: export-cmyk.js used to convert every on-screen hex to
// CMYK mathematically (via sharp's ICC profile conversion). That's correct
// for arbitrary colors, but brands define their official *print* CMYK (or a
// Pantone spot) separately from their screen hex — the print value can't be
// reliably derived by converting the hex, no matter the conversion settings.
//
// This is a manually-entered lookup table, per brand: { hex -> official
// print CMYK }. At export time (see applyBrandColorLibrary in export-cmyk.js),
// any pixel whose on-screen RGB exactly matches a hex here gets the stored
// value painted by a raster stencil with exact PDF CMYK operands.
// Anything not in the table falls back to the old conversion behavior,
// unchanged — see requirement 2/3 in the brief.
//
// Phase 1 scope is Wolt Blue only (client-confirmed, 2026-09-25). McDonald's
// and other partner colors are explicitly out of scope — do not add them
// here without a fresh client sign-off.
import process from 'node:process'
import { list, put } from '@vercel/blob'

export const BRAND_COLOR_LIBRARIES = {
  wolt: [
    {
      hex: '#00C2E8',
      // Official Wolt brand guide: C75 M0 Y10 K0 (matches Pantone 306).
      // Source: client-supplied brand guide, confirmed authoritative in the
      // 2026-09-25 brief (§5) — do not re-derive this by converting the hex.
      cmyk: { c: 75, m: 0, y: 10, k: 0 },
      label: 'Wolt Blue',
    },
  ],
}

export function getBrandLibrary(brand) {
  if (!brand) return []
  const key = String(brand).trim().toLowerCase()
  return Object.hasOwn(BRAND_COLOR_LIBRARIES, key) ? BRAND_COLOR_LIBRARIES[key] : []
}

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '')
  if (!m) return null
  const n = parseInt(m[1], 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

// Approximate backing-image bytes only. Exact PDF ink values use stencils.
export function cmykToBytes({ c, m, y, k }) {
  const toByte = pct => Math.round((pct / 100) * 255)
  return { c: toByte(c), m: toByte(m), y: toByte(y), k: toByte(k) }
}

// ── Admin-edited table (Print colours setting, 2026-10-23) ──────────────────
// Agency admins can lock press-tuned values (e.g. the patch Clarisse picks
// from the blue ladder) without a code change. Stored per brand in Blob at
// settings/brand-colors/<brand>.json; the code table above stays the
// fallback when nothing is saved or Blob is unreachable. Every export reads
// through loadBrandLibrary, so a saved change applies to the next export.

const MAX_COLORS = 24
const settingsPath = brand => `settings/brand-colors/${brand}.json`
const cache = new Map()  // brand -> { at, library }
const CACHE_MS = 30_000

export function normalizeBrand(brand) {
  const key = String(brand || '').trim().toLowerCase()
  return /^[a-z0-9-]{1,40}$/.test(key) ? key : null
}

// Throws a plain-word Error on bad input; returns the cleaned list.
export function validateLibrary(colors) {
  if (!Array.isArray(colors)) throw new Error('colors must be a list')
  if (colors.length > MAX_COLORS) throw new Error(`At most ${MAX_COLORS} print colours`)
  const seen = new Set()
  return colors.map((entry, i) => {
    const rgb = hexToRgb(entry?.hex)
    if (!rgb) throw new Error(`Colour ${i + 1}: HEX must look like #00C2E8`)
    const hex = '#' + String(entry.hex).replace('#', '').toUpperCase()
    if (seen.has(hex)) throw new Error(`${hex} is listed twice`)
    seen.add(hex)
    const cmyk = {}
    for (const ch of ['c', 'm', 'y', 'k']) {
      const v = Number(entry?.cmyk?.[ch])
      if (!Number.isFinite(v) || v < 0 || v > 100) throw new Error(`${hex}: ${ch.toUpperCase()} must be 0-100`)
      cmyk[ch] = Math.round(v * 10) / 10
    }
    const label = String(entry?.label || '').trim().slice(0, 40) || hex
    return { hex, cmyk, label, lockHex: entry?.lockHex !== false, lockCmyk: entry?.lockCmyk !== false }
  })
}

async function readSaved(brand) {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) return null
  const path = settingsPath(brand)
  const { blobs } = await list({ prefix: path, token })
  const match = blobs.find(b => b.pathname === path)
  if (!match) return null
  const r = await fetch(match.url + (match.url.includes('?') ? '&' : '?') + `_t=${Date.now()}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) return null
  return r.json()
}

// The library the export uses: the saved table if there is one, else the code
// defaults. Never throws - a Blob hiccup must not change export colours.
export async function loadBrandLibrary(brand) {
  const key = normalizeBrand(brand)
  if (!key) return []
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.library
  let library = getBrandLibrary(key)
  try {
    const saved = await readSaved(key)
    if (saved?.colors) library = validateLibrary(saved.colors)
  } catch (err) {
    console.error('loadBrandLibrary: using code defaults', err)
  }
  cache.set(key, { at: Date.now(), library })
  return library
}

export async function loadBrandSettings(brand) {
  const key = normalizeBrand(brand)
  const saved = key ? await readSaved(key) : null
  return {
    brand: key,
    colors: saved?.colors ? validateLibrary(saved.colors) : validateLibrary(getBrandLibrary(key)),
    defaults: validateLibrary(getBrandLibrary(key)),
    updatedAt: saved?.updatedAt ?? null,
    updatedBy: saved?.updatedBy ?? null,
  }
}

export async function saveBrandSettings(brand, colors, updatedBy) {
  const key = normalizeBrand(brand)
  if (!key) throw new Error('Unknown brand')
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("Print colours can't be saved here: storage isn't connected.")
  const record = { brand: key, colors: validateLibrary(colors), updatedAt: new Date().toISOString(), updatedBy: updatedBy || null }
  await put(settingsPath(key), JSON.stringify(record), {
    access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json',
    token: process.env.BLOB_READ_WRITE_TOKEN,
  })
  cache.delete(key)
  return record
}
