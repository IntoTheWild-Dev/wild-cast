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

// ── Catalogue tile: which layers the temporary copy shows ──────────────────
const applyTile = vm.runInContext('applyTileVisibility', ctx)
function tree(children) {
  const root = { name: 'frame', type: 'FRAME', visible: true, children }
  children.forEach(c => { c.parent = root })
  return root
}
const layer = (name, extra = {}) => ({ name, type: 'RECTANGLE', visible: false, absoluteBoundingBox: box(0, 0, 10, 10), fills: [], ...extra })

test('tile copy: content layers shown, zone guide boxes hidden', () => {
  const guide = layer('zone:headline')
  const text = layer('headline', { type: 'TEXT' })
  const bg = layer('Rectangle 941', { visible: true })
  applyTile(tree([guide, text, bg]))
  assert.equal(text.visible, true)
  assert.equal(guide.visible, false)
  assert.equal(bg.visible, true) // already-visible artwork is left alone
})
test('tile copy: a zone marker that is itself live text is shown', () => {
  const marker = layer('zone:offer', { type: 'TEXT' })
  applyTile(tree([marker]))
  assert.equal(marker.visible, true)
})
test('tile copy: photo (or the older image name) and sticker pictures are shown, other hidden layers stay hidden', () => {
  const zp = layer('zone:photo', { absoluteBoundingBox: box(100, 100, 200, 150) })
  const food = layer('image', { absoluteBoundingBox: box(120, 120, 100, 80), fills: [{ type: 'IMAGE' }] })
  const zs = layer('zone:sticker', { absoluteBoundingBox: box(400, 100, 50, 50) })
  const sticker = layer('sticker', { absoluteBoundingBox: box(900, 900, 5, 5), fills: [{ type: 'IMAGE' }] })
  const other = layer('ai text')
  applyTile(tree([zp, food, zs, sticker, other]))
  assert.equal(food.visible, true)
  assert.equal(sticker.visible, true)
  assert.equal(zp.visible, false)
  assert.equal(other.visible, false)
})
test('tile copy: a hidden parent group is switched on so its content shows', () => {
  const group = { name: 'group', type: 'GROUP', visible: false, children: [], absoluteBoundingBox: box(0, 0, 1, 1) }
  const text = layer('tc', { type: 'TEXT' }); text.parent = group; group.children.push(text)
  const marker = layer('zone:tc')
  applyTile(tree([group, marker]))
  assert.equal(group.visible, true)
  assert.equal(text.visible, true)
})
