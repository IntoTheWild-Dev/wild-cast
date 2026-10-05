// Run with: npm test
// Exercises api/import-figma-plugin-pdf.js's real handler with Vercel Blob
// swapped for an in-memory store: the PDF is stored, its TrimBox lands on the
// finished A6 inside the 3mm bleed, and the template record points at it.
import { test, mock, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument } from 'pdf-lib'

process.env.FIGMA_PLUGIN_KEY = 'test-key'
process.env.BLOB_READ_WRITE_TOKEN = 'test-token'

const store = new Map()
mock.module('@vercel/blob', {
  namedExports: {
    list: async ({ prefix }) => ({
      blobs: [...store.keys()].filter(k => k.startsWith(prefix)).map(k => ({ pathname: k, url: `mem://${k}` })),
    }),
    put: async (path, body) => { store.set(path, body); return { pathname: path, url: `mem://${path}` } },
  },
})
globalThis.fetch = async url => {
  const key = String(url).replace('mem://', '').split('?')[0]
  return store.has(key)
    ? { ok: true, json: async () => JSON.parse(store.get(key)) }
    : { ok: false }
}

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
      headers: {},
      setHeader() {},
      status(code) { this.code = code; return this },
      json(data) { resolve({ code: this.code, data }) },
      end() { resolve({ code: this.code, data: null }) },
    }
    handler({ method: 'POST', headers: { 'x-plugin-key': key }, body }, res)
  })
}

beforeEach(() => {
  store.clear()
  store.set('templates/test-slot.json', JSON.stringify({ slotKey: 'test-slot', backgroundUrl: 'mem://templates/test-slot-bg.png' }))
})

test('stores the PDF, sets TrimBox to the A6 inside the bleed, links it on the record', async () => {
  const pdf = await makePdf()
  const { code, data } = await call({ slotKey: 'test-slot', pdfBase64: pdf.toString('base64'), frameBox: FRAME })
  assert.equal(code, 200)

  const stored = await PDFDocument.load(store.get('templates/test-slot-bg.pdf'))
  const page = stored.getPage(0)
  const bleed = 3 * MM
  const trim = page.getTrimBox()
  assert.ok(Math.abs(trim.x - bleed) < 0.01 && Math.abs(trim.y - bleed) < 0.01)
  assert.ok(Math.abs(trim.width - 105 * MM) < 0.01, `trim width ${trim.width}`)
  assert.ok(Math.abs(trim.height - 148 * MM) < 0.01, `trim height ${trim.height}`)
  assert.deepEqual(page.getBleedBox(), page.getMediaBox())

  const record = JSON.parse(store.get('templates/test-slot.json'))
  assert.equal(record.backgroundPdfUrl, 'mem://templates/test-slot-bg.pdf')
  assert.equal(record.backgroundUrl, 'mem://templates/test-slot-bg.png') // PNG untouched
  assert.equal(data.bytes, store.get('templates/test-slot-bg.pdf').length)
})

test('rejects a wrong plugin key', async () => {
  const pdf = await makePdf()
  const { code } = await call({ slotKey: 'test-slot', pdfBase64: pdf.toString('base64'), frameBox: FRAME }, 'nope')
  assert.equal(code, 403)
  assert.equal(store.has('templates/test-slot-bg.pdf'), false)
})

test('404 when the template was never imported', async () => {
  const pdf = await makePdf()
  const { code } = await call({ slotKey: 'other-slot', pdfBase64: pdf.toString('base64'), frameBox: FRAME })
  assert.equal(code, 404)
})

test('400 for a non-PDF or multi-page upload, and writes nothing', async () => {
  const notPdf = await call({ slotKey: 'test-slot', pdfBase64: Buffer.from('hello').toString('base64'), frameBox: FRAME })
  assert.equal(notPdf.code, 400)
  const two = await makePdf(2)
  const multi = await call({ slotKey: 'test-slot', pdfBase64: two.toString('base64'), frameBox: FRAME })
  assert.equal(multi.code, 400)
  assert.equal(store.has('templates/test-slot-bg.pdf'), false)
  assert.equal(JSON.parse(store.get('templates/test-slot.json')).backgroundPdfUrl, undefined)
})
