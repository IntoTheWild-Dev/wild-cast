// Converts a Figma-imported template record (from GET /api/list-templates)
// into the exact shapes the static templateZones.js/templates.js already
// use, so custom templates merge into the app the same way the hardcoded
// ones work - same TEMPLATE_ZONES id lookup, same TEMPLATES card shape.
// Every import produces both a designer and guided variant, matching the
// existing convention (e.g. 'opt-b-flyer2' / 'opt-b-flyer2-simple').

// The stored background is a private Blob URL - a plain <img>/fabric.Image
// can't load it directly (no way to attach the Authorization header a
// private blob requires), so every use of it routes through this proxy,
// same pattern as src/lib/assetLibrary.js's libraryAssetSrc().
export function templateAssetSrc(url) {
  return `/api/list-templates?url=${encodeURIComponent(url)}`
}

// "Override" records (see api/publish-template.js) exist only to let a
// hardcoded static slot - Option A/B - be archived; they carry no real
// zones/background and must never enter the zonesById/cards merge (there's
// nothing real to render, and Option A/B's actual data is the static
// templateZones.js/templates.js import, untouched by any of this).
//
// normalizeZone (Julia's ask, 2026-09-24): records imported by OLDER
// versions of the import pipeline can be missing `autoShrink` (so long
// headlines never auto-resized and spilled past their zone) and can carry
// `align: 'left'` straight from Figma's text-node settings (so text didn't
// come out centred). Normalizing HERE - at merge time, on every fetch -
// fixes every already-saved record retroactively, no re-import needed.
// Rotated zones (the tc sidebar) keep their configured left align; every
// other text zone renders centred.
function normalizeZone(zone) {
  if (zone?.type !== 'text') return zone
  const fixed = { ...zone, autoShrink: true }
  if (!fixed.rotate) fixed.align = 'center'
  return fixed
}

export function customZonesEntry(record) {
  if (record.isOverrideOnly) return {}
  const config = {
    canvasW: record.canvasW,
    canvasH: record.canvasH,
    backgroundUrl: templateAssetSrc(record.backgroundUrl),
    backgroundFill: record.backgroundFill,
    zones: (record.zones ?? []).map(normalizeZone),
  }
  return {
    [record.slotKey]: config,
    [`${record.slotKey}-simple`]: config,
  }
}

export function customTemplateCards(record) {
  if (record.isOverrideOnly) return []
  const base = {
    desc: 'Imported from Figma.',
    tags: ['A6', 'CMYK', '3mm bleed'],
    type: 'text-image',
    cat: record.cat,
    format: record.format,
    name: record.label,
    thumb: templateAssetSrc(record.backgroundUrl),
    live: record.live,
    archived: !!record.archived,
  }
  return [
    { ...base, id: record.slotKey, mode: 'designer' },
    { ...base, id: `${record.slotKey}-simple`, mode: 'non-designer' },
  ]
}

// records: array from GET /api/list-templates (draft + live).
export function mergeCustomTemplates(records) {
  const zonesById = {}
  const cards = []
  for (const record of records) {
    Object.assign(zonesById, customZonesEntry(record))
    cards.push(...customTemplateCards(record))
  }
  return { zonesById, cards, records }
}
