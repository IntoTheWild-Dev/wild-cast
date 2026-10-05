// Run with: npm test
// api/import-figma-plugin-pdf.js with Vercel Blob swapped for an in-memory
// store: the PDF is saved with its TrimBox on the finished A6 inside the 3mm
// bleed and its URL returned. It does NOT touch the template record (linking is
// import-figma-plugin-finish.js's job - see figma-plugin-finish.test.mjs).
import { test, mock, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument } from 'pdf-lib'
import { makeBlobMock, urlOf } from './_blobMock.mjs'

process.env.FIGMA_PLUGIN_KEY = 'test-key'
process.env.BLOB_READ_WRITE_TOKEN = 'test-token'

const { store, namedExports, fetchMock } = makeBlobMock()
mock.module('@vercel/blob', { namedExports })
globalThis.fetch = fetchMock

const { default: handler } = await import('../api/import-figma-plugin-pdf.js')

// A6 + 3mm bleed = 111 x 154 mm, in points - what Figma's PDF export of the
// bleed frame looks like (1 Figma unit = 1 pt).
const FRAME = { x: 0, y: 0, width: 314.646, height: 436.535 }
const MM = 72 / 25.4

async function makePdf(pages = 1) {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pages; i++) doc.addPage([FRAME.width, FRAME.height])
  return Buffer.from(await doc.save())
}

function call(body, key = 'test-key') {
  return new Promise(resolve => {
    const res = {
      setHeader() {},
      status(code) { this.code = code; return this },
      json(data) { resolve({ code: this.code, data }) },
      end() { resolve({ code: this.code, data: null }) },
    }
    handler({ method: 'POST', headers: { 'x-plugin-key': key }, body }, res)
  })
}

const record = { slotKey: 'test-slot', backgroundUrl: urlOf('templates/test-slot-bg.png') }
beforeEach(() => {
  store.clear()
  store.set('templates/test-slot.json', JSON.stringify(record))
})

test('saves the PDF with TrimBox = the A6 inside the bleed, returns its URL, leaves the record alone', async () => {
  const pdf = await makePdf()
  const { code, data } = await call({ slotKey: 'test-slot', pdfBase64: pdf.toString('base64'), frameBox: FRAME })
  assert.equal(code, 200)
  assert.equal(data.url, urlOf('templates/test-slot-bg.pdf'))

  const page = (await PDFDocument.load(store.get('templates/test-slot-bg.pdf'))).getPage(0)
  const bleed = 3 * MM
  const trim = page.getTrimBox()
  assert.ok(Math.abs(trim.x - bleed) < 0.01 && Math.abs(trim.y - bleed) < 0.01)
  assert.ok(Math.abs(trim.width - 105 * MM) < 0.01, `trim width ${trim.width}`)
  assert.ok(Math.abs(trim.height - 148 * MM) < 0.01, `trim height ${trim.height}`)
  assert.deepEqual(page.getBleedBox(), page.getMediaBox())

  assert.deepEqual(JSON.parse(store.get('templates/test-slot.json')), record) // not rewritten
})

test('rejects a wrong plugin key', async () => {
  const pdf = await makePdf()
  const { code } = await call({ slotKey: 'test-slot', pdfBase64: pdf.toString('base64'), frameBox: FRAME }, 'nope')
  assert.equal(code, 403)
  assert.equal(store.has('templates/test-slot-bg.pdf'), false)
})

test('400 for a non-PDF, a multi-page PDF, or a bad slotKey - and writes nothing', async () => {
  const notPdf = await call({ slotKey: 'test-slot', pdfBase64: Buffer.from('hello').toString('base64'), frameBox: FRAME })
  assert.equal(notPdf.code, 400)
  const two = await makePdf(2)
  assert.equal((await call({ slotKey: 'test-slot', pdfBase64: two.toString('base64'), frameBox: FRAME })).code, 400)
  const one = await makePdf()
  assert.equal((await call({ slotKey: '../evil', pdfBase64: one.toString('base64'), frameBox: FRAME })).code, 400)
  assert.equal(store.has('templates/test-slot-bg.pdf'), false)
})
