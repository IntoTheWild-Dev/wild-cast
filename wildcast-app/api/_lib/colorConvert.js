// HEX <-> RGB <-> CMYK for the Print colours setting (api/brand-colors.js).
// Both directions go through the same press profile the export uses
// (PSO Coated v3, Relative Colorimetric + BPC, precomputed with LittleCMS):
//   sRGB -> CMYK: api/icc/PSOcoated_v3.relcol-bpc.lut   (scripts/build-cmyk-lut.py)
//   CMYK -> sRGB: api/icc/PSOcoated_v3.cmyk-to-srgb.lut (scripts/build-cmyk-to-rgb-lut.py)
// These are suggestions for the linked fields only. A locked value an admin
// typed (e.g. the brand book's 75/0/10/0) is never replaced by a conversion.
import { Buffer } from 'node:buffer'
import { readFileSync } from 'node:fs'
import { applyLut } from './cmykLut.js'

const reverseCache = new Map()

export function loadReverseLut(path) {
  if (reverseCache.has(path)) return reverseCache.get(path)
  const file = readFileSync(path)
  if (file.toString('latin1', 0, 7) !== 'WCRLUT1') throw new Error(`Not a WildCast reverse LUT: ${path}`)
  const n = file[7]
  const table = file.subarray(8)
  if (table.length !== n ** 4 * 3) throw new Error(`Truncated reverse LUT: ${path}`)
  const lut = { n, table }
  reverseCache.set(path, lut)
  return lut
}

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

export function rgbToHex({ r, g, b }) {
  return '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('').toUpperCase()
}

// rgb 0-255 -> cmyk percentages (whole numbers, like InDesign's swatch panel)
export function rgbToCmyk({ r, g, b }, lut) {
  const out = applyLut(Buffer.from([r, g, b].map(v => clamp(Math.round(v), 0, 255))), lut)
  const [c, m, y, k] = [...out].map(v => Math.round(v / 2.55))
  return { c, m, y, k }
}

// cmyk percentages -> rgb 0-255, quadrilinear over the 4D grid
export function cmykToRgb({ c, m, y, k }, { n, table }) {
  const f = [c, m, y, k].map(v => (clamp(Number(v) || 0, 0, 100) / 100) * (n - 1))
  const i0 = f.map(v => Math.min(Math.floor(v), n - 2))
  const d = f.map((v, j) => v - i0[j])
  const strides = [n ** 3 * 3, n ** 2 * 3, n * 3, 3]
  const rgb = [0, 0, 0]
  for (let corner = 0; corner < 16; corner++) {
    let w = 1
    let base = 0
    for (let j = 0; j < 4; j++) {
      const bit = (corner >> (3 - j)) & 1
      w *= bit ? d[j] : 1 - d[j]
      base += (i0[j] + bit) * strides[j]
    }
    if (w === 0) continue
    for (let ch = 0; ch < 3; ch++) rgb[ch] += w * table[base + ch]
  }
  return { r: Math.round(rgb[0]), g: Math.round(rgb[1]), b: Math.round(rgb[2]) }
}

// One entry point for the linked fields: give any one of hex / rgb / cmyk,
// get all three back.
export function convertColor(input, { lut, reverseLut }) {
  if (input.hex != null) {
    const rgb = hexToRgb(input.hex)
    if (!rgb) throw new Error('HEX must look like #00C2E8')
    return { hex: rgbToHex(rgb), rgb, cmyk: rgbToCmyk(rgb, lut) }
  }
  if (input.rgb) {
    const rgb = { r: toInt(input.rgb.r, 255), g: toInt(input.rgb.g, 255), b: toInt(input.rgb.b, 255) }
    return { hex: rgbToHex(rgb), rgb, cmyk: rgbToCmyk(rgb, lut) }
  }
  if (input.cmyk) {
    const cmyk = { c: toInt(input.cmyk.c, 100), m: toInt(input.cmyk.m, 100), y: toInt(input.cmyk.y, 100), k: toInt(input.cmyk.k, 100) }
    const rgb = cmykToRgb(cmyk, reverseLut)
    return { hex: rgbToHex(rgb), rgb, cmyk }
  }
  throw new Error('Send one of hex, rgb or cmyk')
}

function toInt(v, max) {
  const n = Number(v)
  if (!Number.isFinite(n)) throw new Error('Colour values must be numbers')
  return clamp(Math.round(n), 0, max)
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v))
}
