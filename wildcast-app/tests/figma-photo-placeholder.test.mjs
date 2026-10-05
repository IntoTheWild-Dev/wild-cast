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
const { customZonesEntry, customTemplateCards } = await import('../src/lib/customTemplates.js')
const sharp = (await import('sharp')).default
const { BLEED_UNITS } = await import('../api/_lib/figma-import.js')

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

// A flat PNG the size of the bleed frame at 1.5x (what the plugin sends for the tile).
const frameAt = scale => sharp({
  create: { width: Math.round(314.646 * scale), height: Math.round(436.535 * scale), channels: 3, background: '#20c4e4' },
}).png().toBuffer()

test('tile: trimmed to the finished size like the background, stored, linked as tileUrl', async () => {
  const frame = await frameAt(1.5)
  const { code, data } = await call({ slotKey: 't', images: { tile: frame.toString('base64') }, tileScale: 1.5 })
  assert.equal(code, 200)
  assert.deepEqual(data.imported, ['tile'])
  const bleed = Math.round(BLEED_UNITS * 1.5)
  const meta = await sharp(store.get('templates/t-tile.png')).metadata()
  assert.equal(meta.width, Math.round(314.646 * 1.5) - bleed * 2)
  assert.equal(meta.height, Math.round(436.535 * 1.5) - bleed * 2)
  assert.equal(JSON.parse(store.get('templates/t.json')).tileUrl, 'mem://templates/t-tile.png')
})

test('tile and zone examples travel together and are all linked', async () => {
  const frame = await frameAt(1.5)
  const { data } = await call({
    slotKey: 't', tileScale: 1.5,
    images: { tile: frame.toString('base64'), photo: PNG.toString('base64'), sticker: PNG.toString('base64') },
  })
  assert.deepEqual(data.imported.sort(), ['photo', 'sticker', 'tile'])
  const record = JSON.parse(store.get('templates/t.json'))
  assert.ok(record.tileUrl && record.zones.find(z => z.id === 'photo').placeholderImage && record.zones.find(z => z.id === 'sticker').placeholderImage)
})

test('tile without a usable tileScale is rejected and nothing is written', async () => {
  const frame = await frameAt(1.5)
  assert.equal((await call({ slotKey: 't', images: { tile: frame.toString('base64') } })).code, 400)
  assert.equal((await call({ slotKey: 't', images: { tile: frame.toString('base64') }, tileScale: 99 })).code, 400)
  assert.equal(store.has('templates/t-tile.png'), false)
})

test('template card uses the tile when there is one, the plain background otherwise', () => {
  const rec = { slotKey: 't', label: 'T', cat: 'restaurant', format: 'Flyer', backgroundUrl: 'mem://bg.png' }
  const proxied = u => `/api/list-templates?url=${encodeURIComponent(u)}`
  assert.equal(customTemplateCards(rec)[0].thumb, proxied('mem://bg.png'))
  assert.equal(customTemplateCards({ ...rec, tileUrl: 'mem://tile.png' })[0].thumb, proxied('mem://tile.png'))
})
