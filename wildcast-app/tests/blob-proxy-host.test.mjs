// Run with: npm test
// The two private-image proxies (api/list-templates.js and api/library-assets.js,
// GET ?url=) attach our Blob token to a fetch of a caller-supplied URL. They must
// refuse anything that is not https on *.vercel-storage.com and never call fetch
// for it, or the token can be sent to an attacker's host.
import { test, mock, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

process.env.BLOB_READ_WRITE_TOKEN = 'test-token'

mock.module('@vercel/blob', {
  namedExports: {
    list: async () => ({ blobs: [] }),
    put: async () => ({}),
    del: async () => {},
    copy: async () => ({}),
  },
})

const fetchCalls = []
globalThis.fetch = async (url, init) => {
  fetchCalls.push({ url: String(url), init })
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'image/png' },
    arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer,
  }
}

const { default: listTemplates } = await import('../api/list-templates.js')
const { default: libraryAssets } = await import('../api/library-assets.js')
const { isBlobHost } = await import('../api/_lib/templateAssets.js')

function call(handler, url) {
  return new Promise(resolve => {
    const res = {
      headers: {},
      setHeader(k, v) { this.headers[k] = v },
      status(code) { this.code = code; return this },
      send(body) { resolve({ code: this.code, body }) },
      json(data) { resolve({ code: this.code, body: data }) },
      end() { resolve({ code: this.code, body: null }) },
    }
    handler({ method: 'GET', query: { url }, headers: {} }, res)
  })
}

const ROUTES = [
  ['list-templates', listTemplates],
  ['library-assets', libraryAssets],
]

const REFUSED = [
  ['a foreign host', 'https://attacker.example/x'],
  ['plain http on a blob host', 'http://abc.private.blob.vercel-storage.com/templates/a.png'],
  ['a look-alike host (blob domain as a prefix)', 'https://x.vercel-storage.com.evil.com/a'],
  ['a look-alike host (blob domain as a path)', 'https://evil.com/.vercel-storage.com/a'],
  ['blob host smuggled in userinfo', 'https://abc.private.blob.vercel-storage.com@evil.com/a'],
  ['the bare blob domain with no store', 'https://vercel-storage.com/a'],
  ['a host that only ends the same way', 'https://evilvercel-storage.com/a'],
  ['a non-URL string', 'not a url'],
  ['a protocol-relative URL', '//abc.private.blob.vercel-storage.com/a'],
  ['an array (?url=a&url=b)', ['https://abc.private.blob.vercel-storage.com/a', 'https://evil.com/b']],
]

beforeEach(() => { fetchCalls.length = 0 })

for (const [route, handler] of ROUTES) {
  for (const [label, url] of REFUSED) {
    test(`${route}: refuses ${label} with 400 and never calls fetch`, async () => {
      const { code } = await call(handler, url)
      assert.equal(code, 400)
      assert.equal(fetchCalls.length, 0)
    })
  }

  test(`${route}: still proxies a real-looking private blob URL`, async () => {
    const url = 'https://abc.private.blob.vercel-storage.com/templates/a.png'
    const { code, body } = await call(handler, url)
    assert.equal(code, 200)
    assert.deepEqual(body, Buffer.from([1, 2, 3]))
    assert.equal(fetchCalls.length, 1)
    assert.ok(fetchCalls[0].url.startsWith(url))
    assert.equal(fetchCalls[0].init.headers.Authorization, 'Bearer test-token')
  })
}

test('isBlobHost accepts blob store hosts only', () => {
  assert.equal(isBlobHost('https://abc.private.blob.vercel-storage.com/library/x/y.png'), true)
  assert.equal(isBlobHost('https://abc.public.blob.vercel-storage.com/a?x=1'), true)
  assert.equal(isBlobHost('https://example.com/a'), false)
  assert.equal(isBlobHost(undefined), false)
  assert.equal(isBlobHost(null), false)
})
