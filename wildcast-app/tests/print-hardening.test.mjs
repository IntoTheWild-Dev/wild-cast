// Run with: npm test
// Hardening of the print pipeline (2026-10-24 review): photo JPEG + mask,
// gradients to CMYK, CSS colour parsing + text opacity, template page
// normalisation, rotated templates refused, and the streamed PDF response.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { inflateSync } from 'node:zlib'
import sharp from 'sharp'
import { PDFDocument, PDFName, PDFRawStream, degrees } from 'pdf-lib'
import { buildLayeredPdf, parseCssColor } from '../api/_lib/layeredPdf.js'
import { loadLut } from '../api/_lib/cmykLut.js'
import { getBrandLibrary } from '../api/_lib/brandColors.js'
import handler from '../api/export-cmyk.js'

const api = p => fileURLToPath(new URL(`../api/${p}`, import.meta.url))
const PAGE = { PT_W: 314.646, PT_H: 436.535, BLEED_PT: 8.504 }
const lut = loadLut(api('icc/PSOcoated_v3.relcol-bpc.lut'))

async function template({ size = [PAGE.PT_W, PAGE.PT_H], gradient = false, rotate = 0 } = {}) {
  const doc = await PDFDocument.create()
  const page = doc.addPage(size)
  const ctx = doc.context
  const res = {}
  let art = '0 0.760784 0.909804 rg 0 0 10 10 re f'
  if (gradient) {
    const fn = ctx.obj({ FunctionType: 2, Domain: [0, 1], C0: [0, 0.760784, 0.909804], C1: [1, 1, 1], N: 1 })
    res.Shading = { Sh0: ctx.obj({ ShadingType: 2, ColorSpace: 'DeviceRGB', Coords: [0, 0, 100, 0], Function: fn }) }
    art += '\n/Sh0 sh'
  }
  page.node.set(PDFName.of('Resources'), ctx.obj(res))
  page.node.set(PDFName.of('Contents'), ctx.register(ctx.flateStream(Buffer.from(art))))
  if (rotate) page.setRotation(degrees(rotate))
  return Buffer.from(await doc.save())
}

const build = (templatePdf, items = [], mode = 'print') => buildLayeredPdf({
  templatePdf, layout: { canvasW: 316, canvasH: 441, items }, mode,
  library: getBrandLibrary('wolt'), lut,
  iccProfile: readFileSync(api('icc/PSOcoated_v3.icc')),
  profileMeta: { identifier: 'FOGRA51', info: 'PSO Coated v3 FOGRA51 \\(ISO 12647-2:2013\\)' },
  fontsDir: api('fonts/wolt'), srgbIcc: readFileSync(api('icc/sRGB_IEC61966-2-1.icc')), page: PAGE,
})

function streams(doc) {
  const out = []
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue
    const raw = Buffer.from(obj.getContents())
    let text
    try { text = inflateSync(raw).toString('latin1') } catch { text = raw.toString('latin1') }
    out.push({ dict: obj.dict, text })
  }
  return out
}

test('CSS colours parse like the canvas; unreadable is black, never white', () => {
  assert.deepEqual(parseCssColor('#FFF'), { r: 255, g: 255, b: 255, a: 1 })
  assert.deepEqual(parseCssColor('#000'), { r: 0, g: 0, b: 0, a: 1 })
  assert.deepEqual(parseCssColor('#00C2E8'), { r: 0, g: 194, b: 232, a: 1 })
  assert.equal(parseCssColor('#00C2E880').a.toFixed(2), '0.50')
  assert.deepEqual(parseCssColor('rgba(255, 255, 255, 0.75)'), { r: 255, g: 255, b: 255, a: 0.75 })
  assert.deepEqual(parseCssColor('rgb(0,194,232)'), { r: 0, g: 194, b: 232, a: 1 })
  assert.deepEqual(parseCssColor('nonsense'), { r: 0, g: 0, b: 0, a: 1 })
})

test('photo as JPEG + separate alpha mask: CMYK/sRGB image with a soft mask from the mask', async () => {
  const w = 40, h = 20
  const jpg = await sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 60, b: 30 } } }).jpeg({ quality: 92 }).toBuffer()
  const mask = Buffer.alloc(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w / 2; x++) mask[y * w + x] = 255
  const maskPng = await sharp(mask, { raw: { width: w, height: h, channels: 1 } }).png().toBuffer()
  const items = [{ type: 'image', box: [40, 150, 120, 60], src: 'data:image/jpeg;base64,' + jpg.toString('base64'), alpha: 'data:image/png;base64,' + maskPng.toString('base64') }]
  const { pdf } = await build(await template(), items)
  const doc = await PDFDocument.load(pdf)
  const img = streams(doc).find(s => String(s.dict.get(PDFName.of('Subtype'))) === '/Image' && s.dict.has(PDFName.of('SMask')))
  assert.ok(img, 'image with soft mask')
  const sm = doc.context.lookup(img.dict.get(PDFName.of('SMask')))
  const alpha = inflateSync(Buffer.from(sm.getContents()))
  assert.equal(alpha[0], 255)
  assert.equal(alpha[w - 1], 0)
})

