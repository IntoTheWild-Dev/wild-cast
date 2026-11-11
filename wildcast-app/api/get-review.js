import { get } from '@vercel/blob'
import { requireReviewAccess } from './_lib/reviewAccess.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  const { id } = req.query
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(id)) return res.status(400).json({ error: 'Invalid project id' })
  if (!(await requireReviewAccess(req, res, id))) return

  const token = process.env.BLOB_READ_WRITE_TOKEN
  try {
    // Was list() + a plain fetch(blob.url) with no cache-busting at all -
    // the one place this exact CDN staleness bug (already found and fixed
    // in comments.js and save-project.js) was still live: a status change
    // that just landed (resubmit, approve, request changes) could be
    // masked by a stale cached read right here, on the endpoint that feeds
    // the external reviewer's own page. Same fix as those two: read the
    // known pathname directly via get() with useCache:false.
    const result = await get(`projects/${id}.json`, { access: 'private', useCache: false, token })
    if (!result) return res.status(404).json({ error: 'Project not found' })
    const project = await new Response(result.stream).json()
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
    // Public reviewers need the artwork and its review status, not the
    // private editing state or owner identifiers. Keep existing links usable.
    const { id: reviewId, templateName, projectName, previewHd, preview, thumbnail, reviewStatus, everRequestedChanges } = project
    return res.status(200).json({ id: reviewId, templateName, projectName, previewHd, preview, thumbnail, reviewStatus, everRequestedChanges })
  } catch (err) {
    console.error('get-review error:', err)
    return res.status(500).json({ error: err.message })
  }
}
