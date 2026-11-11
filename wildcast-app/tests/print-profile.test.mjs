import './_securityEnv.mjs'
process.env.WILDCAST_KEYS = 'PRINT-TEST|Print QA|100|agency'
delete process.env.ACTIVATION_KEYS_END
import { test, mock, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { LEGACY_PRINT_PROFILE, printProfileFor } from '../src/lib/printProfile.js'

const store = new Map()
mock.module('@vercel/blob', {
  namedExports: {
    list: async ({ prefix }) => ({ blobs: store.has(prefix) ? [{ url: `https://storage.invalid/${prefix}` }] : [] }),
    get: async path => store.has(path) ? { stream: new Response(store.get(path)).body, blob: { etag: store.get(path) } } : null,
    put: async (path, body) => { store.set(path, body); return { url: `mem://${path}` } },
  },
})
const { default: save } = await import('../api/save-project.js')
const { default: load } = await import('../api/load-project.js')
async function call(handler, method, body, query = {}) {
  const result = {}
  const res = {
    status(code) { result.code = code; return this },
    json(body) { result.body = body; return this },
    setHeader() {},
  }
  await handler({ method, body, query, headers: { 'x-activation-key': 'PRINT-TEST' } }, res)
  return result
}
beforeEach(() => {
  store.clear()
  mock.method(globalThis, 'fetch', async url => {
    const path = new URL(url).pathname.slice(1)
    return new Response(store.get(path), { status: store.has(path) ? 200 : 404 })
  })
})

test('profile survives save and reopening on another client without altering artwork', async () => {
  for (const iccProfile of ['fogra39-300', 'fogra39', 'fogra51']) {
    const project = { id: 'profile-test', templateId: 't', fields: { headline: 'Same artwork' }, iccProfile }
    assert.equal((await call(save, 'POST', project)).code, 200)
    const reopened = await call(load, 'GET', null, { id: project.id })
    assert.equal(reopened.code, 200)
    assert.equal(printProfileFor(reopened.body), iccProfile)
    assert.deepEqual(reopened.body.fields, project.fields)
  }
})
test('saving from an older client preserves an existing FOGRA39 choice', async () => {
  store.set('projects/old.json', JSON.stringify({ id: 'old', iccProfile: 'fogra39' }))
  await call(save, 'POST', { id: 'old', templateId: 't', fields: { headline: 'Edited' } })
  assert.equal(JSON.parse(store.get('projects/old.json')).iccProfile, 'fogra39')
})
test('explicit profile changes persist and legacy designs retain their historical fallback', async () => {
  store.set('projects/old.json', JSON.stringify({ id: 'old', iccProfile: 'fogra39' }))
  await call(save, 'POST', { id: 'old', templateId: 't', iccProfile: 'fogra51' })
  assert.equal(JSON.parse(store.get('projects/old.json')).iccProfile, 'fogra51')
  await call(save, 'POST', { id: 'legacy', templateId: 't' })
  assert.equal(JSON.parse(store.get('projects/legacy.json')).iccProfile, LEGACY_PRINT_PROFILE)
  assert.equal(printProfileFor({}), LEGACY_PRINT_PROFILE)
  assert.equal(printProfileFor({ iccProfile: 'unknown' }), LEGACY_PRINT_PROFILE)
})
