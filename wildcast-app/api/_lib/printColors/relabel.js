// Print colours module: file labelling for a printer preset. Same content,
// same CMYK, same embedded PSO Coated v3 profile - only the labels change.
//   'indesign' - exactly like Adobe InDesign's PDF/X-4 export of the McD
//                reference file: still PDF/X-4, but the output intent is
//                named "PSO Coated v3" (WildCast's default names it by its
//                registered condition, "FOGRA51") and RenditionClass
//                proof:pdf. Checked byte-for-byte against the InDesign file.
//   'plain'    - not marked PDF/X at all (output intent named "PSO Coated
//                v3"), for printers that convert PDF/X files they shouldn't.
// Some printer RIPs pick their colour handling from these labels, so the
// same ink values can print differently depending on them.
import { Buffer } from 'node:buffer'
import { PDFDocument, PDFName, PDFString, PDFArray } from 'pdf-lib'

export const LABELS = ['pdfx4', 'indesign', 'plain']

export async function relabelPdf(pdfBuffer, mode) {
  if (mode !== 'indesign' && mode !== 'plain') return pdfBuffer
  const doc = await PDFDocument.load(pdfBuffer, { updateMetadata: false })
  const ctx = doc.context
  const intents = ctx.lookup(doc.catalog.get(PDFName.of('OutputIntents')))
  if (intents instanceof PDFArray) {
    for (const ref of intents.asArray()) {
      const d = ctx.lookup(ref)
      d.set(PDFName.of('OutputConditionIdentifier'), PDFString.of('PSO Coated v3'))
      d.set(PDFName.of('Info'), PDFString.of('PSO Coated v3'))
    }
  }
  if (mode === 'plain') {
    const info = doc.getInfoDict()
    info.delete(PDFName.of('GTS_PDFXVersion'))
    info.delete(PDFName.of('Trapped'))
  }
  const metaRef = doc.catalog.get(PDFName.of('Metadata'))
  const meta = ctx.lookup(metaRef)
  if (meta?.contents) {
    let xmp = Buffer.from(meta.contents).toString('utf8')
    if (mode === 'indesign') {
      xmp = xmp.replace(/<xmpMM:RenditionClass>.*?<\/xmpMM:RenditionClass>/, '<xmpMM:RenditionClass>proof:pdf</xmpMM:RenditionClass>')
    } else {
      xmp = xmp
        .replace(/<pdfxid:GTS_PDFXVersion>.*?<\/pdfxid:GTS_PDFXVersion>/g, '')
        .replace(/<pdfx:GTS_PDFXVersion>.*?<\/pdfx:GTS_PDFXVersion>/g, '')
    }
    // Replace the stream in place so no copy of the old label stays in the file.
    ctx.assign(metaRef, ctx.stream(xmp, { Type: 'Metadata', Subtype: 'XML' }))
  }
  const out = Buffer.from(await doc.save({ useObjectStreams: false, updateFieldAppearances: false }))
  // PDF/X-4 is defined on PDF 1.6, like the InDesign export (pdf-lib writes 1.7; same length).
  if (out.toString('latin1', 0, 8) === '%PDF-1.7') out.write('%PDF-1.6', 0, 'latin1')
  return out
}
