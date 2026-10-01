// Run with: npm test
// An approved design is locked: a plain save (autosave / manual Save) is
// rejected until someone moves it back into review; saves that name a
// reviewStatus (an intentional transition) still go through.
import { test, beforeEach, mock } from 'node:test'
import assert from 'node:assert/strict'

const store = new Map()
mock.module('@vercel/blob', {
  namedExports: {
    list: async () => ({ blobs: [] }),
    get: async path => (store.has(path) ? { stream: new Response(store.get(path)).body } : null),
    put: async (path, body) => { store.set(path, body); return { pathname: path, url: `mem://${path}` } },
  },
})

const { default: handler } = await import('../api/save-project.js')

function call(method, body) {
  const out = { code: null, body: null }
  const res = {
    status(c) { out.code = c; return this },
    json(b) { out.body = b; return this },
    end() { return this },
    setHeader() { return this },
  }
  return handler({ method, body, query: {}, headers: {} }, res).then(() => out)
}

const seed = status => store.set('projects/p1.json', JSON.stringify({ id: 'p1', templateId: 't', reviewStatus: status, projectName: 'Old' }))
const saved = () => JSON.parse(store.get('projects/p1.json'))

beforeEach(() => store.clear())

test('plain save of an approved design is rejected and nothing is written', async () => {
  seed('approved')
  const out = await call('POST', { id: 'p1', templateId: 't', projectName: 'Edited' })
  assert.equal(out.code, 409)
  assert.equal(saved().projectName, 'Old')
  assert.equal(saved().reviewStatus, 'approved')
})

test('plain save still works for every non-approved status', async () => {
  for (const status of ['design', 'review', 'changes_requested']) {
    seed(status)
    const out = await call('POST', { id: 'p1', templateId: 't', projectName: 'Edited' })
    assert.equal(out.code, 200, status)
    assert.equal(saved().projectName, 'Edited', status)
    assert.equal(saved().reviewStatus, status, status)
  }
})

test('Edit = PATCH back to review, after which saving works again', async () => {
  seed('approved')
  const patch = await call('PATCH', { projectId: 'p1', status: 'review' })
  assert.equal(patch.code, 200)
  assert.equal(saved().reviewStatus, 'review')
  const out = await call('POST', { id: 'p1', templateId: 't', projectName: 'Edited' })
  assert.equal(out.code, 200)
  assert.equal(saved().projectName, 'Edited')
})

test('a save that names a reviewStatus (intentional transition) is allowed on an approved design', async () => {
  seed('approved')
  const out = await call('POST', { id: 'p1', templateId: 't', projectName: 'Resent', reviewStatus: 'review' })
  assert.equal(out.code, 200)
  assert.equal(saved().reviewStatus, 'review')
})

test('a brand-new project is unaffected', async () => {
  const out = await call('POST', { id: 'p1', templateId: 't', projectName: 'New' })
  assert.equal(out.code, 200)
  assert.equal(saved().reviewStatus, 'design')
})
