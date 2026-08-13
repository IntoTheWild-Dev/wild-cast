// WildCast Import — main sandbox code. Reads the currently selected frame
// via the Plugin API, exports its background PNG directly (no Figma REST
// API, no Personal Access Token — see ../FIGMA_IMPORT_ROADMAP.md for why),
// and POSTs raw node data + the PNG straight to WildCast's
// api/import-figma-plugin.js, which does the actual zone-geometry math
// (reusing the exact same functions the REST-based import path uses).

const API_BASE = 'https://cast.wildstack.studio'

// FIGMA_PLUGIN_KEY in Vercel — this plugin is private/internal-only
// (imported locally via manifest, never published to Community), so baking
// the shared secret directly into the plugin file is acceptable here the
// same way the existing Wild CMYK plugin does it. If the Vercel value is
// ever rotated, update this line to match.
const PLUGIN_KEY = 'VAyh3H5p-aYlTRNHNT3qfw1sopkq1AFc'

// Mirrors src/components/TemplatePicker.jsx's BASE_TEMPLATES — this plugin
// runs in a completely separate JS bundle/runtime from the React app and
// can't import that file directly, so this list is a manually-kept-in-sync
// duplicate. Only label/category/format/live matter here; the app's own
// thumb/templateId fields are irrelevant to importing.
const BASE_SLOTS = [
  { label: 'Restaurant Flyer · Option A', category: 'restaurant', format: 'Flyer', live: true },
  { label: 'Restaurant Flyer · Option B', category: 'restaurant', format: 'Flyer', live: true },
  { label: 'Restaurant Flyer · Option C', category: 'restaurant', format: 'Flyer', live: false },
  { label: 'Restaurant Flyer · Option D', category: 'restaurant', format: 'Flyer', live: false },
  { label: 'Restaurant Flyer · Option E', category: 'restaurant', format: 'Flyer', live: false },
  { label: 'Restaurant Poster · Option A', category: 'restaurant', format: 'Poster', live: false },
  { label: 'Restaurant Poster · Option B', category: 'restaurant', format: 'Poster', live: false },
  { label: 'Restaurant Poster · Option C', category: 'restaurant', format: 'Poster', live: false },
  { label: 'Restaurant Poster · Option D', category: 'restaurant', format: 'Poster', live: false },
  { label: 'Restaurant Poster · Option E', category: 'restaurant', format: 'Poster', live: false },
  { label: 'Restaurant Wild Poster · Option A', category: 'restaurant', format: 'Wild Poster', live: false },
  { label: 'Restaurant Wild Poster · Option B', category: 'restaurant', format: 'Wild Poster', live: false },
  { label: 'Restaurant Wild Poster · Option C', category: 'restaurant', format: 'Wild Poster', live: false },
  { label: 'Restaurant Wild Poster · Option D', category: 'restaurant', format: 'Wild Poster', live: false },
  { label: 'Restaurant Wild Poster · Option E', category: 'restaurant', format: 'Wild Poster', live: false },
  { label: 'Retail Flyer · Option A', category: 'retail', format: 'Flyer', live: false },
  { label: 'Retail Flyer · Option B', category: 'retail', format: 'Flyer', live: false },
  { label: 'Retail Flyer · Option C', category: 'retail', format: 'Flyer', live: false },
  { label: 'Retail Flyer · Option D', category: 'retail', format: 'Flyer', live: false },
  { label: 'Retail Flyer · Option E', category: 'retail', format: 'Flyer', live: false },
  { label: 'Retail Poster · Option A', category: 'retail', format: 'Poster', live: false },
  { label: 'Retail Poster · Option B', category: 'retail', format: 'Poster', live: false },
  { label: 'Retail Poster · Option C', category: 'retail', format: 'Poster', live: false },
  { label: 'Retail Poster · Option D', category: 'retail', format: 'Poster', live: false },
  { label: 'Retail Poster · Option E', category: 'retail', format: 'Poster', live: false },
  { label: 'Retail Wild Poster · Option A', category: 'retail', format: 'Wild Poster', live: false },
  { label: 'Retail Wild Poster · Option B', category: 'retail', format: 'Wild Poster', live: false },
  { label: 'Retail Wild Poster · Option C', category: 'retail', format: 'Wild Poster', live: false },
  { label: 'Retail Wild Poster · Option D', category: 'retail', format: 'Wild Poster', live: false },
  { label: 'Retail Wild Poster · Option E', category: 'retail', format: 'Wild Poster', live: false },
]

// Matches src/components/TemplateImportPage.jsx's slugify() exactly — must
// stay identical, since this is how a slotKey round-trips back to a label.
function slugify(label) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

figma.showUI(__html__, { width: 360, height: 480 })

