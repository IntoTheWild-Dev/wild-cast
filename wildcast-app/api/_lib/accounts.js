import { Buffer } from 'node:buffer'
import process from 'node:process'
// Shared account-listing helpers for the team sign-in system
// (api/account-auth.js, api/account-seats.js, api/folders.js) - not a route
// itself, see the api/_lib/ convention (auth.js etc).
import { list, put, get } from '@vercel/blob'
import { timingSafeEqual, createHash } from 'crypto'

// Email domains that belong to the Wild Stack team (Julia's ask, 2026-09-30:
// both count as 'agency', full access incl. publish + import). A domain match
// alone is NOT enough to become agency - anyone can type an address they
// don't own, and there is no email verification yet - so a new sign-up must
// also be approved (see isAgencyApproved below).
export const AGENCY_DOMAINS = ['wildstack.studio', 'intothewild.hamburg']

export function isAgencyDomain(email) {
  const domain = (email || '').trim().toLowerCase().split('@')[1] || ''
  return AGENCY_DOMAINS.includes(domain)
}

// Team privileges need the private invite code, even for an allowlisted
// email: typing an address is not proof of mailbox ownership. The approved
// list is used only to identify legacy partner accounts eligible to upgrade;
// that upgrade also requires the invite. Ordinary partner signup stays open.
export function isApprovedAgencyEmail(email) {
  const raw = process.env.AGENCY_APPROVED_EMAILS || ''
  const approved = raw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
  return approved.includes((email || '').trim().toLowerCase())
}

export function isValidInviteCode(code) {
  const expected = process.env.AGENCY_INVITE_CODE || ''
  const given = typeof code === 'string' ? code.trim() : ''
  if (!expected || !given) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function isAgencyApproved(email, inviteCode) {
  return isAgencyDomain(email) && isValidInviteCode(inviteCode)
}
// Uncapped during the pilot (Julia's ask, 2026-09-22: "remove the seat limit,
// this is just during the pilot") - was a hard 5-seat cap for the Wolt test
// group (see countPartnerSeats below). Restore a real number here once the
// pilot ends; every place that reads SEAT_CAP (api/account-auth.js's signup
// check, api/account-seats.js's display endpoint) already treats it as the
// single source of truth, so this is the only line that needs to change
// either way.
export const SEAT_CAP = Infinity

const canonicalEmail = email => email.trim().toLowerCase()
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const sessionHash = value => createHash('sha256').update(value).digest('hex')
export function accountPath(email) {
  return `accounts/${sessionHash(canonicalEmail(email))}.json`
}
const legacyAccountPath = email => `accounts/${canonicalEmail(email).replace(/[^a-z0-9]/g, '-')}.json`
const revokedPath = token => `revoked-sessions/${sessionHash(token)}.json`

// Prefer collision-resistant paths. A legacy row is usable only when its
// stored email is exactly the requested canonical identity.
export async function loadAccount(email) {
  if (typeof email !== 'string' || !email.trim()) return null
  const token = process.env.BLOB_READ_WRITE_TOKEN
  for (const path of [accountPath(email), legacyAccountPath(email)]) {
    const { blobs } = await list({ prefix: path, token })
    const match = blobs.find(b => b.pathname === path)
    if (!match) continue
    const url = match.url + (match.url.includes('?') ? '&' : '?') + `_t=${Date.now()}`
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!r.ok) throw new Error('Could not read account')
    const account = await r.json()
    return typeof account.email === 'string' && canonicalEmail(account.email) === canonicalEmail(email) ? account : null
  }
  return null
}
export async function saveAccount(account, { createOnly = false } = {}) {
  const path = accountPath(account.email), token = process.env.BLOB_READ_WRITE_TOKEN
  try {
    return await put(path, JSON.stringify(account), {
      access: 'private', addRandomSuffix: false, allowOverwrite: !createOnly,
      contentType: 'application/json', token,
    })
  } catch (err) {
    if (createOnly && await get(path, { access: 'private', useCache: false, token })) {
      throw Object.assign(new Error('Account already exists. Please sign in with your password.'), { status: 409 })
    }
    throw err
  }
}

