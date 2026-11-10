import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { inflateSync } from 'node:zlib'
import sharp from 'sharp'
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib'
import { loadLut, applyLut } from '../api/_lib/cmykLut.js'
import { buildLayeredPdf } from '../api/_lib/layeredPdf.js'
import { getBrandLibrary } from '../api/_lib/brandColors.js'
import { preflightPdf } from '../api/_lib/preflight.js'
import { DEFAULT_PRINT_PROFILE, LEGACY_PRINT_PROFILE, printProfileFor } from '../src/lib/printProfile.js'
import handler from '../api/export-cmyk.js'
const path = p => new URL(`../api/${p}`, import.meta.url)
const icc = readFileSync(path('icc/ISOcoated_v2_300_eci.icc'))
const lut = loadLut(path('icc/ISOcoated_v2_300_eci.relcol-bpc.lut'))
const oracle = JSON.parse(readFileSync(new URL('./fixtures/iso300-lcms.json', import.meta.url)))
const profileMeta = { identifier: 'FOGRA39', info: 'ISO Coated v2 300% (ECI)' }

function verifyProfile(doc) {
  const intent = doc.catalog.lookup(PDFName.of('OutputIntents')).lookup(0)
  assert.equal(intent.get(PDFName.of('OutputConditionIdentifier')).decodeText(), 'FOGRA39')
  assert.equal(intent.get(PDFName.of('Info')).decodeText(), 'ISO Coated v2 300% (ECI)')
  assert.equal(intent.get(PDFName.of('RegistryName')).decodeText(), 'http://www.color.org')
  const profile = intent.lookup(PDFName.of('DestOutputProfile'))
  assert.deepEqual(inflateSync(profile.getContents()), icc)
}
function content(doc) {
  return doc.context.enumerateIndirectObjects().filter(([, x]) => x instanceof PDFRawStream).map(([, x]) => {
    try { return inflateSync(x.getContents()).toString('latin1') } catch { return '' }
  }).join('\n')
}

test('300% profile provenance, LCMS reference samples and LUT ink limit', () => {
  assert.equal(createHash('sha256').update(icc).digest('hex'), oracle.profile_sha256)
  assert.equal(oracle.profile_sha256, 'c6b4b62f0726243742eced8b9669476a6be89e581f50a7600ed8b6fcbb9cdab8')
  for (const sample of oracle.samples) {
    const actual = [...applyLut(Buffer.from(sample.rgb), lut)]
    actual.forEach((v, i) => assert.ok(Math.abs(v - sample.cmyk[i]) <= 3, `${sample.rgb}: ${actual} versus ${sample.cmyk}`))
  }
  for (let n = 0; n < lut.table.length; n += 4) assert.ok(lut.table[n] + lut.table[n + 1] + lut.table[n + 2] + lut.table[n + 3] <= 765)
})
test('new designs default to 300%; saved and historical profiles are preserved', () => {
  assert.equal(DEFAULT_PRINT_PROFILE, 'fogra39-300')
  for (const p of ['fogra39-300', 'fogra39', 'fogra51']) assert.equal(printProfileFor({ iccProfile: p }), p)
  assert.equal(printProfileFor({}), LEGACY_PRINT_PROFILE)
})
test('layered photo conversion embeds the same 300% profile and leaves brand blue unchanged', async () => {
  const template = await PDFDocument.create(), ctx = template.context
  const page = template.addPage([314.646, 436.535])
  const img = ctx.register(ctx.flateStream(Buffer.from([0, 0, 0, 32, 32, 32, 120, 60, 20, 255, 255, 255]), { Type: 'XObject', Subtype: 'Image', Width: 2, Height: 2, BitsPerComponent: 8, ColorSpace: 'DeviceRGB' }))
  page.node.set(PDFName.of('Resources'), ctx.obj({ XObject: { Photo: img } }))
  page.node.set(PDFName.of('Contents'), ctx.register(ctx.flateStream(Buffer.from('0 0.760784 0.909804 rg 0 0 314 436 re f q 0.48 0 0 0.48 20 20 cm /Photo Do Q'))))
  const { pdf } = await buildLayeredPdf({ templatePdf: await template.save(), layout: { canvasW: 316, canvasH: 441, items: [] }, mode: 'cmyk', lut, library: getBrandLibrary('wolt'), iccProfile: icc, profileMeta, fontsDir: path('fonts/wolt'), srgbIcc: readFileSync(path('icc/sRGB_IEC61966-2-1.icc')), page: { PT_W: 314.646, PT_H: 436.535, BLEED_PT: 8.504 } })
  const doc = await PDFDocument.load(pdf)
  verifyProfile(doc)
  assert.match(content(doc), /0\.75 0 0\.1 0 k/)
  const report = await preflightPdf(pdf, { lut, requireCmyk: true, expectedIcc: icc })
  assert.equal(report.checks.find(c => c.id === 'cmyk').status, 'pass')
  assert.ok(report.inkMax <= 300)
})
test('actual flat API export accepts the new profile and reports composed QA as separate', async () => {
  const png = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#00c2e8' } }).png().toBuffer()
  const chunks = [], result = { headers: {} }
  await handler({ method: 'POST', body: { png: png.toString('base64'), brand: 'wolt', mode: 'cmyk', profile: 'fogra39-300' } }, {
    status(code) { result.code = code; return this }, setHeader(k, v) { result.headers[k] = v },
    write(bytes) { chunks.push(bytes) }, end() {}, json(body) { result.body = body; return this },
  })
  assert.equal(result.code, 200, JSON.stringify(result.body))
  verifyProfile(await PDFDocument.load(Buffer.concat(chunks)))
  assert.match(result.headers['X-Preflight'], /Composed-page ink coverage/)
})
