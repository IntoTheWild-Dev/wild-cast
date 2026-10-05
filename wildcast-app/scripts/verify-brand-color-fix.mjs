// Run: node scripts/verify-brand-color-fix.mjs
// Tests the real export handler and independently parses its finished PDFs.
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { readFileSync } from 'node:fs'
import { URL } from 'node:url'
import { inflateSync } from 'node:zlib'
import sharp from 'sharp'
import { PDFDocument, PDFName } from 'pdf-lib'
import handler, { renderFlyerImage } from '../api/export-cmyk.js'
import { loadLut, applyLut } from '../api/_lib/cmykLut.js'

const width = 1241, height = 1749, outputWidth = 1311, outputHeight = 1819
const solid = background => sharp({ create: { width, height, channels: 3, background } }).png().toBuffer()
const blue = { r: 0, g: 194, b: 232 }
const name = PDFName.of

function fakeRes() {
  return {
    headers: {},
    setHeader(key, value) { this.headers[key] = value },
    status(value) { this.statusCode = value; return this },
    send(value) { this.body = value },
    json(value) { this.body = value },
  }
}

// mode undefined = the default ('print'): sRGB-tagged image like InDesign's
// PDF/X-4 export; 'cmyk' = CMYK-only via Relative Colorimetric + BPC.
async function exportPdf(png, brand, mode) {
  const res = fakeRes()
  await handler({ method: 'POST', body: { png: png.toString('base64'), brand, mode } }, res)
  assert.equal(res.statusCode, 200, JSON.stringify(res.body))
  assert.equal(Number(res.headers['Content-Length']), res.body.length)
  assert.equal(res.headers['X-Export-Mode'], mode ?? 'print')
  const pdf = await PDFDocument.load(res.body)
  const page = pdf.getPages()[0]
  const objects = page.node.Resources().lookup(name('XObject'))
  const image = objects.lookup(name('Im1'))
  const [csName, csProfile] = image.dict.lookup(name('ColorSpace')).asArray()
  assert.equal(csName.toString(), '/ICCBased')
  const imageProfile = pdf.context.lookup(csProfile)
  const channels = imageProfile.dict.get(name('N')).asNumber()
  const profileBytes = inflateSync(imageProfile.getContents())
  if (mode === 'cmyk') {
    assert.equal(channels, 4)
    assert.equal(profileBytes.toString('latin1', 16, 20), 'CMYK')
  } else {
    assert.equal(channels, 3)
    assert.equal(profileBytes.toString('latin1', 16, 20), 'RGB ')
    assert.equal(profileBytes.length, 3144)  // sRGB IEC61966-2.1, as InDesign embeds
  }
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
  // PDF/X-4 (ISO 15930-7) structural requirements, matching InDesign's export
  const raw = res.body.toString('latin1')
  assert.match(raw, /trailer\s*<<[^>]*\/ID \[<[0-9a-f]{32}> <[0-9a-f]{32}>\]/)
  const info = pdf.context.lookup(pdf.context.trailerInfo.Info)
  assert.equal(info.get(name('Trapped')).toString(), '/False')
  const xmp = Buffer.from(pdf.catalog.lookup(name('Metadata')).getContents()).toString('utf8')
  for (const tag of ['pdfxid:GTS_PDFXVersion>PDF/X-4<', 'pdf:Trapped>False<', 'xmpMM:DocumentID>uuid:',
    'xmpMM:VersionID>1<', 'xmpMM:RenditionClass>default<', 'xmp:MetadataDate>']) {
    assert.ok(xmp.includes(`<${tag}`), `XMP missing ${tag}`)
  }
  assert.ok(!xmp.includes('GTS_PDFXConformance'))
  const xmpDate = xmp.match(/<xmp:CreateDate>([^<]+)</)[1]
  assert.equal(info.get(name('CreationDate')).decodeText(), `D:${xmpDate.replace(/[-:T]/g, '').replace('Z', '')}Z`)
  // Brand blend overlay ('print' mode only): DeviceCMYK image + explicit mask
  let blend = null
  if (objects.has(name('Blend'))) {
    const stream = objects.lookup(name('Blend'))
    assert.equal(stream.dict.get(name('ColorSpace')).toString(), '/DeviceCMYK')
    assert.equal(stream.dict.get(name('Width')).asNumber(), outputWidth)
    assert.equal(stream.dict.get(name('Height')).asNumber(), outputHeight)
    const mask = stream.dict.lookup(name('Mask'))
    assert.equal(mask.dict.get(name('ImageMask')).toString(), 'true')
    assert.equal(mask.dict.get(name('Decode')).toString(), '[ 1 0 ]')
    assert.match(commands, /\/Blend Do\s+Q\s*$/)
    blend = { pixels: inflateSync(stream.getContents()), mask: inflateSync(mask.getContents()) }
  }
  return {
    warning: Number(res.headers['X-Unverified-Colors']), commands, masks, blend,
    samples: inflateSync(image.getContents()),
  }
}

function painted(mask, x, y) {
  return Boolean(mask[y * Math.ceil(outputWidth / 8) + (x >> 3)] & (128 >> (x & 7)))
}

