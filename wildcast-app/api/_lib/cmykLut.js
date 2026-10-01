// sRGB -> CMYK via a precomputed Relative Colorimetric + BPC lookup table
// (see scripts/build-cmyk-lut.py). Used by the "CMYK-only" export instead of
// sharp's withIccProfile(), which is hard-wired to Perceptual intent and so
// shifts photos by dE ~2.5-3 against what InDesign / a print RIP produces.
import { Buffer } from 'node:buffer'
import { readFileSync } from 'fs'

const cache = new Map()

export function loadLut(path) {
  if (cache.has(path)) return cache.get(path)
  const file = readFileSync(path)
  if (file.toString('latin1', 0, 6) !== 'WCLUT1') throw new Error(`Not a WildCast LUT: ${path}`)
  const n = file[6]
  const table = file.subarray(7)
  if (table.length !== n * n * n * 4) throw new Error(`Truncated LUT: ${path}`)
  const lut = { n, table }
  cache.set(path, lut)
  return lut
}

// Tetrahedral interpolation (the standard for RGB cube LUTs - exact on the
// grid diagonal, so neutral greys stay on the grey axis).
export function applyLut(rgbBuffer, { n, table }) {
  const out = Buffer.alloc((rgbBuffer.length / 3) * 4)
  const scale = (n - 1) / 255
  const sR = n * n * 4, sG = n * 4, sB = 4
  for (let p = 0, o = 0; p < rgbBuffer.length; p += 3, o += 4) {
    const fr = rgbBuffer[p] * scale, fg = rgbBuffer[p + 1] * scale, fb = rgbBuffer[p + 2] * scale
    const r0 = Math.min(fr | 0, n - 2), g0 = Math.min(fg | 0, n - 2), b0 = Math.min(fb | 0, n - 2)
    const dr = fr - r0, dg = fg - g0, db = fb - b0
    const base = r0 * sR + g0 * sG + b0 * sB
    // Pick the tetrahedron containing (dr, dg, db): walk the cube edges in
    // descending order of the fractional parts.
    let a1, a2, w0, w1, w2, w3
    if (dr >= dg) {
      if (dg >= db) { a1 = sR; a2 = sR + sG; w1 = dr - dg; w2 = dg - db; w3 = db }
      else if (dr >= db) { a1 = sR; a2 = sR + sB; w1 = dr - db; w2 = db - dg; w3 = dg }
      else { a1 = sB; a2 = sR + sB; w1 = db - dr; w2 = dr - dg; w3 = dg }
    } else {
      if (db >= dg) { a1 = sB; a2 = sG + sB; w1 = db - dg; w2 = dg - dr; w3 = dr }
      else if (db >= dr) { a1 = sG; a2 = sG + sB; w1 = dg - db; w2 = db - dr; w3 = dr }
      else { a1 = sG; a2 = sR + sG; w1 = dg - dr; w2 = dr - db; w3 = db }
    }
    w0 = 1 - w1 - w2 - w3
    const a3 = sR + sG + sB
    for (let c = 0; c < 4; c++) {
      const i = base + c
      out[o + c] = Math.round(w0 * table[i] + w1 * table[i + a1] + w2 * table[i + a2] + w3 * table[i + a3])
    }
  }
  return out
}
