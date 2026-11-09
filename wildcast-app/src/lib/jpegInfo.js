// JPEG header checks, no dependencies (used by lib/cmykUpload.js).
// Reads the JPEG frame header: 4 components = CMYK (or YCCK).
export async function isCmykJpeg(file) {
  if (!/jpe?g$/i.test(file.type || file.name || '')) return false
  const bytes = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer())
  if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) return false
  let i = 2
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xFF) { i++; continue }
    const marker = bytes[i + 1]
    if (marker === 0xD8 || (marker >= 0xD0 && marker <= 0xD7) || marker === 0x01 || marker === 0xFF) { i += 2; continue }
    const len = (bytes[i + 2] << 8) | bytes[i + 3]
    // SOF0-3, 5-7, 9-11, 13-15: byte 9 of the segment is the component count.
    if ([0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF].includes(marker)) return bytes[i + 9] === 4
    if (marker === 0xDA) return false
    i += 2 + len
  }
  return false
}
