// Every image upload in the app (except QR codes - see shouldRemoveBackground)
// can have its background removed by Photoroom, via our own /api/remove-bg
// proxy - same approach as wild-scale. Replaces the old "please upload a
// transparent PNG" rejection: partners can upload a normal photo and get it
// cut out. Not automatic any more (Anang's ask, 2026-10-08): the user is asked
// first (askRemoveBackground / RemoveBgPrompt.jsx), or picks it with the
// toggle in the Library's batch upload.

// Keeps the request under Vercel's 4.5MB function body limit - see
// api/remove-bg.js. Same ceiling the Library stores at anyway
// (LIBRARY_MAX_DIM in assetLibrary.js), so no real resolution is lost.
const MAX_DIM = 2400

// Short text shown above every upload field so nobody is surprised by the
// question after picking a file.
export const REMOVE_BG_NOTE = "After choosing an image you can have its background removed - no need to cut it out yourself."

// The confirm dialog lives in RemoveBgPrompt.jsx (mounted once in main.jsx)
// and registers itself here, so upload code anywhere can just await the
// answer. No dialog mounted = keep the original, never a silent cut-out.
let promptHandler = null
export function setRemoveBackgroundPrompt(handler) {
  promptHandler = handler
  return () => { if (promptHandler === handler) promptHandler = null }
}

// Resolves true = remove the background, false = keep the image as it is.
export function askRemoveBackground(file, { requireTransparent } = {}) {
  return promptHandler ? promptHandler(file, { requireTransparent }) : Promise.resolve(false)
}

// QR codes need their white quiet zone to stay scannable, so they're never
// cut out. Everything else (logos, food photos, discount badges, other) is.
export function shouldRemoveBackground(folder) {
  return folder !== 'qr-codes'
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not read this image - please try a different file.'))
    img.src = url
  })
}

// Flattened onto white before sending: JPEG keeps the upload well under the
// size limit, and any stray transparent pixels (e.g. rounded corners) would
// otherwise turn black in a JPEG.
async function downscaleToJpeg(url) {
  const img = await loadImage(url)
  let w = img.naturalWidth, h = img.naturalHeight
  if (Math.max(w, h) > MAX_DIM) {
    const scale = MAX_DIM / Math.max(w, h)
    w = Math.round(w * scale)
    h = Math.round(h * scale)
  }
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0, w, h)
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92))
}

// Photoroom's cut-out comes back as WebP (size limit, see api/remove-bg.js) -
// convert to PNG so the library save and PDF export keep getting a PNG.
async function toPngBlob(blob) {
  const url = URL.createObjectURL(blob)
  try {
    const img = await loadImage(url)
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    canvas.getContext('2d').drawImage(img, 0, 0)
    return await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
  } finally {
    URL.revokeObjectURL(url)
  }
}

// "Already cut out" = most of the image's outer edge is transparent. Not just
// "has any transparent pixel" (lib/image.js's hasTransparency): a logo on a
// solid square with transparent rounded corners (the McDonald's logo that
// found this, 2026-09-25) has a few transparent pixels but its background is
// very much still there - that one needs removing too.
export async function isAlreadyCutOut(url) {
  const img = await loadImage(url)
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, size, size)
  let data
  try {
    data = ctx.getImageData(0, 0, size, size).data
  } catch {
    return false
  }
  let edge = 0, clear = 0
  for (let i = 0; i < size; i++) {
    for (const [x, y] of [[i, 0], [i, size - 1], [0, i], [size - 1, i]]) {
      edge++
      if (data[(y * size + x) * 4 + 3] < 128) clear++
    }
  }
  return clear / edge >= 0.5
}

// Takes a raw uploaded File, returns a blob: URL of the cut-out PNG. An image
// that's already cut out (isAlreadyCutOut) is returned untouched, no
// Photoroom call - same skip wild-scale does. Throws with a
// user-facing message if Photoroom fails.
export async function removeBackgroundFromFile(file) {
  const originalUrl = URL.createObjectURL(file)
  if (await isAlreadyCutOut(originalUrl)) return originalUrl

  try {
    const body = await downscaleToJpeg(originalUrl)
    const res = await fetch('/api/remove-bg', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body,
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || `Background removal failed (${res.status})`)
    }
    const png = await toPngBlob(await res.blob())
    return URL.createObjectURL(png)
  } finally {
    URL.revokeObjectURL(originalUrl)
  }
}
