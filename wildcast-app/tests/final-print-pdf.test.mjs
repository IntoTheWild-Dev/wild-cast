import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PDFDocument, PDFName } from 'pdf-lib'
import { buildLayeredPdf } from '../api/_lib/layeredPdf.js'
import { getBrandLibrary } from '../api/_lib/brandColors.js'
import { loadLut } from '../api/_lib/cmykLut.js'
import { preflightPdf } from '../api/_lib/preflight.js'
import { finalizePrintPdf } from '../api/_lib/finalPrintPdf.js'
const api = path => new URL(`../api/${path}`, import.meta.url)
const lut = loadLut(api('icc/PSOcoated_v3.relcol-bpc.lut'))
async function fixture(ink = '0.75 0 0.1 0') {
  const template = await PDFDocument.create()
  const page = template.addPage([314.646, 436.535])
  page.node.set(PDFName.of('Resources'), template.context.obj({}))
  page.node.set(PDFName.of('Contents'), template.context.register(template.context.flateStream(Buffer.from(`${ink} k 0 0 314 436 re f`))))
  return (await buildLayeredPdf({
    templatePdf: await template.save(), layout: { canvasW: 316, canvasH: 441, items: [] }, mode: 'cmyk',
    lut, library: getBrandLibrary('wolt'), iccProfile: readFileSync(api('icc/PSOcoated_v3.icc')),
    profileMeta: { identifier: 'FOGRA51', info: 'PSO Coated v3' }, fontsDir: api('fonts/wolt'),
    srgbIcc: readFileSync(api('icc/sRGB_IEC61966-2-1.icc')), page: { PT_W: 314.646, PT_H: 436.535, BLEED_PT: 8.504 },
  })).pdf
}
const options = { printer: { label: 'pdfx4' }, mode: 'cmyk', lut, iccProfile: readFileSync(api('icc/PSOcoated_v3.icc')) }

test('valid CMYK PDF remains downloadable without changing its bytes', async () => {
  const bytes = await fixture()
  assert.deepEqual((await finalizePrintPdf(bytes, options)).pdf, bytes)
})

test('outlined reference text remains vector and needs no font program', async () => {
  const doc = await PDFDocument.load(await fixture())
  const ctx = doc.context, page = doc.getPage(0)
  // An outlined glyph is a path inside a form, not a text object.
  const outline = ctx.register(ctx.flateStream(Buffer.from('0 0 0 1 k 0 0 m 5 12 l 10 0 l h f'), {
    Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 10, 12], Resources: {},
  }))
  page.node.Resources().set(PDFName.of('XObject'), ctx.obj({ Outline: outline }))
  page.node.set(PDFName.of('Contents'), ctx.register(ctx.flateStream(Buffer.from('0.75 0 0.1 0 k 0 0 314 436 re f q 1 0 0 1 30 30 cm /Outline Do Q'))))
  const bytes = await doc.save()
  const result = await finalizePrintPdf(bytes, options)
  assert.deepEqual(result.pdf, bytes, 'finalization must not rasterize or rewrite outlines')
  const report = await preflightPdf(result.pdf, { lut, requireCmyk: true })
  assert.equal(report.checks.find(c => c.id === 'fonts').status, 'pass')
  assert.equal(report.checks.find(c => c.id === 'cmyk').status, 'pass')
})
test('preflight examines the final printer-labelled PDF, not the earlier PDF/X file', async () => {
  const bytes = await fixture()
  await assert.rejects(finalizePrintPdf(bytes, { ...options, printer: { label: 'plain' } }), e => e.status === 422 && /PDF\/X-4/.test(e.message))
  const digital = await finalizePrintPdf(bytes, { ...options, mode: 'print', printer: { label: 'plain' } })
  assert.ok(digital.problems.some(p => p.id === 'pdfx'))
})
test('ink violations and parser failures cannot return an unchecked print PDF', async () => {
  await assert.rejects(finalizePrintPdf(await fixture('0.9 0.9 0.9 0.9'), options), e => e.status === 422 && /Total ink/.test(e.message))
  await assert.rejects(finalizePrintPdf(Buffer.from('broken'), options), e => e.status === 503)
})
test('tagged RGB passes the managed-RGB check but fails CMYK-only validation', async () => {
  const doc = await PDFDocument.load(await fixture())
  const ctx = doc.context
  const icc = ctx.register(ctx.flateStream(readFileSync(api('icc/sRGB_IEC61966-2-1.icc')), { N: 3 }))
  const image = ctx.register(ctx.flateStream(Buffer.from([20, 100, 200]), { Type: 'XObject', Subtype: 'Image', Width: 1, Height: 1, BitsPerComponent: 8, ColorSpace: ['ICCBased', icc] }))
  const page = doc.getPage(0)
  page.node.Resources().set(PDFName.of('XObject'), ctx.obj({ RGB: image }))
  page.node.set(PDFName.of('Contents'), ctx.register(ctx.flateStream(Buffer.from('q 0.2 0 0 0.2 30 30 cm /RGB Do Q 0.75 0 0.1 0 k 0 0 10 10 re f'))))
  const bytes = await doc.save()
  const report = await preflightPdf(bytes, { lut, requireCmyk: true })
  assert.equal(report.checks.find(c => c.id === 'rgb').status, 'pass')
  assert.equal(report.checks.find(c => c.id === 'cmyk').status, 'fail')
  await assert.rejects(finalizePrintPdf(bytes, options), /CMYK-only colour content/)
})

