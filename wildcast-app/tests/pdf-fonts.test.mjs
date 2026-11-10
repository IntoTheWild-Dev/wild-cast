import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { PDFDocument, PDFName } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { normalizeOpenTypeFonts } from '../api/_lib/pdfFonts.js'
const hash = b => createHash('sha256').update(b).digest('hex')

test('normalization preserves full font bytes, glyph mapping and layout; is idempotent', async () => {
  const bytes = readFileSync(new URL('../api/fonts/wolt/WOLTCondBlack.otf', import.meta.url))
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const font = await doc.embedFont(bytes, { subset: false })
  const page = doc.addPage()
  page.drawText('Code scannen & schlemmen. 25% €', { font })
  await doc.flush()
  const metrics = font.widthOfTextAtSize('Code scannen', 24)
  const root = doc.context.lookup(font.ref)
  const unicode = root.get(PDFName.of('ToUnicode'))
  assert.equal(normalizeOpenTypeFonts(doc.context), 1)
  assert.equal(normalizeOpenTypeFonts(doc.context), 0)
  const descendant = root.lookup(PDFName.of('DescendantFonts')).lookup(0)
  assert.equal(String(descendant.get(PDFName.of('Subtype'))), '/CIDFontType0')
  assert.equal(root.get(PDFName.of('ToUnicode')), unicode)
  assert.equal(font.widthOfTextAtSize('Code scannen', 24), metrics)
  const descriptor = descendant.lookup(PDFName.of('FontDescriptor'))
  assert.equal(descriptor.has(PDFName.of('FontFile2')), false)
  const stream = descriptor.lookup(PDFName.of('FontFile3'))
  assert.equal(String(stream.dict.get(PDFName.of('Subtype'))), '/OpenType')
  assert.equal(hash(inflateSync(stream.getContents())), hash(bytes))
})

test('non-identity mappings and non-CFF font programs are left unchanged', async () => {
  for (const kind of ['mapping', 'truetype', 'truncated']) {
    const doc = await PDFDocument.create()
    const ctx = doc.context
    const real = readFileSync(new URL('../api/fonts/wolt/WOLTCondBlack.otf', import.meta.url))
    const bytes = kind === 'truetype' ? Buffer.from([0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]) : kind === 'truncated' ? Buffer.from('OTTO') : real
    const ref = ctx.register(ctx.flateStream(bytes))
    const descriptor = ctx.obj({ FontFile2: ref })
    const font = ctx.obj({ Type: 'Font', Subtype: 'CIDFontType2', FontDescriptor: descriptor, CIDToGIDMap: kind === 'mapping' ? ctx.register(ctx.flateStream(Buffer.from([0, 1]))) : 'Identity' })
    ctx.register(font)
    assert.equal(normalizeOpenTypeFonts(ctx), 0, kind)
    assert.equal(descriptor.get(PDFName.of('FontFile2')), ref, kind)
    assert.equal(String(font.get(PDFName.of('Subtype'))), '/CIDFontType2', kind)
  }
})
