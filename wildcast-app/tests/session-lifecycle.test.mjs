import { beforeEach, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { scryptSync } from 'node:crypto'
const store = new Map(), writes = []
const HOST = 'https://owned.private.blob.vercel-storage.com'
mock.module('@vercel/blob', { namedExports: {
  list: async ({ prefix }) => ({ blobs: [...store.keys()].filter(pathname => pathname.startsWith(prefix)).map(pathname => ({ pathname, url: HOST + '/' + pathname })) }),
  get: async path => store.has(path) ? { stream: new Response(store.get(path)).body, blob: { etag: store.get(path) } } : null,
  put: async (path, value, options) => {
    if (options.allowOverwrite === false && store.has(path)) throw new Error('already exists')
    writes.push(path); store.set(path, value); return { url: HOST + '/' + path }
  },
}})
globalThis.fetch = async url => {
  assert.ok(String(url).startsWith(HOST + '/'), 'account reads stay on server-resolved storage URLs')
  const path = new URL(url).pathname.slice(1)
  return new Response(store.get(path) ?? '{}', { status: store.has(path) ? 200 : 404 })
}
const { default: auth } = await import('../api/account-auth.js')
const { default: session } = await import('../api/account-session.js')
const { requireCaller, requirePluginKey } = await import('../api/_lib/auth.js')
const { accountPath, loadAccount, verifySession, issueSession, listAccounts, folderPath, SESSION_TTL_MS, sessionHash } = await import('../api/_lib/accounts.js')
const PW = 'session-test-password'
async function call(handler, method, body = {}, headers = {}) {
  const out = {}
  const res = { status(code) { out.code = code; return this }, json(data) { out.data = data; return this }, end() { return this }, setHeader() {} }
  await handler({ method, body, headers }, res); return out
}
const signup = (email = 'person@example.test', password = PW) => call(auth, 'POST', { email, password, displayName: 'Person' })
test('a malformed invitation is rejected before account creation', async () => {
  const r = await call(auth, 'POST', { email: 'team@wildstack.studio', password: PW, displayName: 'Team', inviteCode: 123 })
  assert.equal(r.code, 400)
  assert.equal(store.size, 0)
})
const legacyPath = email => `accounts/${email.replace(/[^a-z0-9]/g, '-')}.json`
function seedLegacy(email, role = 'partner') {
  const salt = 'audit-test-salt'
  store.set(legacyPath(email), JSON.stringify({ email, displayName: 'Existing person', role, passwordSalt: salt, passwordHash: scryptSync(PW, salt, 64).toString('hex'), sessionToken: 'old-permanent-token', createdAt: '2025-01-01T00:00:00Z' }))
}
beforeEach(() => {
  store.clear(); writes.length = 0
  process.env.WILDCAST_KEYS = ''; process.env.BLOB_READ_WRITE_TOKEN = 'dummy-token'
  process.env.AGENCY_APPROVED_EMAILS = 'team@wildstack.studio'; process.env.AGENCY_INVITE_CODE = 'private-test-invite'
})
test('open partner signup issues an expiring token and stores only its hash', async () => {
  const r = await signup(); assert.equal(r.code, 200); assert.equal(r.data.role, 'partner')
  const saved = JSON.parse(store.get(accountPath(r.data.email)))
  assert.equal(saved.sessionToken, undefined); assert.equal(saved.sessionTokenHash, sessionHash(r.data.sessionToken))
  assert.equal(saved.sessionExpiresAt - saved.sessionIssuedAt, SESSION_TTL_MS)
  assert.ok(await verifySession(r.data.email, r.data.sessionToken))
  assert.equal(await verifySession(r.data.email, saved.sessionTokenHash), null, 'stored hash cannot be replayed as a token')
})
test('plugin access uses expiring team sessions and rejects partner sessions or a baked key by default', async () => {
  const res = { status() { return this }, json() {} }
  process.env.FIGMA_PLUGIN_KEY = 'old-plugin-secret'
  delete process.env.ALLOW_LEGACY_PLUGIN_KEY
  assert.equal(await requirePluginKey({ headers: { 'x-plugin-key': 'old-plugin-secret' } }, res), false)
  const account = issueSession({ email: 'designer@example.test', role: 'designer' }, 'designer-token')
  store.set(accountPath(account.email), JSON.stringify(account))
  assert.equal(await requirePluginKey({ headers: { 'x-account-email': account.email, 'x-account-token': 'designer-token' } }, res), true)
  account.role = 'partner'
  store.set(accountPath(account.email), JSON.stringify(account))
  assert.equal(await requirePluginKey({ headers: { 'x-account-email': account.email, 'x-account-token': 'designer-token' } }, res), false)
  account.role = 'designer'; account.sessionExpiresAt = 0
  store.set(accountPath(account.email), JSON.stringify(account))
  assert.equal(await requirePluginKey({ headers: { 'x-account-email': account.email, 'x-account-token': 'designer-token' } }, res), false)
  delete process.env.FIGMA_PLUGIN_KEY
})
test('legacy credentials require reauthentication and migrate without changing password, role or profile', async () => {
  const email = 'person@example.test'; seedLegacy(email)
  const before = JSON.parse(store.get(legacyPath(email)))
  assert.equal(await verifySession(email, 'old-permanent-token'), null)
  const r = await call(auth, 'POST', { email, password: PW }); assert.equal(r.code, 200)
  const migrated = JSON.parse(store.get(accountPath(email)))
  for (const key of ['email', 'displayName', 'role', 'passwordSalt', 'passwordHash', 'createdAt']) assert.equal(migrated[key], before[key])
  assert.equal(migrated.sessionToken, undefined); assert.ok(await verifySession(email, r.data.sessionToken))
  assert.equal((await listAccounts()).length, 1, 'legacy plus migrated record count as one account')
})
test('different email spellings no longer collide or authenticate as each other', async () => {
  const a = 'a.b@example.test', b = 'a-b@example.test'
  assert.notEqual(accountPath(a), accountPath(b)); seedLegacy(a)
  assert.equal(await loadAccount(b), null)
  const second = await signup(b, 'different-password'); assert.equal(second.code, 200)
  assert.equal((await call(auth, 'POST', { email: b, password: PW })).code, 401)
  assert.equal((await call(auth, 'POST', { email: a, password: PW })).data.email, a)
  assert.equal((await call(auth, 'POST', { email: b, password: 'different-password' })).data.email, b)
})
test('expired sessions fail both the session endpoint and protected-route guard', async () => {
  const email = 'person@example.test', token = 'expired-token'
  const account = issueSession({ email, role: 'partner' }, token, 0)
  store.set(accountPath(email), JSON.stringify(account))
  assert.equal((await call(session, 'POST', { email, sessionToken: token })).data.valid, false)
  let code
  assert.equal(await requireCaller({ headers: { 'x-account-email': email, 'x-account-token': token } }, { status(n) { code = n; return this }, json() {} }), null)
  assert.equal(code, 401)
})
test('server logout revokes exactly that token, without overwriting newer account sessions', async () => {
  const first = await signup(), { email, sessionToken } = first.data
  const headers = { 'x-account-email': email, 'x-account-token': sessionToken }
  assert.equal((await call(session, 'DELETE', {}, headers)).code, 200)
  assert.equal(await verifySession(email, sessionToken), null)
  const second = await call(auth, 'POST', { email, password: PW }); assert.equal(second.code, 200)
  await call(session, 'DELETE', {}, headers) // replaying an old logout cannot kill a newer login
  assert.ok(await verifySession(email, second.data.sessionToken))
  const markers = [...store].filter(([path]) => path.startsWith('revoked-sessions/'))
  assert.equal(markers.length, 1); assert.ok(!JSON.stringify(markers).includes(sessionToken))
})
test('concurrent registration cannot replace the first password', async () => {
  const email = 'race@example.test'
  const results = await Promise.all([signup(email, 'first-password'), signup(email, 'second-password')])
  assert.deepEqual(results.map(r => r.code).sort(), [200, 409])
  const winner = results.findIndex(r => r.code === 200)
  assert.equal((await call(auth, 'POST', { email, password: winner === 0 ? 'first-password' : 'second-password' })).code, 200)
  assert.equal((await call(auth, 'POST', { email, password: winner === 0 ? 'second-password' : 'first-password' })).code, 401)
})
test('approved team addresses alone cannot create privileged accounts', async () => {
  const body = { email: 'team@wildstack.studio', password: PW, displayName: 'Team' }
  assert.equal((await call(auth, 'POST', body)).code, 403)
  assert.equal((await call(auth, 'POST', { ...body, inviteCode: 'private-test-invite' })).data.role, 'agency')
  assert.equal((await call(auth, 'POST', { email: body.email, password: PW })).data.role, 'agency', 'existing agency login needs only its password')
})
test('invalid payloads fail without account writes', async () => {
  for (const body of [{ email: {}, password: PW }, { email: 'a@@b.test', password: PW }, { email: 'a@example.test', password: {} }]) {
    assert.equal((await call(auth, 'POST', body)).code, 400)
  }
  assert.equal(writes.length, 0)
})

test('folder and login-attempt identities cannot collide across distinct addresses', async () => {
  const a = 'a.b@example.test', b = 'a-b@example.test'
  assert.notEqual(folderPath(a), folderPath(b))
  const { recordFailure, checkLock } = await import('../api/_lib/loginLimit.js')
  for (let i = 0; i < 5; i++) await recordFailure(a)
  assert.equal((await checkLock(a)).locked, true)
  assert.equal((await checkLock(b)).locked, false)
})
