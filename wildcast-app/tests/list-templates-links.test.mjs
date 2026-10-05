// Run with: npm test
// api/list-templates.js attaches each template's tile, PDF and photo / sticker
// example links from the FILES that exist next to its record - not from the
// record. A record rewritten from a stale read (re-import, Save zone settings,
// Publish) therefore can't lose them.
import { test, mock, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { makeBlobMock, urlOf } from './_blobMock.mjs'

process.env.BLOB_READ_WRITE_TOKEN = 'test-token'
const { store, namedExports, fetchMock } = makeBlobMock()
mock.module('@vercel/blob', { namedExports })
globalThis.fetch = fetchMock
const { default: handler } = await import('../api/list-templates.js')
const { attachDerivedLinks } = await import('../api/_lib/templateAssets.js')

function list() {
  return new Promise(resolve => {
    const res = { headers: {}, setHeader() {}, status(c) { this.code = c; return this }, json(d) { resolve(d) }, end() { resolve(null) } }
    handler({ method: 'GET', query: {}, headers: {} }, res)
  })
}
const rec = (o = {}) => ({ slotKey: 't', backgroundUrl: urlOf('templates/t-bg.png'), zones: [{ id: 'headline', type: 'text' }, { id: 'photo', type: 'image' }, { id: 'sticker', type: 'image' }, { id: 'qr', type: 'image' }], ...o })

beforeEach(() => {
  store.clear()
  store.set('templates/t.json', JSON.stringify(rec()))
})

test('a record with no links of its own still gets tile, pdf and examples from the files next to it', async () => {
  for (const f of ['t-bg.png', 't-tile.png', 't-bg.pdf', 't-ph-photo.png', 't-ph-sticker.png']) store.set('templates/' + f, Buffer.from('x'))
  const { templates } = await list()
  const t = templates[0]
  assert.equal(t.tileUrl, urlOf('templates/t-tile.png'))
  assert.equal(t.backgroundPdfUrl, urlOf('templates/t-bg.pdf'))
  assert.equal(t.zones.find(z => z.id === 'photo').placeholderImage, urlOf('templates/t-ph-photo.png'))
  assert.equal(t.zones.find(z => z.id === 'sticker').placeholderImage, urlOf('templates/t-ph-sticker.png'))
  assert.equal('placeholderImage' in t.zones.find(z => z.id === 'qr'), false, 'logo / qr never get an example')
  assert.equal('placeholderImage' in t.zones.find(z => z.id === 'headline'), false)
})

test('this is what makes them survive a stale rewrite of the record', async () => {
  store.set('templates/t-tile.png', Buffer.from('x'))
  store.set('templates/t-ph-photo.png', Buffer.from('x'))
  // a rewrite that started from an OLD copy: no links in it at all
  store.set('templates/t.json', JSON.stringify(rec({ live: true })))
  const t = (await list()).templates[0]
  assert.ok(t.tileUrl && t.zones.find(z => z.id === 'photo').placeholderImage)
  assert.equal(t.live, true)
})

test('a template with no extra files is returned exactly as stored, and other templates are not mixed up', async () => {
  store.set('templates/other.json', JSON.stringify(rec({ slotKey: 'other' })))
  store.set('templates/other-tile.png', Buffer.from('x'))
  const { templates } = await list()
  const t = templates.find(x => x.slotKey === 't')
  const other = templates.find(x => x.slotKey === 'other')
  assert.equal(t.tileUrl, undefined)
  assert.equal(other.tileUrl, urlOf('templates/other-tile.png'))
})

test('override-only records and odd input are left alone, never thrown on', () => {
  const override = { slotKey: 'x', isOverrideOnly: true }
  assert.equal(attachDerivedLinks(override, new Map([['templates/x-tile.png', 'u']])), override)
  assert.equal(attachDerivedLinks(null, new Map()), null)
  const r = rec()
  assert.equal(attachDerivedLinks(r, undefined), r)
})
