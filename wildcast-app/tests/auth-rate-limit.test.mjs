import { test, mock, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { conditionalBlob } from './_conditionalBlob.mjs'
const blob = conditionalBlob()
mock.module('@vercel/blob', { namedExports: blob.namedExports })
const { allowAuthAttempt } = await import('../api/_lib/authRateLimit.js')
afterEach(() => { delete process.env.VERCEL; blob.store.clear(); delete blob.faults.read; delete blob.faults.write })
async function attempt(headers = {}, options = {}) {
  const result = { headers: {} }
  result.allowed = await allowAuthAttempt({ headers }, { status(n) { result.status = n; return this }, json() {}, setHeader(k, v) { result.headers[k] = v } }, { now: 1000, limit: 3, ...options })
  return result
}
test('parallel requests count atomically and the window recovers', async () => {
  process.env.VERCEL = '1'
  const headers = { 'x-vercel-forwarded-for': '192.0.2.1' }
  const results = await Promise.all(Array.from({ length: 4 }, () => attempt(headers)))
  assert.equal(results.filter(r => r.allowed).length, 3)
  assert.equal(results.find(r => !r.allowed).status, 429)
  assert.equal((await attempt(headers, { now: 901001 })).allowed, true)
})
test('generic spoofed headers do not replace the platform address', async () => {
  process.env.VERCEL = '1'
  assert.equal((await attempt({ 'x-forwarded-for': '192.0.2.2' })).status, 503)
  const a = { 'x-vercel-forwarded-for': '192.0.2.1', 'x-forwarded-for': '192.0.2.2' }
  for (let n = 0; n < 3; n++) assert.equal((await attempt(a)).allowed, true)
  assert.equal((await attempt({ ...a, 'x-forwarded-for': '192.0.2.3' })).status, 429)
})
test('a storage failure blocks sign-in rather than bypassing the limiter', async () => {
  process.env.VERCEL = '1'; blob.faults.read = new Error('offline')
  assert.equal((await attempt({ 'x-vercel-forwarded-for': '192.0.2.1' })).status, 503)
})
