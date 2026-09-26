// Run: node scripts/verify-brand-color-fix.mjs
// Tests the real export handler and independently parses its finished PDFs.
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { inflateSync } from 'node:zlib'
import sharp from 'sharp'
import { PDFDocument, PDFName } from 'pdf-lib'
import handler from '../api/export-cmyk.js'

const width = 1241, height = 1749, outputWidth = 1311, outputHeight = 1819
const solid = background => sharp({ create: { width, height, channels: 3, background } }).png().toBuffer()
const blue = { r: 0, g: 194, b: 232 }
const name = PDFName.of

async function exportPdf(png, brand) {
  const res = {
    headers: {},
    setHeader(key, value) { this.headers[key] = value },
    status(value) { this.statusCode = value; return this },
    send(value) { this.body = value },
    json(value) { throw new Error(JSON.stringify(value)) },
  }
  await handler({ method: 'POST', body: { png: png.toString('base64'), brand } }, res)
  assert.equal(res.statusCode, 200)
  assert.equal(Number(res.headers['Content-Length']), res.body.length)
  const pdf = await PDFDocument.load(res.body)
  const page = pdf.getPages()[0]
  const objects = page.node.Resources().lookup(name('XObject'))
  const image = objects.lookup(name('Im1'))
  const content = page.node.Contents()
  const commands = Buffer.from(content.getContents()).toString('latin1')
  const masks = objects.keys().filter(key => key.toString().startsWith('/Brand')).map(key => {
    const stream = objects.lookup(key)
    assert.equal(stream.dict.get(name('ImageMask')).toString(), 'true')
    assert.equal(stream.dict.get(name('BitsPerComponent')).asNumber(), 1)
    assert.equal(stream.dict.get(name('Width')).asNumber(), outputWidth)
    assert.equal(stream.dict.get(name('Height')).asNumber(), outputHeight)
    assert.equal(stream.dict.get(name('Decode')).toString(), '[ 1 0 ]')
    assert.equal(stream.dict.get(name('Interpolate')).toString(), 'false')
    return inflateSync(stream.getContents())
  })
  const intent = pdf.catalog.lookup(name('OutputIntents')).lookup(0)
  assert.equal(intent.get(name('S')).toString(), '/GTS_PDFX')
  assert.equal(intent.get(name('OutputConditionIdentifier')).decodeText(), 'FOGRA51')
  return {
    warning: Number(res.headers['X-Unverified-Colors']), commands, masks,
    samples: inflateSync(image.getContents()),
  }
}

function painted(mask, x, y) {
  return Boolean(mask[y * Math.ceil(outputWidth / 8) + (x >> 3)] & (128 >> (x & 7)))
}

const bluePng = await solid(blue)
const exact = await exportPdf(bluePng, 'wolt')
assert.equal(exact.warning, 0)
assert.equal(exact.masks.length, 1)
// Literal PDF operands, independent of production rounding helpers.
assert.match(exact.commands, /\/Im1 Do\s+q\s+0\.75 0 0\.1 0 k\s+\/Brand0 Do/)
for (const [x, y] of [[0, 0], [1310, 0], [0, 1818], [1310, 1818], [650, 900]]) {
  assert.ok(painted(exact.masks[0], x, y), 'Blue and bleed must be painted')
}
console.log('PASS: generated PDF paints Wolt Blue with exact 75/0/10/0 operands')

const redPng = await solid({ r: 255, g: 0, b: 0 })
const redWolt = await exportPdf(redPng, 'wolt')
assert.equal(redWolt.warning, 1)
assert.equal(redWolt.masks.length, 0)
for (const brand of [undefined, 'unknown', 'constructor', '__proto__']) {
  const red = await exportPdf(redPng, brand)
  assert.equal(red.warning, 1)
  assert.equal(red.masks.length, 0)
  assert.deepEqual(red.samples, redWolt.samples)
}
const expectedFallback = await sharp(redPng)
  .resize(width, height, { fit: 'cover' })
  .flatten({ background: { r: 255, g: 255, b: 255 } })
  .extend({ top: 35, bottom: 35, left: 35, right: 35, extendWith: 'mirror', background: { r: 255, g: 255, b: 255 } })
  .withIccProfile(fileURLToPath(new URL('../api/icc/PSOcoated_v3.icc', import.meta.url)))
  .raw().toBuffer()
assert.deepEqual(redWolt.samples, expectedFallback)
console.log('PASS: missing/unknown brands warn; fallback samples remain unchanged')

// Warning counts only colors covering >= 0.1% of the canvas (2385 of the
// 1311x1819 output px). A 20x20 red patch and a single green pixel stay
// below that; a 60x60 purple patch (3600 px) is counted. All three must
// still be excluded from the brand mask (fallback conversion).
const rgb = Buffer.alloc(width * height * 3)
for (let i = 0; i < rgb.length; i += 3) { rgb[i + 1] = 194; rgb[i + 2] = 232 }
const fill = (x0, y0, size, [r, g, b]) => {
  for (let y = y0; y < y0 + size; y++) for (let x = x0; x < x0 + size; x++) {
    const i = (y * width + x) * 3
    rgb[i] = r; rgb[i + 1] = g; rgb[i + 2] = b
  }
}
fill(500, 500, 20, [255, 0, 0])
fill(800, 800, 1, [0, 255, 0])
fill(200, 1200, 60, [128, 0, 128])
const patchPng = await sharp(rgb, { raw: { width, height, channels: 3 } }).png().toBuffer()
const patch = await exportPdf(patchPng, 'wolt')
assert.equal(patch.warning, 1)
assert.ok(painted(patch.masks[0], 534, 535))
assert.ok(!painted(patch.masks[0], 535, 535))
assert.ok(!painted(patch.masks[0], 554, 554))
assert.ok(painted(patch.masks[0], 555, 554))
assert.ok(!painted(patch.masks[0], 835, 835))
assert.ok(!painted(patch.masks[0], 265, 1265))
console.log('PASS: only visible unmatched areas warn; masks exclude all unmatched pixels')

const flyerPng = readFileSync(new URL('../public/templates/A6 _ text_swap_wildcast.png', import.meta.url))
const flyer = await exportPdf(flyerPng, 'wolt')
assert.ok(flyer.warning > 0 && flyer.warning < 20)
assert.equal(flyer.masks.length, 1)
assert.match(flyer.commands, /0\.75 0 0\.1 0 k/)
console.log(`PASS: real flyer PDF uses exact blue and reports ${flyer.warning} unverified RGB colors`)
console.log('All checks passed. Original InDesign/Delta E comparison remains a separate acceptance check.')
