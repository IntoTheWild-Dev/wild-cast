import { createHash } from 'node:crypto'
import { isIP } from 'node:net'
import { updateJson } from './atomicJson.js'

const WINDOW = 15 * 60 * 1000
// On Vercel use its platform-set address, never a caller-supplied generic XFF.
// Locally only the direct socket address is trusted.
export async function allowAuthAttempt(req, res, { now = Date.now(), limit = 60 } = {}) {
  const hosted = process.env.VERCEL === '1' && process.env.VERCEL_ENV !== 'development'
  const address = hosted ? req.headers?.['x-vercel-forwarded-for'] : req.socket?.remoteAddress
  if (typeof address !== 'string' || !isIP(address.trim())) {
    if (!hosted) return true // Offline unit/local handler calls have no socket.
    res.status(503).json({ error: 'Sign-in protection is temporarily unavailable.' })
    return false
  }
  const key = createHash('sha256').update(address.trim().toLowerCase()).digest('hex')
  try {
    await updateJson(`auth-rate/${key}.json`, current => {
      if (current && (!Number.isFinite(current.start) || !Number.isInteger(current.count) || current.count < 0)) throw new Error('Invalid rate-limit state')
      const fresh = !current || now - current.start >= WINDOW
      const next = fresh ? { start: now, count: 0 } : current
      if (next.count >= limit) throw Object.assign(new Error('Too many sign-in requests. Please try again later.'), { status: 429, retry: Math.max(1, Math.ceil((next.start + WINDOW - now) / 1000)) })
      return { start: next.start, count: next.count + 1 }
    }, { token: process.env.BLOB_READ_WRITE_TOKEN })
    return true
  } catch (error) {
    if (error.status === 429) res.setHeader('Retry-After', String(error.retry))
    res.status(error.status === 429 ? 429 : 503).json({ error: error.status === 429 ? error.message : 'Sign-in protection is temporarily unavailable.' })
    return false
  }
}
