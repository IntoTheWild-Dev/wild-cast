import sharp from 'sharp'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { deflateSync } from 'zlib'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Print dimensions ──────────────────────────────────────────────────────────
// A6 = 105×148mm  +  3mm bleed each side  =  111×154mm
const BLEED_MM = 3
const DPI = 300
const MM_PER_INCH = 25.4

const TOTAL_W_MM = 105 + BLEED_MM * 2  // 111
const TOTAL_H_MM = 148 + BLEED_MM * 2  // 154

const PX_W = Math.round(TOTAL_W_MM / MM_PER_INCH * DPI)  // 1311
const PX_H = Math.round(TOTAL_H_MM / MM_PER_INCH * DPI)  // 1819

// PDF points — 72pt = 1 inch = 25.4mm
const PT_PER_MM = 72 / MM_PER_INCH
const PT_W     = +(TOTAL_W_MM * PT_PER_MM).toFixed(3)   // 314.646
const PT_H     = +(TOTAL_H_MM * PT_PER_MM).toFixed(3)   // 436.535
const BLEED_PT = +(BLEED_MM   * PT_PER_MM).toFixed(3)   // 8.504

// Increase body limit — the 4× canvas PNG can be 3–5 MB as base64
export const config = { api: { bodyParser: { sizeLimit: '10mb' } } }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { png, filename = 'wildcast-flyer' } = req.body
  if (!png) return res.status(400).json({ error: 'Missing png' })

  try {
    const pngBuffer = Buffer.from(
      png.replace(/^data:image\/[a-z]+;base64,/, ''),
      'base64',
    )

    // Load FOGRA39 ICC profile (bundled alongside this function)
    const iccPath = join(__dirname, 'icc', 'ISOcoated_v2_eci.icc')
    const iccProfile = readFileSync(iccPath)

    // ── RGB → CMYK JPEG ──────────────────────────────────────────────────────
    // Resize to A6 + 3 mm bleed at 300 DPI, convert to CMYK, embed FOGRA39
    const cmykJpeg = await sharp(pngBuffer)
      .resize(PX_W, PX_H, { fit: 'fill' })
      .toColourspace('cmyk')
      .withIccProfile(iccPath)
      .jpeg({ quality: 95 })
      .toBuffer()

    // ── Build PDF/X-4 ────────────────────────────────────────────────────────
    const pdfBuffer = buildPdfX4({ cmykJpeg, iccProfile })

    const safeName = filename.replace(/[^a-z0-9_-]/gi, '-').toLowerCase()
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.pdf"`)
    res.setHeader('Content-Length', pdfBuffer.length)
    return res.status(200).send(pdfBuffer)
  } catch (err) {
    console.error('export-cmyk error:', err)
    return res.status(500).json({ error: err.message })
  }
}

