// Self-service signup-or-login for individual team members, layered
// alongside (not replacing) the existing shared WILDCAST_KEYS activation-key
// system - Julia's ask, 2026-09-15: the Wolt test group (5 seats, exact
// people not known in advance - accounts get created by signing up, not
// pre-provisioned) plus her own Wild Stack team need real per-person
// identity, since a shared activation key makes everyone using it look
// identical to the app. First login for a given email IS the signup - there
// is no separate "create account" step, matching her explicit call
// ("Each person sets their own password on first login").
//
// Deliberately no email verification step - that needs an email-sending
// service this app has none of yet (a real prerequisite, not something to
// skip past silently); plain password auth only, for now.
//
// Role is assigned automatically from the email's domain, not asked at
// signup: @wildstack.studio -> 'agency' (full internal-team access, same
// role Wild Stack's own shared key already grants), everything else ->
// 'partner'. Matches Julia's "more global for our team" - anyone on the
// Wild Stack domain self-provisions full access, no manual step needed.
import { list, put } from '@vercel/blob'
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { WILD_STACK_DOMAIN, SEAT_CAP, countPartnerSeats, ensurePersonFolder } from './_lib/accounts.js'

function accountPath(email) {
  const safe = email.trim().toLowerCase().replace(/[^a-z0-9]/g, '-')
  return `accounts/${safe}.json`
}

function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(password, salt, 64).toString('hex')
  return { salt, hash }
}

function verifyPassword(password, salt, hash) {
  const attempt = scryptSync(password, salt, 64)
  const stored = Buffer.from(hash, 'hex')
  // Lengths always match here (both scryptSync(..., 64) outputs), but
  // timingSafeEqual throws on a length mismatch rather than returning
  // false - guard defensively anyway since a thrown error here would
  // otherwise surface as a 500 instead of a clean "wrong password".
  return attempt.length === stored.length && timingSafeEqual(attempt, stored)
}

async function findAccount(email) {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  const path = accountPath(email)
  const { blobs } = await list({ prefix: path, token })
  const match = blobs.find(b => b.pathname === path)
  if (!match) return null
  const cacheBustUrl = match.url + (match.url.includes('?') ? '&' : '?') + `_t=${Date.now()}`
  const r = await fetch(cacheBustUrl, { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) return null
  return r.json()
}

async function saveAccount(account) {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  await put(accountPath(account.email), JSON.stringify(account), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    token,
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  try {
    const { email, password, displayName } = req.body ?? {}
    const trimmedEmail = (email || '').trim().toLowerCase()
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      return res.status(400).json({ error: 'A real email address is required' })
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' })
    }

    const existing = await findAccount(trimmedEmail)
    const sessionToken = randomBytes(24).toString('hex')

    if (!existing) {
      // First time this email has been seen - this login IS the signup.
      // displayName is required on this first-ever request so the account
      // has a real name from the start (used as the personal folder's own
      // label later) rather than needing a separate "set your name" step.
      const name = (displayName || '').trim()
      if (!name) {
        return res.status(400).json({ error: 'Your name is required the first time you sign in', isNewAccount: true })
      }
      const domain = trimmedEmail.split('@')[1] || ''
      const role = domain === WILD_STACK_DOMAIN ? 'agency' : 'partner'

      // Wolt test group is hard-capped at 5 seats - wildstack.studio is
      // exempt (global/uncapped, per Julia's "more global for our team").
      // Checked only for a brand-new partner signup, never on login, so the
      // 5 people who already signed up keep working after the cap is hit.
      if (role === 'partner') {
        const used = await countPartnerSeats()
        if (used >= SEAT_CAP) {
          return res.status(403).json({ error: `All ${SEAT_CAP} team seats are taken. Contact Wild Stack for access.` })
        }
      }

      const { salt, hash } = hashPassword(password)
      const account = {
        email: trimmedEmail,
        displayName: name,
        passwordSalt: salt,
        passwordHash: hash,
        role,
        sessionToken,
        createdAt: new Date().toISOString(),
      }
      await saveAccount(account)
      // Creates their main-folder person tile immediately, visible to
      // everyone in Designs' Folders view, without waiting on them to save a
      // design or open their own Folders tab first (Julia's ask, 2026-09-15).
      await ensurePersonFolder(trimmedEmail, name)
      return res.status(200).json({
        email: trimmedEmail, displayName: name, role, sessionToken, isNewAccount: true,
      })
    }

    // Existing account - this is a real login, verify the password.
    if (!verifyPassword(password, existing.passwordSalt, existing.passwordHash)) {
      return res.status(401).json({ error: 'Wrong password' })
    }
    existing.sessionToken = sessionToken
    await saveAccount(existing)
    // Backfills a folder space for anyone who signed up before this existed
    // - no-ops once it's there, see ensurePersonFolder.
    await ensurePersonFolder(existing.email, existing.displayName)
    return res.status(200).json({
      email: existing.email, displayName: existing.displayName, role: existing.role, sessionToken, isNewAccount: false,
    })
  } catch (err) {
    console.error('account-auth error:', err)
    return res.status(500).json({ error: err.message })
  }
}
