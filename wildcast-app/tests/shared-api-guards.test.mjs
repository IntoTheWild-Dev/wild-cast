import { beforeEach, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
const HOST = 'https://owned.private.blob.vercel-storage.com'
const store = new Map(), upstream = []
mock.module('@vercel/blob', { namedExports: {
  list: async ({ prefix }) => ({ blobs: [...store.keys()].filter(pathname => pathname.startsWith(prefix)).map(pathname => ({ pathname, url: HOST + '/' + pathname })) }),
  put: async (path, value) => { store.set(path, value); return { url: HOST + '/' + path } },
  get: async path => store.has(path) ? { stream: new Response(store.get(path)).body } : null,
}})
globalThis.fetch = async (url, options) => {
  if (String(url).startsWith(HOST + '/')) {
    const path = new URL(url).pathname.slice(1)
    return new Response(store.get(path) ?? '{}', { status: store.has(path) ? 200 : 404 })
  }
  upstream.push({ url, options })
  assert.equal(url, 'https://sdk.photoroom.com/v1/segment')
  return new Response(Uint8Array.from([1, 2, 3]), { headers: { 'Content-Type': 'image/webp' } })
}
const { default: rename } = await import('../api/rename-project.js')
const { default: move } = await import('../api/move-project.js')
const { default: folders } = await import('../api/folders.js')
const { default: notifications } = await import('../api/notifications.js')
const { default: exportPdf } = await import('../api/export-cmyk.js')
const { default: removeBg } = await import('../api/remove-bg.js')
const { notificationsPath } = await import('../api/_lib/notifications.js')
const OWNER = { 'x-activation-key': 'OWNER' }, OTHER = { 'x-activation-key': 'OTHER' }, TEAM = { 'x-activation-key': 'TEAM' }
async function call(handler, method, { body = {}, query = {}, headers = {} } = {}) {
  const out = { headers: {} }
  const res = { status(n) { out.code = n; return this }, json(data) { out.data = data; return this }, send(data) { out.code ??= 200; out.data = data; return this }, end() { return this }, setHeader(k, v) { out.headers[k] = v } }
  await handler({ method, body, query, headers }, res); return out
}
beforeEach(() => {
  store.clear(); upstream.length = 0
  process.env.WILDCAST_KEYS = 'OWNER|Owner|10|partner,OTHER|Other|10|partner,TEAM|Team|10|agency'
  delete process.env.ACTIVATION_KEYS_END
  process.env.BLOB_READ_WRITE_TOKEN = 'dummy-token'
  process.env.PHOTOROOM_API_KEY = 'dummy-photoroom-key'
  store.set('projects/shared.json', JSON.stringify({ id: 'shared', projectName: 'Before', ownerEmail: 'OWNER', fields: { headline: 'Exact artwork' } }))
})
for (const [name, handler, method] of [
  ['rename', rename, 'POST'], ['move', move, 'POST'], ['folders list', folders, 'GET'], ['folder create', folders, 'POST'],
  ['notifications', notifications, 'GET'], ['notification read state', notifications, 'PATCH'], ['PDF export', exportPdf, 'POST'], ['background removal', removeBg, 'POST'],
]) test(`${name} rejects anonymous calls before writes or paid requests`, async () => {
  const before = [...store]
  assert.equal((await call(handler, method)).code, 401)
  assert.deepEqual([...store], before); assert.deepEqual(upstream, [])
})
test('signed-in partners retain shared rename/move access without changing artwork', async () => {
  assert.equal((await call(rename, 'POST', { headers: OTHER, body: { id: 'shared', projectName: 'After' } })).code, 200)
  assert.equal((await call(move, 'POST', { headers: OTHER, body: { id: 'shared', folder: 'Campaign' } })).code, 200)
  const stored = JSON.parse(store.get('projects/shared.json'))
  assert.deepEqual(stored.fields, { headline: 'Exact artwork' }); assert.equal(stored.ownerEmail, 'OWNER')
  assert.equal(stored.projectName, 'After'); assert.equal(stored.folder, 'Campaign')
})
test('notifications bind to the authenticated identity, not an owner header', async () => {
  store.set(notificationsPath('OWNER'), JSON.stringify([{ id: 'n1', read: false, text: 'Own notification' }]))
  assert.equal((await call(notifications, 'GET', { headers: { ...OTHER, 'x-wildcast-owner': 'OWNER' } })).code, 403)
  const own = await call(notifications, 'GET', { headers: OWNER })
  assert.equal(own.data.notifications[0].text, 'Own notification')
  assert.equal((await call(notifications, 'PATCH', { headers: OWNER, body: { all: true } })).code, 200)
  assert.equal(JSON.parse(store.get(notificationsPath('OWNER')))[0].read, true)
})
test('personal folder creation derives the name/owner; the folder list stays shared', async () => {
  assert.equal((await call(folders, 'POST', { headers: OTHER, body: { ownerEmail: 'OWNER', folderName: 'Not mine' } })).code, 403)
  const own = await call(folders, 'POST', { headers: OWNER, body: { folderName: 'Campaign', ownerName: 'Spoofed' } })
  assert.equal(own.code, 200); assert.equal(own.data.ownerEmail, 'OWNER'); assert.equal(own.data.ownerName, 'Owner')
  const shared = await call(folders, 'GET', { headers: OTHER })
  assert.equal(shared.code, 200); assert.equal(shared.data.owners[0].ownerEmail, 'OWNER')
  assert.equal((await call(folders, 'POST', { headers: TEAM, body: { ownerEmail: 'OTHER', ownerName: 'Other', folderName: 'Managed' } })).code, 200)
})
test('valid callers can still export a CMYK PDF', async () => {
  const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#00c2e8' } }).png().toBuffer()
  const r = await call(exportPdf, 'POST', { headers: OWNER, body: { png: 'data:image/png;base64,' + png.toString('base64'), mode: 'cmyk', brand: 'wolt' } })
  assert.equal(r.code, 200); assert.equal(Buffer.from(r.data).subarray(0, 5).toString(), '%PDF-')
})
test('valid background-removal callers use the fixed vendor endpoint', async () => {
  const r = await call(removeBg, 'POST', { headers: OWNER, body: Buffer.from([1, 2, 3]) })
  assert.equal(r.code, 200); assert.deepEqual(Buffer.from(r.data), Buffer.from([1, 2, 3])); assert.equal(upstream.length, 1)
})
