// Where a template's extra files live in Vercel Blob, and how to check that a
// URL the plugin hands back really is one of them.
//
// A template is `templates/<slotKey>.json` (the record), `-bg.png` (background),
// plus - added by the plugin after the import - `-bg.pdf`, `-tile.png` (the card
// picture in the template picker) and `-ph-<zone>.png` (translucent examples).
// The upload endpoints only SAVE these files; one final request
// (import-figma-plugin-finish.js) links them to the record, so uploads can never
// overwrite each other's links.

export const EXAMPLE_ZONES = ['photo', 'sticker']

export const assetPath = {
  tile: slotKey => `templates/${slotKey}-tile.png`,
  pdf: slotKey => `templates/${slotKey}-bg.pdf`,
  example: (slotKey, zoneId) => `templates/${slotKey}-ph-${zoneId}.png`,
  record: slotKey => `templates/${slotKey}.json`,
  background: slotKey => `templates/${slotKey}-bg.png`,
}

export const SLOT_KEY_RE = /^[a-z0-9-]+$/

// Looser host-only check for the two private-image proxies
// (api/list-templates.js and api/library-assets.js, `?url=`): they attach our
// Blob token to a fetch of a caller-supplied URL, so that URL must be https on
// Vercel's blob storage domain - otherwise anyone could point it at their own
// server and read the token. Any path on the store is fine here (the proxies
// serve backgrounds, tiles, examples and library assets).
export function isBlobHost(url) {
  if (typeof url !== 'string') return false
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && u.hostname.endsWith('.vercel-storage.com')
  } catch {
    return false
  }
}

// A URL we are willing to send our Blob token to: https, on Vercel's blob
// storage domain (<store>.private.blob.vercel-storage.com), at exactly the
// expected path. Never fetch a client-supplied URL
// without this check.
export function isBlobUrl(url, expectedPath) {
  try {
    const u = new URL(url)
    return u.protocol === 'https:'
      && u.hostname.endsWith('.vercel-storage.com')
      && decodeURIComponent(u.pathname) === `/${expectedPath}`
  } catch {
    return false
  }
}

// Same store as the record, at exactly the expected path.
export function isSiblingBlobUrl(url, recordUrl, expectedPath) {
  try {
    return new URL(url).origin === new URL(recordUrl).origin
      && decodeURIComponent(new URL(url).pathname) === `/${expectedPath}`
  } catch {
    return false
  }
}

// Links are DERIVED when templates are listed (api/list-templates.js), not stored
// in the record. A record is rewritten by several things (a re-import, "Save
// zone settings", Publish ...) and Vercel Blob reads can lag a write by tens of
// seconds, so a rewrite that started from a stale read puts an OLD record back
// and silently drops any link stored in it (that is what made the tile and the
// photo example vanish after a perfect import). A file that exists next to the
// record can't be dropped that way: if `templates/<slot>-tile.png` is there, the
// template has that tile. A file always wins over whatever the record says.
export function attachDerivedLinks(record, urlByPath) {
  try {
    if (!record?.slotKey || record.isOverrideOnly || !urlByPath?.get) return record
    const out = { ...record }
    const tile = urlByPath.get(assetPath.tile(record.slotKey))
    if (tile) out.tileUrl = tile
    const pdf = urlByPath.get(assetPath.pdf(record.slotKey))
    if (pdf) out.backgroundPdfUrl = pdf
    if (Array.isArray(record.zones)) {
      out.zones = record.zones.map(z => {
        if (z?.type !== 'image' || !EXAMPLE_ZONES.includes(z.id)) return z
        const example = urlByPath.get(assetPath.example(record.slotKey, z.id))
        return example ? { ...z, placeholderImage: example } : z
      })
    }
    return out
  } catch {
    return record
  }
}
