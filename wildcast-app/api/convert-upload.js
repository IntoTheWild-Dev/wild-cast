// CMYK photo uploads -> sRGB, on the server (Annika's checklist, 2026-10-27).
// Browsers decode CMYK JPEGs inconsistently (some ignore the profile, some
// invert Adobe files), and the editor canvas is also what the print export
// draws photos from - so a CMYK upload shown wrong would print wrong too.
// sharp/libvips converts with the file's embedded profile (or its default
// CMYK profile) to sRGB. Called only for files the browser saw as CMYK
// (src/lib/cmykUpload.js). Body: { data: base64 JPEG } (JSON, so it also
// runs on the local dev server); Vercel's 4.5 MB request cap applies.
import { Buffer } from 'node:buffer'
import sharp from 'sharp'
import { requireCaller } from './_lib/auth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!(await requireCaller(req, res))) return
  try {
    const data = String(req.body?.data ?? '').replace(/^data:[^,]+,/, '')
    if (!data) return res.status(400).json({ error: 'Missing image data' })
    const input = Buffer.from(data, 'base64')
    const meta = await sharp(input).metadata()
    if (meta.space !== 'cmyk') return res.status(400).json({ error: 'Not a CMYK image' })
    const out = await sharp(input).rotate().toColourspace('srgb').withIccProfile('srgb').jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toBuffer()
    res.setHeader('Content-Type', 'image/jpeg')
    return res.status(200).send(out)
  } catch (err) {
    console.error('convert-upload error:', err)
    return res.status(400).json({ error: 'Could not read this image' })
  }
}
