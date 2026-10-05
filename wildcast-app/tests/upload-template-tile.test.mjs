// Run with: npm test
// api/upload-template-tile.js: the manual way to set a template's card picture.
// Designers only; any readable image becomes a PNG tile (capped at 1200px wide)
// saved as templates/<slot>-tile.png and linked on the record.
import { test, mock, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { makeBlobMock, urlOf } from './_blobMock.mjs'

process.env.BLOB_READ_WRITE_TOKEN = 'test-token'
const { store, namedExports, fetchMock } = makeBlobMock()
mock.module('@vercel/blob', { namedExports })
globalThis.fetch = fetchMock

const { default: handler } = await import('../api/upload-template-tile.js')
const sharp = (await import('sharp')).default

function call(body, headers = { 'x-activation-key': 'DES-KEY' }) {
  return new Promise(resolve => {
    const res = {
      setHeader() {},
      status(code) { this.code = code; return this },
      json(data) { resolve({ code: this.code, data }) },
      end() { resolve({ code: this.code, data: null }) },
    }
    handler({ method: 'POST', headers, body }, res)
  })
}

const image = (w, h, fmt = 'png') => sharp({ create: { width: w, height: h, channels: 3, background: '#fa0' } })[fmt]().toBuffer()

beforeEach(() => {
  store.clear()
  process.env.WILDCAST_KEYS = 'DES-KEY|Studio|100|designer,CLIENT-KEY|Wolt DE|100|partner'
  store.set('templates/t.json', JSON.stringify({ slotKey: 't', backgroundUrl: urlOf('templates/t-bg.png'), zones: [] }))
})

test('a designer uploads a PNG: saved as the tile and linked on the record', async () => {
  const png = await image(600, 850)
  const { code, data } = await call({ slotKey: 't', imageBase64: png.toString('base64') })
  assert.equal(code, 200)
  assert.equal(data.tileUrl, urlOf('templates/t-tile.png'))
  assert.equal(JSON.parse(store.get('templates/t.json')).tileUrl, urlOf('templates/t-tile.png'))
  assert.equal((await sharp(store.get('templates/t-tile.png')).metadata()).width, 600)
})

test('a JPG works too, a data URL is accepted, and a huge image is scaled down', async () => {
  const jpg = await image(2400, 3400, 'jpeg')
  const { code } = await call({ slotKey: 't', imageBase64: 'data:image/jpeg;base64,' + jpg.toString('base64') })
  assert.equal(code, 200)
  const meta = await sharp(store.get('templates/t-tile.png')).metadata()
  assert.equal(meta.format, 'png')
  assert.equal(meta.width, 1200)
})

test('refused: clients, no sign-in, a non-image, an unknown template - and nothing is written', async () => {
  const png = (await image(100, 140)).toString('base64')
  assert.equal((await call({ slotKey: 't', imageBase64: png }, { 'x-activation-key': 'CLIENT-KEY' })).code, 403)
  assert.equal((await call({ slotKey: 't', imageBase64: png }, {})).code, 403)
  assert.equal((await call({ slotKey: 't', imageBase64: Buffer.from('not an image').toString('base64') })).code, 400)
  assert.equal((await call({ slotKey: 'missing', imageBase64: png })).code, 404)
  assert.equal((await call({ slotKey: '../x', imageBase64: png })).code, 400)
  assert.equal(store.has('templates/t-tile.png'), false)
  assert.equal(JSON.parse(store.get('templates/t.json')).tileUrl, undefined)
})
