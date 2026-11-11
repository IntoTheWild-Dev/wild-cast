import { verifySession, revokeSession } from './_lib/accounts.js'

export default async function handler(req, res) {
  if (!['POST', 'DELETE'].includes(req.method)) return res.status(405).end()
  res.setHeader('Cache-Control', 'no-store')
  try {
    const email = req.method === 'DELETE' ? req.headers['x-account-email'] : req.body?.email
    const token = req.method === 'DELETE' ? req.headers['x-account-token'] : req.body?.sessionToken
    if (typeof email !== 'string' || typeof token !== 'string') return res.status(400).json({ valid: false })
    if (req.method === 'DELETE') {
      await revokeSession(email, token)
      return res.status(200).json({ ok: true })
    }
    const account = await verifySession(email, token)
    if (!account) return res.status(200).json({ valid: false })
    return res.status(200).json({ valid: true, email: account.email, displayName: account.displayName, role: account.role })
  } catch (err) {
    console.error('account-session error:', err)
    return res.status(503).json({ error: 'Could not verify the session. Please try again.' })
  }
}
