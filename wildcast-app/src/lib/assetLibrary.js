import { blobUrlToDataUrl } from './image'

// Shared library, backed by Vercel Blob (not localStorage) — same asset is
// reusable across designs AND across browsers/devices, and stored at real
// print resolution instead of a small browsing-thumbnail size.
const LIBRARY_MAX_DIM = 2400

export const FOLDERS = {
  logos: 'Logos',
  'product-images': 'Product images',
  stickers: 'Stickers',
  other: 'Other',
}

// Routes a template zone (e.g. 'logo', 'photo') to the library folder it belongs in.
export function assetFolderForZone(zoneId) {
  if (zoneId === 'logo') return 'logos'
  if (zoneId === 'photo') return 'product-images'
  if (zoneId?.includes('sticker')) return 'stickers'
  return 'other'
}

export async function getLibraryAssets() {
  try {
    const res = await fetch('/api/library-assets')
    if (!res.ok) return []
    const { assets } = await res.json()
    return assets ?? []
  } catch (err) {
    console.warn('Could not load library assets:', err)
    return []
  }
}

// Saves a blob: URL into the library under the given folder, at full (capped
// only to a sane hi-res ceiling, not a browsing-thumbnail size) resolution.
// Fire-and-forget — failures are logged, not surfaced, since this runs
// alongside the primary upload-into-the-design flow.
export async function saveAssetToLibrary(folder, name, blobUrl) {
  try {
    const dataUrl = await blobUrlToDataUrl(blobUrl, { maxDim: LIBRARY_MAX_DIM })
    const res = await fetch('/api/library-assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder, name, dataUrl }),
    })
    if (!res.ok) throw new Error((await res.json())?.error || 'Upload failed')
    return await res.json()
  } catch (err) {
    console.warn('Could not save asset to library:', err)
    return null
  }
}

export async function deleteLibraryAsset(url) {
  try {
    await fetch(`/api/library-assets?url=${encodeURIComponent(url)}`, { method: 'DELETE' })
  } catch (err) {
    console.warn('Could not delete library asset:', err)
  }
}