const bluePng = await solid(blue)
for (const mode of [undefined, 'cmyk']) {
  const exact = await exportPdf(bluePng, 'wolt', mode)
  assert.equal(exact.warning, 0)
  assert.equal(exact.masks.length, 1)
  // Literal PDF operands, independent of production rounding helpers.
  assert.match(exact.commands, /\/Im1 Do\s+q\s+0\.75 0 0\.1 0 k\s+\/Brand0 Do/)
  for (const [x, y] of [[0, 0], [1310, 0], [0, 1818], [1310, 1818], [650, 900]]) {
    assert.ok(painted(exact.masks[0], x, y), 'Blue and bleed must be painted')
  }
}
console.log('PASS: both modes paint Wolt Blue with exact 75/0/10/0 operands')

const bad = fakeRes()
await handler({ method: 'POST', body: { png: bluePng.toString('base64'), mode: 'rgb' } }, bad)
assert.equal(bad.statusCode, 400)

// Default mode: image samples are the untouched sRGB pixels (the print
// shop's RIP converts them, exactly as for InDesign's placed RGB photos).
// CMYK mode: Relative Colorimetric + BPC, checked against values computed
// directly with LittleCMS (sRGB -> PSO Coated v3), not our own LUT code.
const redPng = await solid({ r: 255, g: 0, b: 0 })
const redPrint = await exportPdf(redPng, 'wolt')
assert.equal(redPrint.warning, 1)
assert.equal(redPrint.masks.length, 0)
assert.deepEqual([...redPrint.samples.subarray(0, 3)], [255, 0, 0])
assert.ok(redPrint.samples.every((v, i) => v === [255, 0, 0][i % 3]))
const redCmyk = await exportPdf(redPng, 'wolt', 'cmyk')
assert.equal(redCmyk.warning, 1)
const littleCmsRed = [0, 244, 254, 0]
redCmyk.samples.subarray(0, 4).forEach((v, i) => assert.ok(Math.abs(v - littleCmsRed[i]) <= 1, `CMYK red ${[...redCmyk.samples.subarray(0, 4)]}`))
for (const brand of [undefined, 'unknown', 'constructor', '__proto__']) {
  for (const [mode, reference] of [[undefined, redPrint], ['cmyk', redCmyk]]) {
    const red = await exportPdf(redPng, brand, mode)
    assert.equal(red.warning, 1)
    assert.equal(red.masks.length, 0)
    assert.deepEqual(red.samples, reference.samples)
  }
}
console.log('PASS: RGB image untouched (default), CMYK matches LittleCMS RelCol+BPC; unknown brands warn')

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
for (const mode of [undefined, 'cmyk']) {
  const flyer = await exportPdf(flyerPng, 'wolt', mode)
  assert.ok(flyer.warning > 0 && flyer.warning < 20)
  assert.equal(flyer.masks.length, 1)
  assert.match(flyer.commands, /0\.75 0 0\.1 0 k/)
  console.log(`PASS: real flyer PDF (${mode ?? 'print'}) uses exact blue and reports ${flyer.warning} unverified colors`)
}
// Brand blend zone: pixels that are almost (but not exactly) the brand color -
// anti-aliased edges, soft shadows, one-off values like #01C2E8 - must land
// next to the official CMYK instead of dropping to the plain conversion
// (C67 for Wolt Blue, an 8-point cyan step = the printed "halo"). Checked on
// the ink each pixel finally carries: stencil operands, blend overlay, or the
// Relative Colorimetric + BPC conversion of the image sample.
const lutPath = new URL('../api/icc/PSOcoated_v3.relcol-bpc.lut', import.meta.url).pathname
const lut = loadLut(lutPath)
const pixelCount = outputWidth * outputHeight
function finalInk({ pixels, exactMask, exactBytes, blend }) {
  const ink = pixels.length === pixelCount * 3 ? applyLut(pixels, lut) : Buffer.from(pixels)
  const kind = new Uint8Array(pixelCount)  // 0 image, 1 stencil, 2 blend overlay
  for (let px = 0; px < pixelCount; px++) {
    const x = px % outputWidth, y = (px - x) / outputWidth
    if (blend && painted(blend.mask, x, y)) { blend.pixels.copy(ink, px * 4, px * 4, px * 4 + 4); kind[px] = 2 }
    if (painted(exactMask, x, y)) {
      assert.notEqual(kind[px], 2, 'blend overlay must never cover a stencil pixel')
      exactBytes.forEach((v, c) => { ink[px * 4 + c] = v }); kind[px] = 1
    }
  }
  return { ink, kind }
}
// Largest drop in one ink channel between the stencil and its direct
// non-stencil neighbours that are still >= 90% brand color.
function haloStep({ ink, kind }, rgbPixels, brandRgb, channel, target) {
  let worst = 0, count = 0
  for (let y = 1; y < outputHeight - 1; y++) for (let x = 1; x < outputWidth - 1; x++) {
    const px = y * outputWidth + x
    if (kind[px] === 1) continue
    if (![px - 1, px + 1, px - outputWidth, px + outputWidth].some(n => kind[n] === 1)) continue
    let mix = 0
    brandRgb.forEach((b, c) => {
      const v = rgbPixels[px * 3 + c]
      mix = Math.max(mix, v > b ? (v - b) / (255 - b) : v < b ? (b - v) / b : 0)
    })
    if (mix > 0.1) continue
    count++
    worst = Math.max(worst, Math.abs(target - ink[px * 4 + channel] / 255 * 100))
  }
  return { worst, count }
}
// Blue page with a soft dark shadow, anti-aliased white text shapes and a
// saturated "photo" block - the three things that sit on brand color in a flyer.
const scene = await sharp({ create: { width, height, channels: 3, background: blue } })
  .composite([{ input: Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">` +
    '<defs><filter id="f" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="18"/></filter></defs>' +
    '<ellipse cx="620" cy="1150" rx="260" ry="60" fill="#000" opacity="0.45" filter="url(#f)"/>' +
    '<circle cx="400" cy="400" r="150.5" fill="#fff"/><path d="M700 250 L1000.3 300.7 L820.5 520.2 Z" fill="#fff"/>' +
    '<rect x="420" y="800" width="400" height="300" fill="#D8281C"/><rect x="470" y="850" width="300" height="200" fill="#F5A300"/>' +
    '</svg>') }])
  .png().toBuffer()
