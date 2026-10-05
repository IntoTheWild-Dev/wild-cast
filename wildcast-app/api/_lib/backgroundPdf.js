// Prepares the vector PDF the Figma plugin exports alongside the background
// PNG (figma-plugin/code.js -> api/import-figma-plugin-pdf.js).
//
// The plugin exports the full BLEED frame (111x154mm for an A6 flyer), same
// as the PNG. The PNG path crops the bleed off with sharp (cropToTrim); a PDF
// can't be cropped that way, and shouldn't be - print needs the bleed. So the
// bleed stays in the file and the page boxes say where it is: MediaBox =
// BleedBox = whole frame, TrimBox = the finished A6 inside it.
import { Buffer } from 'node:buffer'
import { PDFDocument } from 'pdf-lib'
import { BLEED_UNITS } from './figma-import.js'

export async function prepareBackgroundPdf(pdfBuffer, frameBox) {
  if (!pdfBuffer?.length || pdfBuffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw new Error('Not a PDF file')
  }
  if (!(frameBox?.width > 0) || !(frameBox?.height > 0)) {
    throw new Error('Missing frameBox width/height')
  }

  const doc = await PDFDocument.load(pdfBuffer)
  if (doc.getPageCount() !== 1) {
    throw new Error(`Expected a single-page PDF, got ${doc.getPageCount()} pages`)
  }

  const page = doc.getPage(0)
  const { width, height } = page.getMediaBox()

  // Figma's frame units and the PDF's points are meant to be 1:1, but derive
  // the scale from the actual page instead of assuming it, so a unit mismatch
  // can't silently put the TrimBox in the wrong place.
  const scaleX = width / frameBox.width
  const scaleY = height / frameBox.height
  const insetX = BLEED_UNITS * scaleX
  const insetY = BLEED_UNITS * scaleY
  if (insetX * 2 >= width || insetY * 2 >= height) {
    throw new Error('Frame is too small to contain a 3mm bleed')
  }

  page.setBleedBox(0, 0, width, height)
  page.setTrimBox(insetX, insetY, width - insetX * 2, height - insetY * 2)

  return {
    buffer: Buffer.from(await doc.save()),
    pageWidth: width,
    pageHeight: height,
    trimBox: { x: insetX, y: insetY, width: width - insetX * 2, height: height - insetY * 2 },
  }
}
