#!/usr/bin/env node
// Pulls a template's zone geometry + a print-resolution background PNG straight
// out of Figma, via Figma's REST API — replaces manual pixel-scanning.
//
// Convention this relies on: any node meant to become an editable WildCast
// zone must be named "zone:<id>" (e.g. "zone:headline", "zone:logo",
// "zone:photo", "zone:cta"). Zones named "logo"/"photo" are treated as image
// zones (fit: contain/cover); everything else is a text zone. The target
// frame passed in must be the bleed-size master (111x154mm @ 3mm bleed) —
// same convention used by every master built this session.
//
// Usage:
//   node --env-file=.env.local scripts/import-figma-template.js <figma-url> <output-name>
//
// Example:
//   node --env-file=.env.local scripts/import-figma-template.js \
//     "https://www.figma.com/design/UZcgHrJp7jxLjbtgUoyvpp/WOLT-DE---2026?node-id=4861-2" \
//     koblenz-test

import { writeFile, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const BLEED_MM = 3
const MM_PER_INCH = 25.4
const DPI = 300
const UNIT_PER_MM = 72 / 25.4 // Figma REST units are points: 72/inch
const BLEED_UNITS = BLEED_MM * UNIT_PER_MM
const CANVAS_W = 316
const CANVAS_H = 441

async function loadToken() {
  if (process.env.FIGMA_TOKEN) return process.env.FIGMA_TOKEN
  // Fallback for anyone who forgets --env-file: read .env.local directly.
  try {
    const raw = await readFile(join(ROOT, '.env.local'), 'utf8')
    const match = raw.match(/^FIGMA_TOKEN=(.+)$/m)
    if (match) return match[1].trim()
  } catch { /* no .env.local — fall through to the error below */ }
  throw new Error(
    'FIGMA_TOKEN not set. Either run with `node --env-file=.env.local ...`, ' +
    'or make sure wildcast-app/.env.local has a FIGMA_TOKEN= line filled in.'
  )
}

function parseFigmaUrl(url) {
  const fileMatch = url.match(/figma\.com\/design\/([^/]+)/)
  const nodeMatch = url.match(/node-id=([\d]+)-([\d]+)/)
  if (!fileMatch || !nodeMatch) {
    throw new Error('Could not parse fileKey/nodeId from URL. Expected a figma.com/design/:fileKey/...?node-id=X-Y link.')
  }
  return { fileKey: fileMatch[1], nodeId: `${nodeMatch[1]}:${nodeMatch[2]}` }
}

async function figmaFetch(path, token) {
  const res = await fetch(`https://api.figma.com/v1${path}`, {
    headers: { 'X-Figma-Token': token },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Figma API ${res.status} on ${path}: ${body}`)
  }
  return res.json()
}

// Recursively collect every descendant node named "zone:<id>".
function collectZoneNodes(node, out = []) {
  if (node.name?.startsWith('zone:')) out.push(node)
  for (const child of node.children ?? []) collectZoneNodes(child, out)
  return out
}

function toCanvasZone(node, frameBox) {
  const id = node.name.slice('zone:'.length)
  const isImage = id === 'logo' || id === 'photo'

  const scaleX = CANVAS_W / (frameBox.width - BLEED_UNITS * 2)
  const scaleY = CANVAS_H / (frameBox.height - BLEED_UNITS * 2)

  const trimX = (node.absoluteBoundingBox.x - frameBox.x) - BLEED_UNITS
  const trimY = (node.absoluteBoundingBox.y - frameBox.y) - BLEED_UNITS

  const zone = {
    id,
    type: isImage ? 'image' : 'text',
    x: +(trimX * scaleX).toFixed(1),
    y: +(trimY * scaleY).toFixed(1),
    width: +(node.absoluteBoundingBox.width * scaleX).toFixed(1),
    height: +(node.absoluteBoundingBox.height * scaleY).toFixed(1),
  }

  if (isImage) {
    zone.fit = id === 'logo' ? 'contain' : 'cover'
    zone.label = id === 'logo' ? 'Restaurant logo' : 'Food photo'
    zone.hint = id === 'logo' ? 'JPG or PNG' : 'PNG with transparent background'
  } else if (node.type === 'TEXT' && node.style) {
    // Real font data straight from Figma — only available when the zone
    // marker itself is a text node, not a placeholder shape.
    zone.fontSize = Math.round(node.style.fontSize * scaleY)
    zone.fontFamily = node.style.fontFamily
    zone.fontWeight = node.style.fontWeight
    zone.color = '#FFFFFF'
    zone.align = (node.style.textAlignHorizontal ?? 'CENTER').toLowerCase()
    zone.autoShrink = true
  } else {
    // Placeholder shape, not a text node — position/size are exact, but font
    // details need a human to fill in (no live text to sample from).
    zone.fontSize = null
    zone.fontFamily = null
    zone.fontWeight = null
    zone.color = '#FFFFFF'
    zone.align = 'center'
    zone.autoShrink = true
    zone._needsFontReview = true
  }

  return zone
}

async function main() {
  const [, , url, outputName] = process.argv
  if (!url || !outputName) {
    console.error('Usage: node --env-file=.env.local scripts/import-figma-template.js <figma-url> <output-name>')
    process.exit(1)
  }

  const token = await loadToken()
  const { fileKey, nodeId } = parseFigmaUrl(url)

  console.log(`Fetching node ${nodeId} from file ${fileKey}...`)
  const nodesRes = await figmaFetch(`/files/${fileKey}/nodes?ids=${nodeId}`, token)
  const frame = nodesRes.nodes[nodeId]?.document
  if (!frame) throw new Error(`Node ${nodeId} not found in file ${fileKey}`)

  const frameBox = frame.absoluteBoundingBox
  console.log(`Frame: "${frame.name}" — ${frameBox.width.toFixed(1)}×${frameBox.height.toFixed(1)}pt`)

  const zoneNodes = collectZoneNodes(frame)
  console.log(`Found ${zoneNodes.length} zone: marker(s) — ${zoneNodes.map(n => n.name).join(', ')}`)
  const zones = zoneNodes.map(n => toCanvasZone(n, frameBox))

  const needsReview = zones.filter(z => z._needsFontReview)
  zones.forEach(z => delete z._needsFontReview)

  // Export the background at the highest resolution Figma's image API allows
  // (scale is capped at 4x server-side — that's 288 DPI, not quite our 300 DPI
  // target, but well above print-acceptable and vastly better than the 1x
  // placeholder used until now). This renders whatever is currently VISIBLE
  // in the saved file — hidden zone: markers / guides are excluded
  // automatically, no live toggling needed.
  const scale = Math.min(4, DPI / 72)
  const effectiveDpi = scale * 72
  console.log(`Exporting background at ${scale}x scale (${effectiveDpi} DPI)...`)
  const imgRes = await figmaFetch(`/images/${fileKey}?ids=${nodeId}&format=png&scale=${scale}`, token)
  const imageUrl = imgRes.images[nodeId]
  if (!imageUrl) throw new Error('Figma did not return an image URL — check the node is exportable.')

  const imgBytes = await fetch(imageUrl).then(r => r.arrayBuffer())
  const pngPath = join(ROOT, 'public', 'templates', `${outputName}.png`)
  await writeFile(pngPath, Buffer.from(imgBytes))
  console.log(`Saved background: public/templates/${outputName}.png (${(imgBytes.byteLength / 1024).toFixed(0)}KB)`)

  const snippet = `const ${outputName.toUpperCase().replace(/-/g, '_')}_ZONES = ${JSON.stringify(zones, null, 2)}\n`
  const snippetPath = join(ROOT, 'scripts', `${outputName}-zones.generated.js`)
  await writeFile(snippetPath, snippet)
  console.log(`Saved zone config: scripts/${outputName}-zones.generated.js`)

  if (needsReview.length) {
    console.log(`\n⚠️  ${needsReview.length} zone(s) had no live text to sample font info from — double-check fontSize/fontFamily/fontWeight before shipping: ${needsReview.map(z => z.id).join(', ')}`)
  }
}

main().catch(err => {
  console.error(err.message)
  process.exit(1)
})
