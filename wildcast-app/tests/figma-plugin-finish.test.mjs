// Run with: npm test
// api/import-figma-plugin-finish.js: links the files the plugin saved (PDF,
// tile, photo / sticker examples) to the template record in ONE write, and only
// accepts URLs that are exactly this template's files in the same Blob store.
import { test, mock, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { makeBlobMock, urlOf } from './_blobMock.mjs'

process.env.FIGMA_PLUGIN_KEY = 'test-key'
process.env.BLOB_READ_WRITE_TOKEN = 'test-token'

const { store, namedExports, fetchMock } = makeBlobMock()
mock.module('@vercel/blob', { namedExports })
const fetchedUrls = []
globalThis.fetch = async (url, ...rest) => { fetchedUrls.push(String(url)); return fetchMock(url, ...rest) }

const { default: handler } = await import('../api/import-figma-plugin-finish.js')

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

const recordUrl = urlOf('templates/t.json')
const zones = () => [{ id: 'headline', type: 'text' }, { id: 'photo', type: 'image' }, { id: 'sticker', type: 'image' }]
let writes
beforeEach(() => {
  store.clear()
  fetchedUrls.length = 0
  store.set('templates/t.json', JSON.stringify({ slotKey: 't', backgroundUrl: urlOf('templates/t-bg.png'), zones: zones() }))
  writes = 0
})

const allLinks = () => ({
  tileUrl: urlOf('templates/t-tile.png'),
  backgroundPdfUrl: urlOf('templates/t-bg.pdf'),
  placeholderImages: { photo: urlOf('templates/t-ph-photo.png'), sticker: urlOf('templates/t-ph-sticker.png') },
})

test('links tile, pdf, photo and sticker in one go', async () => {
  const { code, data } = await call({ slotKey: 't', recordUrl, links: allLinks() })
  assert.equal(code, 200)
  assert.deepEqual(data.linked.sort(), ['pdf', 'photo', 'sticker', 'tile'])
  const rec = JSON.parse(store.get('templates/t.json'))
  assert.equal(rec.tileUrl, urlOf('templates/t-tile.png'))
  assert.equal(rec.backgroundPdfUrl, urlOf('templates/t-bg.pdf'))
  assert.equal(rec.zones.find(z => z.id === 'photo').placeholderImage, urlOf('templates/t-ph-photo.png'))
  assert.equal(rec.zones.find(z => z.id === 'sticker').placeholderImage, urlOf('templates/t-ph-sticker.png'))
  assert.equal('placeholderImage' in rec.zones.find(z => z.id === 'headline'), false)
  assert.equal(rec.backgroundUrl, urlOf('templates/t-bg.png')) // untouched
})

test('a partial set links what it has and leaves existing links alone', async () => {
  await call({ slotKey: 't', recordUrl, links: allLinks() })
  const { data } = await call({ slotKey: 't', recordUrl, links: { tileUrl: urlOf('templates/t-tile.png') } })
  assert.deepEqual(data.linked, ['tile'])
  const rec = JSON.parse(store.get('templates/t.json'))
  assert.ok(rec.backgroundPdfUrl && rec.zones.find(z => z.id === 'photo').placeholderImage)
})

test('a zone the template does not have is reported as skipped, the rest still link', async () => {
  store.set('templates/t.json', JSON.stringify({ slotKey: 't', backgroundUrl: urlOf('templates/t-bg.png'), zones: [{ id: 'photo', type: 'image' }] }))
  const { code, data } = await call({ slotKey: 't', recordUrl, links: allLinks() })
  assert.equal(code, 200)
  assert.match(data.skipped.sticker, /no image zone/)
  assert.deepEqual(data.linked.sort(), ['pdf', 'photo', 'tile'])
})

test('refuses URLs that are not exactly this template\'s files, and never fetches a foreign recordUrl', async () => {
  const bad = [
    { tileUrl: urlOf('templates/other-tile.png') },                                   // another template's file
    { tileUrl: 'https://evil.example.com/templates/t-tile.png' },                      // another host
    { placeholderImages: { photo: urlOf('templates/t-ph-sticker.png') } },            // wrong zone's file
    { placeholderImages: { qr: urlOf('templates/t-ph-qr.png') } },                    // unsupported zone
  ]
  for (const links of bad) {
    const { code } = await call({ slotKey: 't', recordUrl, links })
    assert.equal(code, 400, JSON.stringify(links))
  }
  assert.equal(JSON.parse(store.get('templates/t.json')).tileUrl, undefined)

  // The Blob token is only ever sent to this template's own record URL.
  fetchedUrls.length = 0
  for (const url of ['https://evil.example.com/templates/t.json', urlOf('templates/other.json'), 'http://teststore.private.blob.vercel-storage.com/templates/t.json']) {
    assert.equal((await call({ slotKey: 't', recordUrl: url, links: allLinks() })).code, 400)
  }
  assert.deepEqual(fetchedUrls, [])
})

test('wrong plugin key, missing record and nothing-to-link are all refused without writing', async () => {
  assert.equal((await call({ slotKey: 't', recordUrl, links: allLinks() }, 'nope')).code, 403)
  store.delete('templates/t.json')
  assert.equal((await call({ slotKey: 't', recordUrl, links: allLinks() })).code, 502)
  store.set('templates/t.json', JSON.stringify({ slotKey: 't', zones: zones() }))
  assert.equal((await call({ slotKey: 't', recordUrl, links: {} })).code, 400)
  assert.equal(JSON.parse(store.get('templates/t.json')).tileUrl, undefined)
})
