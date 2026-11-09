// Print colours module: the calibration sheet. One A4 page of CMYK patches
// around a colour's current value, each with a code (A1 … F5). The designer
// prints it on the target printer, holds it next to the reference (InDesign
// print or brand book), and types the matching patch's code back in.
//   Rows    A-F: lighter → darker (all inks scaled 84 % … 104 %)
//   Columns 1-5: hue nudge between the two non-dominant colour inks
//                (e.g. for a cyan blue: 1-2 add magenta, 4-5 add yellow)
// The exact current value is always D3 (100 %, no nudge).
import { Buffer } from 'node:buffer'
import { PDFDocument, StandardFonts, PDFName, PDFString, cmyk as pdfCmyk } from 'pdf-lib'

export const ROWS = ['A', 'B', 'C', 'D', 'E', 'F']
const SCALES = [0.84, 0.88, 0.92, 1.0, 1.04, 1.08]
const NUDGES = [-6, -3, 0, 3, 6]
const CURRENT = 'D3'

const round = v => Math.max(0, Math.min(100, Math.round(v)))

function hueAxis({ c, m, y }) {
  // The dominant colour ink stays; the nudge moves between the other two.
  if (c >= m && c >= y) return ['m', 'y']
  if (m >= c && m >= y) return ['c', 'y']
  return ['m', 'c']
}

// All patches for a base CMYK (percent). Pure, shared with the API so the
// code the designer types maps to exactly what was printed.
export function calibrationGrid(base) {
  const [minus, plus] = hueAxis(base)
  const patches = []
  ROWS.forEach((row, r) => {
    NUDGES.forEach((n, col) => {
      const v = { c: base.c * SCALES[r], m: base.m * SCALES[r], y: base.y * SCALES[r], k: base.k * SCALES[r] }
      if (n < 0) v[minus] += -n
      if (n > 0) v[plus] += n
      patches.push({ code: `${row}${col + 1}`, cmyk: { c: round(v.c), m: round(v.m), y: round(v.y), k: round(v.k) } })
    })
  })
  return { patches, current: CURRENT, axis: { minus, plus } }
}

export function patchByCode(base, code) {
  const want = String(code || '').trim().toUpperCase()
  return calibrationGrid(base).patches.find(p => p.code === want) ?? null
}

// A4 PDF. Uses the same output intent label as the InDesign reference file
// (plain PDF, PSO Coated v3) so the printer treats every patch like the
// InDesign artwork it's being compared against.
export async function calibrationSheetPdf({ label, hex, cmyk, iccProfile }) {
  const doc = await PDFDocument.create()
  const page = doc.addPage([595.28, 841.89])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const black = pdfCmyk(0, 0, 0, 1), grey = pdfCmyk(0, 0, 0, 0.6)
  const { patches, axis } = calibrationGrid(cmyk)
  const text = (s, x, y, size = 9, f = font, color = black) => page.drawText(s, { x, y, size, font: f, color })

  text(`Calibration sheet: ${label}`, 40, 800, 16, bold)
  text(`Screen ${hex}  ·  current print value C${cmyk.c} M${cmyk.m} Y${cmyk.y} K${cmyk.k} (patch ${CURRENT}, outlined)`, 40, 782, 9, font, grey)
  text('1. Print this page on the printer you are tuning for: 100 %, no scaling, same colour settings as your normal jobs.', 40, 760, 8.5)
  text('2. Hold it next to the reference (InDesign print or brand book) in daylight.', 40, 747, 8.5)
  text('3. Find the patch that matches best and type its code (e.g. C4) into WildCast > Print colours.', 40, 734, 8.5)
  text(`Rows A to F: lighter to darker.   Columns 1 to 5: more ${axis.minus.toUpperCase()} (1) to more ${axis.plus.toUpperCase()} (5).`, 40, 716, 8.5, bold)

  const size = 86, gap = 14, left = 62, top = 690
  NUDGES.forEach((_, col) => text(String(col + 1), left + col * (size + gap) + size / 2 - 3, top + 4, 10, bold))
  ROWS.forEach((row, r) => {
    const y = top - 12 - (r + 1) * size - r * gap
    text(row, 40, y + size / 2 - 4, 12, bold)
    NUDGES.forEach((__, col) => {
      const p = patches[r * NUDGES.length + col]
      const x = left + col * (size + gap)
      const { c, m, y: yy, k } = p.cmyk
      page.drawRectangle({
        x, y, width: size, height: size, color: pdfCmyk(c / 100, m / 100, yy / 100, k / 100),
        ...(p.code === CURRENT ? { borderColor: black, borderWidth: 2 } : {}),
      })
      text(`${p.code}  ${c}/${m}/${yy}/${k}`, x, y - 9, 6.5, p.code === CURRENT ? bold : font)
    })
  })
  text(`WildCast · ${new Date().toISOString().slice(0, 10)} · Output intent PSO Coated v3`, 40, 22, 6.5, font, grey)

  const iccRef = doc.context.register(doc.context.flateStream(iccProfile, { N: 4 }))
  doc.catalog.set(PDFName.of('OutputIntents'), doc.context.obj([doc.context.obj({
    Type: 'OutputIntent', S: 'GTS_PDFX',
    OutputConditionIdentifier: PDFString.of('PSO Coated v3'), Info: PDFString.of('PSO Coated v3'),
    RegistryName: PDFString.of('http://www.color.org'), DestOutputProfile: iccRef,
  })]))
  doc.setTitle(`Calibration sheet ${label}`)
  return Buffer.from(await doc.save())
}
