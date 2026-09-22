// Public read-only seat count for the Wolt test group, shown on the
// ActivationGate's "Team sign in" tab so people can see how many of the 5
// seats are left before trying to sign up - Julia's ask, 2026-09-15. No auth
// needed since it reveals nothing but a count.
import { SEAT_CAP, countPartnerSeats } from './_lib/accounts.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  try {
    const used = await countPartnerSeats()
    // SEAT_CAP is Infinity during the pilot (accounts.js) - res.json() has no
    // representation for that and silently serializes both fields to `null`,
    // which is exactly what ActivationGate.jsx's Number.isFinite(seats.total)
    // check expects to hide the seat-count banner entirely. Not a bug.
    return res.status(200).json({ used, total: SEAT_CAP, remaining: Math.max(0, SEAT_CAP - used) })
  } catch (err) {
    console.error('account-seats error:', err)
    return res.status(500).json({ error: err.message })
  }
}
