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

  const { slotKey, action, label } = req.body ?? {}
  if (!slotKey || !ACTIONS[action]) {
    return res.status(400).json({ error: `Missing slotKey or action (one of ${Object.keys(ACTIONS).join('|')})` })
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN
  try {
    const { blobs } = await list({ prefix: `templates/${slotKey}.json`, token })

    let record
    if (!blobs.length) {
      // No backing record — the only legitimate reason is archiving a
      // hardcoded catalogue slot (Option A/B) for the first time, which has
      // no Figma-import record at all. Create a lightweight "override"
      // record that carries just the archived flag, never real zones/
      // background data — src/lib/customTemplates.js skips these when
      // building zonesById/cards, so Option A/B's actual static data is
      // completely untouched by this.
      if (action !== 'archive') {
        return res.status(404).json({ error: `No template found for slotKey "${slotKey}"` })
      }
      record = { slotKey, label: label || slotKey, isOverrideOnly: true }
    } else {
      // Cache-bust so a rapid import-then-publish (typical usage) can't read
      // back a stale pre-import version of this record from Cloudflare's CDN.
      const cacheBustUrl = blobs[0].url + (blobs[0].url.includes('?') ? '&' : '?') + `_t=${Date.now()}`
      const response = await fetch(cacheBustUrl, { headers: { Authorization: `Bearer ${token}` } })
      if (!response.ok) return res.status(500).json({ error: 'Could not read existing template record' })
      record = await response.json()
    }

    const { live, archived } = ACTIONS[action]
    // An override record has no draft/live concept of its own — it only
    // ever tracks archived/not-archived for a slot that's really "live" via
    // its hardcoded source, so its `live` field is never meaningful to set.
    if (!record.isOverrideOnly) {
      record.live = live
      if (live) record.publishedAt = new Date().toISOString()
    }
    record.archived = archived

    await put(`templates/${slotKey}.json`, JSON.stringify(record), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
      token,
    })

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
    return res.status(200).json({ ok: true, slotKey, live: record.live, archived, isOverrideOnly: !!record.isOverrideOnly })
  } catch (err) {
    console.error('publish-template error:', err)
    return res.status(500).json({ error: err.message })
  }
}
