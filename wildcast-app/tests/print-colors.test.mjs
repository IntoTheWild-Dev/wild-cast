// Run with: npm test
// Print colours module, pure parts: conversion, calibration grid, relabelling.
import { test } from 'node:test'
import { Buffer } from 'node:buffer'
import { inflateSync } from 'node:zlib'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PDFDocument, PDFName } from 'pdf-lib'
import { loadLut } from '../api/_lib/cmykLut.js'
import { loadReverseLut, convertColor, cmykToRgb } from '../api/_lib/printColors/convert.js'
import { calibrationGrid, patchByCode, calibrationSheetPdf } from '../api/_lib/printColors/calibration.js'
import { relabelLikeInDesign } from '../api/_lib/printColors/relabel.js'
import { validateColors, validatePrinters, codeSnippet } from '../api/_lib/printColors/store.js'

const p = f => fileURLToPath(new URL(`../api/icc/${f}`, import.meta.url))
const luts = { lut: loadLut(p('PSOcoated_v3.relcol-bpc.lut')), reverseLut: loadReverseLut(p('PSOcoated_v3.cmyk-to-srgb.lut')) }
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`)

test('CMYK -> RGB matches LittleCMS (PSO Coated v3, RelCol+BPC)', () => {
  for (const [[c, m, y, k], ref] of [[[75, 0, 10, 0], [0, 179, 217]], [[72, 29, 1, 0], [59, 146, 203]], [[0, 0, 0, 100], [18, 18, 13]]]) {
    const rgb = cmykToRgb({ c, m, y, k }, luts.reverseLut)
    near(rgb.r, ref[0], 3, 'R'); near(rgb.g, ref[1], 3, 'G'); near(rgb.b, ref[2], 3, 'B')
  }
})

test('one field in, all three out', () => {
  const fromHex = convertColor({ hex: '#3f96d1' }, luts)
  assert.equal(fromHex.hex, '#3F96D1')
  assert.deepEqual(fromHex.rgb, { r: 63, g: 150, b: 209 })
  near(fromHex.cmyk.c, 71, 1, 'C')
  assert.deepEqual(convertColor({ rgb: fromHex.rgb }, luts), fromHex)
  assert.deepEqual(convertColor({ cmyk: { c: 75, m: 0, y: 10, k: 0 } }, luts).cmyk, { c: 75, m: 0, y: 10, k: 0 })
  assert.throws(() => convertColor({ hex: 'blue' }, luts), /HEX/)
})

test('calibration grid: D3 is the current value, rows lighter -> darker, columns shift hue', () => {
  const base = { c: 75, m: 0, y: 10, k: 0 }
  const { patches, current, axis } = calibrationGrid(base)
  assert.equal(patches.length, 30)
  assert.equal(current, 'D3')
  assert.deepEqual(patchByCode(base, 'd3').cmyk, base)
  assert.deepEqual(axis, { minus: 'm', plus: 'y' })  // cyan blue: magenta <-> yellow
  assert.ok(patchByCode(base, 'A3').cmyk.c < patchByCode(base, 'F3').cmyk.c)
  assert.equal(patchByCode(base, 'D1').cmyk.m, 6)
  assert.equal(patchByCode(base, 'D5').cmyk.y, 16)
  assert.equal(patchByCode(base, 'Z9'), null)
})

test('calibration sheet is a one-page A4 PDF with the InDesign-style intent', async () => {
  const pdf = await calibrationSheetPdf({ label: 'Wolt Blue', hex: '#00C2E8', cmyk: { c: 75, m: 0, y: 10, k: 0 }, iccProfile: readFileSync(p('PSOcoated_v3.icc')) })
  const doc = await PDFDocument.load(pdf)
  assert.equal(doc.getPageCount(), 1)
  assert.equal(Math.round(doc.getPage(0).getWidth()), 595)
  const raw = pdf.toString('latin1')
  const content = [...raw.matchAll(/stream\r?\n/g)].map(m => {
    try { return inflateSync(Buffer.from(raw.slice(m.index + m[0].length, raw.indexOf('endstream', m.index)), 'latin1')).toString('latin1') } catch { return '' }
  }).join('\n')
  assert.match(content, /0\.75 0 0\.1 0 k/)  // the D3 patch is the exact current ink
  const intent = doc.context.lookup(doc.context.lookup(doc.catalog.get(PDFName.of('OutputIntents'))).get(0))
  assert.equal(intent.get(PDFName.of('OutputConditionIdentifier')).decodeText(), 'PSO Coated v3')
})

test('relabel: same content, not marked PDF/X, intent named PSO Coated v3', async () => {
  // Build a tiny PDF/X-4-style file the way the exports do.
  const doc = await PDFDocument.create()
  doc.addPage([100, 100]).drawRectangle({ x: 0, y: 0, width: 50, height: 50 })
  const ctx = doc.context
  ctx.trailerInfo.Info = ctx.register(ctx.obj({ GTS_PDFXVersion: 'PDF/X-4', Trapped: 'False' }))
  doc.catalog.set(PDFName.of('OutputIntents'), ctx.obj([ctx.obj({ Type: 'OutputIntent', S: 'GTS_PDFX', OutputConditionIdentifier: 'FOGRA51' })]))
  doc.catalog.set(PDFName.of('Metadata'), ctx.register(ctx.stream('<x><pdfxid:GTS_PDFXVersion>PDF/X-4</pdfxid:GTS_PDFXVersion></x>', { Type: 'Metadata', Subtype: 'XML' })))
  const out = await relabelLikeInDesign(Buffer.from(await doc.save()))
  const s = out.toString('latin1')
  assert.equal(s.slice(0, 8), '%PDF-1.6')
  assert.doesNotMatch(s, /GTS_PDFXVersion/)
  assert.match(s, /OutputConditionIdentifier \(PSO Coated v3\)/)
})

test('validation and code snippet', () => {
  const colors = validateColors([{ hex: '#00c2e8', label: 'Wolt Blue', cmyk: { c: 75, m: 0, y: 10, k: 0 }, status: 'approved', approvedBy: 'x', approvedAt: '2026-10-23T00:00:00Z' }])
  assert.equal(colors[0].hex, '#00C2E8')
  assert.throws(() => validateColors([colors[0], colors[0]]), /twice/)
  assert.throws(() => validateColors([{ hex: '#00C2E8', cmyk: { c: 120, m: 0, y: 0, k: 0 } }]), /0-100/)
  const printers = validatePrinters([{ name: 'Clarisse – digital', label: 'indesign', overrides: { '#00c2e8': { c: 70, m: 0, y: 8, k: 0 }, '#123456': { c: 1, m: 1, y: 1, k: 1 } } }], new Set(['#00C2E8']))
  assert.equal(printers[0].id, 'clarisse-digital')
  assert.deepEqual(Object.keys(printers[0].overrides), ['#00C2E8'])  // removed colours are dropped
  assert.match(codeSnippet('wolt', colors), /cmyk: \{ c: 75, m: 0, y: 10, k: 0 \}/)
})
