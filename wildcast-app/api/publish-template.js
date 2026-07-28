// Flips a Figma-imported template's draft/live/archived status. Nothing from
// /api/import-figma-template.js is partner-visible until this is called
// with action:'publish' — a deliberate review gate before anything goes public.
import { list, put } from '@vercel/blob'

// publish  → live,      visible in the catalogue
// unpublish→ draft,     pulled back for more review, still re-publishable
// archive  → archived,  hidden everywhere, slot freed up for a fresh import
// restore  → draft,     brought back from archive (does NOT auto-publish)
const ACTIONS = {
  publish:   { live: true,  archived: false },
  unpublish: { live: false, archived: false },
  archive:   { live: false, archived: true },
  restore:   { live: false, archived: false },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { slotKey, action } = req.body ?? {}
  if (!slotKey || !ACTIONS[action]) {
    return res.status(400).json({ error: `Missing slotKey or action (one of ${Object.keys(ACTIONS).join('|')})` })
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN
  try {
    const { blobs } = await list({ prefix: `templates/${slotKey}.json`, token })
    if (!blobs.length) return res.status(404).json({ error: `No template found for slotKey "${slotKey}"` })

    // Cache-bust so a rapid import-then-publish (typical usage) can't read
    // back a stale pre-import version of this record from Cloudflare's CDN.
    const cacheBustUrl = blobs[0].url + (blobs[0].url.includes('?') ? '&' : '?') + `_t=${Date.now()}`
    const response = await fetch(cacheBustUrl, { headers: { Authorization: `Bearer ${token}` } })
    if (!response.ok) return res.status(500).json({ error: 'Could not read existing template record' })
    const record = await response.json()

    const { live, archived } = ACTIONS[action]
    record.live = live
    record.archived = archived
    if (live) record.publishedAt = new Date().toISOString()

    await put(`templates/${slotKey}.json`, JSON.stringify(record), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
      token,
    })

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
    return res.status(200).json({ ok: true, slotKey, live, archived })
  } catch (err) {
    console.error('publish-template error:', err)
    return res.status(500).json({ error: err.message })
  }
}
