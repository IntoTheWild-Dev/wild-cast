// TEMPORARY - deletes the auto-folder-test account and its folder registry
// blob. Delete this file immediately after use.
import { del, list } from '@vercel/blob'

const SECRET = 'autofolder-test-verify-2609'
const PATHS = [
  'accounts/auto-folder-test-example-com.json',
  'folders/auto-folder-test-example-com.json',
]

export default async function handler(req, res) {
  if (req.query.secret !== SECRET) return res.status(403).end()
  const token = process.env.BLOB_READ_WRITE_TOKEN
  const deleted = []
  for (const path of PATHS) {
    const { blobs } = await list({ prefix: path, token })
    const match = blobs.find(b => b.pathname === path)
    if (match) { await del(match.url, { token }); deleted.push(path) }
  }
  return res.status(200).json({ deleted })
}
