// Media reads must use approved storage pathnames, never caller URLs.
import { test, mock, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
const reads = [], fetches = []
let contentType, missing
mock.module('@vercel/blob', { namedExports: {
  list: async () => ({ blobs: [] }), put: async () => ({}), del: async () => {}, copy: async () => ({}),
  get: async path => {
    reads.push(path)
    return missing ? null : { stream: new Response(Uint8Array.from([1, 2, 3])).body, blob: { contentType } }
  },
}})
globalThis.fetch = async (...args) => { fetches.push(args); throw new Error('Unexpected outbound fetch') }
const { default: templates } = await import('../api/list-templates.js')
const { default: library } = await import('../api/library-assets.js')
const { isBlobHost } = await import('../api/_lib/templateAssets.js')
async function call(handler, url) {
  const out = { headers: {} }
  const res = {
    setHeader(k, v) { out.headers[k] = v }, status(code) { out.code = code; return this },
    send(body) { out.body = body; return this }, json(body) { out.body = body; return this }, end() { return this },
  }
  await handler({ method: 'GET', query: { url }, headers: {} }, res)
  return out
}
beforeEach(() => { reads.length = 0; fetches.length = 0; contentType = 'image/png'; missing = false })
const HOST = 'https://abc.private.blob.vercel-storage.com'
const refused = [
  'https://attacker.example/x', 'http://abc.private.blob.vercel-storage.com/templates/a.png',
  'https://x.vercel-storage.com.evil.com/a', 'https://evil.com/.vercel-storage.com/a',
  'https://abc.private.blob.vercel-storage.com@evil.com/a', 'https://vercel-storage.com/a',
  'https://evilvercel-storage.com/a', 'not a url', '//abc.private.blob.vercel-storage.com/a',
  [HOST + '/templates/a.png', 'https://evil.com/b'],
  HOST + '/accounts/user.json', HOST + '/settings/print-colors/wolt.json',
  HOST + '/templates/../accounts/user.json', HOST + '/templates/%252e%252e/accounts/user.json',
  HOST + '/templates/a.svg', HOST + '/templates/a.json',
  'https://user:password@abc.private.blob.vercel-storage.com/templates/a.png',
]
for (const [name, handler, path] of [
  ['templates', templates, 'templates/a.png'],
  ['library', library, 'library/logos/General/abc__Logo.png'],
]) {
  for (const url of refused) test(`${name} rejects unsafe locator ${JSON.stringify(url)}`, async () => {
    assert.equal((await call(handler, url)).code, 400)
    assert.deepEqual(reads, []); assert.deepEqual(fetches, [])
  })
  test(`${name} reads only an approved pathname from the configured store`, async () => {
    const r = await call(handler, HOST + '/' + path + '?ignored=1')
    assert.equal(r.code, 200); assert.deepEqual(r.body, Buffer.from([1, 2, 3]))
    assert.deepEqual(reads, [path]); assert.deepEqual(fetches, [])
    assert.equal(r.headers['X-Content-Type-Options'], 'nosniff')
  })
  test(`${name} rejects SVG content disguised as PNG`, async () => {
    contentType = 'image/svg+xml'
    assert.equal((await call(handler, HOST + '/' + path)).code, 422)
  })
  test(`${name} returns 404 for an absent asset`, async () => {
    missing = true; assert.equal((await call(handler, HOST + '/' + path)).code, 404)
  })
}
test('proxies cannot cross into each other’s namespaces', async () => {
  assert.equal((await call(templates, HOST + '/library/logos/General/x.png')).code, 400)
  assert.equal((await call(library, HOST + '/templates/a.png')).code, 400)
})
test('blob host filter still rejects foreign domains', () => {
  assert.equal(isBlobHost(HOST + '/templates/a.png'), true)
  assert.equal(isBlobHost('https://evil.com/a'), false)
})
