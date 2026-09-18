import { list } from '@vercel/blob'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const { url, id } = req.query
  if (!url && !id) return res.status(400).json({ error: 'Missing url or id' })

  try {
    let targetUrl = url
    if (!targetUrl) {
      // Deep-link path (?edit=<id> in the app's URL, see App.jsx) - the
      // Designs list normally supplies the blob's url directly, but a
      // fresh page load only has the id from the address bar. The blob's
      // pathname is deterministic (save-project.js writes it to exactly
      // `projects/${id}.json`), so an exact-prefix list() resolves straight
      // to it without fetching every project's content the way the
      // Designs-list endpoint does.
      const { blobs } = await list({ prefix: `projects/${id}.json`, token: process.env.BLOB_READ_WRITE_TOKEN, limit: 1 })
      if (!blobs.length) return res.status(404).json({ error: 'Design not found' })
      targetUrl = blobs[0].url
    }
    // Append a timestamp so Cloudflare CDN always sees a new URL and never
    // serves a stale cached version of an overwritten blob.
    const cacheBustUrl = targetUrl + (targetUrl.includes('?') ? '&' : '?') + `_t=${Date.now()}`
    const response = await fetch(cacheBustUrl, {
      headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
    })
    if (!response.ok) throw new Error(`Blob fetch failed: ${response.status}`)
    const project = await response.json()
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
    res.setHeader('Pragma', 'no-cache')
    return res.status(200).json(project)
  } catch (err) {
    console.error('load-project error:', err)
    return res.status(500).json({ error: err.message })
  }
}
