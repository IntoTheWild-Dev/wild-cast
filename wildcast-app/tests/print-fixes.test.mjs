// Run with: npm test
// Annika's ready-for-Wolt checklist (2026-10-27): 1 photos to CMYK + ~300 ppi
// at printed size, 2 black = 100% K overprint / rich black for large areas,
// 3 unknown colours listed before download; plus CMYK upload conversion.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { inflateSync } from 'node:zlib'
import sharp from 'sharp'
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib'
import { buildLayeredPdf, recolorContent, RICH_BLACK } from '../api/_lib/layeredPdf.js'
import { loadLut } from '../api/_lib/cmykLut.js'
import { getBrandLibrary } from '../api/_lib/brandColors.js'

process.env.WILDCAST_KEYS = 'TEST-KEY|Test|100|agency'

const api = p => fileURLToPath(new URL(`../api/${p}`, import.meta.url))
const PAGE = { PT_W: 314.646, PT_H: 436.535, BLEED_PT: 8.504 }
const lut = loadLut(api('icc/PSOcoated_v3.relcol-bpc.lut'))
const map = (r, g, b) => ({ cmyk: r <= 12 && g <= 12 && b <= 12 ? [0, 0, 0, 1] : [0.5, 0.5, 0, 0] })

const build = (templatePdf, mode, items = []) => buildLayeredPdf({
  templatePdf, layout: { canvasW: 316, canvasH: 441, items }, mode,
  library: getBrandLibrary('wolt'), lut,
  iccProfile: readFileSync(api('icc/PSOcoated_v3.icc')),
  profileMeta: { identifier: 'FOGRA51', info: 'x' },
  fontsDir: api('fonts/wolt'), srgbIcc: readFileSync(api('icc/sRGB_IEC61966-2-1.icc')), page: PAGE,
})

// A template with one 2000 px RGB image drawn 72 pt (1 inch) wide.
async function templateWithImage() {
  const doc = await PDFDocument.create()
  const page = doc.addPage([PAGE.PT_W, PAGE.PT_H])
  const ctx = doc.context
  const px = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: { r: 200, g: 80, b: 40 } } }).raw().toBuffer()
  const img = ctx.register(ctx.flateStream(px, { Type: 'XObject', Subtype: 'Image', Width: 2000, Height: 1000, ColorSpace: 'DeviceRGB', BitsPerComponent: 8 }))
  page.node.set(PDFName.of('Resources'), ctx.obj({ XObject: { Im0: img } }))
  page.node.set(PDFName.of('Contents'), ctx.register(ctx.flateStream(Buffer.from('q 72 0 0 36 50 50 cm /Im0 Do Q'))))
  return Buffer.from(await doc.save())
}

function images(doc) {
  const out = []
  for (const [, o] of doc.context.enumerateIndirectObjects()) {
    if (o instanceof PDFRawStream && String(o.dict.get(PDFName.of('Subtype'))) === '/Image' && String(o.dict.get(PDFName.of('ColorSpace'))) !== '/DeviceGray') out.push(o)
  }
  return out
}

test('fix 1: template image resampled to 300 ppi at its printed size, CMYK in print export', async () => {
  const doc = await PDFDocument.load((await build(await templateWithImage(), 'cmyk')).pdf)
  const [img] = images(doc)
  assert.equal(img.dict.get(PDFName.of('Width')).asNumber(), 300)   // 1 inch at 300 ppi
  assert.equal(img.dict.get(PDFName.of('Height')).asNumber(), 150)
  assert.equal(String(img.dict.get(PDFName.of('ColorSpace'))), '/DeviceCMYK')
  // Digital export: same resampling, colour stays RGB.
  const rgb = images(await PDFDocument.load((await build(await templateWithImage(), 'print')).pdf))[0]
  assert.equal(rgb.dict.get(PDFName.of('Width')).asNumber(), 300)
  assert.equal(String(rgb.dict.get(PDFName.of('ColorSpace'))), '/DeviceRGB')
})

test('fix 2: small black = 100% K overprint, large black = rich black, overprint off again after', () => {
  const used = new Set()
  const src = [
    '0 0 0 rg 10 10 20 2 re f',          // thin black rule -> K100 + overprint
    '0 0 0 rg 0 0 100 100 re f',         // 35 x 35 mm black area -> rich black
    '0.2 0.5 0.9 rg 10 10 5 5 re f',     // a colour after black -> overprint off
    '0 0 0 1 k 5 5 3 3 re f',            // native CMYK black -> overprint too
  ].join('\n')
  const { text } = recolorContent(src, new Set(), map, used)
  assert.match(text, /\/WCopOn gs 0 0 0 1 k 10 10 20 2 re f/)
  assert.match(text, new RegExp(`/WCopOff gs ${RICH_BLACK.join(' ')} k 0 0 100 100 re f`))
  assert.match(text, /0\.5 0\.5 0 0 k 10 10 5 5 re f/)
  assert.match(text, /\/WCopOn gs 0 0 0 1 k 5 5 3 3 re f/)
  assert.deepEqual([...used].sort(), ['WCopOff', 'WCopOn'])
})

