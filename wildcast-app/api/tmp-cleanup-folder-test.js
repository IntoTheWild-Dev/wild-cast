// TEMPORARY - deletes the folder-test account and its folder registry blob
// created to verify the personal-folders feature. Delete this file
// immediately after use.
import { del, list } from '@vercel/blob'

const SECRET = 'folder-test-verify-2609'
const PATHS = [
  'accounts/folder-test-1-example-com.json',
  'folders/folder-test-1-example-com.json',
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
