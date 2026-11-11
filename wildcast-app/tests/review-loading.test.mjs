import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const source = readFileSync(new URL('../src/components/ReviewPage.jsx', import.meta.url), 'utf8')
const effect = source.match(/useEffect\(\(\) => \{\n    let active = true[\s\S]*?\}, \[projectId\]\)/)?.[0]
assert.ok(effect)
function start() {
  const requests = [], updates = []
  let cleanup
  vm.runInNewContext(effect, {
    projectId: 'review',
    useEffect: fn => { cleanup = fn() },
    fetch: url => new Promise((resolve, reject) => requests.push({ url, resolve, reject })),
    setProject: value => updates.push(['project', value]),
    setComments: value => updates.push(['comments', value]),
    setError: value => updates.push(['error', value]),
    setLoading: value => updates.push(['loading', value]),
  })
  return { requests, updates, stop: () => cleanup() }
}
const flush = () => new Promise(resolve => setImmediate(resolve))
test('leaving a review ignores delayed project and comment responses', async () => {
  const state = start()
  state.stop()
  state.requests[0].resolve({ json: async () => ({ id: 'review' }) })
  state.requests[1].resolve({ json: async () => ({ comments: ['old'] }) })
  await flush()
  assert.deepEqual(state.updates, [])
})
test('leaving a review ignores a delayed failure, while an active review reports it', async () => {
  for (const cancelled of [true, false]) {
    const state = start()
    if (cancelled) state.stop()
    state.requests[0].reject(new Error('Unavailable'))
    await flush()
    assert.deepEqual(state.updates, cancelled ? [] : [['error', 'Unavailable'], ['loading', false]])
  }
})
