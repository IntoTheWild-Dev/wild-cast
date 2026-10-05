// Run with: npm test
// Runs the real figma-plugin/code.js in a sandbox (with a stubbed `figma`) and
// checks which layer it picks as the photo / sticker example.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../figma-plugin/code.js', import.meta.url), 'utf8')
const noop = new Proxy(function () {}, { get: () => noop, apply: () => noop })
const ctx = { __html__: '', figma: noop, fetch: async () => ({}), console, btoa, setTimeout }
vm.createContext(ctx)
vm.runInContext(src, ctx)
const find = vm.runInContext('findExampleNode', ctx)

const box = (x, y, width, height) => ({ x, y, width, height })
const img = (name, b) => ({ name, absoluteBoundingBox: b, fills: [{ type: 'IMAGE' }] })
const rect = (name, b) => ({ name, absoluteBoundingBox: b, fills: [{ type: 'SOLID' }] })
const zone = rect('zone:photo', box(100, 100, 200, 150))

test('a layer named exactly photo is used', () => {
  assert.equal(find([zone, img('photo', box(0, 0, 10, 10))], 'photo').node.name, 'photo')
})
test('older templates: a layer named image counts when it sits inside the photo zone', () => {
  assert.equal(find([zone, img('image', box(120, 120, 100, 80))], 'photo').node.name, 'image')
})
test('an image layer elsewhere on the page is ignored', () => {
  assert.equal(find([zone, img('image', box(0, 0, 50, 50))], 'photo').node, null)
})
test('photo wins over image', () => {
  const nodes = [zone, img('image', box(120, 120, 100, 80)), img('photo', box(0, 0, 10, 10))]
  assert.equal(find(nodes, 'photo').node.name, 'photo')
})
test('zone:photo holding the picture itself is used directly', () => {
  assert.equal(find([img('zone:photo', box(1, 1, 5, 5))], 'photo').node.name, 'zone:photo')
})
test('no zone:photo marker means nothing is looked up', () => {
  assert.equal(find([img('photo', box(0, 0, 5, 5))], 'photo').zoneMissing, true)
})
test('sticker uses only a layer named sticker, never the image alias', () => {
  const z = rect('zone:sticker', box(0, 0, 50, 50))
  assert.equal(find([z, img('sticker', box(900, 900, 5, 5))], 'sticker').node.name, 'sticker')
  assert.equal(find([z, img('image', box(10, 10, 5, 5))], 'sticker').node, null)
})
