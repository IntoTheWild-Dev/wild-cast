// Resizes to maxDim and re-encodes as JPEG (photos) or PNG (logos/stickers with transparency).
export async function blobUrlToDataUrl(blobUrl, { maxDim = 1500 } = {}) {
  const res = await fetch(blobUrl)
  const blob = await res.blob()
  const isPng = blob.type === 'image/png'

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      let w = img.naturalWidth, h = img.naturalHeight
      if (Math.max(w, h) > maxDim) {
        const scale = maxDim / Math.max(w, h)
        w = Math.round(w * scale)
        h = Math.round(h * scale)
      }
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL(isPng ? 'image/png' : 'image/jpeg', 0.82))
    }
    img.onerror = reject
    img.src = URL.createObjectURL(blob)
  })
}

// Crops away empty padding around an uploaded image's real content - many QR
// generators export with a big white "quiet zone" margin baked into the file
// itself, so a plain "contain" fit shows all that empty space instead of
// filling the zone. Scans a small downsampled copy to cheaply find the
// tightest bounding box of non-background pixels (transparent OR near-white),
// then maps that box back onto the full-resolution image for a clean crop.
// Returns the original url unchanged if nothing meaningful to trim was found
// (blank image, already-tight crop, or a tainted cross-origin canvas).
export function cropToContent(url) {
  return new Promise(resolve => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const fullW = img.naturalWidth, fullH = img.naturalHeight
      const SCAN = 300
      const scale = Math.min(1, SCAN / Math.max(fullW, fullH))
      const sw = Math.max(1, Math.round(fullW * scale))
      const sh = Math.max(1, Math.round(fullH * scale))
      const scanCanvas = document.createElement('canvas')
      scanCanvas.width = sw
      scanCanvas.height = sh
      const sctx = scanCanvas.getContext('2d')
      sctx.drawImage(img, 0, 0, sw, sh)

      let data
      try {
        data = sctx.getImageData(0, 0, sw, sh).data
      } catch {
        resolve(url) // tainted (cross-origin) - can't inspect, leave the image as-is
        return
      }

      const WHITE = 250
      let minX = sw, minY = sh, maxX = -1, maxY = -1
      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          const i = (y * sw + x) * 4
          const isBg = data[i + 3] < 10 || (data[i] > WHITE && data[i + 1] > WHITE && data[i + 2] > WHITE)
          if (!isBg) {
            if (x < minX) minX = x
            if (x > maxX) maxX = x
            if (y < minY) minY = y
            if (y > maxY) maxY = y
          }
        }
      }
      if (maxX < minX || maxY < minY) { resolve(url); return } // fully blank - nothing to crop to

      const PAD = 0.02 // small margin so anti-aliased edge pixels don't get shaved off
      const fx0 = Math.max(0, minX / sw - PAD)
      const fy0 = Math.max(0, minY / sh - PAD)
      const fx1 = Math.min(1, (maxX + 1) / sw + PAD)
      const fy1 = Math.min(1, (maxY + 1) / sh + PAD)
      if (fx1 - fx0 > 0.97 && fy1 - fy0 > 0.97) { resolve(url); return } // already tight, skip re-encoding

      const cx = Math.round(fx0 * fullW)
      const cy = Math.round(fy0 * fullH)
      const cw = Math.round((fx1 - fx0) * fullW)
      const ch = Math.round((fy1 - fy0) * fullH)
      const out = document.createElement('canvas')
      out.width = cw
      out.height = ch
      out.getContext('2d').drawImage(img, cx, cy, cw, ch, 0, 0, cw, ch)
      resolve(out.toDataURL('image/png'))
    }
    img.onerror = () => resolve(url)
    img.src = url
  })
}

// Downsamples to a small canvas and checks the alpha channel for any transparent
// pixels. Used to reject logo/sticker uploads that are flattened onto a solid
// background instead of being true transparent PNGs.
export function hasTransparency(url) {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const size = 48
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, size, size)
      ctx.drawImage(img, 0, 0, size, size)
      try {
        const data = ctx.getImageData(0, 0, size, size).data
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] < 250) { resolve(true); return }
        }
        resolve(false)
      } catch {
        // Canvas tainted (cross-origin) - can't inspect, don't block the upload.
        resolve(true)
      }
    }
    img.onerror = () => resolve(true)
    img.src = url
  })
}

// Frame sizes offered when uploading on the Assets page - same presets as
// wild-scale, minus its "Recommended" tag. The Custom option (the default)
// is prefilled with the image's own size instead.
export const FRAME_PRESETS = [
  { label: 'XL Square', width: 1000, height: 1000 },
  { label: 'Print', width: 2400, height: 2400 },
]

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not read this image - please try a different file.'))
    img.src = url
  })
}

export async function imageSize(url) {
  const img = await loadImage(url)
  return { width: img.naturalWidth, height: img.naturalHeight }
}

// Draws an image into a width x height transparent PNG frame, centred.
// centreContent (the presets): same framing as wild-scale's resizeImage -
// the visible (alpha > 128) content is found, centred, and scaled to fit
// inside 15% padding, so a cut-out product lands consistently in the frame.
// Otherwise (Custom): the whole image is simply fitted (contain) with no
// extra padding - at the image's own size that leaves it unchanged.
// Returns a blob: URL.
export async function resizeToFrame(url, width, height, { centreContent = false } = {}) {
  const img = await loadImage(url)
  const iw = img.naturalWidth, ih = img.naturalHeight

  let box = { x: 0, y: 0, w: iw, h: ih }
  let pad = 0
  if (centreContent) {
    pad = 0.15
    const S = 600
    const s = Math.min(1, S / Math.max(iw, ih))
    const sw = Math.max(1, Math.round(iw * s)), sh = Math.max(1, Math.round(ih * s))
    const scan = document.createElement('canvas')
    scan.width = sw
    scan.height = sh
    const sctx = scan.getContext('2d')
    sctx.drawImage(img, 0, 0, sw, sh)
    const { data } = sctx.getImageData(0, 0, sw, sh)
    let minX = sw, minY = sh, maxX = -1, maxY = -1
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        if (data[(y * sw + x) * 4 + 3] > 128) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }
    if (maxX >= 0) box = { x: minX / s, y: minY / s, w: (maxX - minX + 1) / s, h: (maxY - minY + 1) / s }
  }

  const scale = Math.min(width * (1 - 2 * pad) / box.w, height * (1 - 2 * pad) / box.h)
  const dx = width / 2 - (box.x + box.w / 2) * scale
  const dy = height / 2 - (box.y + box.h / 2) * scale

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, dx, dy, iw * scale, ih * scale)
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
  return URL.createObjectURL(blob)
}
