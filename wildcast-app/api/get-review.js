import { list } from '@vercel/blob'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  const { id } = req.query
  if (!id) return res.status(400).json({ error: 'Missing id' })

  const token = process.env.BLOB_READ_WRITE_TOKEN
  try {
    const { blobs } = await list({ prefix: `projects/${id}`, token })
    if (!blobs.length) return res.status(404).json({ error: 'Project not found' })

    const response = await fetch(blobs[0].url, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) throw new Error(`Blob fetch failed: ${response.status}`)
    const project = await response.json()
    return res.status(200).json(project)
  } catch (err) {
    console.error('get-review error:', err)
    return res.status(500).json({ error: err.message })
  }
}
