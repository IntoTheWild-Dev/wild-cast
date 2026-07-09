import { blobUrlToDataUrl } from './image'

const LIBRARY_KEY = 'wildcast_library_assets'
const MAX_PER_FOLDER = 60
const LIBRARY_MAX_DIM = 800

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

export function getLibraryAssets() {
  try {
    return JSON.parse(localStorage.getItem(LIBRARY_KEY) || '[]')
  } catch {
    return []
  }
}

// Saves a blob: URL into the library under the given folder. Fire-and-forget —
// failures (e.g. storage quota) are logged, not surfaced, since this runs
// alongside the primary upload-into-the-design flow.
export async function saveAssetToLibrary(folder, name, blobUrl) {
  try {
    const dataUrl = await blobUrlToDataUrl(blobUrl, { maxDim: LIBRARY_MAX_DIM })
    const existing = getLibraryAssets()
    const entry = { id: crypto.randomUUID(), folder, name, dataUrl, uploadedAt: Date.now() }
    const sameFolder = existing.filter(a => a.folder === folder).slice(0, MAX_PER_FOLDER - 1)
    const otherFolders = existing.filter(a => a.folder !== folder)
    localStorage.setItem(LIBRARY_KEY, JSON.stringify([...otherFolders, entry, ...sameFolder]))
  } catch (err) {
    console.warn('Could not save asset to library:', err)
  }
}

export function deleteLibraryAsset(id) {
  const updated = getLibraryAssets().filter(a => a.id !== id)
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(updated))
  return updated
}
