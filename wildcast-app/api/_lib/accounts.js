// Shared account-listing helpers for the team sign-in system
// (api/account-auth.js, api/account-seats.js, api/folders.js) - not a route
// itself, see the api/_lib/ convention (auth.js etc).
import { list, put } from '@vercel/blob'

export const WILD_STACK_DOMAIN = 'wildstack.studio'
export const SEAT_CAP = 5

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
