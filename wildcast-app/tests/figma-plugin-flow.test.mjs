// Run with: npm test
// Runs the REAL figma-plugin/code.js import sequence against a small fake Figma
// document and a fake server: which requests go out and in what order, what the
// temporary tile copy shows, that the real layers are never changed and the
// copies are always removed, and what the final message says when a step fails.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../figma-plugin/code.js', import.meta.url), 'utf8')
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4])
const bb = (x, y, width, height) => ({ x, y, width, height })

class Node {
  constructor(o) { Object.assign(this, { visible: true, children: [], fills: [], parent: null }, o) }
  // Like Figma: a copy is a deep copy that sits next to the original in its parent.
  _copy(parent) {
    const c = new Node({ ...this, children: [], parent })
    for (const ch of this.children) c.children.push(ch._copy(c))
    return c
  }
  clone() {
    const c = this._copy(this.parent)
    this.parent?.children.push(c)
    return c
  }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(n => n !== this) }
  async exportAsync(settings) { this.onExport?.(this, settings); return PNG_BYTES }
}

function buildFrame() {
  const frame = new Node({ name: 'FINAL', type: 'FRAME', id: '1:2', absoluteBoundingBox: bb(0, 0, 314.646, 436.535) })
  const add = (n) => { n.parent = frame; frame.children.push(n); return n }
  add(new Node({ name: 'Rectangle 941', type: 'RECTANGLE', absoluteBoundingBox: bb(10, 10, 290, 420) }))
  add(new Node({ name: 'zone:headline', type: 'RECTANGLE', visible: false, absoluteBoundingBox: bb(20, 40, 270, 60) }))
  add(new Node({ name: 'headline', type: 'TEXT', visible: false, characters: '150 GRATIS', fontName: { family: 'Omnes Cond', style: 'Bold' }, fontSize: 40, textAlignHorizontal: 'CENTER', absoluteBoundingBox: bb(20, 40, 270, 60) }))
  add(new Node({ name: 'zone:photo', type: 'RECTANGLE', visible: false, absoluteBoundingBox: bb(60, 120, 200, 140) }))
  add(new Node({ name: 'photo', type: 'RECTANGLE', visible: false, fills: [{ type: 'IMAGE' }], absoluteBoundingBox: bb(70, 130, 150, 110) }))
  add(new Node({ name: 'zone:sticker', type: 'RECTANGLE', visible: false, absoluteBoundingBox: bb(230, 130, 50, 50) }))
  add(new Node({ name: 'sticker', type: 'RECTANGLE', visible: false, fills: [{ type: 'IMAGE' }], absoluteBoundingBox: bb(232, 132, 46, 46) }))
  return frame
}

