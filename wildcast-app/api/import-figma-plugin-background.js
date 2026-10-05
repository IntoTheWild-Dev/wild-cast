// "Update background only": replaces a template's background picture
// (templates/<slotKey>-bg.png) with a fresh export of the Figma frame, WITHOUT
// touching the template record. Zone positions, sizes, fonts and anything the
// designer fixed on the review screen all stay as they are.
//
// For when the artwork was wrong but the zones were fine - e.g. a layer that
// should have been hidden was left visible and got baked into the background.
// Same export, same trim as the full import (main import's cropToTrim), but only
// a file is written: no record read-modify-write (see CLAUDE.md on why).
import { Buffer } from 'node:buffer'
import { list, put } from '@vercel/blob'
import { requirePluginKey } from './_lib/auth.js'
import { cropToTrim } from './_lib/figma-import.js'
import { assetPath, SLOT_KEY_RE } from './_lib/templateAssets.js'
import sharp from 'sharp'

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47])
// A different frame size would put every zone in the wrong place.
const ASPECT_TOLERANCE = 0.02

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-plugin-key')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).end()
  if (!requirePluginKey(req, res)) return

  try {
    const { slotKey, imageBase64 } = req.body ?? {}
    const scale = Number(req.body?.scale)
    if (!slotKey || !imageBase64 || !(scale >= 0.5 && scale <= 8)) {
      return res.status(400).json({ error: 'Missing slotKey, imageBase64, or a usable scale' })
    }
    if (!SLOT_KEY_RE.test(slotKey)) {
      return res.status(400).json({ error: 'slotKey must be lowercase letters/numbers/hyphens only' })
    }
    const image = Buffer.from(String(imageBase64), 'base64')
    if (image.length < 8 || !image.subarray(0, 4).equals(PNG_MAGIC)) {
      return res.status(400).json({ error: 'Not a PNG file' })
    }

    const token = process.env.BLOB_READ_WRITE_TOKEN
    // Read-only look at the record: it must exist, and tells us the canvas shape.
    const { blobs } = await list({ prefix: assetPath.record(slotKey), token })
    if (!blobs.length) return res.status(404).json({ error: `No template found for slotKey "${slotKey}"` })
    const bust = blobs[0].url + (blobs[0].url.includes('?') ? '&' : '?') + `_t=${Date.now()}`
    const read = await fetch(bust, { headers: { Authorization: `Bearer ${token}` } })
    const record = read.ok ? await read.json() : null

    const trimmed = await cropToTrim(image, scale)
    if (record?.canvasW > 0 && record?.canvasH > 0) {
      const { width, height } = await sharp(trimmed).metadata()
      const wanted = record.canvasW / record.canvasH
      if (Math.abs(width / height - wanted) / wanted > ASPECT_TOLERANCE) {
        return res.status(400).json({ error: 'This frame is a different shape from the imported template, so its zones would no longer line up. Use the same frame, or do a full import.' })
      }
    }

    const blob = await put(assetPath.background(slotKey), trimmed, {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'image/png',
      token,
    })
    return res.status(200).json({ ok: true, slotKey, url: blob.url })
  } catch (err) {
    console.error('import-figma-plugin-background error:', err)
    return res.status(500).json({ error: err.message })
  }
}
