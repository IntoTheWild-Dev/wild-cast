import { list, del } from '@vercel/blob'
import { requireDesignerKey } from './_lib/auth.js'

export default async function handler(req, res) {
  if (req.method !== 'DELETE') return res.status(405).end()
  if (!requireDesignerKey(req, res)) return

  const { slotKey } = req.query
  if (!slotKey) return res.status(400).json({ error: 'Missing slotKey' })

  const token = process.env.BLOB_READ_WRITE_TOKEN

  try {
    // Deletes both the record (templates/<slotKey>.json) and its background
    // (templates/<slotKey>-bg.png) — both share the same prefix.
    const { blobs } = await list({ prefix: `templates/${slotKey}`, token })
    const urlsToDelete = blobs.map(b => b.url)

    if (urlsToDelete.length > 0) {
      await del(urlsToDelete, { token })
    }

    return res.status(200).json({ ok: true, deleted: urlsToDelete.length })
  } catch (err) {
    console.error('delete-template error:', err)
    return res.status(500).json({ error: err.message })
  }
}
