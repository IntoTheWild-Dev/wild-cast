// Run with: npm test
// api/brand-colors.js end to end with Vercel Blob swapped for an in-memory
// store: only agency callers get in, a saved table is what the export's
// loadBrandLibrary returns, and bad input never gets saved.
import { test, mock, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import process from 'node:process'

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

const { default: handler } = await import('../api/brand-colors.js')
const { loadBrandLibrary } = await import('../api/_lib/brandColors.js')

function call({ method = 'POST', key = 'AGENCY-KEY', body, query = {} }) {
  return new Promise(resolve => {
    const res = {
      setHeader() {},
      status(code) { this.code = code; return this },
      json(data) { resolve({ code: this.code, data }) },
      end() { resolve({ code: this.code, data: null }) },
    }
    handler({ method, body, query, headers: { 'x-activation-key': key } }, res)
  })
}

beforeEach(() => store.clear())

test('only agency callers can read or change print colours', async () => {
  assert.equal((await call({ method: 'GET', key: 'CLIENT-KEY' })).code, 403)
  assert.equal((await call({ method: 'GET', key: '' })).code, 403)
  const ok = await call({ method: 'GET', query: { brand: 'wolt' } })
  assert.equal(ok.code, 200)
  assert.deepEqual(ok.data.colors[0].cmyk, { c: 75, m: 0, y: 10, k: 0 })
})

test('a saved table is what the export uses', async () => {
  const colors = [
    { label: 'Wolt Blue (press-tuned)', hex: '#00C2E8', cmyk: { c: 70, m: 0, y: 8, k: 0 } },
    { label: 'McD Yellow', hex: '#FDDF30', cmyk: { c: 2, m: 7, y: 85, k: 1 } },
  ]
  const saved = await call({ body: { action: 'save', brand: 'wolt', colors } })
  assert.equal(saved.code, 200)
  assert.equal(saved.data.updatedBy, 'agency key')
  const library = await loadBrandLibrary('wolt')
  assert.deepEqual(library.map(c => [c.hex, c.cmyk.c]), [['#00C2E8', 70], ['#FDDF30', 2]])
})

test('bad input is refused and nothing is saved', async () => {
  const r = await call({ body: { action: 'save', brand: 'wolt', colors: [{ hex: '#00C2E8', cmyk: { c: 120, m: 0, y: 0, k: 0 } }] } })
  assert.equal(r.code, 400)
  assert.match(r.data.error, /0-100/)
  assert.equal(store.size, 0)
})

test('convert links the fields', async () => {
  const r = await call({ body: { action: 'convert', hex: '#00C2E8' } })
  assert.equal(r.code, 200)
  assert.deepEqual(r.data.rgb, { r: 0, g: 194, b: 232 })
  assert.equal(Object.keys(r.data.cmyk).join(''), 'cmyk')
})
