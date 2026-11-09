import process from 'node:process'
import { readJson, updateJson } from './_lib/atomicJson.js'
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
import { get } from '@vercel/blob'
import { notifyOwner } from './_lib/notifications.js'

const commentPath = id => `comments/${id}.json`
const loadComments = async (id, token) => (await readJson(commentPath(id), token)) ?? []
const missing = message => Object.assign(new Error(message), { status: 404 })

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

// Figma-style pinned comments (Anang's ask, 2026-09-28): a comment can carry
// `pin` - where on the design it was dropped, as 0-1 fractions of the trim
// area (the same area the saved preview image shows), so it lands in the
// same spot in the editor at any zoom and on the review link. Returns null
// for anything that isn't a real in-bounds point.
function parsePin(pin) {
  if (!pin || typeof pin !== 'object') return null
  const x = Number(pin.x), y = Number(pin.y)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) }
}

async function handlePost(req, res) {
  const { projectId, name, text, from, pin, parentId } = req.body
  if (!projectId || !name?.trim() || !text?.trim()) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN

  try {
    const newId = crypto.randomUUID()
    const createdAt = Date.now()
    const { value: comments } = await updateJson(commentPath(projectId), current => {
      const comments = current ?? []
      // A reply (`parentId`) always hangs off a thread's root comment, never
      // off another reply, and never carries its own pin - the thread's root
      // owns the pin. Comments without either stay plain, unpinned top-level
      // comments, exactly like every comment saved before this.
      const parent = parentId ? comments.find(c => c.id === parentId) : null
      if (parentId && !parent) throw missing('Thread not found')
      const rootId = parent ? (parent.parentId || parent.id) : null
      const parsedPin = rootId ? null : parsePin(pin)
      comments.push({
        id: newId,
        name: name.trim(),
        text: text.trim(),
        // Defaults to 'reviewer' - ReviewPage.jsx (the external share-link
        // page) never sends this. App.jsx's editor sends 'designer' or
        // 'manager' from the "View as" role (was always 'designer', so a
        // Manager's editor comments were mislabelled and never notified the
        // owner - Anang, 2026-09-29).
        from: from === 'designer' || from === 'manager' ? from : 'reviewer',
        resolved: false,
        createdAt,
        ...(rootId ? { parentId: rootId } : {}),
        ...(parsedPin ? { pin: parsedPin } : {}),
      })
      return comments
    }, { token })

    // A reviewer's or Manager's comment notifies the design's owner. The
    // designer's own replies (from: 'designer', posted from the editor)
    // don't - they'd only be notifying themselves.
    if (from !== 'designer') {
      try {
        const result = await get(`projects/${projectId}.json`, { access: 'private', useCache: false, token })
        if (result) {
          const project = await new Response(result.stream).json()
          await notifyOwner(project.ownerEmail, {
            type: 'comment',
            projectId,
            projectName: project.projectName || project.templateName || 'Untitled design',
            actor: name.trim().slice(0, 80),
            text: text.trim().slice(0, 200),
          }, token)
        }
      } catch (err) {
        console.error('comment notification error:', err)
      }
    }

    return res.status(200).json({ ok: true, id: newId, count: comments.length })
  } catch (err) {
    console.error('add-comment error:', err)
    return res.status(err.status || 500).json({ error: err.message })
  }
}

async function handlePatch(req, res) {
  const { projectId, commentId, resolved } = req.body
  if (!projectId || !commentId || typeof resolved !== 'boolean') {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN

  try {
    await updateJson(commentPath(projectId), current => {
      const comments = current ?? []
      const comment = comments.find(c => c.id === commentId)
      if (!comment) throw missing('Comment not found')
      comment.resolved = resolved
      return comments
    }, { token })
    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('resolve-comment error:', err)
    return res.status(err.status || 500).json({ error: err.message })
  }
}

export default async function handler(req, res) {
  if (!['GET', 'POST', 'PATCH'].includes(req.method)) return res.status(405).end()
  const projectId = req.method === 'GET' ? req.query.id : req.body?.projectId
  if (typeof projectId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(projectId)) return res.status(400).json({ error: 'Invalid project id' })
  if (req.method === 'GET') return handleGet(req, res)
  if (req.method === 'POST') return handlePost(req, res)
  if (req.method === 'PATCH') return handlePatch(req, res)
  return res.status(405).end()
}
