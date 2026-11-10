import { Buffer } from 'node:buffer'
import { PDFDict, PDFName, PDFRawStream } from 'pdf-lib'
import { inflateSync } from 'node:zlib'

// pdf-lib/fontkit can misidentify a full OpenType-CFF program as TrueType.
// Preserve the bytes and glyph IDs; correct only the PDF embedding metadata.
// PDF 1.6 / ISO 32000-1 section 9.9: full OpenType uses FontFile3/OpenType.
export function normalizeOpenTypeFonts(context) {
  let corrected = 0
  for (const [, font] of context.enumerateIndirectObjects()) {
    if (!(font instanceof PDFDict) || String(font.get(PDFName.of('Subtype'))) !== '/CIDFontType2') continue
    const mapping = font.get(PDFName.of('CIDToGIDMap'))
    if (mapping && String(mapping) !== '/Identity') continue
    const descriptor = font.lookup(PDFName.of('FontDescriptor'))
    if (!(descriptor instanceof PDFDict)) continue
    const ref = descriptor.get(PDFName.of('FontFile2'))
    const stream = ref && context.lookup(ref)
    if (!(stream instanceof PDFRawStream)) continue
    const filter = String(stream.dict.get(PDFName.of('Filter')) ?? '')
    if (filter && filter !== '/FlateDecode') continue
    let bytes
    try { bytes = filter ? inflateSync(stream.getContents()) : Buffer.from(stream.getContents()) } catch { continue }
    if (bytes.length < 12 || bytes.toString('ascii', 0, 4) !== 'OTTO') continue
    const tables = bytes.readUInt16BE(4)
    if (12 + 16 * tables > bytes.length) continue
    let cff = false
    for (let i = 0; i < tables; i++) {
      if (bytes.toString('ascii', 12 + 16 * i, 16 + 16 * i) === 'CFF ') cff = true
    }
    if (!cff) continue // TrueType and CFF2 require their own embedding rules.
    descriptor.delete(PDFName.of('FontFile2'))
    descriptor.set(PDFName.of('FontFile3'), ref)
    stream.dict.set(PDFName.of('Subtype'), PDFName.of('OpenType'))
    stream.dict.delete(PDFName.of('Length1'))
    font.set(PDFName.of('Subtype'), PDFName.of('CIDFontType0'))
    font.delete(PDFName.of('CIDToGIDMap'))
    corrected++
  }
  return corrected
}
