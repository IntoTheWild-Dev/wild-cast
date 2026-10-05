// Saves the images the Figma plugin makes for a template, and returns their
// URLs: the translucent photo / sticker examples (the zone's own pixels, or its
// same-named sibling layer) and the catalogue `tile` (the card picture in the
// template picker, made from a temporary finished-looking copy of the frame).
//
// It only SAVES files. Linking them to the template record is done once, at the
// end of the plugin run, by /api/import-figma-plugin-finish - earlier versions
// updated the record here, and two uploads' read-modify-writes could overwrite
// each other (the photo link vanished while the sticker's survived). Each
// request is also small and quick, so one failing can't take the others down.
// A failure never affects the import: the zone just keeps its grey labelled box
// and the card keeps the plain background.
//
// Body: { slotKey, images: { photo?, sticker?, tile? }, tileScale? } (base64
// PNGs). The old single-image shape { slotKey, zoneId, imageBase64 } still works.
import { Buffer } from 'node:buffer'
import { put } from '@vercel/blob'
import { requirePluginKey } from './_lib/auth.js'
import { cropToTrim } from './_lib/figma-import.js'
import { assetPath, EXAMPLE_ZONES, SLOT_KEY_RE } from './_lib/templateAssets.js'

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47])

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-plugin-key')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).end()
  if (!requirePluginKey(req, res)) return

  try {
    const { slotKey, zoneId, imageBase64 } = req.body ?? {}
    const images = req.body?.images ?? (zoneId && imageBase64 ? { [zoneId]: imageBase64 } : null)
    if (!slotKey || !images || typeof images !== 'object' || !Object.keys(images).length) {
      return res.status(400).json({ error: 'Missing slotKey or images' })
    }
    if (!SLOT_KEY_RE.test(slotKey)) {
      return res.status(400).json({ error: 'slotKey must be lowercase letters/numbers/hyphens only' })
    }

    // `tile` arrives as the full bleed frame and is trimmed the same way the
    // background is, so it needs the scale it was exported at.
    const tileScale = Number(req.body?.tileScale)
    if ('tile' in images && !(tileScale >= 0.5 && tileScale <= 4)) {
      return res.status(400).json({ error: 'tile needs a tileScale between 0.5 and 4' })
    }

    const decoded = {}
    for (const [id, b64] of Object.entries(images)) {
      if (id !== 'tile' && !EXAMPLE_ZONES.includes(id)) {
        return res.status(400).json({ error: `Images are only supported for: tile, ${EXAMPLE_ZONES.join(', ')}` })
      }
      const image = Buffer.from(String(b64), 'base64')
      if (image.length < 8 || !image.subarray(0, 4).equals(PNG_MAGIC)) {
        return res.status(400).json({ error: `${id}: not a PNG file` })
      }
      decoded[id] = image
    }

    const token = process.env.BLOB_READ_WRITE_TOKEN
    const save = async (path, body) => (await put(path, body, {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'image/png',
      token,
    })).url

    // In parallel - they are independent files.
    const outcomes = await Promise.all(Object.entries(decoded).map(async ([id, image]) => {
      try {
        if (id === 'tile') return [id, await save(assetPath.tile(slotKey), await cropToTrim(image, tileScale)), null]
        return [id, await save(assetPath.example(slotKey, id), image), null]
      } catch (err) {
        return [id, null, err.message]
      }
    }))

    const urls = {}
    const failed = {}
    for (const [id, url, err] of outcomes) {
      if (url) urls[id] = url
      else failed[id] = err
    }
    if (!Object.keys(urls).length) {
      return res.status(500).json({ error: Object.values(failed).join('; '), failed })
    }
    return res.status(200).json({ ok: true, slotKey, urls, failed })
  } catch (err) {
    console.error('import-figma-plugin-placeholder error:', err)
    return res.status(500).json({ error: err.message })
  }
}