test('fix 2: overprint states are registered in the resources; black live text overprints', async () => {
  const doc = await PDFDocument.create()
  const page = doc.addPage([PAGE.PT_W, PAGE.PT_H])
  page.node.set(PDFName.of('Contents'), doc.context.register(doc.context.flateStream(Buffer.from('0 0 0 rg 10 10 20 2 re f'))))
  const items = [{ type: 'text', fontFamily: 'omnes-pro', fontWeight: 400, fontSize: 6, fill: '#000000', charSpacing: 0, matrix: [1, 0, 0, 1, 100, 400], lines: [{ text: 'T&Cs apply', x: 0, y: 0 }] }]
  const out = await PDFDocument.load((await build(Buffer.from(await doc.save()), 'cmyk', items)).pdf)
  const gs = out.getPage(0).node.Resources().lookup(PDFName.of('ExtGState'))
  const on = gs.lookup(PDFName.of('WCopOn'))
  assert.equal(on.get(PDFName.of('op')).asBoolean(), true)
  assert.equal(on.get(PDFName.of('OPM')).asNumber(), 1)
  let all = ''
  for (const [, o] of out.context.enumerateIndirectObjects()) if (o instanceof PDFRawStream) { try { all += inflateSync(Buffer.from(o.getContents())).toString('latin1') } catch { /* binary */ } }
  assert.match(all, /\/WCopOn gs 0 0 0 1 k BT/)
})

test('fix 3: estimated colours come back as a list (brand colours, white and black excluded)', async () => {
  const doc = await PDFDocument.create()
  const page = doc.addPage([PAGE.PT_W, PAGE.PT_H])
  page.node.set(PDFName.of('Contents'), doc.context.register(doc.context.flateStream(Buffer.from(
    '0 0.760784 0.909804 rg 0 0 10 10 re f 1 1 1 rg 0 0 5 5 re f 0.8 0.2 0.6 rg 1 1 2 2 re f'))))
  const r = await build(Buffer.from(await doc.save()), 'cmyk')
  assert.deepEqual(r.unverifiedColors, ['#CC3399'])
})

test('CMYK upload: detected from the JPEG header and converted to sRGB on the server', async () => {
  const cmykJpeg = await sharp({ create: { width: 40, height: 20, channels: 3, background: { r: 0, g: 194, b: 232 } } }).toColourspace('cmyk').jpeg().toBuffer()
  const rgbJpeg = await sharp({ create: { width: 40, height: 20, channels: 3, background: { r: 0, g: 194, b: 232 } } }).jpeg().toBuffer()
  const { isCmykJpeg } = await import('../src/lib/jpegInfo.js')
  assert.equal(await isCmykJpeg(new File([cmykJpeg], 'a.jpg', { type: 'image/jpeg' })), true)
  assert.equal(await isCmykJpeg(new File([rgbJpeg], 'b.jpg', { type: 'image/jpeg' })), false)

  const { default: handler } = await import('../api/convert-upload.js')
  const res = await new Promise(resolve => handler({ method: 'POST', headers: { 'x-activation-key': 'TEST-KEY' }, body: { data: cmykJpeg.toString('base64') } }, {
    setHeader() {}, status(c) { this.code = c; return this }, send(b) { this.body = b; resolve(this) }, json(b) { this.body = b; resolve(this) },
  }))
  assert.equal(res.code, 200)
  const meta = await sharp(res.body).metadata()
  assert.equal(meta.space, 'srgb')
  const { data } = await sharp(res.body).raw().toBuffer({ resolveWithObject: true })
  assert.ok(data[0] < 60 && data[1] > 150 && data[2] > 180, `still Wolt-blue-ish after conversion: ${data[0]},${data[1]},${data[2]}`)
})


test('CMYK export refuses a background image it cannot convert instead of returning RGB', async () => {
  const doc = await PDFDocument.load(await templateWithImage())
  const image = images(doc)[0]
  image.dict.set(PDFName.of('Filter'), PDFName.of('ASCII85Decode'))
  const template = Buffer.from(await doc.save())
  await assert.rejects(build(template, 'cmyk'), /background image could not be converted to CMYK/)
  // Digital mode may preserve the source image without claiming CMYK-only.
  assert.ok((await build(template, 'print')).pdf.length > 0)
})

test('printer label presets preserve FOGRA39 identity', async () => {
  const { relabelPdf } = await import('../api/_lib/printColors/relabel.js')
  const { PDFString } = await import('pdf-lib')
  for (const mode of ['indesign', 'plain']) {
    const doc = await PDFDocument.create()
    doc.addPage()
    doc.catalog.set(PDFName.of('OutputIntents'), doc.context.obj([{
      Type: 'OutputIntent', S: 'GTS_PDFX',
      OutputConditionIdentifier: PDFString.of('FOGRA39'),
      Info: PDFString.of('ISO Coated v2'),
    }]))
    const out = await PDFDocument.load(await relabelPdf(Buffer.from(await doc.save()), mode))
    const intent = out.catalog.lookup(PDFName.of('OutputIntents')).lookup(0)
    assert.equal(intent.get(PDFName.of('OutputConditionIdentifier')).decodeText(), 'FOGRA39')
    assert.equal(intent.get(PDFName.of('Info')).decodeText(), 'ISO Coated v2')
  }
})
