// Attaches the translucent example image for an image zone (today: the photo
// zone) to a template that /api/import-figma-plugin.js already created. The
// plugin exports the zone:photo layer's own pixels, so the example no longer
// has to be hand-added per template in src/data/placeholders.js.
//
// Separate request from the main import for the same reason as the PDF one
// (Vercel's ~4.5 MB body cap). A failure here never affects the import: the
// zone just keeps its grey labelled box.
//
// Stores templates/<slotKey>-ph-<zoneId>.png and sets zone.placeholderImage.
import { Buffer } from 'node:buffer'
import { list, put } from '@vercel/blob'
import { requirePluginKey } from './_lib/auth.js'

// Only photos get a real example. logo / sticker / qr keep their labelled
// boxes on purpose ("QR code must say QR code").
const ALLOWED_ZONES = new Set(['photo'])
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
    const { slotKey, zoneId, imageBase64 } = req.body ?? {}
    if (!slotKey || !zoneId || !imageBase64) {
      return res.status(400).json({ error: 'Missing slotKey, zoneId, or imageBase64' })
    }
    if (!/^[a-z0-9-]+$/.test(slotKey)) {
      return res.status(400).json({ error: 'slotKey must be lowercase letters/numbers/hyphens only' })
    }
    if (!ALLOWED_ZONES.has(zoneId)) {
      return res.status(400).json({ error: `Placeholder images are only supported for: ${[...ALLOWED_ZONES].join(', ')}` })
    }

    const image = Buffer.from(imageBase64, 'base64')
    if (image.length < 8 || !image.subarray(0, 4).equals(PNG_MAGIC)) {
      return res.status(400).json({ error: 'Not a PNG file' })
    }

    const token = process.env.BLOB_READ_WRITE_TOKEN
    const record = await readRecord(slotKey, token)
    if (!record) {
      return res.status(404).json({ error: `No template found for slotKey "${slotKey}" - import it first` })
    }
    const zone = (record.zones ?? []).find(z => z.id === zoneId && z.type === 'image')
    if (!zone) {
      return res.status(404).json({ error: `Template "${slotKey}" has no image zone "${zoneId}"` })
    }

    const blob = await put(`templates/${slotKey}-ph-${zoneId}.png`, image, {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'image/png',
      token,
    })

    zone.placeholderImage = blob.url
    await put(`templates/${slotKey}.json`, JSON.stringify(record), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
      token,
    })

    return res.status(200).json({ ok: true, slotKey, zoneId, placeholderImage: blob.url, bytes: image.length })
  } catch (err) {
    console.error('import-figma-plugin-placeholder error:', err)
    return res.status(500).json({ error: err.message })
  }
}