async function loadEmptySlots() {
  try {
    const res = await fetch(`${API_BASE}/api/list-templates`)
    const data = await res.json()
    // Only an already-LIVE slot is actually unavailable — a draft or
    // archived record is a valid re-import target (it gets overwritten),
    // matching how the web app's own equivalent logic has always worked.
    // An earlier version of this excluded ANY existing record regardless of
    // status, which silently blocked reusing a slot after archiving it —
    // real bug, found 2026-08-13 (Julia: "archive doesn't seem to work").
    const liveKeys = new Set((data.templates || []).filter(r => r.live).map(r => r.slotKey))
    const empty = BASE_SLOTS
      .filter(s => !s.live && !liveKeys.has(slugify(s.label)))
      .map(s => ({ ...s, slotKey: slugify(s.label) }))
    figma.ui.postMessage({ type: 'slots', slots: empty })
  } catch (err) {
    figma.ui.postMessage({ type: 'slots-error', message: String(err && err.message || err) })
  }
}
loadEmptySlots()

figma.ui.onmessage = async msg => {
  if (msg.type === 'import') {
    await handleImport(msg.slotKey, msg.label, msg.cat, msg.format)
  }
}

async function handleImport(slotKey, label, cat, format) {
  try {
    const selection = figma.currentPage.selection
    if (selection.length !== 1) {
      figma.ui.postMessage({ type: 'error', message: 'Select exactly one frame in Figma, then try again.' })
      return
    }
    const frame = selection[0]
    if (!('absoluteBoundingBox' in frame) || !frame.absoluteBoundingBox) {
      figma.ui.postMessage({ type: 'error', message: 'Selected node has no bounding box — select a frame, not a page.' })
      return
    }

    figma.ui.postMessage({ type: 'status', message: 'Scanning zones…' })
    const allNodes = collectAllNodes(frame, []).map(serializeNode)
    const zoneNodes = allNodes.filter(n => n.name && n.name.indexOf('zone:') === 0)

    if (!zoneNodes.length) {
      figma.ui.postMessage({ type: 'error', message: 'No zone:<id> layers found in the selected frame — check the naming convention (see FIGMA_IMPORT_ROADMAP.md / project_template_rules).' })
      return
    }

    figma.ui.postMessage({ type: 'status', message: 'Exporting background…' })
    const DPI = 300
    const scale = Math.min(4, DPI / 72) // Figma's export API caps scale at 4x server-side
    const bytes = await frame.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: scale } })
    const imageBase64 = bytesToBase64(bytes)

    figma.ui.postMessage({ type: 'status', message: 'Uploading to WildCast…' })
    const res = await fetch(`${API_BASE}/api/import-figma-plugin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-plugin-key': PLUGIN_KEY },
      body: JSON.stringify({
        frameBox: frame.absoluteBoundingBox,
        zoneNodes,
        allNodes,
        imageBase64,
        scale,
        slotKey, label, cat, format,
        sourceFrameName: frame.name,
        figmaUrl: figma.fileKey ? `https://www.figma.com/design/${figma.fileKey}/?node-id=${frame.id.replace(':', '-')}` : null,
      }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `Import failed (${res.status})`)

    figma.ui.postMessage({ type: 'done', label: data.label, needsReview: data.needsReview || [] })
  } catch (err) {
    figma.ui.postMessage({ type: 'error', message: String(err && err.message || err) })
  }
}

function collectAllNodes(node, out) {
  out.push(node)
  if ('children' in node) {
    for (const child of node.children) collectAllNodes(child, out)
  }
  return out
}

// Only sends what the backend actually needs — not the whole Plugin API
// node object, which isn't serializable across the UI/network boundary
// anyway. Font info only makes sense for TEXT nodes, and only when it isn't
// figma.mixed (multiple fonts/sizes within one text layer — same "needs a
// human to review" case the backend's toCanvasZoneFromPluginNode() already
// handles when font data is missing entirely).
function serializeNode(node) {
  const base = { name: node.name, type: node.type, absoluteBoundingBox: node.absoluteBoundingBox }
  if (node.type === 'TEXT') {
    const fontName = node.fontName
    if (fontName && fontName !== figma.mixed) {
      base.fontFamily = fontName.family
      base.fontWeightName = fontName.style
    }
    if (typeof node.fontSize === 'number') base.fontSize = node.fontSize
    base.textAlignHorizontal = node.textAlignHorizontal
  }
  return base
}

// btoa can't take a raw Uint8Array directly, and spreading a large one into
// String.fromCharCode(...bytes) blows the call-stack argument limit on a
// full-resolution export — chunk it.
function bytesToBase64(bytes) {
  const CHUNK = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}
