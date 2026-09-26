import { Buffer } from 'node:buffer'
import sharp from 'sharp'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { deflateSync } from 'zlib'
import { getBrandLibrary, hexToRgb, cmykToBytes } from './_lib/brandColors.js'

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

// The canvas the app renders is trim-size only (105×148mm) — it never draws
// real bleed content. BLEED_PX/TRIM_PX_* let us resize the incoming PNG to its
// true trim size (no distortion) and then extend the bleed margin separately,
// instead of stretching trim art across the whole bleed box (see rawCmyk below).
const BLEED_PX  = Math.round(BLEED_MM / MM_PER_INCH * DPI)   // 35
const TRIM_PX_W = PX_W - BLEED_PX * 2                        // 1241
const TRIM_PX_H = PX_H - BLEED_PX * 2                         // 1749

// Increase body limit — the 4× canvas PNG can be 3–5 MB as base64
export const config = { api: { bodyParser: { sizeLimit: '10mb' } } }

// Selectable output intents — both ICC files are the free, redistributable
// characterisation profiles from eci.org (same source/license as the
// original FOGRA39 file). FOGRA51 (PSO Coated v3, ISO 12647-2:2013) is now
// the only user-choosable profile (Julia's ask, 2026-09-18); the fogra39
// entry stays here so a project saved before this change with
// iccProfile:'fogra39' still exports correctly, it's just not offered.
const ICC_PROFILES = {
  fogra39: {
    file: 'ISOcoated_v2_eci.icc',
    identifier: 'FOGRA39',
    info: 'Coated FOGRA39 \\(ISO 12647-2:2004\\)',
  },
  fogra51: {
    file: 'PSOcoated_v3.icc',
    identifier: 'FOGRA51',
    info: 'PSO Coated v3 FOGRA51 \\(ISO 12647-2:2013\\)',
  },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { png, filename = 'wildcast-flyer', profile = 'fogra51', brand = null } = req.body
  if (!png) return res.status(400).json({ error: 'Missing png' })

  const profileMeta = ICC_PROFILES[profile]
  if (!profileMeta) return res.status(400).json({ error: `Unknown profile "${profile}"` })

  try {
    const pngBuffer = Buffer.from(
      png.replace(/^data:image\/[a-z]+;base64,/, ''),
      'base64',
    )

    // Load the selected output ICC profile (bundled alongside this function)
    const iccPath = join(__dirname, 'icc', profileMeta.file)
    const iccProfile = readFileSync(iccPath)

    // ── sRGB → CMYK, with brand color library override ───────────────────────
    // CMYK JPEG carries an APP14 "Adobe" marker that inverts byte values
    // (0=full ink instead of 0=no ink), causing PDF viewers to render near-black.
    // Using raw bytes + FlateDecode (below) sidesteps that convention entirely.
    // See convertToBrandAwareCmyk for the resize/bleed/ICC/brand-lookup details.
    const { rawCmyk, brandMasks, unverifiedColorCount } = await convertToBrandAwareCmyk({ pngBuffer, iccPath, brand })

    const cmykZ = deflateSync(rawCmyk)  // FlateDecode for PDF

    // ── Build PDF/X-4 ────────────────────────────────────────────────────────
    const pdfBuffer = buildPdfX4({ cmykZ, brandMasks, iccProfile, profileMeta })

    const safeName = filename.replace(/[^a-z0-9_-]/gi, '-').toLowerCase()
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.pdf"`)
    res.setHeader('Content-Length', pdfBuffer.length)
    // Requirement 3 (brief §5): flag any export that used the fallback
    // conversion for one or more colors, so nobody assumes an unflagged
    // flyer is fully brand-accurate. Exposed as a response header (rather
    // than baked into the PDF itself) so the UI can show "N colors not
    // brand-verified" without touching the print file.
    res.setHeader('X-Unverified-Colors', String(unverifiedColorCount))
    res.setHeader('Access-Control-Expose-Headers', 'X-Unverified-Colors')
    return res.status(200).send(pdfBuffer)
  } catch (err) {
    console.error('export-cmyk error:', err)
    return res.status(500).json({ error: err.message })
  }
}

