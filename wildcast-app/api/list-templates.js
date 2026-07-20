// Returns every custom (Figma-imported) template record, draft or published.
// The frontend merges these with the static built-in templates at load time.
import { list } from '@vercel/blob'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const token = process.env.BLOB_READ_WRITE_TOKEN
  try {
    const { blobs } = await list({ prefix: 'templates/', token })
    const recordBlobs = blobs.filter(b => b.pathname.endsWith('.json'))

    const records = await Promise.all(
      recordBlobs.map(async b => {
        try {
          const r = await fetch(b.url, { headers: { Authorization: `Bearer ${token}` } })
          if (!r.ok) return null
          return await r.json()
        } catch {
          return null
        }
      })
    )

    return res.status(200).json({ templates: records.filter(Boolean) })
  } catch (err) {
    console.error('list-templates error:', err)
    return res.status(200).json({ templates: [] })
  }
}
