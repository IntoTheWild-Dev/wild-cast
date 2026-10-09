import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  sortByName, newRow, rowsFromItems, nameFromFile, rowName,
  buildRowFields, applyImageToAll, MAX_BATCH,
} from '../src/lib/batch.js'

const f = name => ({ name, url: `blob:${name}` })

test('files sort in natural order (logo-2 before logo-10)', () => {
  const sorted = sortByName([f('logo-10.png'), f('logo-2.png'), f('Logo-1.png')])
  assert.deepEqual(sorted.map(x => x.name), ['Logo-1.png', 'logo-2.png', 'logo-10.png'])
})

test('10 logos dropped on "+ Add design" -> 10 designs, one logo each, in name order', () => {
  const rows = rowsFromItems(Array.from({ length: 10 }, (_, i) => f(`logo-${10 - i}.png`)), 'logo', 0)
  assert.equal(rows.length, 10)
  assert.equal(rows[0].images.logo.name, 'logo-1.png')
  assert.equal(rows[9].images.logo.name, 'logo-10.png')
  assert.equal(new Set(rows.map(r => r.id)).size, 10)
})

test('bulk add never goes past the cap', () => {
  const rows = rowsFromItems(Array.from({ length: 10 }, (_, i) => f(`${i}.png`)), 'logo', MAX_BATCH - 3)
  assert.equal(rows.length, 3)
})

test('a design combines the shared text with its own images', () => {
  const row = newRow({ logo: f('a.png'), photo: f('pizza.jpg') })
  assert.deepEqual(
    buildRowFields({ sharedText: { headline: 'HI' }, images: row.images, imageZoneIds: ['logo', 'photo', 'qr'] }),
    { headline: 'HI', logoUrl: 'blob:a.png', photoUrl: 'blob:pizza.jpg', qrUrl: null },
  )
})

test('"Use on all" puts one image on every design and keeps the rest', () => {
  const rows = [newRow({ logo: f('a.png') }), newRow({ logo: f('b.png') })]
  const next = applyImageToAll(rows, 'qr', f('qr.png'))
  assert.deepEqual(next.map(r => [r.images.logo.name, r.images.qr.name]), [['a.png', 'qr.png'], ['b.png', 'qr.png']])
})

test('design names: typed > file name > "Design N"', () => {
  assert.equal(nameFromFile('edeka_eble-logo.png'), 'Edeka eble')
  assert.equal(nameFromFile('Burger King FOOD final.jpg'), 'Burger King')
  assert.equal(nameFromFile('logo.png'), '')
  assert.equal(rowName({ name: 'Eble', images: { logo: f('x-logo.png') } }, ['logo'], 0), 'Eble')
  assert.equal(rowName({ name: '', images: { logo: f('logo.png'), photo: f('sushi-bar.jpg') } }, ['logo', 'photo'], 0), 'Sushi bar')
  assert.equal(rowName({ name: '', images: {} }, ['logo'], 2), 'Design 3')
})
