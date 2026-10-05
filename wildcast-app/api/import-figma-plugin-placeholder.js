// Attaches the translucent example image for an image zone (photo and sticker)
// to a template that /api/import-figma-plugin.js already created. The plugin
// exports the zone's (or its same-named sibling layer's) own pixels, so the
// example no longer has to be hand-added per template in
// src/data/placeholders.js.
//
// Separate request from the main import for the same reason as the PDF one
// (Vercel's ~4.5 MB body cap). A failure here never affects the import: the
// zone just keeps its grey labelled box.
//
// Stores templates/<slotKey>-ph-<zoneId>.png and sets zone.placeholderImage.
import { Buffer } from 'node:buffer'
import { list, put } from '@vercel/blob'
import { requirePluginKey } from './_lib/auth.js'
import { cropToTrim } from './_lib/figma-import.js'

// Photos and stickers get a real example (plus the template card `tile`, handled separately below). logo / qr keep their labelled boxes
// on purpose ("QR code must say QR code").
const ALLOWED_ZONES = new Set(['photo', 'sticker'])
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47])

async function readRecord(slotKey, token) {
  const { blobs } = await list({ prefix: `templates/${slotKey}.json`, token })
  if (!blobs.length) return null
  const cacheBustUrl = blobs[0].url + (blobs[0].url.includes('?') ? '&' : '?') + `_t=${Date.now()}`
  const response = await fetch(cacheBustUrl, { headers: { Authorization: `Bearer ${token}` } })
  if (!response.ok) throw new Error('Could not read existing template record')
  return response.json()
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-plugin-key')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).end()
  if (!requirePluginKey(req, res)) return

  try {
    // Body: { slotKey, images: { photo: <base64>, sticker: <base64> } }. All
    // images go in ONE request so the template record is read and written
    // once - separate requests each did their own read-modify-write, and a
    // stale read in the second one could silently overwrite the first one's
    // link (the photo example vanished while the sticker's survived). The old
    // single-image shape { slotKey, zoneId, imageBase64 } still works.
    const { slotKey, zoneId, imageBase64 } = req.body ?? {}
    const images = req.body?.images ?? (zoneId && imageBase64 ? { [zoneId]: imageBase64 } : null)
    if (!slotKey || !images || typeof images !== 'object' || !Object.keys(images).length) {
      return res.status(400).json({ error: 'Missing slotKey or images' })
    }
    if (!/^[a-z0-9-]+$/.test(slotKey)) {
      return res.status(400).json({ error: 'slotKey must be lowercase letters/numbers/hyphens only' })
    }

    // `tile` is the template picker's card picture, not a zone example: it
    // arrives as the full bleed frame and is trimmed the same way the
    // background is, so it needs the scale it was exported at.
    const tileScale = Number(req.body?.tileScale)
    if ('tile' in images && !(tileScale >= 0.5 && tileScale <= 4)) {
      return res.status(400).json({ error: 'tile needs a tileScale between 0.5 and 4' })
    }

    const decoded = {}
    for (const [id, b64] of Object.entries(images)) {
      if (id !== 'tile' && !ALLOWED_ZONES.has(id)) {
        return res.status(400).json({ error: `Placeholder images are only supported for: ${[...ALLOWED_ZONES].join(', ')}` })
      }
      const image = Buffer.from(String(b64), 'base64')
      if (image.length < 8 || !image.subarray(0, 4).equals(PNG_MAGIC)) {
        return res.status(400).json({ error: `${id}: not a PNG file` })
      }
      decoded[id] = image
    }

    const token = process.env.BLOB_READ_WRITE_TOKEN
    const record = await readRecord(slotKey, token)
    if (!record) {
      return res.status(404).json({ error: `No template found for slotKey "${slotKey}" - import it first` })
    }

    const imported = []
    const skipped = {}
    for (const [id, image] of Object.entries(decoded)) {
      if (id === 'tile') {
        try {
          const tile = await cropToTrim(image, tileScale)
          const blob = await put(`templates/${slotKey}-tile.png`, tile, {
            access: 'private',
            addRandomSuffix: false,
            allowOverwrite: true,
            contentType: 'image/png',
            token,
          })
          record.tileUrl = blob.url
          imported.push('tile')
        } catch (err) {
          skipped.tile = `could not trim the tile image: ${err.message}`
        }
        continue
      }
      const zone = (record.zones ?? []).find(z => z.id === id && z.type === 'image')
      if (!zone) { skipped[id] = `template has no image zone "${id}"`; continue }
      const blob = await put(`templates/${slotKey}-ph-${id}.png`, image, {
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'image/png',
        token,
      })
      zone.placeholderImage = blob.url
      imported.push(id)
    }
    if (!imported.length) {
      return res.status(404).json({ error: Object.values(skipped).join('; ') })
    }

    await put(`templates/${slotKey}.json`, JSON.stringify(record), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
      token,
    })

    return res.status(200).json({ ok: true, slotKey, imported, skipped })
  } catch (err) {
    console.error('import-figma-plugin-placeholder error:', err)
    return res.status(500).json({ error: err.message })
  }
}
