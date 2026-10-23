// Print colours module: "Like InDesign" file labelling for a printer preset.
// Same content, same CMYK, same embedded PSO Coated v3 profile - only the
// label changes to match the InDesign reference export: not marked PDF/X,
// output intent named "PSO Coated v3". Some printer RIPs (e.g. Fiery with
// "Use PDF/X output intent") colour-convert PDF/X files but pass plain
// PDFs' CMYK straight through; this lets a printer get InDesign's handling.
import { Buffer } from 'node:buffer'
import { PDFDocument, PDFName, PDFString, PDFArray } from 'pdf-lib'

export async function relabelLikeInDesign(pdfBuffer) {
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
  const info = doc.getInfoDict()
  info.delete(PDFName.of('GTS_PDFXVersion'))
  info.delete(PDFName.of('Trapped'))
  const metaRef = doc.catalog.get(PDFName.of('Metadata'))
  const meta = ctx.lookup(metaRef)
  if (meta?.contents) {
    const xmp = Buffer.from(meta.contents).toString('utf8')
      .replace(/<pdfxid:GTS_PDFXVersion>.*?<\/pdfxid:GTS_PDFXVersion>/g, '')
      .replace(/<pdfx:GTS_PDFXVersion>.*?<\/pdfx:GTS_PDFXVersion>/g, '')
    // Replace the stream in place so no copy of the old label stays in the file.
    ctx.assign(metaRef, ctx.stream(xmp, { Type: 'Metadata', Subtype: 'XML' }))
  }
  const out = Buffer.from(await doc.save({ useObjectStreams: false, updateFieldAppearances: false }))
  // Same header as the InDesign export (pdf-lib writes 1.7; same length).
  if (out.toString('latin1', 0, 8) === '%PDF-1.7') out.write('%PDF-1.6', 0, 'latin1')
  return out
}
