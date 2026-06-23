import { list } from '@vercel/blob'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  const { id } = req.query
  if (!id) return res.status(400).json({ error: 'Missing id' })

  const token = process.env.BLOB_READ_WRITE_TOKEN
  try {
    const { blobs } = await list({ prefix: `comments/${id}`, token })
    if (!blobs.length) return res.status(200).json({ comments: [] })

    const response = await fetch(blobs[0].url, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) return res.status(200).json({ comments: [] })
    const comments = await response.json()
    return res.status(200).json({ comments })
  } catch (err) {
    console.error('get-comments error:', err)
    return res.status(200).json({ comments: [] })
  }
}