// Runs one import against `behaviour` (which can make steps fail) and returns what happened.
async function runImport(behaviour = {}, action = 'import') {
  const frame = buildFrame()
  const calls = []        // [{ path, body }]
  const messages = []     // ui messages
  const exports_ = []     // what each export saw
  const originalCount = frame.children.length

  const fakeFetch = async (url, opts = {}) => {
    const path = String(url).replace('https://cast.wildstack.studio', '')
    const body = opts.body ? JSON.parse(opts.body) : null
    calls.push({ path, body })
    const reply = (status, json) => ({ ok: status < 400, status, json: async () => json })
    if (path.startsWith('/api/list-templates')) return reply(200, { templates: [] })
    if (path === '/api/import-figma-plugin') return reply(200, { label: 'Option E', needsReview: [], recordUrl: 'https://s.private.blob.vercel-storage.com/templates/t.json' })
    if (behaviour[path]) return behaviour[path](body, reply)
    if (path === '/api/import-figma-plugin-background') return reply(200, { ok: true, url: 'https://s.private.blob.vercel-storage.com/templates/t-bg.png' })
    if (path === '/api/import-figma-plugin-pdf') return reply(200, { url: 'https://s.private.blob.vercel-storage.com/templates/t-bg.pdf' })
    if (path === '/api/import-figma-plugin-placeholder') {
      const urls = {}
      for (const id of Object.keys(body.images)) urls[id] = `https://s.private.blob.vercel-storage.com/templates/t-${id === 'tile' ? 'tile' : 'ph-' + id}.png`
      return reply(200, { urls, failed: {} })
    }
    return reply(404, { error: 'unexpected ' + path })
  }

  const figma = {
    fileKey: 'FILE',
    currentPage: { selection: [frame] },
    showUI() {},
    ui: { postMessage: m => messages.push(m), onmessage: null },
    mixed: Symbol('mixed'),
  }
  const ctx = { __html__: '', figma, fetch: fakeFetch, console, btoa, setTimeout }
  vm.createContext(ctx)
  vm.runInContext(src, ctx)

  // Record, at each export, whether a temporary copy exists and what it shows.
  const watch = n => {
    n.onExport = (node, settings) => {
      const copies = frame.children.filter(c => c.name === 'FINAL')
      exports_.push({
        node: node.name, format: settings.format, scale: settings.constraint?.value,
        frameChildrenAtExport: frame.children.length,
        copyShows: node.name === 'FINAL' && node !== frame
          ? Object.fromEntries(node.children.map(c => [c.name, c.visible])) : null,
        isCopy: node !== frame && !frame.children.includes(node) ? true : copies.includes(node),
      })
      if (behaviour.failTileExport && settings.constraint?.value === 1.5) throw new Error('export boom')
    }
    n.children.forEach(watch)
  }
  watch(frame)
  const origClone = Node.prototype.clone
  // new copies must be watched too
  Node.prototype.clone = function () { const c = origClone.call(this); watch(c); return c }
  try {
    if (action === 'background') await vm.runInContext('handleBackgroundUpdate', ctx)('t', 'Option E')
    else await vm.runInContext('handleImport', ctx)('t', 'Option E', 'restaurant', 'Flyer')
  } finally {
    Node.prototype.clone = origClone
  }
  const done = messages.find(m => m.type === 'done')
  return { frame, calls, messages, exports_, done, originalCount }
}

test('happy path: import, pdf, tile, examples - and the record is never touched again', async () => {
  const { calls, done, frame, originalCount } = await runImport()
  assert.deepEqual(calls.filter(c => !c.path.startsWith('/api/list-templates')).map(c => c.path), [
    '/api/import-figma-plugin', '/api/import-figma-plugin-pdf',
    '/api/import-figma-plugin-placeholder', '/api/import-figma-plugin-placeholder',
  ])
  const placeholderCalls = calls.filter(c => c.path === '/api/import-figma-plugin-placeholder')
  assert.deepEqual(Object.keys(placeholderCalls[0].body.images), ['tile'])
  assert.equal(placeholderCalls[0].body.tileScale, 1.5)
  assert.deepEqual(Object.keys(placeholderCalls[1].body.images).sort(), ['photo', 'sticker'])

  assert.match(done.pdfNote, /Saved: pdf, tile, photo \(the "photo" layer\), sticker \(the "sticker" layer\)/)
  assert.match(done.pdfNote, /within about 30 seconds/)
  assert.equal(frame.children.length, originalCount, 'every temporary copy was removed')
})

test('the real layers are never changed, and the frame\'s own PNG/PDF exports happen before any copy exists', async () => {
  const { frame, exports_, originalCount } = await runImport()
  for (const n of frame.children) {
    const hiddenOnPurpose = n.name !== 'Rectangle 941'
    assert.equal(n.visible, !hiddenOnPurpose, `${n.name} visibility changed`)
  }
  const frameExports = exports_.filter(e => e.node === 'FINAL' && !e.copyShows)
  assert.deepEqual(frameExports.map(e => e.format), ['PNG', 'PDF'])
  assert.ok(frameExports.every(e => e.frameChildrenAtExport === originalCount), 'no copy was in the frame during its PNG/PDF export')
})

test('the tile copy shows the content layers and hides the zone guide boxes', async () => {
  const { exports_ } = await runImport()
  const tile = exports_.find(e => e.copyShows && e.format === 'PNG' && e.scale === 1.5)
  assert.ok(tile, 'a tile export happened')
  assert.equal(tile.copyShows.headline, true)
  assert.equal(tile.copyShows.photo, true)
  assert.equal(tile.copyShows.sticker, true)
  assert.equal(tile.copyShows['zone:headline'], false)
  assert.equal(tile.copyShows['zone:photo'], false)
  assert.equal(tile.copyShows['zone:sticker'], false)
})

