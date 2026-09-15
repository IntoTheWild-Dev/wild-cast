// Shared account-listing helpers for the team sign-in system
// (api/account-auth.js, api/account-seats.js) - not a route itself, see the
// api/_lib/ convention (auth.js etc).
import { list } from '@vercel/blob'

export const WILD_STACK_DOMAIN = 'wildstack.studio'
export const SEAT_CAP = 5

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
