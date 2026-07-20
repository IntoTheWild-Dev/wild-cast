// Flips a Figma-imported template's draft/live flag. Nothing from
// /api/import-figma-template.js is partner-visible until this is called
// with live:true — a deliberate review gate before anything goes public.
import { list, put } from '@vercel/blob'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { slotKey, live } = req.body ?? {}
  if (!slotKey || typeof live !== 'boolean') {
    return res.status(400).json({ error: 'Missing slotKey or live (boolean)' })
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN
  try {
    const { blobs } = await list({ prefix: `templates/${slotKey}.json`, token })
    if (!blobs.length) return res.status(404).json({ error: `No template found for slotKey "${slotKey}"` })

    const response = await fetch(blobs[0].url, { headers: { Authorization: `Bearer ${token}` } })
    if (!response.ok) return res.status(500).json({ error: 'Could not read existing template record' })
    const record = await response.json()

    record.live = live
    record.publishedAt = live ? new Date().toISOString() : null

    await put(`templates/${slotKey}.json`, JSON.stringify(record), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
      token,
    })

    return res.status(200).json({ ok: true, slotKey, live })
  } catch (err) {
    console.error('publish-template error:', err)
    return res.status(500).json({ error: err.message })
  }
}
