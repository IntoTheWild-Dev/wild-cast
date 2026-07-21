// Merged get-comments.js + add-comment.js into one route (dispatched by method)
// to stay under Vercel's per-deployment serverless function count — needed
// headroom for the new library-assets route. Same logic, same behavior.
import { put, list } from '@vercel/blob'

async function handleGet(req, res) {
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

async function handlePost(req, res) {
  const { projectId, name, text } = req.body
  if (!projectId || !name?.trim() || !text?.trim()) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN
  const key = `comments/${projectId}.json`

  try {
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

export default async function handler(req, res) {
  if (req.method === 'GET') return handleGet(req, res)
  if (req.method === 'POST') return handlePost(req, res)
  return res.status(405).end()
}
