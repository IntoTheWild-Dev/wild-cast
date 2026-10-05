// Manual way to set a template's catalogue tile (the card picture in the
// template picker): a designer uploads an image on the template review screen.
// The Figma plugin makes one automatically at import; this is for replacing it
// or for templates imported before that existed. Same file as the plugin's
// (templates/<slotKey>-tile.png), so whichever ran last wins.
import { Buffer } from 'node:buffer'
import { list, put } from '@vercel/blob'
import sharp from 'sharp'
import { requireDesignerKey } from './_lib/auth.js'
import { assetPath, SLOT_KEY_RE } from './_lib/templateAssets.js'

// Plenty for a ~320px-wide card on a retina screen; keeps the file small.
const MAX_TILE_WIDTH = 1200

async function readRecord(slotKey, token) {
  const { blobs } = await list({ prefix: assetPath.record(slotKey), token })
  if (!blobs.length) return null
  const bust = blobs[0].url + (blobs[0].url.includes('?') ? '&' : '?') + `_t=${Date.now()}`
  const response = await fetch(bust, { headers: { Authorization: `Bearer ${token}` } })
  if (!response.ok) throw new Error('Could not read existing template record')
  return response.json()
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!(await requireDesignerKey(req, res))) return

  try {
    const { slotKey, imageBase64 } = req.body ?? {}
    if (!slotKey || !imageBase64) return res.status(400).json({ error: 'Missing slotKey or imageBase64' })
    if (!SLOT_KEY_RE.test(slotKey)) return res.status(400).json({ error: 'Invalid slotKey' })

    // Accept a data URL as well as bare base64.
    const raw = Buffer.from(String(imageBase64).replace(/^data:[^,]*,/, ''), 'base64')
    let tile
    try {
      tile = await sharp(raw).rotate().resize({ width: MAX_TILE_WIDTH, withoutEnlargement: true }).png().toBuffer()
    } catch {
      return res.status(400).json({ error: 'That file is not an image we can read (use PNG or JPG).' })
    }

    const token = process.env.BLOB_READ_WRITE_TOKEN
    const record = await readRecord(slotKey, token)
    if (!record) return res.status(404).json({ error: `No template found for slotKey "${slotKey}"` })

    const blob = await put(assetPath.tile(slotKey), tile, {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'image/png',
      token,
    })
    record.tileUrl = blob.url
    await put(assetPath.record(slotKey), JSON.stringify(record), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
      token,
    })
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
    return res.status(200).json({ ok: true, slotKey, tileUrl: blob.url })
  } catch (err) {
    console.error('upload-template-tile error:', err)
    return res.status(500).json({ error: err.message })
  }
}