test('a correctly labelled PDF with a different ICC binary is rejected', async () => {
  await assert.rejects(finalizePrintPdf(await fixture(), { ...options, iccProfile: readFileSync(api('icc/ISOcoated_v2_eci.icc')) }), e => e.status === 422 && /Selected output ICC/.test(e.message))
})

test('unused RGB state does not reject CMYK painting; a form reused under RGB does', async () => {
  const doc = await PDFDocument.load(await fixture())
  const ctx = doc.context, page = doc.getPage(0)
  const resources = page.node.Resources()
  const form = ctx.register(ctx.flateStream(Buffer.from('0 0 10 10 re f'), { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 10, 10], Resources: {} }))
  resources.set(PDFName.of('XObject'), ctx.obj({ Art: form }))
  const setContent = text => page.node.set(PDFName.of('Contents'), ctx.register(ctx.flateStream(Buffer.from(text))))
  setContent('1 0 0 rg 0.75 0 0.1 0 k /Art Do')
  assert.equal((await preflightPdf(await doc.save(), { lut, requireCmyk: true })).checks.find(c => c.id === 'cmyk').status, 'pass')
  setContent('0.75 0 0.1 0 k /Art Do 1 0 0 rg /Art Do')
  assert.equal((await preflightPdf(await doc.save(), { lut, requireCmyk: true })).checks.find(c => c.id === 'cmyk').status, 'fail')
})

test('absent page boxes cannot pass as explicitly set trim/bleed boxes', async () => {
  const doc = await PDFDocument.load(await fixture())
  doc.getPage(0).node.delete(PDFName.of('TrimBox'))
  await assert.rejects(finalizePrintPdf(await doc.save(), options), /Trim and bleed boxes/)
})

test('Type3 accessibility text is not mistaken for painted RGB, but coloured glyphs are checked', async () => {
  for (const [glyph, expected] of [
    ['500 0 0 0 10 10 d1', 'pass'],
    ['500 0 d0 0.75 0 0.1 0 k 0 0 10 10 re f', 'pass'],
    ['500 0 d0 1 0 0 rg 0 0 10 10 re f', 'fail'],
  ]) {
    const doc = await PDFDocument.load(await fixture())
    const ctx = doc.context, page = doc.getPage(0)
    const proc = ctx.register(ctx.flateStream(Buffer.from(glyph)))
    const font = ctx.register(ctx.obj({ Type: 'Font', Subtype: 'Type3', FontBBox: [0, 0, 500, 500], FontMatrix: [0.001, 0, 0, 0.001, 0, 0], FirstChar: 65, LastChar: 65, Widths: [500], CharProcs: { A: proc }, Encoding: { Type: 'Encoding', Differences: [65, 'A'] }, Resources: {} }))
    page.node.Resources().set(PDFName.of('Font'), ctx.obj({ Glyph: font }))
    page.node.set(PDFName.of('Contents'), ctx.register(ctx.flateStream(Buffer.from('1 0 0 rg BT /Glyph 12 Tf (A) Tj ET'))))
    const report = await preflightPdf(await doc.save(), { lut, requireCmyk: true })
    assert.equal(report.checks.find(c => c.id === 'cmyk').status, expected, glyph)
  }
})

test('isolated over-ink pixels cannot be missed by downsampled validation', async () => {
  const doc = await PDFDocument.load(await fixture())
  const ctx = doc.context, page = doc.getPage(0)
  const samples = Buffer.alloc(1200 * 4)
  for (let x = 0; x < 1200; x++) samples[x * 4 + 3] = 255
  samples.fill(255, 0, 4) // One 400% pixel amongst otherwise K-only pixels.
  const image = ctx.register(ctx.flateStream(samples, { Type: 'XObject', Subtype: 'Image', Width: 1200, Height: 1, BitsPerComponent: 8, ColorSpace: 'DeviceCMYK' }))
  page.node.Resources().set(PDFName.of('XObject'), ctx.obj({ Ink: image }))
  page.node.set(PDFName.of('Contents'), ctx.register(ctx.flateStream(Buffer.from('0.75 0 0.1 0 k 0 0 10 10 re f q 288 0 0 0.24 0 0 cm /Ink Do Q'))))
  const bytes = await doc.save()
  const report = await preflightPdf(bytes, { lut, requireCmyk: true })
  assert.equal(report.inkMax, 400)
  await assert.rejects(finalizePrintPdf(bytes, options), /Total ink/)
})

test('form resource inheritance cannot hide RGB images from strict validation', async () => {
  const doc = await PDFDocument.load(await fixture())
  const ctx = doc.context, page = doc.getPage(0)
  const rgb = ctx.register(ctx.flateStream(Buffer.from([20, 100, 200]), { Type: 'XObject', Subtype: 'Image', Width: 1, Height: 1, BitsPerComponent: 8, ColorSpace: 'DeviceRGB' }))
  // A form without its own Resources uses the parent's resources.
  const form = ctx.register(ctx.flateStream(Buffer.from('q 0.2 0 0 0.2 0 0 cm /Photo Do Q'), { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 10, 10] }))
  page.node.Resources().set(PDFName.of('XObject'), ctx.obj({ Photo: rgb, Art: form }))
  page.node.set(PDFName.of('Contents'), ctx.register(ctx.flateStream(Buffer.from('/Art Do'))))
  await assert.rejects(finalizePrintPdf(await doc.save(), options), /CMYK-only colour content/)
  page.node.set(PDFName.of('Contents'), ctx.register(ctx.flateStream(Buffer.from('/Missing Do'))))
  await assert.rejects(finalizePrintPdf(await doc.save(), options), /Page content can be checked/)
})
