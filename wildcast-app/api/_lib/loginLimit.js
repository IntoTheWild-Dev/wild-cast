// Slows down password guessing: 5 wrong passwords for one email within 15
// minutes locks sign-in for that email for 15 minutes. A correct password
// clears the count. State is one small blob per email: login-attempts/<email>.json.
// Trade-off (deliberate): while locked, even the right password is refused, so
// someone could annoy a colleague by guessing - the lock only lasts 15 minutes.
import { list, put } from '@vercel/blob'

export const MAX_FAILURES = 5
export const WINDOW_MS = 15 * 60 * 1000
export const LOCK_MS = 15 * 60 * 1000

function pathFor(email) {
  return `login-attempts/${email.trim().toLowerCase().replace(/[^a-z0-9]/g, '-')}.json`
}

async function load(email) {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  const path = pathFor(email)
  const { blobs } = await list({ prefix: path, token })
  const match = blobs.find(b => b.pathname === path)
  if (!match) return null
  const r = await fetch(match.url + (match.url.includes('?') ? '&' : '?') + `_t=${Date.now()}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return r.ok ? r.json() : null
}

async function save(email, record) {
  await put(pathFor(email), JSON.stringify(record), {
    access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json',
    token: process.env.BLOB_READ_WRITE_TOKEN,
  })
}

// { locked: false } or { locked: true, retryAfterMin }
export async function checkLock(email, now = Date.now()) {
  const rec = await load(email)
  if (rec?.lockedUntil && rec.lockedUntil > now) {
    return { locked: true, retryAfterMin: Math.max(1, Math.ceil((rec.lockedUntil - now) / 60000)) }
  }
  return { locked: false }
}

// Returns { locked, retryAfterMin? } after counting one more wrong password.
export async function recordFailure(email, now = Date.now()) {
  const rec = (await load(email)) || { count: 0, firstAt: now }
  const fresh = !rec.firstAt || now - rec.firstAt > WINDOW_MS || (rec.lockedUntil && rec.lockedUntil <= now)
  const next = fresh ? { count: 1, firstAt: now } : { count: rec.count + 1, firstAt: rec.firstAt }
  if (next.count >= MAX_FAILURES) next.lockedUntil = now + LOCK_MS
  await save(email, next)
  return next.lockedUntil ? { locked: true, retryAfterMin: Math.ceil(LOCK_MS / 60000) } : { locked: false }
}

// Called after a correct password; only writes when there is something to clear.
export async function clearFailures(email) {
  const rec = await load(email)
  if (rec && (rec.count || rec.lockedUntil)) await save(email, { count: 0, firstAt: Date.now() })
}
