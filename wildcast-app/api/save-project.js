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
            // Personal-folders feature (Julia's ask, 2026-09-15) - who saved
            // this and which of their subfolders it's filed under. Absent
            // on any design saved before this shipped, hence the ?? null
            // fallbacks - shows up as "Unassigned" in the Designs UI rather
            // than crashing or silently disappearing from folder views.
            ownerEmail: project.ownerEmail ?? null,
            ownerName: project.ownerName ?? null,
            folder: project.folder ?? null,
            // "My Tasks" status (Notion card "Review queue in the user
            // profile", 2026-09-22) - 'design' | 'review' | 'changes_requested'
            // | 'approved'. Absent on any project saved before this shipped,
            // same fallback convention as folder/owner above.
            reviewStatus: project.reviewStatus ?? 'design',
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

const VALID_REVIEW_STATUSES = ['design', 'review', 'changes_requested', 'approved']

// Flips a saved project's persisted review status only - used by
// ReviewPage.jsx's Approve/Request changes buttons (the only writer of
// 'approved'/'changes_requested'; the creator's own side only ever sets
// 'review', via App.jsx's doSave() passing the full project through the
// POST handler below instead). Folded
// in here rather than its own route - this codebase has already hit and
// worked around a real per-deployment serverless function count limit once
// (see comments.js's own note on merging get-comments.js + add-comment.js),
// and this is a small, single-field mutation against the exact same
// `projects/${id}.json` blob POST already writes to.
async function handlePatch(req, res) {
  const { projectId, status } = req.body ?? {}
  if (!projectId || !VALID_REVIEW_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Missing or invalid projectId/status' })
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN

  try {
    const { blobs } = await list({ prefix: `projects/${projectId}.json`, token, limit: 1 })
    if (!blobs.length) return res.status(404).json({ error: 'Project not found' })

    const cacheBustUrl = blobs[0].url + (blobs[0].url.includes('?') ? '&' : '?') + `_t=${Date.now()}`
    const response = await fetch(cacheBustUrl, { headers: { Authorization: `Bearer ${token}` } })
    if (!response.ok) throw new Error(`Blob fetch failed: ${response.status}`)
    const project = await response.json()

    project.reviewStatus = status
    await put(`projects/${projectId}.json`, JSON.stringify(project), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
      token,
    })

    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('review-status patch error:', err)
    return res.status(500).json({ error: err.message })
  }
}

export default async function handler(req, res) {
  if (req.method === 'GET') return handleList(req, res)
  if (req.method === 'PATCH') return handlePatch(req, res)
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
