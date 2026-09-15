// TEMPORARY - deletes the seat-cap-test accounts created to verify the
// 5-seat cap in api/account-auth.js. Delete this file immediately after use.
import { del, list } from '@vercel/blob'

const SECRET = 'seat-cap-verify-2609'
const TEST_EMAILS = [
  'seat-test-1@example.com', 'seat-test-2@example.com', 'seat-test-3@example.com',
  'seat-test-4@example.com', 'seat-test-5@example.com', 'seat-test-wildstack@wildstack.studio',
]

function accountPath(email) {
  const safe = email.trim().toLowerCase().replace(/[^a-z0-9]/g, '-')
  return `accounts/${safe}.json`
}

export default async function handler(req, res) {
  if (req.query.secret !== SECRET) return res.status(403).end()
  const token = process.env.BLOB_READ_WRITE_TOKEN
  const deleted = []
  for (const email of TEST_EMAILS) {
    const path = accountPath(email)
    const { blobs } = await list({ prefix: path, token })
    const match = blobs.find(b => b.pathname === path)
    if (match) { await del(match.url, { token }); deleted.push(email) }
  }
  return res.status(200).json({ deleted })
}
