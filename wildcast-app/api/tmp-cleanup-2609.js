// TEMPORARY - deleted immediately after use. Cleans up test account records
// created while verifying api/account-auth.js live, not meant to ship.
import { del, list } from '@vercel/blob'

export default async function handler(req, res) {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  const { secret, prefix } = req.query
  if (secret !== 'cleanup-2026-09-15') return res.status(403).end()
  const { blobs } = await list({ prefix: prefix || 'accounts/claude-e2e-test', token })
  for (const b of blobs) await del(b.url, { token })
  return res.status(200).json({ deleted: blobs.map(b => b.pathname) })
}
