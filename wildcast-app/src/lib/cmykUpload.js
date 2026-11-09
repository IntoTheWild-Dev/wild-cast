// CMYK JPEG uploads are converted to sRGB on the server before the editor
// uses them (api/convert-upload.js). Everything else passes through as is.
import { activationHeaders } from './activationKey'
import { isCmykJpeg } from './jpegInfo'

const MAX_B64_CHARS = 4_300_000  // Vercel's 4.5 MB request cap, with headroom

const toBase64 = file => new Promise((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(String(r.result))
  r.onerror = () => reject(r.error)
  r.readAsDataURL(file)
})

// Returns an sRGB File for a CMYK JPEG, or the original file.
export async function srgbIfCmyk(file) {
  try {
    if (!(await isCmykJpeg(file))) return file
    const data = await toBase64(file)
    if (data.length > MAX_B64_CHARS) {
      console.warn('CMYK upload too large to convert on the server; the browser decodes it as is.')
      return file
    }
    const res = await fetch('/api/convert-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...activationHeaders() },
      body: JSON.stringify({ data }),
    })
    if (!res.ok) throw new Error(`convert-upload ${res.status}`)
    const blob = await res.blob()
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch (err) {
    console.warn('CMYK conversion failed, using the original file:', err)
    return file
  }
}