// ── sRGB → brand-aware CMYK conversion ──────────────────────────────────────
// Pulled out of the handler so it can be exercised directly (see
// scripts/verify-brand-color-fix.mjs) without going through an HTTP request -
// the verification script imports and calls this exact function, so what it
// checks is provably the same code path production uses, not a re-implementation.
export async function convertToBrandAwareCmyk({ pngBuffer, iccPath, brand }) {
  // 'cover' (not 'fill') — the editor canvas is 316×441px, which is ~1% off
  // true A6's 105:148 ratio (canvasH was rounded to 441 rather than the more
  // precise 445 when these constants were first chosen), so a naive
  // fill-resize stretched every element on export slightly non-uniformly
  // (circles → faint ovals, etc). 'cover' scales uniformly and crops the
  // ~1% overflow off one edge instead — invisible here since the
  // background art fills edge-to-edge — guaranteeing nothing in the design
  // gets stretched out of proportion.
  // Shared pipeline up to (but not including) the ICC conversion — reused
  // below to get both the pre-conversion RGB pixels (needed to find brand
  // colors) and the converted CMYK pixels, on the identical pixel grid.
  const buildPipeline = () =>
    sharp(pngBuffer)
      .resize(TRIM_PX_W, TRIM_PX_H, { fit: 'cover' })
      .flatten({ background: { r: 255, g: 255, b: 255 } }) // composite any alpha on white
      // Real bleed: mirror the trim-edge pixels outward by BLEED_PX rather than
      // stretching the trim art across the full bleed box. Keeps every design
      // element (frame, text, photos) registered exactly at the TrimBox line —
      // only the extra 3mm strip that gets trimmed away is the mirrored fill.
      .extend({
        top: BLEED_PX, bottom: BLEED_PX, left: BLEED_PX, right: BLEED_PX,
        background: { r: 255, g: 255, b: 255 },
        extendWith: 'mirror',
      })

  // ── sRGB → CMYK (raw bytes, no JPEG APP14 inversion risk) ────────────────
  // withIccProfile with a CMYK profile does the ICC-accurate sRGB→CMYK
  // conversion; raw() extracts 4 bytes/px (C, M, Y, K) in standard order.
  const rawCmyk = await buildPipeline()
    .withIccProfile(iccPath)   // sRGB → CMYK via the selected profile (4 channels, 0=no ink)
    .raw()
    .toBuffer()

  // Unmatched colors are counted for the warning, including exports without
  // a library (see applyBrandColorLibrary for the visible-area threshold).
  const rgbBuffer = await buildPipeline().removeAlpha().raw().toBuffer()
  const { brandMasks, unverifiedColorCount } = applyBrandColorLibrary(
    rgbBuffer, rawCmyk, getBrandLibrary(brand),
  )
  return { rawCmyk, brandMasks, unverifiedColorCount }
}

// Warning count (requirement 3): distinct unmatched RGB values that cover at
// least 0.1% of the canvas. This is a raster export, so every anti-aliased
// edge and photo pixel is its own "color" (~127k on the Wolt flyer); counting
// only visible flat areas keeps the warning meaningful ("5 colors").
const MIN_SIGNIFICANT_FRACTION = 0.001

function applyBrandColorLibrary(rgbBuffer, cmykBuffer, library) {
  const rowBytes = Math.ceil(PX_W / 8)
  const byHex = new Map()
  for (const entry of library) {
    const rgb = hexToRgb(entry.hex)
    const components = ['c', 'm', 'y', 'k'].map(channel => entry.cmyk?.[channel])
    if (!rgb || components.some(value => !Number.isFinite(value) || value < 0 || value > 100)) {
      throw new Error('Invalid brand color library entry')
    }
    byHex.set((rgb.r << 16) | (rgb.g << 8) | rgb.b, {
      cmyk: components.map(value => value / 100),
      bytes: cmykToBytes(entry.cmyk),
      mask: null,
    })
  }

  const pixelCount = rgbBuffer.length / 3
  const unmatched = new Map()
  for (let px = 0; px < pixelCount; px++) {
    const ri = px * 3
    const key = (rgbBuffer[ri] << 16) | (rgbBuffer[ri + 1] << 8) | rgbBuffer[ri + 2]
    const color = byHex.get(key)
    if (!color) {
      unmatched.set(key, (unmatched.get(key) || 0) + 1)
      continue
    }
    // Retain the approximate brand color underneath the stencil. The final
    // ink values come from its exact PDF CMYK operands, not these bytes.
    const ci = px * 4
    cmykBuffer[ci] = color.bytes.c
    cmykBuffer[ci + 1] = color.bytes.m
    cmykBuffer[ci + 2] = color.bytes.y
    cmykBuffer[ci + 3] = color.bytes.k
    color.mask ??= Buffer.alloc(rowBytes * PX_H)
    const x = px % PX_W
    const y = Math.floor(px / PX_W)
    color.mask[y * rowBytes + (x >> 3)] |= 128 >> (x & 7)
  }
  return {
    brandMasks: [...byHex.values()].filter(color => color.mask),
    unverifiedColorCount: [...unmatched.values()]
      .filter(count => count >= pixelCount * MIN_SIGNIFICANT_FRACTION).length,
  }
}

