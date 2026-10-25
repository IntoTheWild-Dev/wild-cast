// Run with: npm test
// Print colours module end to end, with Vercel Blob swapped for an in-memory
// store: agency-only access, approval rules, history, and that the brand's
// default printer really changes what export-cmyk.js produces.
import { test, mock, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'
import { Buffer } from 'node:buffer'
import { inflateSync } from 'node:zlib'
import sharp from 'sharp'

const store = new Map()
mock.module('@vercel/blob', {
  namedExports: {
    list: async ({ prefix }) => ({
      blobs: [...store.keys()].filter(k => k.startsWith(prefix)).map(k => ({ pathname: k, url: `mem://${k}` })),
    }),
    put: async (path, body) => { store.set(path, body); return { pathname: path } },
  },
})
globalThis.fetch = async url => {
  const key = String(url).replace('mem://', '').split('?')[0]
  return store.has(key) ? { ok: true, json: async () => JSON.parse(store.get(key)) } : { ok: false }
}
process.env.BLOB_READ_WRITE_TOKEN = 'test'
process.env.WILDCAST_KEYS = 'AGENCY-KEY|Wild Stack|100|agency,CLIENT-KEY|Client|20|designer'

const { default: api } = await import('../api/print-colors.js')
const { default: exportHandler } = await import('../api/export-cmyk.js')
const { clearCache } = await import('../api/_lib/printColors/index.js')

function fakeRes(resolve) {
  return {
    headers: {},
    setHeader(k, v) { this.headers[k] = v },
    status(code) { this.code = code; return this },
    json(data) { resolve({ code: this.code, data, headers: this.headers }) },
    send(data) { resolve({ code: this.code, data, headers: this.headers }) },
    end() { resolve({ code: this.code, data: null }) },
  }
}
const call = ({ method = 'POST', key = 'AGENCY-KEY', body, query = {} }) =>
  new Promise(resolve => api({ method, body, query, headers: { 'x-activation-key': key } }, fakeRes(resolve)))
const save = body => call({ body: { action: 'save', brand: 'wolt', ...body } })

const WOLT = { label: 'Wolt Blue', hex: '#00C2E8', cmyk: { c: 75, m: 0, y: 10, k: 0 } }

beforeEach(() => { store.clear(); clearCache('wolt'); delete process.env.PRINT_COLORS })

test('only agency callers get in', async () => {
  assert.equal((await call({ method: 'GET', key: 'CLIENT-KEY' })).code, 403)
  assert.equal((await call({ method: 'GET', key: '' })).code, 403)
  const ok = await call({ method: 'GET', query: { brand: 'wolt' } })
  assert.equal(ok.code, 200)
  assert.deepEqual(ok.data.colors[0].cmyk, WOLT.cmyk)
  assert.equal(ok.data.colors[0].status, 'approved')  // built-in values count as approved
  assert.match(ok.data.snippet, /hex: '#00C2E8'/)
})

test('approval is stamped by the server and a CMYK change makes it a draft again', async () => {
  let r = await save({ colors: [{ ...WOLT, cmyk: { c: 70, m: 0, y: 8, k: 0 }, status: 'draft' }] })
  assert.equal(r.code, 200)
  assert.equal(r.data.colors[0].status, 'draft')
  r = await save({ colors: [{ ...WOLT, cmyk: { c: 70, m: 0, y: 8, k: 0 }, status: 'approved', approvedBy: 'spoofed' }] })
  assert.equal(r.data.colors[0].approvedBy, 'agency key')
  assert.ok(r.data.colors[0].approvedAt)
  assert.match(r.data.snippet, /c: 70, m: 0, y: 8, k: 0/)
  assert.match(r.data.history[0].summary, /approved/)
  assert.match(r.data.history[1].summary, /75\/0\/10\/0 → 70\/0\/8\/0/)
})

test('bad input is refused and nothing is saved', async () => {
  const r = await save({ colors: [{ ...WOLT, cmyk: { c: 120, m: 0, y: 0, k: 0 } }] })
  assert.equal(r.code, 400)
  assert.match(r.data.error, /0-100/)
  assert.equal(store.size, 0)
})

test('calibration endpoints: grid and sheet', async () => {
  const grid = await call({ body: { action: 'grid', cmyk: WOLT.cmyk } })
  assert.deepEqual(grid.data.patches.find(p => p.code === 'D3').cmyk, WOLT.cmyk)
  const sheet = await call({ body: { action: 'sheet', ...WOLT } })
  assert.equal(sheet.headers['Content-Type'], 'application/pdf')
  assert.equal(sheet.data.subarray(0, 5).toString(), '%PDF-')
})

// ── Export integration ──────────────────────────────────────────────────────
const bluePng = await sharp({ create: { width: 1241, height: 1749, channels: 3, background: { r: 0, g: 194, b: 232 } } }).png().toBuffer()
const exportPdf = () => new Promise(resolve =>
  exportHandler({ method: 'POST', body: { png: bluePng.toString('base64'), brand: 'wolt' } }, fakeRes(resolve)))
const inks = pdf => {
  const raw = pdf.toString('latin1')
  return [...raw.matchAll(/stream\r?\n/g)].map(m => {
    const body = Buffer.from(raw.slice(m.index + m[0].length, raw.indexOf('endstream', m.index)), 'latin1')
    try { return inflateSync(body).toString('latin1') } catch { return body.toString('latin1') }
  }).join('\n')
}

test('export: built-in colours and PDF/X-4 when nothing is saved', async () => {
  const r = await exportPdf()
  assert.equal(r.code, 200)
  assert.match(inks(r.data), /0\.75 0 0\.1 0 k/)
  assert.match(r.data.toString('latin1'), /GTS_PDFXVersion \(PDF\/X-4\)/)
})

test('export: the default printer\'s colour and "Like InDesign" labelling are used (still PDF/X-4)', async () => {
  await save({
    colors: [{ ...WOLT, status: 'approved' }],
    printers: [{ name: 'Clarisse digital', label: 'indesign', overrides: { '#00C2E8': { c: 68, m: 0, y: 6, k: 0 } } }],
    defaultPrinter: 'clarisse-digital',
  })
  clearCache('wolt')
  const r = await exportPdf()
  assert.equal(r.code, 200)
  const s = r.data.toString('latin1')
  assert.match(inks(r.data), /0\.68 0 0\.06 0 k/)
  assert.doesNotMatch(inks(r.data), /0\.75 0 0\.1 0 k/)
  assert.match(s, /GTS_PDFXVersion \(PDF\/X-4\)/)
  assert.match(s, /OutputConditionIdentifier \(PSO Coated v3\)/)
  assert.doesNotMatch(s, /\(FOGRA51\)/)
  assert.equal(Number(r.headers['Content-Length']), r.data.length)
})

test('PRINT_COLORS=off: saved settings are ignored and the API is closed', async () => {
  await save({ colors: [{ ...WOLT, cmyk: { c: 60, m: 0, y: 5, k: 0 } }] })
  process.env.PRINT_COLORS = 'off'
  clearCache('wolt')
  assert.equal((await call({ method: 'GET' })).code, 404)
  const r = await exportPdf()
  assert.match(inks(r.data), /0\.75 0 0\.1 0 k/)
})

test('two admins: a save based on an older page is refused (409), nothing is lost', async () => {
  const first = await save({ colors: [WOLT], expectedUpdatedAt: null })
  assert.equal(first.code, 200)
  const stale = await save({ colors: [{ ...WOLT, cmyk: { c: 60, m: 0, y: 5, k: 0 } }], expectedUpdatedAt: null })
  assert.equal(stale.code, 409)
  assert.match(stale.data.error, /saved changes since you opened this page/)
  const fresh = await save({ colors: [{ ...WOLT, cmyk: { c: 60, m: 0, y: 5, k: 0 } }], expectedUpdatedAt: first.data.updatedAt })
  assert.equal(fresh.code, 200)
})

test('duplicate printer ids are refused instead of silently renamed', async () => {
  const r = await save({ colors: [WOLT], printers: [{ id: 'clarisse', name: 'A' }, { id: 'clarisse', name: 'B' }] })
  assert.equal(r.code, 400)
  assert.match(r.data.error, /share the id/)
})
