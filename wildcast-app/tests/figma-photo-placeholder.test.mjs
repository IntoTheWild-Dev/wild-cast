// Run with: npm test
// api/import-figma-plugin-placeholder.js with Vercel Blob swapped for an
// in-memory store: photo / sticker examples and the catalogue tile are SAVED
// (tile trimmed like the background) and their URLs returned. It does not touch
// the template record - see figma-plugin-finish.test.mjs for the linking - and
// the editor/card side (proxied URLs, override -> Figma -> grey order) is here.
import { test, mock, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { makeBlobMock, urlOf } from './_blobMock.mjs'

process.env.FIGMA_PLUGIN_KEY = 'test-key'
process.env.BLOB_READ_WRITE_TOKEN = 'test-token'

const { store, namedExports, fetchMock } = makeBlobMock()
mock.module('@vercel/blob', { namedExports })
globalThis.fetch = fetchMock

const { default: handler } = await import('../api/import-figma-plugin-placeholder.js')
const { placeholderImageFor, IMAGE_PLACEHOLDERS } = await import('../src/data/placeholders.js')
const { customZonesEntry, customTemplateCards } = await import('../src/lib/customTemplates.js')
const sharp = (await import('sharp')).default
const { BLEED_UNITS } = await import('../api/_lib/figma-import.js')

// 1x1 transparent PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHnOcQAAAAABJRU5ErkJggg==', 'base64')
const b64 = PNG.toString('base64')

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

// A flat PNG the size of the bleed frame at `scale` (what the plugin sends for the tile).
const frameAt = scale => sharp({
  create: { width: Math.round(314.646 * scale), height: Math.round(436.535 * scale), channels: 3, background: '#20c4e4' },
}).png().toBuffer()

const recordJson = JSON.stringify({ slotKey: 't', backgroundUrl: urlOf('templates/t-bg.png'), zones: [{ id: 'photo', type: 'image' }, { id: 'sticker', type: 'image' }] })
beforeEach(() => {
  store.clear()
  store.set('templates/t.json', recordJson)
})

test('photo and sticker are saved and their URLs returned; the record is left alone', async () => {
  const { code, data } = await call({ slotKey: 't', images: { photo: b64, sticker: b64 } })
  assert.equal(code, 200)
  assert.deepEqual(data.urls, { photo: urlOf('templates/t-ph-photo.png'), sticker: urlOf('templates/t-ph-sticker.png') })
  assert.deepEqual(store.get('templates/t-ph-photo.png'), PNG)
  assert.equal(store.get('templates/t.json'), recordJson)
})

test('the old single-image shape still works', async () => {
  const { code, data } = await call({ slotKey: 't', zoneId: 'photo', imageBase64: b64 })
  assert.equal(code, 200)
  assert.deepEqual(Object.keys(data.urls), ['photo'])
})

test('tile: trimmed to the finished size like the background, saved, URL returned', async () => {
  const frame = await frameAt(1.5)
  const { code, data } = await call({ slotKey: 't', images: { tile: frame.toString('base64') }, tileScale: 1.5 })
  assert.equal(code, 200)
  assert.equal(data.urls.tile, urlOf('templates/t-tile.png'))
  const bleed = Math.round(BLEED_UNITS * 1.5)
  const meta = await sharp(store.get('templates/t-tile.png')).metadata()
  assert.equal(meta.width, Math.round(314.646 * 1.5) - bleed * 2)
  assert.equal(meta.height, Math.round(436.535 * 1.5) - bleed * 2)
})

test('tile and examples can arrive together', async () => {
  const frame = await frameAt(1.5)
  const { data } = await call({ slotKey: 't', tileScale: 1.5, images: { tile: frame.toString('base64'), photo: b64, sticker: b64 } })
  assert.deepEqual(Object.keys(data.urls).sort(), ['photo', 'sticker', 'tile'])
})

test('rejects: bad key, non-PNG, logo/qr, tile without a usable tileScale, bad slotKey - nothing is saved', async () => {
  const frame = await frameAt(1.5)
  assert.equal((await call({ slotKey: 't', images: { photo: b64 } }, 'nope')).code, 403)
  assert.equal((await call({ slotKey: 't', images: { photo: Buffer.from('not a png at all').toString('base64') } })).code, 400)
  assert.equal((await call({ slotKey: 't', images: { qr: b64 } })).code, 400)
  assert.equal((await call({ slotKey: 't', images: { logo: b64 } })).code, 400)
  assert.equal((await call({ slotKey: 't', images: { tile: frame.toString('base64') } })).code, 400)
  assert.equal((await call({ slotKey: 't', images: { tile: frame.toString('base64') }, tileScale: 99 })).code, 400)
  assert.equal((await call({ slotKey: '../x', images: { photo: b64 } })).code, 400)
  assert.deepEqual([...store.keys()], ['templates/t.json'])
})

test('editor: proxied URL for custom templates, and order override -> Figma -> grey box', () => {
  const rec = JSON.parse(recordJson)
  rec.zones = rec.zones.map(z => (z.id === 'photo' ? { ...z, placeholderImage: urlOf('templates/t-ph-photo.png') } : z))
  const photo = customZonesEntry({ ...rec, canvasW: 316, canvasH: 441 }).t.zones.find(z => z.id === 'photo')
  assert.equal(photo.placeholderImage, `/api/list-templates?url=${encodeURIComponent(urlOf('templates/t-ph-photo.png'))}`)
  assert.equal(placeholderImageFor(photo, 'brand-new-template'), photo.placeholderImage)
  assert.equal(placeholderImageFor(photo, 'wen-cheng-flyer1'), '/placeholders/wen-cheng-photo.png') // hand-picked still wins
  assert.equal(placeholderImageFor({ id: 'photo' }, 'brand-new-template'), IMAGE_PLACEHOLDERS.photo) // old records unchanged
})

test('template card uses the tile when there is one, the plain background otherwise', () => {
  const rec = { slotKey: 't', label: 'T', cat: 'restaurant', format: 'Flyer', backgroundUrl: urlOf('templates/t-bg.png') }
  const proxied = u => `/api/list-templates?url=${encodeURIComponent(u)}`
  assert.equal(customTemplateCards(rec)[0].thumb, proxied(rec.backgroundUrl))
  assert.equal(customTemplateCards({ ...rec, tileUrl: urlOf('templates/t-tile.png') })[0].thumb, proxied(urlOf('templates/t-tile.png')))
})
