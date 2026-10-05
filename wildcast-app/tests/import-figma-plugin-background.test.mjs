// Run with: npm test
// api/import-figma-plugin-background.js: "Update background only" replaces the
// template's background picture and nothing else - same trim as a full import,
// the record is never touched, and a frame of a different shape is refused.
import { test, mock, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { makeBlobMock, urlOf } from './_blobMock.mjs'

process.env.FIGMA_PLUGIN_KEY = 'test-key'
process.env.BLOB_READ_WRITE_TOKEN = 'test-token'
const { store, namedExports, fetchMock } = makeBlobMock()
mock.module('@vercel/blob', { namedExports })
globalThis.fetch = fetchMock

const { default: handler } = await import('../api/import-figma-plugin-background.js')
const sharp = (await import('sharp')).default
const { BLEED_UNITS } = await import('../api/_lib/figma-import.js')

function call(body, key = 'test-key') {
  return new Promise(resolve => {
    const res = { setHeader() {}, status(c) { this.code = c; return this }, json(d) { resolve({ code: this.code, data: d }) }, end() { resolve({ code: this.code }) } }
    handler({ method: 'POST', headers: { 'x-plugin-key': key }, body }, res)
  })
}
// A full bleed frame (314.646 x 436.535) exported at `scale`, in a flat colour.
const frame = (scale, w = 314.646, h = 436.535, bg = '#20c4e4') =>
  sharp({ create: { width: Math.round(w * scale), height: Math.round(h * scale), channels: 3, background: bg } }).png().toBuffer()

const record = JSON.stringify({ slotKey: 't', canvasW: 316, canvasH: 441, backgroundUrl: urlOf('templates/t-bg.png'), createdAt: '2026-10-05T12:00:00.000Z', zones: [{ id: 'headline', type: 'text', x: 12, fontSize: 40 }] })
beforeEach(() => {
  store.clear()
  store.set('templates/t.json', record)
  store.set('templates/t-bg.png', Buffer.from('old background'))
})

test('replaces the background with the trimmed new export and leaves the record byte-for-byte alone', async () => {
  const scale = 300 / 72
  const png = await frame(scale)
  const { code } = await call({ slotKey: 't', imageBase64: png.toString('base64'), scale })
  assert.equal(code, 200)
  const meta = await sharp(store.get('templates/t-bg.png')).metadata()
  const bleed = Math.round(BLEED_UNITS * scale)
  assert.equal(meta.width, Math.round(314.646 * scale) - bleed * 2)
  assert.equal(meta.height, Math.round(436.535 * scale) - bleed * 2)
  assert.equal(store.get('templates/t.json'), record, 'zones and settings untouched')
})

test('a frame of a different shape is refused and the old background is kept', async () => {
  const scale = 300 / 72
  const wide = await frame(scale, 500, 300)
  const { code, data } = await call({ slotKey: 't', imageBase64: wide.toString('base64'), scale })
  assert.equal(code, 400)
  assert.match(data.error, /different shape/)
  assert.equal(store.get('templates/t-bg.png').toString(), 'old background')
})

test('refused: wrong key, unknown template, non-PNG, bad scale, bad slotKey', async () => {
  const scale = 2
  const ok = (await frame(scale)).toString('base64')
  assert.equal((await call({ slotKey: 't', imageBase64: ok, scale }, 'nope')).code, 403)
  assert.equal((await call({ slotKey: 'missing', imageBase64: ok, scale })).code, 404)
  assert.equal((await call({ slotKey: 't', imageBase64: Buffer.from('not a png at all').toString('base64'), scale })).code, 400)
  assert.equal((await call({ slotKey: 't', imageBase64: ok, scale: 99 })).code, 400)
  assert.equal((await call({ slotKey: '../x', imageBase64: ok, scale })).code, 400)
  assert.equal(store.get('templates/t-bg.png').toString(), 'old background')
})
