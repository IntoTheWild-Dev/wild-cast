// Re-validates a stored { email, sessionToken } pair on page reload, mirroring
// how api/validate-key.js's activation flow already re-checks a saved
// activation key on mount - same idea, account-auth.js's login just issues a
// fresh sessionToken (see its comment) instead of an activation key.
// Deliberately does NOT accept a password here - only account-auth.js ever
// sees the password, this route only ever compares an already-issued token.
import { list } from '@vercel/blob'

function accountPath(email) {
  const safe = email.trim().toLowerCase().replace(/[^a-z0-9]/g, '-')
  return `accounts/${safe}.json`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  try {
    const { email, sessionToken } = req.body ?? {}
    if (!email || !sessionToken) return res.status(400).json({ valid: false })

    const token = process.env.BLOB_READ_WRITE_TOKEN
    const path = accountPath(email)
    const { blobs } = await list({ prefix: path, token })
    const match = blobs.find(b => b.pathname === path)
    if (!match) return res.status(200).json({ valid: false })

    const cacheBustUrl = match.url + (match.url.includes('?') ? '&' : '?') + `_t=${Date.now()}`
    const r = await fetch(cacheBustUrl, { headers: { Authorization: `Bearer ${token}` } })
    if (!r.ok) return res.status(200).json({ valid: false })
    const account = await r.json()

    if (account.sessionToken !== sessionToken) return res.status(200).json({ valid: false })
    return res.status(200).json({ valid: true, email: account.email, displayName: account.displayName, role: account.role })
  } catch (err) {
    console.error('account-session error:', err)
    return res.status(200).json({ valid: false })
  }
}