test('RGB gradient becomes a CMYK gradient with exact brand stops', async () => {
  const { pdf, unverifiedColorCount } = await build(await template({ gradient: true }))
  const doc = await PDFDocument.load(pdf)
  const shading = doc.getPage(0).node.Resources().lookup(PDFName.of('Shading')).lookup(PDFName.of('Sh0'))
  assert.equal(String(shading.get(PDFName.of('ColorSpace'))), '/DeviceCMYK')
  const fn = doc.context.lookup(shading.get(PDFName.of('Function')))
  assert.deepEqual(fn.lookup(PDFName.of('C0')).asArray().map(n => n.asNumber()), [0.75, 0, 0.1, 0])
  assert.deepEqual(fn.lookup(PDFName.of('C1')).asArray().map(n => n.asNumber()), [0, 0, 0, 0])
  assert.equal(unverifiedColorCount, 0)
})

test('a template of another size is scaled onto the bleed box; a rotated one is refused', async () => {
  const { pdf } = await build(await template({ size: [PAGE.PT_W / 2, PAGE.PT_H / 2] }))
  const doc = await PDFDocument.load(pdf)
  assert.ok(streams(doc).some(s => /^q 2 0 0 2 0 0 cm/.test(s.text)), 'template wrapped in a 2x placement')
  await assert.rejects(build(await template({ rotate: 90 })), /rotated/)
})

test('text colour alpha and object opacity become a /ca graphics state', async () => {
  const items = [{ type: 'text', fontFamily: 'omnes-pro', fontWeight: 700, fontSize: 20, fill: 'rgba(255,255,255,0.5)', opacity: 0.8,
    charSpacing: 0, matrix: [1, 0, 0, 1, 158, 80], lines: [{ text: 'Hallo', x: -20, y: 5 }] }]
  const { pdf } = await build(await template(), items)
  const doc = await PDFDocument.load(pdf)
  const overlay = streams(doc).map(s => s.text).find(t => /BT /.test(t))
  assert.match(overlay, /\/WCGs400 gs 0 0 0 0 k BT/)
  const gs = doc.getPage(0).node.Resources().lookup(PDFName.of('ExtGState')).lookup(PDFName.of('WCGs400'))
  assert.equal(gs.get(PDFName.of('ca')).asNumber(), 0.4)
})

test('export response is streamed in chunks with the right length', async () => {
  const png = await sharp({ create: { width: 1241, height: 1749, channels: 3, background: { r: 0, g: 194, b: 232 } } }).png().toBuffer()
  const chunks = []
  const res = await new Promise(resolve => {
    const r = {
      headers: {}, setHeader(k, v) { this.headers[k] = v }, status(c) { this.code = c; return this },
      write(b) { chunks.push(Buffer.from(b)) }, end() { resolve(this) }, json(d) { this.body = d; resolve(this) },
    }
    handler({ method: 'POST', body: { png: png.toString('base64'), brand: 'wolt' } }, r)
  })
  assert.equal(res.code, 200)
  const body = Buffer.concat(chunks)
  assert.equal(body.subarray(0, 5).toString(), '%PDF-')
  assert.equal(Number(res.headers['Content-Length']), body.length)
})

test('export refuses a non-string filename instead of crashing', async () => {
  const res = await new Promise(resolve => handler({ method: 'POST', body: { png: 'x', filename: 42 } }, {
    status(c) { this.code = c; return this }, json(d) { this.body = d; resolve(this) },
  }))
  assert.equal(res.code, 400)
})

test('tokenizer never hangs on damaged content (unterminated hex string / literal / inline image)', async () => {
  const { tokenize } = await import('../api/_lib/layeredPdf.js')
  for (const bad of ['1 0 0 rg <4142', '(unterminated', 'BI /W 1 ID xx', '<< /A <00', '%only a comment']) {
    const t0 = Date.now()
    tokenize(bad)
    assert.ok(Date.now() - t0 < 200, `tokenize(${JSON.stringify(bad)}) returned`)
  }
})
