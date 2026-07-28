// Shared Figma-to-WildCast extraction logic — used by both the local CLI
// script (scripts/import-figma-template.js) and the deployed serverless
// import route (api/import-figma-template.js). One implementation, no drift.
//
// Convention: any node meant to become an editable WildCast zone must be
// named "zone:<id>" (e.g. "zone:headline", "zone:logo", "zone:photo").
// Zones named "logo"/"photo" become image zones (fit: contain/cover);
// everything else becomes a text zone. The target frame must be the
// bleed-size master (111x154mm @ 3mm bleed).
import sharp from 'sharp'

export const BLEED_MM = 3
export const MM_PER_INCH = 25.4
export const DPI = 300
export const UNIT_PER_MM = 72 / 25.4 // Figma REST units are points: 72/inch
export const BLEED_UNITS = BLEED_MM * UNIT_PER_MM
export const CANVAS_W = 316
export const CANVAS_H = 441

export function parseFigmaUrl(url) {
  const fileMatch = url.match(/figma\.com\/design\/([^/]+)/)
  const nodeMatch = url.match(/node-id=([\d]+)-([\d]+)/)
  if (!fileMatch || !nodeMatch) {
    throw new Error('Could not parse fileKey/nodeId from URL. Expected a figma.com/design/:fileKey/...?node-id=X-Y link.')
  }
  return { fileKey: fileMatch[1], nodeId: `${nodeMatch[1]}:${nodeMatch[2]}` }
}

export async function figmaFetch(path, token) {
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
export function collectZoneNodes(node, out = []) {
  if (node.name?.startsWith('zone:')) out.push(node)
  for (const child of node.children ?? []) collectZoneNodes(child, out)
  return out
}

// Zone ids that become image uploads (fit/label/hint per id). Everything
// else named zone:<id> becomes a text zone.
const IMAGE_ZONE_CONFIG = {
  logo:    { fit: 'contain', label: 'Restaurant logo', hint: 'JPG or PNG' },
  photo:   { fit: 'cover',   label: 'Food photo',       hint: 'PNG with transparent background' },
  sticker: { fit: 'contain', label: 'Sticker / badge',  hint: 'PNG with transparent background' },
  qr:      { fit: 'contain', label: 'QR code',          hint: 'PNG or JPG' },
}

export function toCanvasZone(node, frameBox) {
  const id = node.name.slice('zone:'.length)
  const isImage = Object.prototype.hasOwnProperty.call(IMAGE_ZONE_CONFIG, id)

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
    Object.assign(zone, IMAGE_ZONE_CONFIG[id])
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

// Full extraction: fetch the Figma frame, compute zones, export the
// background image bytes. Does NOT persist anything — callers (CLI script,
// API route) decide where the results go (local disk vs. Vercel Blob).
export async function importFigmaTemplate({ figmaUrl, token }) {
  const { fileKey, nodeId } = parseFigmaUrl(figmaUrl)

  const nodesRes = await figmaFetch(`/files/${fileKey}/nodes?ids=${nodeId}`, token)
  const frame = nodesRes.nodes[nodeId]?.document
  if (!frame) throw new Error(`Node ${nodeId} not found in file ${fileKey}`)

  const frameBox = frame.absoluteBoundingBox
  const zoneNodes = collectZoneNodes(frame)
  const zones = zoneNodes.map(n => toCanvasZone(n, frameBox))

  const needsReview = zones.filter(z => z._needsFontReview).map(z => z.id)
  zones.forEach(z => delete z._needsFontReview)

  // Figma's image export API caps scale at 4x server-side (288 DPI, not
  // quite our 300 DPI target, but print-fine and a big jump over 1x).
  // Renders whatever is currently VISIBLE in the saved file — hidden
  // zone: markers / guides are excluded automatically, no live toggling needed.
  const scale = Math.min(4, DPI / 72)
  const effectiveDpi = scale * 72
  const imgRes = await figmaFetch(`/images/${fileKey}?ids=${nodeId}&format=png&scale=${scale}`, token)
  const imageUrl = imgRes.images[nodeId]
  if (!imageUrl) throw new Error('Figma did not return an image URL — check the node is exportable.')

  const rawImageBuffer = Buffer.from(await fetch(imageUrl).then(r => r.arrayBuffer()))

  // This export is the FULL bleed frame (111x154mm) — but every zone
  // coordinate above is computed relative to the TRIM rect only (CANVAS_W ×
  // CANVAS_H = the trim size), and the editor/export pipeline both treat this
  // background as trim-only (TemplateCanvas.jsx stretches it to fill exactly
  // canvasW×canvasH; export-cmyk.js adds its own separate 3mm bleed on top
  // via mirror-extend). Left uncropped, every background carries an extra
  // ~3mm of margin the zone math doesn't know about, AND gets a second 3mm
  // of bleed added again on export — effectively double bleed, silently
  // shrinking every design ~4-6% smaller than the true Figma master.
  // Crop that same BLEED_UNITS margin off each edge here so the saved
  // background genuinely is trim-only, matching what the rest of the app
  // already assumes it is.
  const bleedPx = Math.round(BLEED_UNITS * scale)
  const rawMeta = await sharp(rawImageBuffer).metadata()
  const imageBuffer = await sharp(rawImageBuffer)
    .extract({
      left: bleedPx,
      top: bleedPx,
      // Clamp to the image's own actual dimensions rather than the
      // calculated frameBox×scale — Figma's real export can be a pixel or
      // two off from that calculation, and .extract() throws on an
      // out-of-bounds region.
      width: rawMeta.width - bleedPx * 2,
      height: rawMeta.height - bleedPx * 2,
    })
    .png()
    .toBuffer()

  return {
    fileKey,
    nodeId,
    frameName: frame.name,
    frameWidth: frameBox.width,
    frameHeight: frameBox.height,
    zones,
    needsReview,
    imageBuffer,
    scale,
    effectiveDpi,
  }
}
