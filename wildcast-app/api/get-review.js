import { get } from '@vercel/blob'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  const { id } = req.query
  if (!id) return res.status(400).json({ error: 'Missing id' })

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
    return res.status(200).json(project)
  } catch (err) {
    console.error('get-review error:', err)
    return res.status(500).json({ error: err.message })
  }
}
