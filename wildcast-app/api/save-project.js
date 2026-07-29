import { put, list } from '@vercel/blob'

// Designs used to only be discoverable via a per-browser localStorage
// registry — nobody but the person who saved a design could ever see it
// existed, even on their own other devices. This lists every saved project
// from Blob directly, making Designs genuinely shared across every
// activation key (Julia's call, 2026-07-29). Returns lightweight summaries
// only — the full editing state (fields, positions, etc.) is still fetched
// separately via load-project.js only when a design is actually opened.
async function handleList(req, res) {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  try {
    const { blobs } = await list({ prefix: 'projects/', token })
    const projects = await Promise.all(
      blobs.map(async b => {
        try {
          // Cache-bust so a rapid save-then-list can't read back a stale
          // pre-save version from Cloudflare's CDN — same pattern used
          // throughout this project's other list endpoints.
          const cacheBustUrl = b.url + (b.url.includes('?') ? '&' : '?') + `_t=${Date.now()}`
          const r = await fetch(cacheBustUrl, { headers: { Authorization: `Bearer ${token}` } })
          if (!r.ok) return null
          const project = await r.json()
          return {
            id: project.id,
            url: b.url,
            templateId: project.templateId,
            templateName: project.templateName,
            projectName: project.projectName,
            // Same merchant fallback used for canvas-editor uploads: real
            // restaurant name if the template has one, else the project's
            // own name — always something, never blank.
            merchant: (project.fields?.restaurant_name || '').trim() || project.projectName || project.templateName,
            savedAt: project.savedAt,
            thumbnail: project.thumbnail,
          }
        } catch {
          return null
        }
      })
    )
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
    return res.status(200).json({ projects: projects.filter(Boolean) })
  } catch (err) {
    console.error('save-project list error:', err)
    return res.status(200).json({ projects: [] })
  }
}

export default async function handler(req, res) {
  if (req.method === 'GET') return handleList(req, res)
  if (req.method !== 'POST') return res.status(405).end()

  try {
    const project = req.body
    if (!project?.id || !project?.templateId) {
      return res.status(400).json({ error: 'Missing project id or templateId' })
    }

    const blob = await put(`projects/${project.id}.json`, JSON.stringify(project), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
      token: process.env.BLOB_READ_WRITE_TOKEN,
    })

    return res.status(200).json({ id: project.id, url: blob.url })
  } catch (err) {
    console.error('save-project error:', err)
    return res.status(500).json({ error: err.message })
  }
}