for (const mode of [undefined, 'cmyk']) {
  const out = await exportPdf(scene, 'wolt', mode)
  assert.equal(Boolean(out.blend), mode !== 'cmyk', 'print mode carries the blend overlay; cmyk corrects in place')
  // same resize/bleed the handler applied, to know each pixel's source RGB
  const { pixels: sceneRgb } = await renderFlyerImage({ pngBuffer: scene, brand: null, mode: 'print', lutPath })
  const result = finalInk({ pixels: out.samples, exactMask: out.masks[0], exactBytes: [191, 0, 26, 0], blend: out.blend })
  const cyan = haloStep(result, sceneRgb, [0, 194, 232], 0, 75)
  assert.ok(cyan.count > 1000, 'scene must contain almost-blue pixels beside the stencil')
  assert.ok(cyan.worst <= 4, `halo: cyan drops ${cyan.worst.toFixed(1)} points beside exact Wolt Blue (${mode ?? 'print'})`)
  // Photo block interior (saturated, no brand color in it) keeps the plain conversion
  const plain = applyLut(sceneRgb, lut)
  for (const [x, y] of [[480, 870], [655, 985], [700, 1000], [800, 1090]]) {
    const px = (y + 35) * outputWidth + (x + 35)
    assert.equal(result.kind[px], 0)
    assert.deepEqual([...result.ink.subarray(px * 4, px * 4 + 4)], [...plain.subarray(px * 4, px * 4 + 4)], 'photo pixels must not change')
  }
  console.log(`PASS: no halo beside Wolt Blue (${mode ?? 'print'}): worst cyan step ${cyan.worst.toFixed(2)} over ${cyan.count} edge pixels; photo block untouched`)
}

// Any brand color in a library gets the same treatment, not just Wolt Blue.
// TEST-ONLY values (not an official brand guide): a yellow whose print value
// is far from its plain conversion, with white shapes on top.
const testLibrary = [{ hex: '#FFBC0D', cmyk: { c: 0, m: 30, y: 100, k: 0 }, label: 'test yellow' }]
const yellowScene = await sharp({ create: { width, height, channels: 3, background: { r: 255, g: 188, b: 13 } } })
  .composite([{ input: Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">` +
    '<defs><filter id="f" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="18"/></filter></defs>' +
    '<ellipse cx="620" cy="1350" rx="260" ry="60" fill="#000" opacity="0.45" filter="url(#f)"/>' +
    '<circle cx="600" cy="800" r="250.5" fill="#fff"/><path d="M200 200 L500.3 250.7 L320.5 470.2 Z" fill="#1A1A1A"/></svg>') }])
  .png().toBuffer()
for (const mode of ['print', 'cmyk']) {
  const out = await renderFlyerImage({ pngBuffer: yellowScene, brand: null, mode, lutPath, library: testLibrary })
  const { pixels: yellowRgb } = await renderFlyerImage({ pngBuffer: yellowScene, brand: null, mode: 'print', lutPath })
  assert.equal(out.brandMasks.length, 1)
  const result = finalInk({ pixels: out.pixels, exactMask: out.brandMasks[0].mask, exactBytes: [0, 77, 255, 0], blend: out.brandBlend })
  const magenta = haloStep(result, yellowRgb, [255, 188, 13], 1, 30)
  assert.ok(magenta.count > 500)
  assert.ok(magenta.worst <= 4, `halo: magenta off by ${magenta.worst.toFixed(1)} points beside the test yellow (${mode})`)
  console.log(`PASS: second brand color blends cleanly too (${mode}): worst magenta step ${magenta.worst.toFixed(2)}`)
}

console.log('All checks passed. Original InDesign/Delta E comparison remains a separate acceptance check.')
