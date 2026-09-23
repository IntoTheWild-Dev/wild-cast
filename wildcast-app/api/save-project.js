import { put, list, get } from '@vercel/blob'

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
          // get()+useCache:false reads this blob's content straight from
          // origin storage instead of through the CDN, so a status flip
          // that just landed (e.g. Request changes, PATCHed via handlePatch
          // below) can't be masked by a stale cached read here - same fix
          // as comments.js's own loadComments(), which had the identical
          // symptom (a just-written value not showing up on the very next
          // read) for the same reason.
          const result = await get(b.pathname, { access: 'private', useCache: false, token })
          if (!result) return null
          const project = await new Response(result.stream).json()
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
            // My Tasks "second round" color-coding (Julia's ask, 2026-09-23):
            // true once this design has ever had changes requested against
            // it, so a resubmission sitting under review again reads
            // differently from a design being looked at for the first time.
            // Sticky once true - never cleared by an ordinary review pass.
            everRequestedChanges: project.everRequestedChanges ?? false,
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
    // Known, deterministic pathname (addRandomSuffix: false on every save)
    // - reads it directly instead of list()-then-fetch, same fix as
    // handleList above and comments.js's loadComments(). This one matters
    // more: a stale read here doesn't just show a stale status, it gets
    // written BACK, silently reverting whatever the stale read missed.
    const result = await get(`projects/${projectId}.json`, { access: 'private', useCache: false, token })
    if (!result) return res.status(404).json({ error: 'Project not found' })
    const project = await new Response(result.stream).json()

    project.reviewStatus = status
    // Sticky "second round" flag for My Tasks - see its own note above on
    // the GET side. Only ever flips on, never off.
    if (status === 'changes_requested') project.everRequestedChanges = true
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
    const incoming = req.body
    if (!incoming?.id || !incoming?.templateId) {
      return res.status(400).json({ error: 'Missing project id or templateId' })
    }

    const token = process.env.BLOB_READ_WRITE_TOKEN

    // Bug fix, 2026-09-24 (root cause behind the everRequestedChanges fix
    // above, and the wider class it's one instance of): a plain save
    // (autosave, manual Save) used to write the client's in-memory
    // reviewStatus/everRequestedChanges straight through, full overwrite,
    // no matter how stale. Since neither field is ever polled while the
    // editor's open, a designer typing while a Manager/reviewer PATCHes a
    // status change elsewhere could have their next autosave silently
    // revert that change moments later - exactly what happened to
    // everRequestedChanges specifically, but the same risk applies to
    // reviewStatus itself. Root fix: these two fields are the review
    // lifecycle's own state, not ordinary editor content - a plain save
    // has no business touching either. reviewStatus is only set from the
    // client when doSave() passes it explicitly (an intentional
    // transition - Send review link's first-send or resubmit); otherwise
    // it's preserved from whatever's already stored. everRequestedChanges
    // is never taken from the client at all - handlePatch above is its
    // only writer, full stop.
    let existingReviewStatus, existingEverRequestedChanges
    const existing = await get(`projects/${incoming.id}.json`, { access: 'private', useCache: false, token }).catch(() => null)
    if (existing) {
      const existingProject = await new Response(existing.stream).json()
      existingReviewStatus = existingProject.reviewStatus
      existingEverRequestedChanges = existingProject.everRequestedChanges
    }

    const project = {
      ...incoming,
      reviewStatus: incoming.reviewStatus ?? existingReviewStatus ?? 'design',
      everRequestedChanges: existingEverRequestedChanges ?? false,
    }

    const blob = await put(`projects/${project.id}.json`, JSON.stringify(project), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
      token,
    })

    return res.status(200).json({ id: project.id, url: blob.url })
  } catch (err) {
    console.error('save-project error:', err)
    return res.status(500).json({ error: err.message })
  }
}
