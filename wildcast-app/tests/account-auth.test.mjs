// Run with: npm test
// Exercises api/account-auth.js's real handler with Vercel Blob swapped for an
// in-memory store, so the sign-up / team-approval rules can be checked without
// touching production storage.
import { test, mock, beforeEach } from 'node:test'
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

const { default: handler } = await import('../api/account-auth.js')

function call(body) {
  return new Promise(resolve => {
    const res = {
      status(code) { this.code = code; return this },
      json(data) { resolve({ code: this.code, data }) },
      end() { resolve({ code: this.code, data: null }) },
    }
    handler({ method: 'POST', body }, res)
  })
}

const PW = 'secret123'
beforeEach(() => {
  store.clear()
  process.env.AGENCY_APPROVED_EMAILS = 'julia@wildstack.studio, anang@intothewild.hamburg'
  process.env.AGENCY_INVITE_CODE = 'letmein-2026'
})

test('client email signs up as partner, no invite code asked', async () => {
  const first = await call({ email: 'chef@wolt.com', password: PW })
  assert.equal(first.code, 400)
  assert.equal(first.data.isNewAccount, true)
  assert.equal(first.data.needsInviteCode, false)
  const ok = await call({ email: 'chef@wolt.com', password: PW, displayName: 'Chef' })
  assert.equal(ok.code, 200)
  assert.equal(ok.data.role, 'partner')
})

test('unapproved team address: asked for an invite code, refused without it', async () => {
  for (const email of ['new@wildstack.studio', 'new@intothewild.hamburg']) {
    const first = await call({ email, password: PW })
    assert.equal(first.data.needsInviteCode, true)
    const refused = await call({ email, password: PW, displayName: 'New' })
    assert.equal(refused.code, 403)
    assert.equal(refused.data.needsInviteCode, true)
    assert.equal(store.size, 0, 'no account may be created')
  }
})

test('wrong invite code is refused with a clear message', async () => {
  const r = await call({ email: 'new@wildstack.studio', password: PW, displayName: 'New', inviteCode: 'nope' })
  assert.equal(r.code, 403)
  assert.match(r.data.error, /not valid/)
  assert.equal(store.size, 0)
})

test('right invite code makes a team member agency, on both domains', async () => {
  for (const email of ['new@wildstack.studio', 'new@intothewild.hamburg']) {
    const r = await call({ email, password: PW, displayName: 'New', inviteCode: 'letmein-2026' })
    assert.equal(r.code, 200)
    assert.equal(r.data.role, 'agency')
  }
})

test('pre-approved email needs no code', async () => {
  const first = await call({ email: 'Julia@WildStack.studio', password: PW })
  assert.equal(first.data.needsInviteCode, false)
  const r = await call({ email: 'julia@wildstack.studio', password: PW, displayName: 'Julia' })
  assert.equal(r.code, 200)
  assert.equal(r.data.role, 'agency')
})

test('fails closed: with nothing configured, no team address can sign up', async () => {
  delete process.env.AGENCY_APPROVED_EMAILS
  delete process.env.AGENCY_INVITE_CODE
  const r = await call({ email: 'new@wildstack.studio', password: PW, displayName: 'New', inviteCode: '' })
  assert.equal(r.code, 403)
  assert.equal(store.size, 0)
})

test('look-alike domains are not team addresses', async () => {
  const r = await call({ email: 'x@wildstack.studio.evil.com', password: PW, displayName: 'X' })
  assert.equal(r.code, 200)
  assert.equal(r.data.role, 'partner')
})

test('existing agency logs back in without a code; wrong password still refused', async () => {
  await call({ email: 'new@wildstack.studio', password: PW, displayName: 'New', inviteCode: 'letmein-2026' })
  const back = await call({ email: 'new@wildstack.studio', password: PW })
  assert.equal(back.code, 200)
  assert.equal(back.data.role, 'agency')
  const bad = await call({ email: 'new@wildstack.studio', password: 'wrongpass' })
  assert.equal(bad.code, 401)
})

test('earlier partner on a team domain is promoted at login only if on the approved list', async () => {
  // Signed up while @intothewild.hamburg was not yet recognised.
  for (const email of ['anang@intothewild.hamburg', 'stranger@intothewild.hamburg']) {
    const path = `accounts/${email.replace(/[^a-z0-9]/g, '-')}.json`
    const salt = 'aa'
    store.set(path, JSON.stringify({
      email, displayName: 'X', passwordSalt: salt,
      passwordHash: scryptSync(PW, salt, 64).toString('hex'), role: 'partner', sessionToken: 't',
    }))
  }
  const approved = await call({ email: 'anang@intothewild.hamburg', password: PW })
  assert.equal(approved.data.role, 'agency')
  const notApproved = await call({ email: 'stranger@intothewild.hamburg', password: PW })
  assert.equal(notApproved.data.role, 'partner')
})
