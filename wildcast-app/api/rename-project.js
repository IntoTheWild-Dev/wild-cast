// Renames an already-saved design straight from the Designs tab, without
// opening the editor (Julia's ask, 2026-09-15). Same reasoning as
// move-project.js: Designs' list view only ever holds a lightweight summary,
// not the full editing state, so this loads the real full record
// server-side and patches only `projectName` rather than round-tripping
// whatever the client has back through save-project.js's POST (which would
// silently wipe every field the summary doesn't carry).
import { list, put } from '@vercel/blob'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  try {
    const { id, projectName } = req.body ?? {}
    const trimmed = (projectName || '').trim()
    if (!id || !trimmed) return res.status(400).json({ error: 'Missing project id or name' })

    const token = process.env.BLOB_READ_WRITE_TOKEN
    const path = `projects/${id}.json`
    const { blobs } = await list({ prefix: path, token })
    const match = blobs.find(b => b.pathname === path)
    if (!match) return res.status(404).json({ error: 'Project not found' })

    const cacheBustUrl = match.url + (match.url.includes('?') ? '&' : '?') + `_t=${Date.now()}`
    const r = await fetch(cacheBustUrl, { headers: { Authorization: `Bearer ${token}` } })
    if (!r.ok) throw new Error(`Blob fetch failed: ${r.status}`)
    const project = await r.json()

    project.projectName = trimmed

    await put(path, JSON.stringify(project), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
      token,
    })

    return res.status(200).json({ id, projectName: trimmed })
  } catch (err) {
    console.error('rename-project error:', err)
    return res.status(500).json({ error: err.message })
  }
}
