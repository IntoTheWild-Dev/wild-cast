// Last step of a plugin import: links the files the plugin saved (PDF, tile,
// photo / sticker examples) to the template record, in ONE read-modify-write.
//
// The record is read straight from the URL the main import returned (not via
// list(), which can lag behind a fresh write by up to ~30s - see
// list-templates.js), and every URL the plugin passes back is checked to be a
// file in the same store at exactly the expected path before it is stored.
// Nothing here can fail the import: if this step fails the files are saved but
// unlinked, and the plugin says so.
import { put } from '@vercel/blob'
import { requirePluginKey } from './_lib/auth.js'
import { assetPath, EXAMPLE_ZONES, isBlobUrl, isSiblingBlobUrl, SLOT_KEY_RE } from './_lib/templateAssets.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-plugin-key')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).end()
  if (!requirePluginKey(req, res)) return

  try {
    const { slotKey, recordUrl, links } = req.body ?? {}
    if (!slotKey || !recordUrl || !links || typeof links !== 'object') {
      return res.status(400).json({ error: 'Missing slotKey, recordUrl, or links' })
    }
    if (!SLOT_KEY_RE.test(slotKey)) {
      return res.status(400).json({ error: 'slotKey must be lowercase letters/numbers/hyphens only' })
    }
    // We send our Blob token to this URL, so it must be this template's record
    // on Vercel Blob and nothing else.
    if (!isBlobUrl(recordUrl, assetPath.record(slotKey))) {
      return res.status(400).json({ error: 'recordUrl is not this template\'s record' })
    }

    const token = process.env.BLOB_READ_WRITE_TOKEN
    const bust = recordUrl + (recordUrl.includes('?') ? '&' : '?') + `_t=${Date.now()}`
    const read = await fetch(bust, { headers: { Authorization: `Bearer ${token}` } })
    if (!read.ok) return res.status(502).json({ error: `Could not read the template record (HTTP ${read.status})` })
    const record = await read.json()
    if (record.slotKey !== slotKey) return res.status(400).json({ error: 'Record does not match slotKey' })

    const linked = []
    const skipped = {}

    if (links.tileUrl) {
      if (isSiblingBlobUrl(links.tileUrl, recordUrl, assetPath.tile(slotKey))) { record.tileUrl = links.tileUrl; linked.push('tile') }
      else skipped.tile = 'unexpected file location'
    }
    if (links.backgroundPdfUrl) {
      if (isSiblingBlobUrl(links.backgroundPdfUrl, recordUrl, assetPath.pdf(slotKey))) { record.backgroundPdfUrl = links.backgroundPdfUrl; linked.push('pdf') }
      else skipped.pdf = 'unexpected file location'
    }
    for (const [id, url] of Object.entries(links.placeholderImages ?? {})) {
      if (!EXAMPLE_ZONES.includes(id)) { skipped[id] = 'not a supported example zone'; continue }
      const zone = (record.zones ?? []).find(z => z.id === id && z.type === 'image')
      if (!zone) { skipped[id] = `the template has no image zone "${id}"`; continue }
      if (!isSiblingBlobUrl(url, recordUrl, assetPath.example(slotKey, id))) { skipped[id] = 'unexpected file location'; continue }
      zone.placeholderImage = url
      linked.push(id)
    }

    if (!linked.length) return res.status(400).json({ error: 'Nothing could be linked', skipped })

    await put(assetPath.record(slotKey), JSON.stringify(record), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
      token,
    })
    return res.status(200).json({ ok: true, slotKey, linked, skipped })
  } catch (err) {
    console.error('import-figma-plugin-finish error:', err)
    return res.status(500).json({ error: err.message })
  }
}
