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
        // Canvas tainted (cross-origin) — can't inspect, don't block the upload.
        resolve(true)
      }
    }
    img.onerror = () => resolve(true)
    img.src = url
  })
}