// ── PDF/X-4 builder ───────────────────────────────────────────────────────────
function buildPdfX4({ cmykZ, brandMasks, iccProfile, profileMeta }) {
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

  // 3 — OutputIntent (selected profile / ISO 12647-2)
  mark(3)
  push(
    '3 0 obj\n' +
    '<< /Type /OutputIntent\n' +
    '   /S /GTS_PDFX\n' +
    `   /OutputConditionIdentifier (${profileMeta.identifier})\n` +
    `   /Info (${profileMeta.info})\n` +
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
    `   /Resources << /XObject << /Im1 7 0 R ${brandMasks.map((_, i) => `/Brand${i} ${9 + i} 0 R`).join(' ')} >> >>\n` +
    '   /Contents 8 0 R\n' +
    '>>\nendobj\n',
  )

  // 6 — ICC Profile stream (FlateDecode compressed — 1.8 MB → ~1.3 MB)
  const iccZ = deflateSync(iccProfile)
  mark(6)
  push(`6 0 obj\n<< /N 4 /Length ${iccZ.length} /Filter /FlateDecode >>\nstream\n`)
  push(iccZ)
  push('\nendstream\nendobj\n')

  // 7 — Image XObject (raw CMYK, FlateDecode — avoids JPEG APP14 inversion bug)
  mark(7)
  push(
    '7 0 obj\n' +
    '<< /Type /XObject\n' +
    '   /Subtype /Image\n' +
    `   /Width ${PX_W}\n` +
    `   /Height ${PX_H}\n` +
    '   /ColorSpace [/ICCBased 6 0 R]\n' +
    '   /BitsPerComponent 8\n' +
    '   /Filter /FlateDecode\n' +
    `   /Length ${cmykZ.length}\n` +
    '>>\nstream\n',
  )
  push(cmykZ)
  push('\nendstream\nendobj\n')

  // 8 — Content stream: scale-to-page cm matrix, then paint image
  // Raster stencils paint only exact source matches. DeviceCMYK operands
  // retain official percentages under the document's CMYK output intent.
  // This does not vectorize text/logos or change unmatched image samples.
  const brandPaint = brandMasks.map((color, i) =>
    `q\n${color.cmyk.join(' ')} k\n/Brand${i} Do\nQ\n`,
  ).join('')
  const cs = `q\n${PT_W} 0 0 ${PT_H} 0 0 cm\n/Im1 Do\n${brandPaint}Q\n`
  mark(8)
  push(`8 0 obj\n<< /Length ${cs.length} >>\nstream\n${cs}\nendstream\nendobj\n`)

  brandMasks.forEach((color, i) => {
    const id = 9 + i
    const maskZ = deflateSync(color.mask)
    mark(id)
    push(`${id} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${PX_W} /Height ${PX_H} /ImageMask true /BitsPerComponent 1 /Decode [1 0] /Interpolate false /Filter /FlateDecode /Length ${maskZ.length} >>\nstream\n`)
    push(maskZ)
    push('\nendstream\nendobj\n')
  })

  // ── Cross-reference table ─────────────────────────────────────────────────
  const xrefOffset = tell()
  const N = 9 + brandMasks.length  // objects 0–8 plus brand stencils
  push(`xref\n0 ${N}\n`)
  push('0000000000 65535 f \n')
  for (let i = 1; i < N; i++) {
    push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`)
  }

  // Trailer
  push(`trailer\n<< /Size ${N} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`)

  return Buffer.concat(chunks)
}
