// Merged get-comments.js + add-comment.js into one route (dispatched by method)
// to stay under Vercel's per-deployment serverless function count — needed
// headroom for the new library-assets route. Same logic, same behavior.
//
// Two-way + resolved state (Julia's ask, 2026-09-16): comments used to only
// ever flow reviewer -> designer, read-only on the designer's side. `from`
// ('reviewer' | 'designer') tags who posted each entry - the designer's own
// replies come from the signed-in editor (App.jsx), not a separate reviewer
// link, so there's no separate name field to type there; `resolved` is a
// plain boolean either side can flip, no access control, matching this
// project's existing trust model (Designs/Library have none either).
import { put, list } from '@vercel/blob'

async function loadComments(projectId, token) {
  const { blobs } = await list({ prefix: `comments/${projectId}`, token })
  if (!blobs.length) return []
  // Cache-bust so a reply posted a moment ago is never masked by a stale
  // CDN-cached read - the same fix this project has needed repeatedly
  // elsewhere (list-templates.js, save-project.js, etc.), and matters more
  // here now that both sides read/write in the same short conversation.
  const cacheBustUrl = blobs[0].url + (blobs[0].url.includes('?') ? '&' : '?') + `_t=${Date.now()}`
  const response = await fetch(cacheBustUrl, { headers: { Authorization: `Bearer ${token}` } })
  if (!response.ok) return []
  return response.json()
}

async function saveComments(projectId, comments, token) {
  await put(`comments/${projectId}.json`, JSON.stringify(comments), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    token,
  })
}

async function handleGet(req, res) {
  const { id } = req.query
  if (!id) return res.status(400).json({ error: 'Missing id' })

  const token = process.env.BLOB_READ_WRITE_TOKEN
  try {
    const comments = await loadComments(id, token)
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
    return res.status(200).json({ comments })
  } catch (err) {
    console.error('get-comments error:', err)
    return res.status(200).json({ comments: [] })
  }
}

async function handlePost(req, res) {
  const { projectId, name, text, from } = req.body
  if (!projectId || !name?.trim() || !text?.trim()) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN

  try {
    const comments = await loadComments(projectId, token)
    comments.push({
      id: crypto.randomUUID(),
      name: name.trim(),
      text: text.trim(),
      // Defaults to 'reviewer' - ReviewPage.jsx (the external share-link
      // page) never sends this, only App.jsx's editor sidebar does when the
      // signed-in designer replies.
      from: from === 'designer' ? 'designer' : 'reviewer',
      resolved: false,
      createdAt: Date.now(),
    })
    await saveComments(projectId, comments, token)
    return res.status(200).json({ ok: true, count: comments.length })
  } catch (err) {
    console.error('add-comment error:', err)
    return res.status(500).json({ error: err.message })
  }
}

async function handlePatch(req, res) {
  const { projectId, commentId, resolved } = req.body
  if (!projectId || !commentId || typeof resolved !== 'boolean') {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN

  try {
    const comments = await loadComments(projectId, token)
    const comment = comments.find(c => c.id === commentId)
    if (!comment) return res.status(404).json({ error: 'Comment not found' })
    comment.resolved = resolved
    await saveComments(projectId, comments, token)
    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('resolve-comment error:', err)
    return res.status(500).json({ error: err.message })
  }
}

export default async function handler(req, res) {
  if (req.method === 'GET') return handleGet(req, res)
  if (req.method === 'POST') return handlePost(req, res)
  if (req.method === 'PATCH') return handlePatch(req, res)
  return res.status(405).end()
}