// ── PDF/X-4 builder ───────────────────────────────────────────────────────────
function buildPdfX4({ cmykJpeg, iccProfile }) {
  const chunks  = []
  const offsets = {}

  function push(data) {
    chunks.push(Buffer.isBuffer(data) ? data : Buffer.from(data, 'latin1'))
  }
  function tell() { return chunks.reduce((n, c) => n + c.length, 0) }
  function mark(id) { offsets[id] = tell() }

  // Binary-safe header — signals to FTP/tools that this is a binary file
  push('%PDF-1.6\n%\xe2\xe3\xcf\xd3\n')

  // 1 — Catalog
  mark(1)
  push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R /OutputIntents [3 0 R] /Metadata 4 0 R >>\nendobj\n')

  // 2 — Pages
  mark(2)
  push('2 0 obj\n<< /Type /Pages /Kids [5 0 R] /Count 1 >>\nendobj\n')

  // 3 — OutputIntent (FOGRA39 / ISO 12647-2)
  mark(3)
  push(
    '3 0 obj\n' +
    '<< /Type /OutputIntent\n' +
    '   /S /GTS_PDFIX\n' +
    '   /OutputConditionIdentifier (FOGRA39)\n' +
    '   /Info (Coated FOGRA39 \\(ISO 12647-2:2004\\))\n' +
    '   /RegistryName (http://www.color.org)\n' +
    '   /DestOutputProfile 6 0 R\n' +
    '>>\nendobj\n',
  )

  // 4 — XMP Metadata (PDF/X-4 conformance declaration)
  const now = new Date().toISOString()
  const xmp = Buffer.from(
    '<?xpacket begin="\xEF\xBB\xBF" id="W5M0MpCehiHzreSzNTczkc9d"?>\n' +
    '<x:xmpmeta xmlns:x="adobe:ns:meta/">\n' +
    '  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n' +
    '    <rdf:Description rdf:about=""\n' +
    '      xmlns:pdf="http://ns.adobe.com/pdf/1.3/"\n' +
    '      xmlns:xmp="http://ns.adobe.com/xap/1.0/"\n' +
    '      xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/"\n' +
    '      xmlns:pdfx="http://ns.adobe.com/pdfx/1.3/"\n' +
    '      xmlns:dc="http://purl.org/dc/elements/1.1/">\n' +
    '      <pdf:Producer>WildCast</pdf:Producer>\n' +
    '      <xmp:CreatorTool>WildCast</xmp:CreatorTool>\n' +
    `      <xmp:CreateDate>${now}</xmp:CreateDate>\n` +
    `      <xmp:ModifyDate>${now}</xmp:ModifyDate>\n` +
    '      <pdfx:GTS_PDFXVersion>PDF/X-4</pdfx:GTS_PDFXVersion>\n' +
    '      <pdfx:GTS_PDFXConformance>PDF/X-4</pdfx:GTS_PDFXConformance>\n' +
    '      <dc:title>\n' +
    '        <rdf:Alt><rdf:li xml:lang="x-default">WildCast Flyer</rdf:li></rdf:Alt>\n' +
    '      </dc:title>\n' +
    '    </rdf:Description>\n' +
    '  </rdf:RDF>\n' +
    '</x:xmpmeta>\n' +
    '<?xpacket end="w"?>',
    'utf8',
  )
  mark(4)
  push(`4 0 obj\n<< /Type /Metadata /Subtype /XML /Length ${xmp.length} >>\nstream\n`)
  push(xmp)
  push('\nendstream\nendobj\n')

  // 5 — Page  (MediaBox = full with bleed, TrimBox = finished A6, BleedBox = MediaBox)
  const tx0 = BLEED_PT, ty0 = BLEED_PT
  const tx1 = PT_W - BLEED_PT, ty1 = PT_H - BLEED_PT
  mark(5)
  push(
    '5 0 obj\n' +
    '<< /Type /Page\n' +
    '   /Parent 2 0 R\n' +
    `   /MediaBox [0 0 ${PT_W} ${PT_H}]\n` +
    `   /TrimBox [${tx0} ${ty0} ${tx1} ${ty1}]\n` +
    `   /BleedBox [0 0 ${PT_W} ${PT_H}]\n` +
    '   /Resources << /XObject << /Im1 7 0 R >> >>\n' +
    '   /Contents 8 0 R\n' +
    '>>\nendobj\n',
  )

  // 6 — ICC Profile stream (FlateDecode compressed — 1.8 MB → ~1.3 MB)
  const iccZ = deflateSync(iccProfile)
  mark(6)
  push(`6 0 obj\n<< /N 4 /Length ${iccZ.length} /Filter /FlateDecode >>\nstream\n`)
  push(iccZ)
  push('\nendstream\nendobj\n')

  // 7 — Image XObject (CMYK JPEG, ICCBased colorspace references obj 6)
  mark(7)
  push(
    '7 0 obj\n' +
    '<< /Type /XObject\n' +
    '   /Subtype /Image\n' +
    `   /Width ${PX_W}\n` +
    `   /Height ${PX_H}\n` +
    '   /ColorSpace [/ICCBased 6 0 R]\n' +
    '   /BitsPerComponent 8\n' +
    '   /Filter /DCTDecode\n' +
    `   /Length ${cmykJpeg.length}\n` +
    '>>\nstream\n',
  )
  push(cmykJpeg)
  push('\nendstream\nendobj\n')

  // 8 — Content stream: scale-to-page cm matrix, then paint image
  const cs = `q\n${PT_W} 0 0 ${PT_H} 0 0 cm\n/Im1 Do\nQ\n`
  mark(8)
  push(`8 0 obj\n<< /Length ${cs.length} >>\nstream\n${cs}\nendstream\nendobj\n`)

  // ── Cross-reference table ─────────────────────────────────────────────────
  const xrefOffset = tell()
  const N = 9  // objects 0–8
  push(`xref\n0 ${N}\n`)
  push('0000000000 65535 f \n')
  for (let i = 1; i < N; i++) {
    push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`)
  }

  // Trailer
  push(`trailer\n<< /Size ${N} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`)

  return Buffer.concat(chunks)
}
