import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { loadLut } from '../api/_lib/cmykLut.js'
import { loadReverseLut, convertColor, cmykToRgb } from '../api/_lib/colorConvert.js'
import { validateLibrary, getBrandLibrary } from '../api/_lib/brandColors.js'

const p = f => fileURLToPath(new URL(`../api/icc/${f}`, import.meta.url))
const luts = { lut: loadLut(p('PSOcoated_v3.relcol-bpc.lut')), reverseLut: loadReverseLut(p('PSOcoated_v3.cmyk-to-srgb.lut')) }
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`)

test('CMYK -> RGB matches LittleCMS (PSO Coated v3, RelCol+BPC)', () => {
  // Reference values from Pillow ImageCms, same intent and flags.
  for (const [cmyk, ref] of [[[75, 0, 10, 0], [0, 179, 217]], [[72, 29, 1, 0], [59, 146, 203]], [[0, 0, 0, 100], [18, 18, 13]]]) {
    const [c, m, y, k] = cmyk
    const rgb = cmykToRgb({ c, m, y, k }, luts.reverseLut)
    near(rgb.r, ref[0], 3, 'R'); near(rgb.g, ref[1], 3, 'G'); near(rgb.b, ref[2], 3, 'B')
  }
})

test('one field in, all three out', () => {
  const fromHex = convertColor({ hex: '#3f96d1' }, luts)
  assert.equal(fromHex.hex, '#3F96D1')
  assert.deepEqual(fromHex.rgb, { r: 63, g: 150, b: 209 })
  near(fromHex.cmyk.c, 71, 1, 'C'); near(fromHex.cmyk.m, 27, 1, 'M')
  const fromRgb = convertColor({ rgb: { r: 63, g: 150, b: 209 } }, luts)
  assert.deepEqual(fromRgb, fromHex)
  const fromCmyk = convertColor({ cmyk: { c: 75, m: 0, y: 10, k: 0 } }, luts)
  assert.deepEqual(fromCmyk.cmyk, { c: 75, m: 0, y: 10, k: 0 })
  assert.match(fromCmyk.hex, /^#[0-9A-F]{6}$/)
  assert.throws(() => convertColor({ hex: 'blue' }, luts), /HEX/)
})

test('library validation keeps official pairs and rejects bad input', () => {
  const [wolt] = validateLibrary(getBrandLibrary('wolt'))
  assert.deepEqual(wolt.cmyk, { c: 75, m: 0, y: 10, k: 0 })
  assert.equal(wolt.hex, '#00C2E8')
  assert.throws(() => validateLibrary([{ hex: '#00C2E8', cmyk: { c: 75, m: 0, y: 10, k: 0 } }, { hex: '#00c2e8', cmyk: { c: 70, m: 0, y: 8, k: 0 } }]), /twice/)
  assert.throws(() => validateLibrary([{ hex: '#00C2E8', cmyk: { c: 175, m: 0, y: 10, k: 0 } }]), /0-100/)
  assert.throws(() => validateLibrary([{ hex: 'nope', cmyk: { c: 1, m: 0, y: 0, k: 0 } }]), /HEX/)
})
