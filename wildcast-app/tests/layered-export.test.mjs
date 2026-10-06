// Run with: npm test
// api/_lib/layeredPdf.js - the layered print export. A synthetic "Figma"
// background (sRGB fills in a form XObject, like Figma's PDF export) plus a
// layout snapshot go in; the PDF that comes out must have exact CMYK brand
// colours, no RGB colour operators, live text with an embedded font, images
// with soft masks, and the PDF/X-4 wrapper.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { inflateSync } from 'node:zlib'
import sharp from 'sharp'
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib'
import { buildLayeredPdf, recolorContent, pickWeight, fontFileFor } from '../api/_lib/layeredPdf.js'
import { loadLut } from '../api/_lib/cmykLut.js'
import { getBrandLibrary } from '../api/_lib/brandColors.js'

const api = p => fileURLToPath(new URL(`../api/${p}`, import.meta.url))
const PAGE = { PT_W: 314.646, PT_H: 436.535, BLEED_PT: 8.504 }

// Background like Figma's: page sets "/C1 cs" (ICCBased sRGB), the artwork is
// a form that paints with "r g b scn" in the inherited colour space.
async function figmaLikeTemplate() {
  const doc = await PDFDocument.create()
  const page = doc.addPage([PAGE.PT_W, PAGE.PT_H])
  const ctx = doc.context
  const icc = ctx.register(ctx.flateStream(readFileSync(api('icc/sRGB_IEC61966-2-1.icc')), { N: 3 }))
  const art = [
    '0 0.760784 0.909804 scn 0 0 314.646 436.535 re f',   // Wolt Blue, full bleed
    '1 1 1 scn 40 40 50 20 re f',                          // white panel
    '0.011765 0.011765 0.015686 scn 40 80 50 4 re f',      // near-black rule -> K100
    '0.913725 0.294118 0.317647 scn 120 40 30 30 re f',    // partner red -> converted, unverified
  ].join('\n')
  const form = ctx.register(ctx.flateStream(Buffer.from(art), {
    Type: 'XObject', Subtype: 'Form', BBox: [0, 0, PAGE.PT_W, PAGE.PT_H],
    Resources: { ColorSpace: { C1: ['ICCBased', icc] } },
  }))
  page.node.set(PDFName.of('Resources'), ctx.obj({ ColorSpace: { C1: ['ICCBased', icc] }, XObject: { X1: form } }))
  page.node.set(PDFName.of('Contents'), ctx.register(ctx.flateStream(Buffer.from('/C1 cs q /X1 Do Q'))))
  return Buffer.from(await doc.save())
}

async function photoDataUrl() {
  // 40x20 px, opaque red on the left half, transparent on the right.
  const px = Buffer.alloc(40 * 20 * 4)
  for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) px.set([220, 40, 30, 255], (y * 40 + x) * 4)
  return 'data:image/png;base64,' + (await sharp(px, { raw: { width: 40, height: 20, channels: 4 } }).png().toBuffer()).toString('base64')
}

async function build(mode) {
  const layout = {
    canvasW: 316, canvasH: 441,
    items: [
      { type: 'image', src: await photoDataUrl(), box: [40, 150, 120, 60] },
      { type: 'text', fontFamily: 'omnes-cond', fontWeight: 900, fontSize: 40, fill: '#FFFFFF', charSpacing: 0,
        matrix: [1, 0, 0, 1, 158, 80], lines: [{ text: '30% SPAREN', x: -100, y: 12 }] },
      { type: 'text', fontFamily: 'omnes-pro', fontWeight: 500, fontSize: 4, fill: '#000000', charSpacing: 0,
        matrix: [1, 0, 0, 1, 158, 400], lines: [{ text: 'Gültig bis 31.08.2026', x: -20, y: 2 }] },
    ],
  }
  return buildLayeredPdf({
    templatePdf: await figmaLikeTemplate(), layout, mode,
    library: getBrandLibrary('wolt'),
    lut: loadLut(api('icc/PSOcoated_v3.relcol-bpc.lut')),
    iccProfile: readFileSync(api('icc/PSOcoated_v3.icc')),
    profileMeta: { identifier: 'FOGRA51', info: 'PSO Coated v3 FOGRA51 \\(ISO 12647-2:2013\\)' },
    fontsDir: api('fonts/wolt'),
    srgbIcc: readFileSync(api('icc/sRGB_IEC61966-2-1.icc')),
    page: PAGE,
  })
}

function allContent(doc) {
  let text = ''
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue
    const sub = String(obj.dict.get(PDFName.of('Subtype')) ?? '')
    if (sub === '/Image' || sub === '/XML' || obj.dict.has(PDFName.of('N')) || obj.dict.has(PDFName.of('Length1'))) continue
    if (obj.dict.has(PDFName.of('Subtype')) && sub !== '/Form') continue
    const raw = Buffer.from(obj.getContents())
    try { text += inflateSync(raw).toString('latin1') + '\n' } catch { text += raw.toString('latin1') + '\n' }
  }
  return text
}

