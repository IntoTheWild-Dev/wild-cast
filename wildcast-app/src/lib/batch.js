// "Create many" (batch) - one template, many designs at once (Julia's ask,
// 2026-10-09: "add like 10 logos and 10 food items and instead of it only
// making 1 we get 10 at once"). Pure helpers, kept out of BatchCreator.jsx so
// they can be tested without a browser (tests/batch-pairing.test.mjs).
//
// Model: a list of designs ("rows"), each with its own name and its own image
// per zone - { id, name, images: { [zoneId]: { name, url, warning? } } }.
// The text typed in "Text for every design" is shared by all of them. Rows are
// added one at a time ("+ Add design") or several at once by dropping many
// files on the add button (one new design per file, sorted by file name).

export const MAX_BATCH = 50

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

export function sortByName(items) {
  return [...items].sort((a, b) => collator.compare(a.name ?? '', b.name ?? ''))
}

let nextId = 0
export function newRow(images = {}) {
  nextId += 1
  return { id: `row-${Date.now().toString(36)}-${nextId}`, name: '', images }
}

// Several files dropped on "+ Add design" -> one new design per file, the file
// going into zoneId. Capped so rows never exceed MAX_BATCH.
export function rowsFromItems(items, zoneId, existingCount) {
  const room = Math.max(0, MAX_BATCH - existingCount)
  return sortByName(items).slice(0, room).map(item => newRow({ [zoneId]: item }))
}

// "eble_logo-final.png" -> "Eble". Strips the extension and common
// role words so the design is named after the partner, not the file type.
const ROLE_WORDS = /\b(logo|logos|food|photo|foto|image|img|pic|final|v\d+|qr|sticker|icon)\b/gi
export function nameFromFile(fileName) {
  const base = String(fileName ?? '').replace(/\.[^.]+$/, '')
  const words = base.replace(/[_\-.]+/g, ' ').replace(ROLE_WORDS, ' ').replace(/\s+/g, ' ').trim()
  if (!words) return ''
  return words.charAt(0).toUpperCase() + words.slice(1)
}

// A row's name: what was typed, else the first image's file name (in zone
// order), else "Design N".
export function rowName(row, imageZoneIds, index) {
  if (row.name?.trim()) return row.name
  for (const id of imageZoneIds) {
    const name = nameFromFile(row.images?.[id]?.name)
    if (name) return name
  }
  return `Design ${index + 1}`
}

// Shared text + this row's images -> the fields object the canvas and
// save-project expect (same keys as App.jsx's DEFAULT_FIELDS).
export function buildRowFields({ sharedText, images, imageZoneIds }) {
  const fields = { ...sharedText }
  for (const id of imageZoneIds) fields[`${id}Url`] = images?.[id]?.url ?? null
  return fields
}

// "Use on all designs" for one zone's image.
export function applyImageToAll(rows, zoneId, item) {
  return rows.map(r => ({ ...r, images: { ...r.images, [zoneId]: item } }))
}
