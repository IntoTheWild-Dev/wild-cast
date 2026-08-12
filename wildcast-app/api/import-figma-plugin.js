// Receives a completed import directly from the WildCast Figma plugin
// (figma-plugin/code.js) — the plugin already read the live node tree via
// the Plugin API and exported the background PNG itself via
// node.exportAsync, so unlike api/import-figma-template.js (the legacy
// paste-a-URL path this is meant to replace, see FIGMA_IMPORT_ROADMAP.md)
// this endpoint makes no Figma API calls of its own and needs no Figma
// token at all.
//
// The plugin sends RAW node data (bounding boxes, font info, the exported
// PNG bytes) rather than pre-computed zone geometry — the actual
// geometry/font math (toCanvasZoneFromPluginNode, cropToTrim) runs here,
// reusing the exact same functions api/_lib/figma-import.js already has
// for the REST path, so there's one source of truth for that math instead
// of a second copy duplicated into the plugin's own JS runtime.
import { put } from '@vercel/blob'
import { requirePluginKey } from './_lib/auth.js'
import { toCanvasZoneFromPluginNode, cropToTrim } from './_lib/figma-import.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!requirePluginKey(req, res)) return

  try {
    const {
      frameBox, zoneNodes, allNodes, imageBase64, scale,
      slotKey, label, cat, format, sourceFrameName, figmaUrl,
    } = req.body ?? {}

    if (!frameBox || !Array.isArray(zoneNodes) || !zoneNodes.length || !imageBase64 || !scale) {
      return res.status(400).json({ error: 'Missing frameBox, zoneNodes, imageBase64, or scale' })
    }
    if (!slotKey || !label || !cat || !format) {
      return res.status(400).json({ error: 'Missing slotKey, label, cat, or format' })
    }
    if (!/^[a-z0-9-]+$/.test(slotKey)) {
      return res.status(400).json({ error: 'slotKey must be lowercase letters/numbers/hyphens only' })
    }

    const zones = zoneNodes.map(n => toCanvasZoneFromPluginNode(n, frameBox, allNodes ?? []))
    const needsReview = zones.filter(z => z._needsFontReview).map(z => z.id)
    zones.forEach(z => delete z._needsFontReview)

    // Plugin exports the full bleed frame as-is (no crop math in the plugin
    // sandbox — no sharp/image-processing library available there); same
    // trim-crop this endpoint's REST-based sibling does, just fed bytes
    // directly instead of fetching them from Figma's images API.
    const rawImageBuffer = Buffer.from(imageBase64, 'base64')
    const imageBuffer = await cropToTrim(rawImageBuffer, scale)

    const bgBlob = await put(`templates/${slotKey}-bg.png`, imageBuffer, {
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
      zones,
      needsReview,
      live: false, // draft — never auto-publish over a real partner-facing slot
      figmaUrl: figmaUrl || null,
      sourceFrameName: sourceFrameName || null,
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
    console.error('import-figma-plugin error:', err)
    return res.status(500).json({ error: err.message })
  }
}
