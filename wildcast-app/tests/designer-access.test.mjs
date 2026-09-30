// Run with: npm test
// Who may publish / archive / delete templates. Old shared keys and personal
// accounts must both work; clients (partner role) and strangers must not.
import { test, mock, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

const store = new Map()
mock.module('@vercel/blob', {
  namedExports: {
    list: async ({ prefix }) => ({
      blobs: [...store.keys()].filter(k => k.startsWith(prefix)).map(k => ({ pathname: k, url: `mem://${k}` })),
    }),
    put: async (path, body) => { store.set(path, body); return { pathname: path } },
  },
})
globalThis.fetch = async url => {
  const key = String(url).replace('mem://', '').split('?')[0]
  return store.has(key)
    ? { ok: true, json: async () => JSON.parse(store.get(key)) }
    : { ok: false }
}

const { requireDesignerKey } = await import('../api/_lib/auth.js')

function seed(email, role, sessionToken) {
  store.set(`accounts/${email.replace(/[^a-z0-9]/g, '-')}.json`, JSON.stringify({ email, role, sessionToken }))
}

async function check(headers) {
  let out = { allowed: null, code: null }
  const res = {
    status(c) { out.code = c; return this },
    json() { return this },
  }
  out.allowed = await requireDesignerKey({ headers }, res)
  return out
}

beforeEach(() => {
  store.clear()
  process.env.WILDCAST_KEYS = 'WS-AGENCY|Wild Stack|1000|agency,CLIENT-KEY|Wolt DE|100|partner,DES-KEY|Studio|100|designer'
  seed('julia@wildstack.studio', 'agency', 'tok-julia')
  seed('chef@wolt.com', 'partner', 'tok-chef')
})

test('old shared keys: agency and designer allowed, client key refused', async () => {
  assert.equal((await check({ 'x-activation-key': 'WS-AGENCY' })).allowed, true)
  assert.equal((await check({ 'x-activation-key': 'DES-KEY' })).allowed, true)
  const r = await check({ 'x-activation-key': 'CLIENT-KEY' })
  assert.equal(r.allowed, false)
  assert.equal(r.code, 403)
})

test('team account with a valid session is allowed', async () => {
  const r = await check({ 'x-account-email': 'julia@wildstack.studio', 'x-account-token': 'tok-julia' })
  assert.equal(r.allowed, true)
})

test('email casing does not matter', async () => {
  const r = await check({ 'x-account-email': 'Julia@WildStack.studio', 'x-account-token': 'tok-julia' })
  assert.equal(r.allowed, true)
})

test('team account with a wrong or stale token is refused', async () => {
  const r = await check({ 'x-account-email': 'julia@wildstack.studio', 'x-account-token': 'old-token' })
  assert.equal(r.allowed, false)
  assert.equal(r.code, 403)
})

test('client account (partner) is refused even with a valid session', async () => {
  const r = await check({ 'x-account-email': 'chef@wolt.com', 'x-account-token': 'tok-chef' })
  assert.equal(r.allowed, false)
  assert.equal(r.code, 403)
})

test('no credentials, unknown account, or empty token are refused', async () => {
  assert.equal((await check({})).allowed, false)
  assert.equal((await check({ 'x-account-email': 'ghost@wildstack.studio', 'x-account-token': 'x' })).allowed, false)
  assert.equal((await check({ 'x-account-email': 'julia@wildstack.studio', 'x-account-token': '' })).allowed, false)
})
