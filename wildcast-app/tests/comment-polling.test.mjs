import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const effect = source.match(/useEffect\(\(\) => \{\n    if \(!currentProjectId\)[\s\S]*?\}, \[currentProjectId\]\)/)?.[0]
assert.ok(effect, 'find the editor comment polling effect')
function start(projectId) {
  const pending = [], updates = []
  let cleanup, poll, stopped = false
  vm.runInNewContext(effect, {
    currentProjectId: projectId, activationHeaders: () => ({}),
    useEffect: fn => { cleanup = fn() },
    fetch: url => new Promise(resolve => pending.push({ url, resolve })),
    setComments: value => updates.push(value),
    setInterval: fn => { poll = fn; return 1 },
    clearInterval: () => { stopped = true },
  })
  return { pending, updates, stop: () => cleanup(), poll: () => poll(), stopped: () => stopped }
}
async function complete(request, comments) {
  request.resolve({ json: async () => ({ comments }) })
  await new Promise(resolve => setImmediate(resolve))
}
test('switching designs ignores a late response from the previous design', async () => {
  const previous = start('old')
  previous.stop()
  const current = start('new')
  await complete(current.pending[0], ['new comment'])
  await complete(previous.pending[0], ['old comment'])
  assert.deepEqual(previous.updates, [])
  assert.deepEqual(current.updates, [['new comment']])
  assert.equal(previous.stopped(), true)
})
test('a slower earlier poll cannot overwrite the latest poll', async () => {
  const state = start('design')
  state.poll()
  await complete(state.pending[1], ['latest'])
  await complete(state.pending[0], ['stale'])
  assert.deepEqual(state.updates, [['latest']])
  state.stop()
})