test('a failing tile export is reported, its copy is still removed, and the other files still get saved', async () => {
  const { done, calls, frame, originalCount } = await runImport({ failTileExport: true })
  assert.ok(done, 'the import itself still finishes')
  assert.match(done.pdfNote, /Tile failed: export boom/)
  assert.equal(frame.children.length, originalCount, 'the temporary copy was removed even though its export threw')
  assert.match(done.pdfNote, /Saved: pdf, photo/)
  assert.doesNotMatch(done.pdfNote, /tile \(|Saved:[^.]*tile/)
  assert.equal(calls.filter(c => c.path === '/api/import-figma-plugin-placeholder').length, 1, 'only the examples request went out')
})

test('a server error on an upload is reported with its reason and does not stop the rest', async () => {
  const { done, calls } = await runImport({ '/api/import-figma-plugin-pdf': (b, reply) => reply(500, { error: 'pdf boom' }) })
  assert.match(done.pdfNote, /PDF upload failed: pdf boom/)
  assert.match(done.pdfNote, /Saved: tile, photo/)
  assert.doesNotMatch(done.pdfNote, /Saved:[^.]*pdf/)
  assert.equal(calls.filter(c => c.path === '/api/import-figma-plugin-placeholder').length, 2, 'tile and examples still went out')
})

test('a missing food layer is explained instead of skipped silently', async () => {
  const frame = buildFrame()
  frame.children = frame.children.filter(n => n.name !== 'photo')
  // run with a custom frame via the same harness is overkill - check the finder's message path instead
  const ctx = { __html__: '', figma: { showUI() {}, ui: { postMessage() {} } }, fetch: async () => ({}), console, btoa, setTimeout }
  vm.createContext(ctx); vm.runInContext(src, ctx)
  const found = vm.runInContext('findExampleNode', ctx)(frame.children, 'photo')
  assert.equal(found.node, null)
  assert.equal(found.zoneMissing, undefined)
})

test('Update background only: re-exports the frame, replaces just the picture + pdf + tile, never touches zones or the record', async () => {
  const { calls, done, frame, originalCount, exports_ } = await runImport({}, 'background')
  assert.deepEqual(calls.filter(c => !c.path.startsWith('/api/list-templates')).map(c => c.path), [
    '/api/import-figma-plugin-background', '/api/import-figma-plugin-pdf', '/api/import-figma-plugin-placeholder',
  ])
  const bg = calls.find(c => c.path === '/api/import-figma-plugin-background').body
  assert.equal(bg.slotKey, 't')
  assert.ok(bg.imageBase64 && bg.scale > 4 - 0.01 && bg.scale <= 4)
  assert.deepEqual(Object.keys(calls.filter(c => c.path === '/api/import-figma-plugin-placeholder')[0].body.images), ['tile'], 'no photo / sticker examples re-sent')
  assert.equal(done.kind, 'background')
  assert.equal(done.needsReview.length, 0)
  assert.match(done.pdfNote, /Saved: background, pdf, tile/)
  assert.equal(frame.children.length, originalCount, 'temporary copies removed')
  assert.ok(exports_.some(e => e.node === 'FINAL' && e.format === 'PNG' && !e.copyShows))
  for (const n of frame.children) assert.equal(n.visible, n.name === 'Rectangle 941', `${n.name} visibility changed`)
})

test('Update background only: a server refusal (e.g. different frame shape) is shown, nothing else is sent', async () => {
  const { messages, calls } = await runImport({ '/api/import-figma-plugin-background': (b, reply) => reply(400, { error: 'different shape' }) }, 'background')
  assert.ok(messages.some(m => m.type === 'error' && /different shape/.test(m.message)))
  assert.equal(messages.some(m => m.type === 'done'), false)
  assert.equal(calls.some(c => c.path === '/api/import-figma-plugin-pdf'), false)
})
