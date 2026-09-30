// Run with: npm test
// Step 3 (AI routes check who is calling + usage recording), step 4 (activation
// key switch-off date) and step 5 (wrong-password lock), against an in-memory
// stand-in for Vercel Blob.
import { test, mock, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { scryptSync } from 'node:crypto'

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

const { requireCaller, activationKeysEnabled } = await import('../api/_lib/auth.js')
const { recordUsage, summariseUsage } = await import('../api/_lib/usage.js')
const { default: validateKey } = await import('../api/validate-key.js')
const { default: aiSuggest } = await import('../api/ai-suggest.js')
const { default: promptChat } = await import('../api/prompt-brief-chat.js')
const { default: accountAuth } = await import('../api/account-auth.js')

function fakeRes() {
  const out = { code: null, data: null }
  const res = {
    status(c) { out.code = c; return this },
    json(d) { out.data = d; return this },
    end() { return this },
  }
  return { res, out }
}
async function callHandler(handler, req) {
  const { res, out } = fakeRes()
  await handler(req, res)
  return out
}

const PW = 'secret123'
function seedAccount(email, role, sessionToken) {
  const salt = 'aa'
  store.set(`accounts/${email.replace(/[^a-z0-9]/g, '-')}.json`, JSON.stringify({
    email, displayName: email.split('@')[0], role, sessionToken,
    passwordSalt: salt, passwordHash: scryptSync(PW, salt, 64).toString('hex'),
  }))
}

beforeEach(() => {
  store.clear()
  delete process.env.ACTIVATION_KEYS_END
  process.env.WILDCAST_KEYS = 'WOLT-KEY|Wolt DE|100|partner,WS-KEY|Wild Stack|1000|agency'
  process.env.WILDCAST_COPY = 'test-anthropic-key'
  seedAccount('julia@wildstack.studio', 'agency', 'tok-julia')
  seedAccount('chef@wolt.com', 'partner', 'tok-chef')
})
afterEach(() => mock.restoreAll())

// ---------- step 3: who is calling ----------
test('requireCaller: no sign-in is refused with 401', async () => {
  const { res, out } = fakeRes()
  assert.equal(await requireCaller({ headers: {} }, res), null)
  assert.equal(out.code, 401)
})

test('requireCaller: account, client account and shared key are all recognised', async () => {
  const a = await requireCaller({ headers: { 'x-account-email': 'julia@wildstack.studio', 'x-account-token': 'tok-julia' } }, fakeRes().res)
  assert.deepEqual([a.kind, a.role], ['account', 'agency'])
  const c = await requireCaller({ headers: { 'x-account-email': 'chef@wolt.com', 'x-account-token': 'tok-chef' } }, fakeRes().res)
  assert.deepEqual([c.kind, c.role], ['account', 'partner'])
  const k = await requireCaller({ headers: { 'x-activation-key': 'WOLT-KEY' } }, fakeRes().res)
  assert.deepEqual([k.kind, k.name], ['key', 'Wolt DE'])
})

test('requireCaller: stale account token and unknown key are refused', async () => {
  assert.equal(await requireCaller({ headers: { 'x-account-email': 'julia@wildstack.studio', 'x-account-token': 'old' } }, fakeRes().res), null)
  assert.equal(await requireCaller({ headers: { 'x-activation-key': 'NOPE' } }, fakeRes().res), null)
})

test('AI routes refuse unauthenticated calls before doing anything', async () => {
  for (const handler of [aiSuggest, promptChat]) {
    const out = await callHandler(handler, { method: 'POST', headers: {}, body: {} })
    assert.equal(out.code, 401)
  }
  assert.equal([...store.keys()].some(k => k.startsWith('usage/')), false, 'nothing recorded for a refused call')
})

test('usage is counted per person per feature and summarised', async () => {
  const julia = { id: 'julia@wildstack.studio', name: 'julia', role: 'agency' }
  const wolt = { id: 'key:Wolt DE', name: 'Wolt DE', role: 'partner' }
  await recordUsage(julia, 'ai-suggest')
  await recordUsage(julia, 'ai-suggest')
  await recordUsage(julia, 'prompt-brief-chat')
  await recordUsage(wolt, 'ai-suggest')
  const s = await summariseUsage()
  assert.equal(s.totalCalls, 4)
  const j = s.people.find(p => p.id === julia.id)
  assert.equal(j.total, 3)
  assert.deepEqual(j.byFeature, { 'ai-suggest': 2, 'prompt-brief-chat': 1 })
  assert.equal(s.people[0].id, julia.id, 'biggest user first')
})

test('a failing usage write never breaks the feature', async () => {
  mock.method(console, 'error', () => {})
  const orig = globalThis.fetch
  globalThis.fetch = async () => { throw new Error('storage down') }
  store.set('usage/x/2026-01-01.json', '{}')
  await assert.doesNotReject(recordUsage({ id: 'x', name: 'x', role: 'partner' }, 'ai-suggest'))
  globalThis.fetch = orig
})

// ---------- step 4: key switch-off ----------
test('keys work until ACTIVATION_KEYS_END, then stop everywhere', async () => {
  process.env.ACTIVATION_KEYS_END = '2026-10-05T00:00:00+02:00'
  mock.method(Date, 'now', () => Date.parse('2026-10-04T12:00:00+02:00'))
  assert.equal(activationKeysEnabled(), true)
  assert.equal((await callHandler(validateKey, { method: 'POST', body: { key: 'WOLT-KEY' } })).code, 200)
  assert.ok(await requireCaller({ headers: { 'x-activation-key': 'WOLT-KEY' } }, fakeRes().res))

  mock.restoreAll()
  mock.method(Date, 'now', () => Date.parse('2026-10-05T00:00:01+02:00'))
  assert.equal(activationKeysEnabled(), false)
  const out = await callHandler(validateKey, { method: 'POST', body: { key: 'WOLT-KEY' } })
  assert.equal(out.code, 410)
  assert.equal(out.data.valid, false)
  assert.equal(await requireCaller({ headers: { 'x-activation-key': 'WS-KEY' } }, fakeRes().res), null)
  // personal accounts are unaffected by the switch-off
  assert.ok(await requireCaller({ headers: { 'x-account-email': 'chef@wolt.com', 'x-account-token': 'tok-chef' } }, fakeRes().res))
})

test('no end date set, or an unreadable one: keys keep working', async () => {
  assert.equal(activationKeysEnabled(), true)
  mock.method(console, 'warn', () => {})
  process.env.ACTIVATION_KEYS_END = 'next monday'
  assert.equal(activationKeysEnabled(), true)
})

// ---------- step 5: wrong-password lock ----------
const login = (password, email = 'chef@wolt.com') =>
  callHandler(accountAuth, { method: 'POST', body: { email, password } })

test('5 wrong passwords lock the email, even the right password is refused, then it unlocks', async () => {
  let now = Date.parse('2026-10-01T10:00:00Z')
  mock.method(Date, 'now', () => now)
  for (let i = 1; i <= 4; i++) assert.equal((await login('wrong-pass')).code, 401)
  const fifth = await login('wrong-pass')
  assert.equal(fifth.code, 429)
  assert.match(fifth.data.error, /Too many wrong passwords/)
  assert.equal((await login(PW)).code, 429, 'right password refused while locked')

  now += 16 * 60 * 1000
  const ok = await login(PW)
  assert.equal(ok.code, 200)
})

test('a correct password clears earlier wrong attempts', async () => {
  for (let i = 0; i < 4; i++) await login('wrong-pass')
  assert.equal((await login(PW)).code, 200)
  for (let i = 0; i < 4; i++) assert.equal((await login('wrong-pass')).code, 401)
  assert.equal((await login(PW)).code, 200)
})

test('locking one email does not affect another', async () => {
  for (let i = 0; i < 5; i++) await login('wrong-pass')
  assert.equal((await login(PW, 'julia@wildstack.studio')).code, 200)
})
