// Returns every custom (Figma-imported) template record, draft or published.
// The frontend merges these with the static built-in templates at load time.
import { list } from '@vercel/blob'

export default async function handler(req, res) {
  // The Figma plugin (figma-plugin/code.js) calls this from inside Figma's
  // own webview, which enforces normal browser CORS — unlike the rest of
  // this app's endpoints, this one has no per-request secret to check, so a
  // wildcard origin costs nothing (see FIGMA_IMPORT_ROADMAP.md's "open
  // questions": this was the anticipated fallback once main-thread fetch
  // turned out not to bypass CORS after all).
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'GET') return res.status(405).end()

  const token = process.env.BLOB_READ_WRITE_TOKEN

  // ?url=<blobUrl> — proxy a private background PNG through to the browser.
  // Same reason as api/library-assets.js's proxy: this Blob store only allows
  // private access, and a plain <img src> can't attach the Authorization
  // header a private blob requires.
  if (req.query.url) {
    try {
      const upstream = await fetch(req.query.url, { headers: { Authorization: `Bearer ${token}` } })
      if (!upstream.ok) return res.status(upstream.status).end()
      const contentType = upstream.headers.get('content-type') || 'application/octet-stream'
      const buffer = Buffer.from(await upstream.arrayBuffer())
      res.setHeader('Content-Type', contentType)
      res.setHeader('Cache-Control', 'private, max-age=86400')
      return res.status(200).send(buffer)
    } catch (err) {
      console.error('template-asset proxy error:', err)
      return res.status(500).end()
    }
  }

  try {
    const { blobs } = await list({ prefix: 'templates/', token })
    const recordBlobs = blobs.filter(b => b.pathname.endsWith('.json'))

    const records = await Promise.all(
      recordBlobs.map(async b => {
        try {
          // Cache-bust so Cloudflare's CDN in front of Blob never serves a
          // stale record right after publish-template.js flips live:true —
          // the exact staleness bug already hit (and fixed this same way)
          // for save-project/load-project.
          const cacheBustUrl = b.url + (b.url.includes('?') ? '&' : '?') + `_t=${Date.now()}`
          const r = await fetch(cacheBustUrl, { headers: { Authorization: `Bearer ${token}` } })
          if (!r.ok) return null
          return await r.json()
        } catch {
          return null
        }
      })
    )

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
    res.setHeader('Pragma', 'no-cache')
    return res.status(200).json({ templates: records.filter(Boolean) })
  } catch (err) {
    console.error('list-templates error:', err)
    return res.status(200).json({ templates: [] })
  }
}
