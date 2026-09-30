// Shared account-listing helpers for the team sign-in system
// (api/account-auth.js, api/account-seats.js, api/folders.js) - not a route
// itself, see the api/_lib/ convention (auth.js etc).
import { list, put } from '@vercel/blob'
import { timingSafeEqual } from 'crypto'

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

// Approval for a team-domain sign-up, stop-gap until email verification
// exists. Two ways in, both configured as Vercel env vars so Julia can change
// them without a code change:
//   AGENCY_APPROVED_EMAILS - comma-separated list of exact addresses
//   AGENCY_INVITE_CODE     - one shared code handed to a new team member
// Fails closed: with neither set, no new team-domain sign-up is approved.
export function isApprovedAgencyEmail(email) {
  const raw = process.env.AGENCY_APPROVED_EMAILS || ''
  const approved = raw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
  return approved.includes((email || '').trim().toLowerCase())
}

export function isValidInviteCode(code) {
  const expected = process.env.AGENCY_INVITE_CODE || ''
  const given = (code || '').trim()
  if (!expected || !given) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function isAgencyApproved(email, inviteCode) {
  return isApprovedAgencyEmail(email) || isValidInviteCode(inviteCode)
}
// Uncapped during the pilot (Julia's ask, 2026-09-22: "remove the seat limit,
// this is just during the pilot") - was a hard 5-seat cap for the Wolt test
// group (see countPartnerSeats below). Restore a real number here once the
// pilot ends; every place that reads SEAT_CAP (api/account-auth.js's signup
// check, api/account-seats.js's display endpoint) already treats it as the
// single source of truth, so this is the only line that needs to change
// either way.
export const SEAT_CAP = Infinity

export function folderPath(email) {
  const safe = email.trim().toLowerCase().replace(/[^a-z0-9]/g, '-')
  return `folders/${safe}.json`
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
  return accounts.filter(Boolean)
}

// Seats are capped for the Wolt test group only - any @wildstack.studio
// signup is 'agency' role and global/uncapped (Julia's ask, 2026-09-15).
export async function countPartnerSeats() {
  const accounts = await listAccounts()
  return accounts.filter(a => a.role !== 'agency').length
}
