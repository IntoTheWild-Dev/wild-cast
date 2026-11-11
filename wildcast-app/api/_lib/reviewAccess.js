import { createHmac, timingSafeEqual } from 'node:crypto'
import { resolveCaller } from './auth.js'

const signature = text => {
  const key = process.env.REVIEW_LINK_SECRET || process.env.OWNER_ID_SECRET
  if (typeof key !== 'string' || key.length < 32) throw new Error('Review link signing is not configured')
  return createHmac('sha256', key).update(`wildcast:review:v1:${text}`).digest('hex')
}
export function issueReviewToken(id, now = Date.now()) {
  const expiry = Math.floor(now / 1000) + 7 * 24 * 60 * 60
  return `${expiry}.${signature(`${id}:${expiry}`)}`
}
export function verifyReviewToken(id, token, now = Date.now()) {
  if (typeof token !== 'string' || !/^\d{10}\.[a-f0-9]{64}$/.test(token)) return false
  const [expiry, given] = token.split('.')
  if (Number(expiry) <= Math.floor(now / 1000)) return false
  const expected = signature(`${id}:${expiry}`)
  return timingSafeEqual(Buffer.from(given, 'hex'), Buffer.from(expected, 'hex'))
}
export async function requireReviewAccess(req, res, id) {
  const caller = await resolveCaller({ ...req, headers: req.headers || {} })
  if (caller) return caller
  try {
    const token = req.headers?.['x-review-token'] || req.query?.access
    if (verifyReviewToken(id, token)) return { kind: 'review', id, name: null }
  } catch { /* Missing signing configuration must not grant access. */ }
  res.status(401).json({ error: 'Open a current review link or sign in.' })
  return null
}
