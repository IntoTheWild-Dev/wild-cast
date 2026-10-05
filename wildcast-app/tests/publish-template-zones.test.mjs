// Run with: npm test
// Saving zone settings from the review screen replaces the record's zones with
// the copy the page loaded. That copy can be older than the plugin's final link
// step, so it must not wipe the photo/sticker example links (or tileUrl).
import { test, mock, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { makeBlobMock, urlOf } from './_blobMock.mjs'

process.env.BLOB_READ_WRITE_TOKEN = 'test-token'
const { store, namedExports, fetchMock } = makeBlobMock()
mock.module('@vercel/blob', { namedExports })
globalThis.fetch = fetchMock
const { default: handler } = await import('../api/publish-template.js')

function call(body) {
  return new Promise(resolve => {
    const res = { setHeader() {}, status(c) { this.code = c; return this }, json(d) { resolve({ code: this.code, data: d }) }, end() { resolve({ code: this.code }) } }
    handler({ method: 'POST', headers: { 'x-activation-key': 'DES-KEY' }, body }, res)
  })
}

beforeEach(() => {
  store.clear()
  process.env.WILDCAST_KEYS = 'DES-KEY|Studio|100|designer'
  store.set('templates/t.json', JSON.stringify({
    slotKey: 't', tileUrl: urlOf('templates/t-tile.png'), backgroundPdfUrl: urlOf('templates/t-bg.pdf'),
    zones: [{ id: 'headline', type: 'text', x: 1 }, { id: 'photo', type: 'image', x: 2, placeholderImage: urlOf('templates/t-ph-photo.png') }],
  }))
})

test('a stale zones copy (no example link) keeps the existing link; edits still apply; tile and pdf untouched', async () => {
  const stale = [{ id: 'headline', type: 'text', x: 50 }, { id: 'photo', type: 'image', x: 60 }]
  const { code } = await call({ slotKey: 't', action: 'updateZones', zones: stale })
  assert.equal(code, 200)
  const rec = JSON.parse(store.get('templates/t.json'))
  assert.equal(rec.zones.find(z => z.id === 'photo').x, 60)
  assert.equal(rec.zones.find(z => z.id === 'photo').placeholderImage, urlOf('templates/t-ph-photo.png'))
  assert.equal(rec.zones.find(z => z.id === 'headline').x, 50)
  assert.equal(rec.tileUrl, urlOf('templates/t-tile.png'))
  assert.equal(rec.backgroundPdfUrl, urlOf('templates/t-bg.pdf'))
})

test('a link that is already on the incoming zone is not overridden', async () => {
  const newer = [{ id: 'photo', type: 'image', placeholderImage: urlOf('templates/t-ph-photo-v2.png') }]
  await call({ slotKey: 't', action: 'updateZones', zones: newer })
  assert.equal(JSON.parse(store.get('templates/t.json')).zones[0].placeholderImage, urlOf('templates/t-ph-photo-v2.png'))
})
