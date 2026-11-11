import { test, beforeEach, mock } from 'node:test'
import sharp from 'sharp'
import assert from 'node:assert/strict'
const HOST = 'https://owned.private.blob.vercel-storage.com'
const store = new Map(), reads = [], deletes = [], copies = [], fetches = []
const pathOf = value => String(value).startsWith(HOST) ? new URL(value).pathname.slice(1) : value
mock.module('@vercel/blob', { namedExports: {
  list: async ({ prefix }) => ({ blobs: [...store.keys()].filter(p => p.startsWith(prefix)).map(pathname => ({ pathname, url: HOST + '/' + pathname })) }),
  get: async path => { reads.push(path); return store.has(path) ? { stream: new Response(store.get(path)).body, blob: { contentType: path.endsWith('.pdf') ? 'application/pdf' : 'image/png' } } : null },
  put: async (path, data) => { store.set(path, data); return { url: HOST + '/' + path } },
  del: async paths => { for (const p of [paths].flat()) { deletes.push(p); store.delete(pathOf(p)) } },
  copy: async (path, target) => { copies.push([path, target]); store.set(target, store.get(pathOf(path))); return { url: HOST + '/' + target } },
}})
globalThis.fetch = async url => {
  fetches.push(url); assert.ok(String(url).startsWith(HOST + '/accounts/'), 'only server-resolved account reads may use HTTP')
  return new Response(store.get(pathOf(url)) ?? '{}', { status: store.has(pathOf(url)) ? 200 : 404 })
}
const { issueSession } = await import('../api/_lib/accounts.js')
const { ownerRecord } = await import('../api/_lib/ownerIdentity.js')
const { default: save } = await import('../api/save-project.js')
const { default: load } = await import('../api/load-project.js')
const { default: remove } = await import('../api/delete-project.js')
const { default: library } = await import('../api/library-assets.js')
const { default: validate } = await import('../api/validate-key.js')
const { requireCaller } = await import('../api/_lib/auth.js')
const { fetchTemplatePdf } = await import('../api/export-cmyk.js')
const OWNER = { 'x-activation-key': 'OWNER' }, OTHER = { 'x-activation-key': 'OTHER' }, TEAM = { 'x-activation-key': 'TEAM' }
async function call(handler, method, { body = {}, query = {}, headers = {} } = {}) {
  const out = { headers: {} }
  const res = { status(n) { out.code = n; return this }, json(data) { out.data = data; return this }, send(data) { out.data = data; return this }, end() { return this }, setHeader(k, v) { out.headers[k] = v } }
  await handler({ method, body, query, headers }, res); return out
}
beforeEach(() => {
  store.clear(); reads.length = 0; deletes.length = 0; copies.length = 0; fetches.length = 0
  process.env.WILDCAST_KEYS = 'OWNER|Owner|10|partner,OTHER|Other|10|partner,TEAM|Team|10|agency'
  process.env.BLOB_READ_WRITE_TOKEN = 'test-token'; delete process.env.ACTIVATION_KEYS_END
  store.set('projects/p1.json', JSON.stringify({ id: 'p1', templateId: 't', ownerEmail: 'OWNER', fields: { headline: 'Unchanged' } }))
})
for (const key of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) test(`inherited key ${key} fails both auth entry points`, async () => {
  assert.equal((await call(validate, 'POST', { body: { key } })).data.valid, false)
  assert.equal(await requireCaller({ headers: { 'x-activation-key': key } }, { status() { return this }, json() {} }), null)
})
test('valid keys still work; array keys and expired keys fail', async () => {
  assert.equal((await call(validate, 'POST', { body: { key: 'OWNER' } })).data.valid, true)
  const res = { status() { return this }, json() {} }
  assert.equal(await requireCaller({ headers: { 'x-activation-key': ['OWNER'] } }, res), null)
  process.env.ACTIVATION_KEYS_END = '2000-01-01T00:00:00Z'
  assert.equal(await requireCaller({ headers: OWNER }, res), null)
})
test('project loading rejects anonymous users before storage access', async () => {
  assert.equal((await call(load, 'GET', { query: { id: 'p1' } })).code, 401); assert.deepEqual(reads, [])
})
test('authenticated project loading preserves every saved field', async () => {
  const r = await call(load, 'GET', { query: { id: 'p1' }, headers: OWNER })
  assert.equal(r.code, 200); assert.deepEqual(r.data, ownerRecord(JSON.parse(store.get('projects/p1.json'))))
  assert.deepEqual(reads, ['projects/p1.json']); assert.deepEqual(fetches, [])
})
test('valid account sessions can still open shared projects', async () => {
  store.set('accounts/person-example-test.json', JSON.stringify(issueSession({ email: 'person@example.test', role: 'partner' }, 'valid')))
  assert.equal((await call(load, 'GET', { query: { id: 'p1' }, headers: { 'x-account-email': 'person@example.test', 'x-account-token': 'valid' } })).code, 200)
})
test('old URL locators resolve to a local project pathname without HTTP', async () => {
  const r = await call(load, 'GET', { query: { url: HOST + '/projects/p1.json' }, headers: OWNER })
  assert.equal(r.code, 200); assert.deepEqual(reads, ['projects/p1.json']); assert.deepEqual(fetches, [])
})
for (const query of [{ url: 'https://controlled.example/collect' }, { url: HOST + '/accounts/person.json' }, { id: '../accounts/person' }, { id: ['p1', 'p2'] }, { id: 'p1.json' }]) test(`bad locator ${JSON.stringify(query)} cannot reach storage or HTTP`, async () => {
  assert.equal((await call(load, 'GET', { query, headers: OWNER })).code, 400)
  assert.deepEqual(reads, []); assert.deepEqual(fetches, [])
})
test('deletion is authenticated, owner/team authorized and exact', async () => {
  for (const p of ['projects/p10.json', 'projects/p1.json-extra', 'comments/p1.json', 'comments/p10.json']) store.set(p, '{}')
  assert.equal((await call(remove, 'DELETE', { query: { id: 'p1' } })).code, 401)
  assert.equal((await call(remove, 'DELETE', { query: { id: 'p1' }, headers: OTHER })).code, 403)
  assert.equal((await call(remove, 'DELETE', { query: { id: 'p1' }, headers: OWNER })).data.deleted, 2)
  assert.deepEqual(deletes, ['projects/p1.json', 'comments/p1.json'])
  for (const p of ['projects/p10.json', 'projects/p1.json-extra', 'comments/p10.json']) assert.ok(store.has(p))
})
test('agency can delete shared projects; a repeat is harmless', async () => {
  assert.equal((await call(remove, 'DELETE', { query: { id: 'p1' }, headers: TEAM })).code, 200)
  assert.equal((await call(remove, 'DELETE', { query: { id: 'p1' }, headers: TEAM })).data.deleted, 0)
})
for (const method of ['POST', 'PATCH', 'DELETE']) test(`anonymous library ${method} is blocked`, async () => {
  assert.equal((await call(library, method, { query: { url: HOST + '/accounts/person.json' } })).code, 401)
  assert.deepEqual(deletes, []); assert.deepEqual(copies, [])
})
test('library uploads reject SVG and disguised active content before storage', async () => {
  for (const mime of ['image/svg+xml', 'image/png']) {
    const before = store.size
    const dataUrl = `data:${mime};base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64')}`
    const result = await call(library, 'POST', { headers: OWNER, body: { folder: 'logos', name: 'unsafe', dataUrl } })
    assert.equal(result.code, 400)
    assert.equal(store.size, before)
  }
})
test('a valid transparent raster is decoded and stored as a clean PNG', async () => {
  const input = await sharp({ create: { width: 2, height: 2, channels: 4, background: { r: 20, g: 100, b: 200, alpha: 0.5 } } }).png().toBuffer()
  const result = await call(library, 'POST', { headers: OWNER, body: { folder: 'logos', name: 'safe', dataUrl: `data:image/png;base64,${input.toString('base64')}` } })
  assert.equal(result.code, 200)
  const saved = store.get(new URL(result.data.url).pathname.slice(1))
  const decoded = await sharp(saved).raw().toBuffer({ resolveWithObject: true })
  assert.equal(decoded.info.channels, 4)
  assert.equal(decoded.info.width, 2)
  assert.equal(decoded.data[3], 128)
})
test('signed-in library mutations cannot target accounts', async () => {
  const url = HOST + '/accounts/person.json'
  assert.equal((await call(library, 'DELETE', { query: { url }, headers: OWNER })).code, 400)
  assert.equal((await call(library, 'PATCH', { body: { url, newName: 'x' }, headers: OWNER })).code, 400)
  assert.deepEqual(deletes, []); assert.deepEqual(copies, [])
})
test('same-name library rename keeps bytes; real rename/delete still work', async () => {
  const path = 'library/logos/General/abc__Logo.png'; store.set(path, 'IMAGE')
  assert.equal((await call(library, 'PATCH', { body: { url: HOST + '/' + path, newName: 'Logo' }, headers: OWNER })).code, 200)
  assert.deepEqual(copies, []); assert.deepEqual(deletes, []); assert.equal(store.get(path), 'IMAGE')
  assert.equal((await call(library, 'PATCH', { body: { url: HOST + '/' + path, newName: 'New' }, headers: OWNER })).code, 200)
  assert.equal(store.get('library/logos/General/abc__New.png'), 'IMAGE')
  assert.equal((await call(library, 'DELETE', { query: { url: HOST + '/library/logos/General/abc__New.png' }, headers: OWNER })).code, 200)
  assert.ok(!store.has('library/logos/General/abc__New.png'))
})
test('vector PDF loading preserves bytes and cannot forward credentials to a URL', async () => {
  const pdf = Buffer.from('%PDF-1.6\nunchanged test bytes'); store.set('templates/a-bg.pdf', pdf)
  assert.deepEqual(await fetchTemplatePdf('/api/list-templates?url=' + encodeURIComponent(HOST + '/templates/a-bg.pdf')), pdf)
  assert.deepEqual(reads, ['templates/a-bg.pdf']); assert.deepEqual(fetches, [])
  await assert.rejects(fetchTemplatePdf(HOST + '/accounts/person.json'))
  await assert.rejects(fetchTemplatePdf('https://controlled.example/templates/a-bg.pdf'))
})

for (const type of ['text/html', 'image/svg+xml', 'application/json']) test(`thumbnail refuses active/non-image content ${type}`, async () => {
  store.set('projects/p1.json', JSON.stringify({ preview: `data:${type};base64,${Buffer.from('<script>unsafe</script>').toString('base64')}` }))
  assert.equal((await call(save, 'GET', { query: { thumb: 'p1' }, headers: OWNER })).code, 422)
})
test('existing raster thumbnail bytes are unchanged and served with defensive headers', async () => {
  const bytes = Buffer.from([1, 2, 3])
  store.set('projects/p1.json', JSON.stringify({ preview: 'data:image/jpeg;base64,' + bytes.toString('base64') }))
  const r = await call(save, 'GET', { query: { thumb: 'p1' }, headers: OWNER })
  assert.equal(r.code, 200); assert.deepEqual(r.data, bytes)
  assert.equal(r.headers['Content-Type'], 'image/jpeg'); assert.equal(r.headers['X-Content-Type-Options'], 'nosniff')
})
