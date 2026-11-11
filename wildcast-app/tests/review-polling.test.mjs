import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const source = readFileSync(new URL('../src/components/ReviewPage.jsx', import.meta.url), 'utf8')
const commentLoader = source.match(/  async function loadComments\([\s\S]*?\n  \}/)[0]
const status = source.match(/  async function refreshReviewStatus\([\s\S]*?\n  \}/)[0]
const effect = source.match(/useEffect\(\(\) => \{\n    if \(loading \|\| error\)[\s\S]*?\}, \[projectId, reviewToken, loading, error\]\)/)[0]
function start() {
  const pending = []
  let poll, cleanup, comments = ['saved'], project = { reviewStatus: 'review' }
  vm.runInNewContext(`${commentLoader}\n${status}\n${effect}`, {
    reviewToken: null, reviewHeaders: () => ({}), projectId: 'qa', loading: false, error: null,
    fetch: url => new Promise((resolve, reject) => pending.push({ url, resolve, reject })),
    setComments: value => { comments = value },
    setProject: fn => { project = fn(project) },
    useEffect: fn => { cleanup = fn() },
    setInterval: fn => { poll = fn; return 1 }, clearInterval: () => {},
  })
  return { pending, poll: () => poll(), stop: () => cleanup(), comments: () => comments, project: () => project }
}
function respond(request, data, ok = true) { request.resolve({ ok, json: async () => data }) }
test('background network failures are handled and the next poll recovers', async () => {
  const s = start(), first = s.poll()
  s.pending[0].reject(new Error('offline'))
  s.pending[1].reject(new Error('offline'))
  await first
  assert.deepEqual(s.comments(), ['saved'])
  const next = s.poll()
  respond(s.pending[2], { comments: ['new'] })
  respond(s.pending[3], { reviewStatus: 'approved' })
  await next
  assert.deepEqual(s.comments(), ['new'])
  assert.equal(s.project().reviewStatus, 'approved')
})
test('HTTP errors do not erase the last good comments or status', async () => {
  const s = start(), tick = s.poll()
  respond(s.pending[0], { error: 'Unavailable' }, false)
  respond(s.pending[1], { error: 'Unavailable' }, false)
  await tick
  assert.deepEqual(s.comments(), ['saved'])
  assert.equal(s.project().reviewStatus, 'review')
})
test('out-of-order and abandoned review polls cannot replace current data', async () => {
  const s = start(), old = s.poll(), latest = s.poll()
  respond(s.pending[2], { comments: ['latest'] })
  respond(s.pending[3], { reviewStatus: 'approved' })
  await latest
  respond(s.pending[0], { comments: ['old'] })
  respond(s.pending[1], { reviewStatus: 'review' })
  await old
  const abandoned = s.poll()
  s.stop()
  respond(s.pending[4], { comments: ['abandoned'] })
  respond(s.pending[5], { reviewStatus: 'design' })
  await abandoned
  assert.deepEqual(s.comments(), ['latest'])
  assert.equal(s.project().reviewStatus, 'approved')
})
