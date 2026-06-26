export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const { url } = req.query
  if (!url) return res.status(400).json({ error: 'Missing url' })

  try {
    // Append a timestamp so Cloudflare CDN always sees a new URL and never
    // serves a stale cached version of an overwritten blob.
    const cacheBustUrl = url + (url.includes('?') ? '&' : '?') + `_t=${Date.now()}`
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