for (const mode of ['print', 'cmyk']) {
  test(`layered export (${mode}): exact brand CMYK, no RGB operators, live embedded text, PDF/X-4`, async () => {
    const { pdf, unverifiedColorCount } = await build(mode)
    assert.equal(pdf.toString('latin1', 0, 8), '%PDF-1.6')
    const doc = await PDFDocument.load(pdf)
    const content = allContent(doc)
    assert.match(content, /\b0\.75 0 0\.1 0 k\b/, 'Wolt Blue as exact CMYK')
    assert.match(content, /\b0 0 0 0 k\b/, 'white as 0/0/0/0')
    assert.match(content, /\b0 0 0 1 k\b/, 'near-black as K100 only')
    assert.doesNotMatch(content, /(?:^|\s)(?:[\d.]+\s+){3}(?:rg|RG|scn|SCN|sc|SC)\b/, 'no RGB colour operators left')
    assert.equal(unverifiedColorCount, 1, 'only the partner red has no official print value')
    assert.match(content, /\/WCF\d+ 40 Tf \[<[0-9a-f]{4}>/, 'headline as live text')
    // Fonts embedded, glyphs from the WOLT files.
    const fonts = []
    for (const [, obj] of doc.context.enumerateIndirectObjects()) {
      if (obj?.get?.(PDFName.of('Type'))?.toString() === '/FontDescriptor') fonts.push(obj)
    }
    assert.ok(fonts.length >= 2)
    for (const fd of fonts) assert.ok(fd.has(PDFName.of('FontFile3')) || fd.has(PDFName.of('FontFile2')), 'font program embedded')
    // Image with soft mask; colour space per mode.
    const images = []
    for (const [, obj] of doc.context.enumerateIndirectObjects()) {
      if (obj instanceof PDFRawStream && String(obj.dict.get(PDFName.of('Subtype'))) === '/Image' && obj.dict.has(PDFName.of('SMask'))) images.push(obj)
    }
    assert.equal(images.length, 1)
    const cs = images[0].dict.get(PDFName.of('ColorSpace'))
    if (mode === 'cmyk') assert.equal(String(cs), '/DeviceCMYK')
    else assert.equal(String(doc.context.lookup(cs).get(0)), '/ICCBased')
    // Page and PDF/X-4 wrapper.
    const page = doc.getPages()[0]
    assert.deepEqual(page.getTrimBox(), { x: 8.504, y: 8.504, width: 297.638, height: 419.527 })
    assert.equal(String(page.node.lookup(PDFName.of('Group')).get(PDFName.of('CS'))), '/DeviceCMYK')
    const intent = doc.catalog.lookup(PDFName.of('OutputIntents')).lookup(0)
    assert.equal(intent.get(PDFName.of('OutputConditionIdentifier')).decodeText(), 'FOGRA51')
    assert.ok(doc.context.trailerInfo.ID, 'trailer /ID present')
    const xmp = Buffer.from(doc.catalog.lookup(PDFName.of('Metadata')).getContents()).toString('utf8')
    assert.ok(xmp.includes('<pdfxid:GTS_PDFXVersion>PDF/X-4<'))
  })
}

test('recolorContent: RGB in an inherited colour space becomes CMYK; CMYK and gray untouched', () => {
  const map = (r, g, b) => ({ cmyk: r === 0 && g === 194 && b === 232 ? [0.75, 0, 0.1, 0] : [0.1, 0.2, 0.3, 0.4] })
  const { text, changed } = recolorContent('q 0 0.760784 0.909804 scn 0 0 1 1 re f 0.5 g 0.1 0.2 0.3 0.4 k 1 0 0 RG Q', new Set(), map)
  assert.equal(changed, 2)
  assert.match(text, /0\.75 0 0\.1 0 k/)
  assert.match(text, /0\.1 0\.2 0\.3 0\.4 K/)
  assert.match(text, /0\.5 g/)
})

test('font matching follows the browser (CSS weight rules) and the % patch', () => {
  assert.equal(pickWeight([400, 600, 700, 900], 500), 400)
  assert.equal(pickWeight([500, 700, 900], 800), 900)
  assert.equal(pickWeight([500, 700, 900], 300), 500)
  assert.deepEqual(fontFileFor('omnes-cond', 900), { file: 'WOLTCondBlack.otf', percentFile: 'WOLTCond-Bold.otf' })
  assert.deepEqual(fontFileFor('omnes-pro', 500), { file: 'WOLTRegular.otf', percentFile: 'WOLTSemiBold.otf' })
})
