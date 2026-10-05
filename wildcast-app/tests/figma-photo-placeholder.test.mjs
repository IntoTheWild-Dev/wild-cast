// Run with: npm test
// The zone:photo layer's exported pixels become that template's translucent
// photo example: endpoint stores it and links it on the zone, the editor
// proxies it, and placeholderImageFor prefers it over the grey box.
import { test, mock, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

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

const { default: handler } = await import('../api/import-figma-plugin-placeholder.js')
const { placeholderImageFor, IMAGE_PLACEHOLDERS } = await import('../src/data/placeholders.js')
const { customZonesEntry } = await import('../src/lib/customTemplates.js')

// 1x1 transparent PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHnOcQAAAAABJRU5ErkJggg==', 'base64')

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

beforeEach(() => {
  store.clear()
  store.set('templates/t.json', JSON.stringify({
    slotKey: 't', backgroundUrl: 'mem://templates/t-bg.png',
    zones: [{ id: 'headline', type: 'text' }, { id: 'photo', type: 'image' }, { id: 'sticker', type: 'image' }, { id: 'qr', type: 'image' }],
  }))
})

test('stores the PNG and links it on the photo zone only', async () => {
  const { code } = await call({ slotKey: 't', zoneId: 'photo', imageBase64: PNG.toString('base64') })
  assert.equal(code, 200)
  assert.deepEqual(store.get('templates/t-ph-photo.png'), PNG)
  const record = JSON.parse(store.get('templates/t.json'))
  assert.equal(record.zones.find(z => z.id === 'photo').placeholderImage, 'mem://templates/t-ph-photo.png')
  assert.equal('placeholderImage' in record.zones.find(z => z.id === 'headline'), false)
})

test('sticker gets its own example, separate from the photo', async () => {
  assert.equal((await call({ slotKey: 't', zoneId: 'sticker', imageBase64: PNG.toString('base64') })).code, 200)
  const record = JSON.parse(store.get('templates/t.json'))
  assert.equal(record.zones.find(z => z.id === 'sticker').placeholderImage, 'mem://templates/t-ph-sticker.png')
  assert.equal('placeholderImage' in record.zones.find(z => z.id === 'photo'), false)
})

test('photo and sticker in ONE request both end up linked (single record write)', async () => {
  const b64 = PNG.toString('base64')
  const { code, data } = await call({ slotKey: 't', images: { photo: b64, sticker: b64 } })
  assert.equal(code, 200)
  assert.deepEqual(data.imported.sort(), ['photo', 'sticker'])
  const record = JSON.parse(store.get('templates/t.json'))
  assert.equal(record.zones.find(z => z.id === 'photo').placeholderImage, 'mem://templates/t-ph-photo.png')
  assert.equal(record.zones.find(z => z.id === 'sticker').placeholderImage, 'mem://templates/t-ph-sticker.png')
})

test('a zone the template does not have is reported as skipped, the rest still import', async () => {
  store.set('templates/t.json', JSON.stringify({ slotKey: 't', zones: [{ id: 'photo', type: 'image' }] }))
  const b64 = PNG.toString('base64')
  const { code, data } = await call({ slotKey: 't', images: { photo: b64, sticker: b64 } })
  assert.equal(code, 200)
  assert.deepEqual(data.imported, ['photo'])
  assert.match(data.skipped.sticker, /no image zone/)
  assert.equal(store.has('templates/t-ph-sticker.png'), false)
})

test('rejects bad key, non-PNG, unsupported zone, unknown template and missing zone', async () => {
  const body = { slotKey: 't', zoneId: 'photo', imageBase64: PNG.toString('base64') }
  assert.equal((await call(body, 'nope')).code, 403)
  assert.equal((await call({ ...body, imageBase64: Buffer.from('not a png at all').toString('base64') })).code, 400)
  assert.equal((await call({ ...body, zoneId: 'qr' })).code, 400)
  assert.equal((await call({ ...body, zoneId: 'logo' })).code, 400)
  assert.equal((await call({ ...body, slotKey: 'missing' })).code, 404)
  store.set('templates/t.json', JSON.stringify({ slotKey: 't', zones: [{ id: 'headline', type: 'text' }] }))
  assert.equal((await call(body)).code, 404)
  assert.equal(store.has('templates/t-ph-photo.png'), false)
})

test('editor: proxied URL for custom templates, and order override -> Figma -> grey box', async () => {
  await call({ slotKey: 't', zoneId: 'photo', imageBase64: PNG.toString('base64') })
  const record = JSON.parse(store.get('templates/t.json'))
  const photo = customZonesEntry({ ...record, canvasW: 316, canvasH: 441 }).t.zones.find(z => z.id === 'photo')
  assert.equal(photo.placeholderImage, `/api/list-templates?url=${encodeURIComponent('mem://templates/t-ph-photo.png')}`)

  assert.equal(placeholderImageFor(photo, 'brand-new-template'), photo.placeholderImage)
  assert.equal(placeholderImageFor(photo, 'wen-cheng-flyer1'), '/placeholders/wen-cheng-photo.png') // hand-picked still wins
  assert.equal(placeholderImageFor({ id: 'photo' }, 'brand-new-template'), IMAGE_PLACEHOLDERS.photo) // old records unchanged
})
