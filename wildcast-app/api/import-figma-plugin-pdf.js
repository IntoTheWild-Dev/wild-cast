// Second half of a plugin import: attaches the vector PDF of the frame to a
// template that /api/import-figma-plugin.js already created.
//
// It's a separate request (not part of the PNG one) because Vercel caps a
// function's request body at ~4.5 MB and the PNG alone is already large; the
// PDF gets its own budget. The plugin only calls this after the main import
// succeeded, and a failure here never undoes the PNG import - the template
// keeps working off the PNG exactly as before, it just has no vector
// background yet.
//
// Stores templates/<slotKey>-bg.pdf and adds backgroundPdfUrl to the record.
// Nothing reads the PDF yet - the editor and the CMYK export still use the
// PNG (see STATUS.md).
import { Buffer } from 'node:buffer'
import { list, put } from '@vercel/blob'
import { requirePluginKey } from './_lib/auth.js'
import { prepareBackgroundPdf } from './_lib/backgroundPdf.js'

async function readRecord(slotKey, token) {
  const { blobs } = await list({ prefix: `templates/${slotKey}.json`, token })
  if (!blobs.length) return null
  const cacheBustUrl = blobs[0].url + (blobs[0].url.includes('?') ? '&' : '?') + `_t=${Date.now()}`
  const response = await fetch(cacheBustUrl, { headers: { Authorization: `Bearer ${token}` } })
  if (!response.ok) throw new Error('Could not read existing template record')
  return response.json()
}

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
    if (!/^[a-z0-9-]+$/.test(slotKey)) {
      return res.status(400).json({ error: 'slotKey must be lowercase letters/numbers/hyphens only' })
    }

    const token = process.env.BLOB_READ_WRITE_TOKEN
    const record = await readRecord(slotKey, token)
    if (!record) {
      return res.status(404).json({ error: `No template found for slotKey "${slotKey}" - import it first` })
    }

    let prepared
    try {
      prepared = await prepareBackgroundPdf(Buffer.from(pdfBase64, 'base64'), frameBox)
    } catch (err) {
      return res.status(400).json({ error: err.message })
    }

    const pdfBlob = await put(`templates/${slotKey}-bg.pdf`, prepared.buffer, {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/pdf',
      token,
    })

    record.backgroundPdfUrl = pdfBlob.url
    record.backgroundPdfBytes = prepared.buffer.length
    await put(`templates/${slotKey}.json`, JSON.stringify(record), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
      token,
    })

    return res.status(200).json({
      ok: true,
      slotKey,
      backgroundPdfUrl: pdfBlob.url,
      bytes: prepared.buffer.length,
      trimBox: prepared.trimBox,
    })
  } catch (err) {
    console.error('import-figma-plugin-pdf error:', err)
    return res.status(500).json({ error: err.message })
  }
}
