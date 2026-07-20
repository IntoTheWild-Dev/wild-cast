// Self-serve Figma → WildCast import. Pulls zone geometry + a real bleed
// background from a Figma master (see api/_lib/figma-import.js) and stores
// the result in Vercel Blob as a draft template — nothing is deployed live
// until a designer reviews it and calls /api/publish-template.
import { put } from '@vercel/blob'
import { importFigmaTemplate } from './_lib/figma-import.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  try {
    const { figmaUrl, slotKey, label, cat, format } = req.body ?? {}
    if (!figmaUrl || !slotKey || !label || !cat || !format) {
      return res.status(400).json({ error: 'Missing figmaUrl, slotKey, label, cat, or format' })
    }
    if (!/^[a-z0-9-]+$/.test(slotKey)) {
      return res.status(400).json({ error: 'slotKey must be lowercase letters/numbers/hyphens only' })
    }

    const token = process.env.FIGMA_TOKEN
    if (!token) {
      return res.status(500).json({ error: 'FIGMA_TOKEN is not configured on the server' })
    }

    const result = await importFigmaTemplate({ figmaUrl, token })

    const bgBlob = await put(`templates/${slotKey}-bg.png`, result.imageBuffer, {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'image/png',
      token: process.env.BLOB_READ_WRITE_TOKEN,
    })

    const record = {
      slotKey,
      label,
      cat,
      format,
      canvasW: 316,
      canvasH: 441,
      backgroundFill: '#00C2CB',
      backgroundUrl: bgBlob.url,
      zones: result.zones,
      needsReview: result.needsReview,
      live: false, // draft — never auto-publish over a real partner-facing slot
      figmaUrl,
      sourceFrameName: result.frameName,
      createdAt: new Date().toISOString(),
    }

    const recordBlob = await put(`templates/${slotKey}.json`, JSON.stringify(record), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
      token: process.env.BLOB_READ_WRITE_TOKEN,
    })

    return res.status(200).json({ ...record, recordUrl: recordBlob.url })
  } catch (err) {
    console.error('import-figma-template error:', err)
    return res.status(500).json({ error: err.message })
  }
}