export function issueSession(account, token, now = Date.now()) {
  delete account.sessionToken
  account.sessionTokenHash = sessionHash(token)
  account.sessionIssuedAt = now
  account.sessionExpiresAt = now + SESSION_TTL_MS
  return account
}
export async function verifySession(email, token) {
  if (typeof email !== 'string' || typeof token !== 'string' || !token || token.length > 256) return null
  const account = await loadAccount(email)
  if (!account || !Number.isFinite(account.sessionExpiresAt) || account.sessionExpiresAt <= Date.now()) return null
  if (typeof account.sessionTokenHash !== 'string' || !/^[a-f0-9]{64}$/.test(account.sessionTokenHash)) return null
  const a = Buffer.from(sessionHash(token), 'hex'), b = Buffer.from(account.sessionTokenHash, 'hex')
  if (!timingSafeEqual(a, b)) return null
  // Direct uncached reads make logout independent of Blob list-index lag.
  const revoked = await get(revokedPath(token), { access: 'private', useCache: false, token: process.env.BLOB_READ_WRITE_TOKEN })
  return revoked ? null : account
}
export async function revokeSession(email, token) {
  const account = await verifySession(email, token)
  if (!account) return
  const path = revokedPath(token)
  try {
    // A per-token marker avoids overwriting account changes or a newer login.
    await put(path, JSON.stringify({ expiresAt: account.sessionExpiresAt }), {
      access: 'private', addRandomSuffix: false, allowOverwrite: false,
      contentType: 'application/json', token: process.env.BLOB_READ_WRITE_TOKEN,
    })
  } catch (err) {
    if (!(await get(path, { access: 'private', useCache: false, token: process.env.BLOB_READ_WRITE_TOKEN }))) throw err
  }
}

export function folderPath(email) {
  return `folders/${sessionHash(email.trim().toLowerCase())}.json`
}

// Creates an empty folder-registry record for a brand-new account so their
// "main folder" (the person tile in Designs' Folders view - see
// DesignsPage.jsx's buildPeople) shows up for EVERYONE immediately on
// signup, not just once they've saved a design or opened their own Folders
// view themselves (Julia's question, 2026-09-15: "do we need to create new
// folders for new seats or is that automatic when the seat signs in?" -
// answer: this makes it automatic). No-ops if a record already exists (e.g.
// a returning login, or a race with a concurrent first sign-in) so it never
// clobbers folders someone's already created.
export async function ensurePersonFolder(email, name) {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  const path = folderPath(email)
  const { blobs } = await list({ prefix: path, token })
  if (blobs.some(b => b.pathname === path)) return
  await put(path, JSON.stringify({ ownerEmail: email, ownerName: name || email, folders: [] }), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    token,
  })
}

export async function listAccounts() {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  const { blobs } = await list({ prefix: 'accounts/', token })
  const accounts = await Promise.all(blobs.map(async b => {
    const cacheBustUrl = b.url + (b.url.includes('?') ? '&' : '?') + `_t=${Date.now()}`
    const r = await fetch(cacheBustUrl, { headers: { Authorization: `Bearer ${token}` } })
    if (!r.ok) return null
    return r.json()
  }))
  const unique = new Map()
  for (const account of accounts.filter(Boolean)) {
    const email = canonicalEmail(account.email)
    const previous = unique.get(email)
    if (!previous || (account.sessionIssuedAt || 0) >= (previous.sessionIssuedAt || 0)) unique.set(email, account)
  }
  return [...unique.values()]
}

// Seats are capped for the Wolt test group only - any @wildstack.studio
// signup is 'agency' role and global/uncapped (Julia's ask, 2026-09-15).
export async function countPartnerSeats() {
  const accounts = await listAccounts()
  return accounts.filter(a => a.role !== 'agency').length
}
