import { test, mock, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { conditionalBlob } from './_conditionalBlob.mjs'
const blob = conditionalBlob()
mock.module('@vercel/blob', { namedExports: blob.namedExports })
const { default: comments } = await import('../api/comments.js')
const { default: projects } = await import('../api/save-project.js')
const { recordFailure, checkLock, clearFailures } = await import('../api/_lib/loginLimit.js')
const { updateJson } = await import('../api/_lib/atomicJson.js')
async function call(handler, method, body) {
  const result = {}
  await handler({ method, body, query: {}, headers: {} }, {
    status(code) { result.code = code; return this },
    json(body) { result.body = body; return this }, setHeader() {},
  })
  return result
}
beforeEach(() => { blob.store.clear(); blob.writes.length = 0; delete blob.faults.read; delete blob.faults.write })

test('eight simultaneous comments and resolutions retain every successful update', async () => {
  const posts = await Promise.all(Array.from({ length: 8 }, (_, n) => call(comments, 'POST', { projectId: 'p', name: 'Designer', text: `Comment ${n}`, from: 'designer' })))
  assert.ok(posts.every(p => p.code === 200))
  let stored = JSON.parse(blob.store.get('comments/p.json'))
  assert.equal(stored.length, 8)
  assert.equal(new Set(stored.map(c => c.text)).size, 8)
  const changes = await Promise.all(stored.map(c => call(comments, 'PATCH', { projectId: 'p', commentId: c.id, resolved: true })))
  assert.ok(changes.every(p => p.code === 200))
  stored = JSON.parse(blob.store.get('comments/p.json'))
  assert.ok(stored.every(c => c.resolved))
  assert.ok(blob.writes.some(w => w.options.ifMatch))
})
test('simultaneous failed passwords count separately and enforce the existing lock threshold', async () => {
  await Promise.all(Array.from({ length: 5 }, () => recordFailure('test@example.com', 1000)))
  assert.equal((await checkLock('test@example.com', 1001)).locked, true)
  await clearFailures('test@example.com')
  assert.equal((await checkLock('test@example.com', 1002)).locked, false)
})
test('approval racing an autosave cannot be overwritten by the stale review state', async () => {
  blob.store.set('projects/p.json', JSON.stringify({ id: 'p', templateId: 't', reviewStatus: 'review', fields: { headline: 'Original' } }))
  const [approval, save] = await Promise.all([
    call(projects, 'PATCH', { projectId: 'p', status: 'approved' }),
    call(projects, 'POST', { id: 'p', templateId: 't', fields: { headline: 'Autosave' } }),
  ])
  assert.equal(approval.code, 200)
  assert.ok([200, 409].includes(save.code))
  assert.equal(JSON.parse(blob.store.get('projects/p.json')).reviewStatus, 'approved')
})
test('a rejected reply does not create or change the comments document', async () => {
  const result = await call(comments, 'POST', { projectId: 'p', parentId: 'missing', name: 'D', text: 'Reply' })
  assert.equal(result.code, 404)
  assert.equal(blob.store.size, 0)
})
test('non-conflict storage failures are not silently retried or written', async () => {
  blob.faults.write = new Error('offline')
  let calls = 0
  await assert.rejects(updateJson('x', () => { calls++; return { ok: true } }), /offline/)
  assert.equal(calls, 1)
  assert.equal(blob.store.size, 0)
})
test('read failures propagate without treating an existing document as absent', async () => {
  blob.store.set('x', JSON.stringify({ kept: true }))
  blob.faults.read = new Error('unavailable')
  await assert.rejects(updateJson('x', () => ({ kept: false })), /unavailable/)
  assert.deepEqual(JSON.parse(blob.store.get('x')), { kept: true })
})
