import process from 'node:process'
// Slows down password guessing: 5 wrong passwords for one email within 15
// minutes locks sign-in for that email for 15 minutes. A correct password
// clears the count. State is one small blob per email: login-attempts/<email>.json.
// Trade-off (deliberate): while locked, even the right password is refused, so
// someone could annoy a colleague by guessing - the lock only lasts 15 minutes.
import { readJson, updateJson } from './atomicJson.js'

export const MAX_FAILURES = 5
export const WINDOW_MS = 15 * 60 * 1000
export const LOCK_MS = 15 * 60 * 1000

function pathFor(email) {
  return `login-attempts/${email.trim().toLowerCase().replace(/[^a-z0-9]/g, '-')}.json`
}

const load = email => readJson(pathFor(email), process.env.BLOB_READ_WRITE_TOKEN)

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
  const { value: next } = await updateJson(pathFor(email), current => {
    const rec = current || { count: 0, firstAt: now }
    const fresh = !rec.firstAt || now - rec.firstAt > WINDOW_MS || (rec.lockedUntil && rec.lockedUntil <= now)
    const next = fresh ? { count: 1, firstAt: now } : { count: rec.count + 1, firstAt: rec.firstAt }
    if (next.count >= MAX_FAILURES) next.lockedUntil = now + LOCK_MS
    return next
  }, { token: process.env.BLOB_READ_WRITE_TOKEN })
  return next.lockedUntil ? { locked: true, retryAfterMin: Math.ceil(LOCK_MS / 60000) } : { locked: false }
}

// Called after a correct password; only writes when there is something to clear.
export async function clearFailures(email) {
  await updateJson(pathFor(email), rec => {
    if (rec && (rec.count || rec.lockedUntil)) return { count: 0, firstAt: Date.now() }
    return undefined
  }, { token: process.env.BLOB_READ_WRITE_TOKEN })
}
