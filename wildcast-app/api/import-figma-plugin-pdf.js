// Saves the vector PDF the Figma plugin exports for a frame, alongside the
// background PNG that /api/import-figma-plugin.js already stored.
//
// Separate request from the PNG import because Vercel caps a function's request
// body at ~4.5 MB. It only SAVES the file (templates/<slotKey>-bg.pdf) and
// returns its URL - linking it to the template record is done once, at the end
// of the plugin run, by /api/import-figma-plugin-finish. A failure here never
// affects the PNG import. Nothing reads the PDF yet - the editor and the CMYK
// export still use the PNG (see STATUS.md).
import { Buffer } from 'node:buffer'
import { put } from '@vercel/blob'
import { requirePluginKey } from './_lib/auth.js'
import { prepareBackgroundPdf } from './_lib/backgroundPdf.js'
import { assetPath, SLOT_KEY_RE } from './_lib/templateAssets.js'

export default async function handler(req, res) {
  // Same CORS reasoning as import-figma-plugin.js: called from Figma's
  // webview with a custom header, so the preflight has to succeed.
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-plugin-key')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).end()
  if (!requirePluginKey(req, res)) return

  try {
    const { slotKey, pdfBase64, frameBox } = req.body ?? {}
    if (!slotKey || !pdfBase64 || !frameBox) {
      return res.status(400).json({ error: 'Missing slotKey, pdfBase64, or frameBox' })
    }
    if (!SLOT_KEY_RE.test(slotKey)) {
      return res.status(400).json({ error: 'slotKey must be lowercase letters/numbers/hyphens only' })
    }

    let prepared
    try {
      prepared = await prepareBackgroundPdf(Buffer.from(pdfBase64, 'base64'), frameBox)
    } catch (err) {
      return res.status(400).json({ error: err.message })
    }

    const blob = await put(assetPath.pdf(slotKey), prepared.buffer, {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/pdf',
      token: process.env.BLOB_READ_WRITE_TOKEN,
    })

    return res.status(200).json({ ok: true, slotKey, url: blob.url, bytes: prepared.buffer.length, trimBox: prepared.trimBox })
  } catch (err) {
    console.error('import-figma-plugin-pdf error:', err)
    return res.status(500).json({ error: err.message })
  }
}
