import { put, list } from '@vercel/blob'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { projectId, name, text } = req.body
  if (!projectId || !name?.trim() || !text?.trim()) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN
  const key = `comments/${projectId}.json`

  try {
    // Load existing comments
    let comments = []
    const { blobs } = await list({ prefix: `comments/${projectId}`, token })
    if (blobs.length > 0) {
      const existing = await fetch(blobs[0].url, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (existing.ok) comments = await existing.json()
    }

    comments.push({
      id: crypto.randomUUID(),
      name: name.trim(),
      text: text.trim(),
      createdAt: Date.now(),
    })

    await put(key, JSON.stringify(comments), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
      token,
    })

    return res.status(200).json({ ok: true, count: comments.length })
  } catch (err) {
    console.error('add-comment error:', err)
    return res.status(500).json({ error: err.message })
  }
}
