import { Buffer } from 'node:buffer'
import process from 'node:process'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { deflateSync } from 'zlib'
import { getBrandLibrary, hexToRgb, cmykToBytes } from './_lib/brandColors.js'
import { loadLut, applyLut } from './_lib/cmykLut.js'
import { buildLayeredPdf } from './_lib/layeredPdf.js'
import { preflightPdf } from './_lib/preflight.js'
import { isBlobHost } from './_lib/templateAssets.js'

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
// `lut` is the Relative Colorimetric + BPC table for the CMYK-only mode (see
// scripts/build-cmyk-lut.py).
const ICC_PROFILES = {
  fogra39: {
    file: 'ISOcoated_v2_eci.icc',
    lut: 'ISOcoated_v2_eci.relcol-bpc.lut',
    identifier: 'FOGRA39',
    info: 'Coated FOGRA39 \\(ISO 12647-2:2004\\)',
  },
  fogra51: {
    file: 'PSOcoated_v3.icc',
    lut: 'PSOcoated_v3.relcol-bpc.lut',
    identifier: 'FOGRA51',
    info: 'PSO Coated v3 FOGRA51 \\(ISO 12647-2:2013\\)',
  },
}

// Export modes (2026-09-29, after cross-checking the Wolt x McDonald's
// InDesign reference):
//  - 'print' (default): the flyer image stays sRGB (ICC-tagged), exactly as
//    InDesign's PDF/X-4 export leaves placed RGB photos, so the print shop's
//    RIP converts WildCast and InDesign files identically. Brand colors are
//    still painted as exact CMYK on top.
//  - 'cmyk': everything converted to CMYK here, for printers that require
//    CMYK-only files - Relative Colorimetric + BPC (what a RIP / InDesign's
//    Convert to Destination does), not sharp's Perceptual-only conversion,
//    which measured dE ~2.5-3.2 off on the reference's food photos.
const EXPORT_MODES = new Set(['print', 'cmyk'])
// Uploads enlarged below this print resolution get a preflight warning.
const MIN_SOURCE_PPI = 300
// Same names the editor's field list uses.
const ZONE_NAMES = { photo: 'Food photo', logo: 'Restaurant logo', qr: 'QR code', sticker: 'Sticker' }
const SRGB_ICC = 'sRGB_IEC61966-2-1.icc'  // same profile InDesign embeds

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { png, filename = 'wildcast-flyer', profile = 'fogra51', brand = null, mode = 'print', layout = null, backgroundPdfUrl = null } = req.body
  const layered = Boolean(layout && backgroundPdfUrl)
  if (!png && !layered) return res.status(400).json({ error: 'Missing png' })

  const profileMeta = ICC_PROFILES[profile]
  if (!profileMeta) return res.status(400).json({ error: `Unknown profile "${profile}"` })
  if (!EXPORT_MODES.has(mode)) return res.status(400).json({ error: `Unknown mode "${mode}"` })

  const safeName = filename.replace(/[^a-z0-9_-]/gi, '-').toLowerCase() + (mode === 'cmyk' ? '-cmyk' : '')
  const send = async (pdfBuffer, unverifiedColorCount, exportKind, sourcePpi = []) => {
    // Print preflight on the finished file (api/_lib/preflight.js): plain-word
    // warnings for the export dialog. Never blocks the download.
    const warnings = []
    try {
      const pf = await preflightPdf(pdfBuffer, { lut: loadLut(join(__dirname, 'icc', profileMeta.lut)) })
      for (const c of pf.checks) if (c.status !== 'pass' && c.id !== 'livetext' && c.id !== 'ppi') warnings.push(`${c.label}: ${c.detail}`)
    } catch (err) {
      console.error('export-cmyk preflight error:', err)
    }
    for (const s of sourcePpi) {
      const name = ZONE_NAMES[s.zoneId] ?? 'An image'
      if (s.ppi < MIN_SOURCE_PPI) warnings.push(`${name} is ${s.ppi} ppi at print size (300 needed). Upload a larger file.`)
    }
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.pdf"`)
    res.setHeader('X-Export-Mode', mode)
    res.setHeader('X-Export-Kind', exportKind)
    res.setHeader('Content-Length', pdfBuffer.length)
    // Requirement 3 (brief §5): flag colours with no official print value.
    res.setHeader('X-Unverified-Colors', String(unverifiedColorCount))
    // ASCII-safe JSON array of warnings (headers can't carry raw UTF-8).
    res.setHeader('X-Preflight', JSON.stringify(warnings).replace(/[^ -~]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')))
    res.setHeader('Access-Control-Expose-Headers', 'X-Unverified-Colors, X-Export-Mode, X-Export-Kind, X-Preflight')
    return res.status(200).send(pdfBuffer)
  }

  // ── Layered export (2026-10-06): the template's vector PDF + live text +
  // separate images, see api/_lib/layeredPdf.js. Used whenever the template
  // has a stored vector background; anything else keeps the flat path below.
  if (layered) {
    try {
      const templatePdf = await fetchTemplatePdf(backgroundPdfUrl)
      const { pdf, unverifiedColorCount, sourcePpi } = await buildLayeredPdf({
        templatePdf, layout, mode,
        library: getBrandLibrary(brand),
        lut: loadLut(join(__dirname, 'icc', profileMeta.lut)),
        iccProfile: readFileSync(join(__dirname, 'icc', profileMeta.file)),
        profileMeta,
        fontsDir: join(__dirname, 'fonts', 'wolt'),
        srgbIcc: readFileSync(join(__dirname, 'icc', SRGB_ICC)),
        page: { PT_W, PT_H, BLEED_PT },
      })
      return await send(pdf, unverifiedColorCount, 'layered', sourcePpi)
    } catch (err) {
      console.error('export-cmyk layered error:', err)
      if (!png) return res.status(500).json({ error: err.message })
      // Fall through to the flat export so the user still gets a file.
    }
  }

  try {
    const pngBuffer = Buffer.from(
      png.replace(/^data:image\/[a-z]+;base64,/, ''),
      'base64',
    )

    // Load the selected output ICC profile (bundled alongside this function)
    const iccProfile = readFileSync(join(__dirname, 'icc', profileMeta.file))

    // ── Flyer image (sRGB or CMYK), with brand color library override ────────
    // Raw bytes + FlateDecode (below), never JPEG: CMYK JPEG's APP14 "Adobe"
    // marker inverts byte values, causing PDF viewers to render near-black.
    // See renderFlyerImage for the resize/bleed/conversion/brand-lookup details.
    const { pixels, brandMasks, unverifiedColorCount } = await renderFlyerImage({
      pngBuffer, brand, mode, lutPath: join(__dirname, 'icc', profileMeta.lut),
    })

    // ── Build PDF/X-4 ────────────────────────────────────────────────────────
    const pdfBuffer = buildPdfX4({
      imageZ: deflateSync(pixels),
      imageIcc: mode === 'print' ? readFileSync(join(__dirname, 'icc', SRGB_ICC)) : null,
      brandMasks, iccProfile, profileMeta,
    })

    return await send(pdfBuffer, unverifiedColorCount, 'flat')
  } catch (err) {
    console.error('export-cmyk error:', err)
    return res.status(500).json({ error: err.message })
  }
}

// The template's vector background. The editor holds it as a proxy link
// ("/api/list-templates?url=<blob url>", src/lib/customTemplates.js); only
// that template file on our Blob store is ever fetched with the token.
// WILDCAST_TEMPLATE_PROXY (local development only, no Blob token) fetches
// through a deployed app's own proxy instead.
const TEMPLATE_PDF_PATH = /^\/templates\/[a-z0-9-]+-bg\.pdf$/
export async function fetchTemplatePdf(link) {
  let blobUrl = String(link)
  if (blobUrl.startsWith('/api/list-templates?')) blobUrl = new URLSearchParams(blobUrl.split('?')[1]).get('url') ?? ''
  if (!isBlobHost(blobUrl) || !TEMPLATE_PDF_PATH.test(decodeURIComponent(new URL(blobUrl).pathname))) {
    throw new Error('Not a template background PDF')
  }
  const token = process.env.BLOB_READ_WRITE_TOKEN
  const proxy = process.env.WILDCAST_TEMPLATE_PROXY
  const url = token || !proxy ? `${blobUrl}?_t=${Date.now()}` : `${proxy}/api/list-templates?url=${encodeURIComponent(blobUrl)}`
  const r = await fetch(url, token ? { headers: { Authorization: `Bearer ${token}` } } : {})
  if (!r.ok) throw new Error(`Template PDF not available (${r.status})`)
  const bytes = Buffer.from(await r.arrayBuffer())
  if (bytes.toString('latin1', 0, 5) !== '%PDF-') throw new Error('Template background is not a PDF')
  return bytes
}

// ── Flyer image: resize/bleed, then sRGB ('print') or CMYK ('cmyk') ─────────
// Returns the raw image samples (3 bytes/px sRGB, or 4 bytes/px CMYK), the
// exact-CMYK brand stencils and the unverified-color count.
export async function renderFlyerImage({ pngBuffer, brand, mode, lutPath }) {
  // 'cover' (not 'fill') — the editor canvas is 316×441px, which is ~1% off
  // true A6's 105:148 ratio (canvasH was rounded to 441 rather than the more
  // precise 445 when these constants were first chosen), so a naive
  // fill-resize stretched every element on export slightly non-uniformly
  // (circles → faint ovals, etc). 'cover' scales uniformly and crops the
  // ~1% overflow off one edge instead — invisible here since the
  // background art fills edge-to-edge — guaranteeing nothing in the design
  // gets stretched out of proportion.
  const rgbBuffer = await sharp(pngBuffer)
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
      .removeAlpha()
      .raw()
      .toBuffer()

  // 'cmyk': Relative Colorimetric + BPC via the profile's lookup table (0=no
  // ink, 4 bytes/px). 'print': the sRGB samples go into the PDF untouched.
  const cmykBuffer = mode === 'cmyk' ? applyLut(rgbBuffer, loadLut(lutPath)) : null

  // Unmatched colors are counted for the warning, including exports without
  // a library (see applyBrandColorLibrary for the visible-area threshold).
  const { brandMasks, unverifiedColorCount } = applyBrandColorLibrary(
    rgbBuffer, cmykBuffer, getBrandLibrary(brand),
  )
  return { pixels: cmykBuffer ?? rgbBuffer, brandMasks, unverifiedColorCount }
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
    // Retain the approximate brand color underneath the stencil ('cmyk' mode;
    // in 'print' mode the sRGB brand pixel stays). The final ink values come
    // from the stencil's exact PDF CMYK operands, not these bytes.
    if (cmykBuffer) {
      const ci = px * 4
      cmykBuffer[ci] = color.bytes.c
      cmykBuffer[ci + 1] = color.bytes.m
      cmykBuffer[ci + 2] = color.bytes.y
      cmykBuffer[ci + 3] = color.bytes.k
    }
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
// Objects 1–9 are fixed (see below); in 'print' mode object 10 is the sRGB
// ICC profile the image is tagged with; brand stencil masks follow.
function buildPdfX4({ imageZ, imageIcc, brandMasks, iccProfile, profileMeta }) {
  const IMAGE_ICC_ID = 10
  const MASK_ID0 = imageIcc ? 11 : 10
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
  // ISO 15930-7 (PDF/X-4) requires pdfxid:GTS_PDFXVersion, xmpMM
  // DocumentID/VersionID/RenditionClass, pdf:Trapped, and dates that match
  // the /Info dictionary (object 9) exactly - preflight (e.g. Acrobat's
  // PDF/X-4 profile) rejects the file otherwise. Mirrors what InDesign's
  // PDF/X-4 export writes. Dates are second-precision UTC so both forms agree.
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  const pdfDate = `D:${now.replace(/[-:T]/g, '').replace('Z', '')}Z`
  const documentId = `uuid:${randomUUID()}`
  const instanceId = `uuid:${randomUUID()}`
  const xmp = Buffer.from(
    '<?xpacket begin="\xEF\xBB\xBF" id="W5M0MpCehiHzreSzNTczkc9d"?>\n' +
    '<x:xmpmeta xmlns:x="adobe:ns:meta/">\n' +
    '  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n' +
    '    <rdf:Description rdf:about=""\n' +
    '      xmlns:pdf="http://ns.adobe.com/pdf/1.3/"\n' +
    '      xmlns:xmp="http://ns.adobe.com/xap/1.0/"\n' +
    '      xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/"\n' +
    '      xmlns:pdfx="http://ns.adobe.com/pdfx/1.3/"\n' +
    '      xmlns:pdfxid="http://www.npes.org/pdfx/ns/id/"\n' +
    '      xmlns:dc="http://purl.org/dc/elements/1.1/">\n' +
    '      <pdf:Producer>WildCast</pdf:Producer>\n' +
    '      <pdf:Trapped>False</pdf:Trapped>\n' +
    '      <xmp:CreatorTool>WildCast</xmp:CreatorTool>\n' +
    `      <xmp:CreateDate>${now}</xmp:CreateDate>\n` +
    `      <xmp:ModifyDate>${now}</xmp:ModifyDate>\n` +
    `      <xmp:MetadataDate>${now}</xmp:MetadataDate>\n` +
    `      <xmpMM:DocumentID>${documentId}</xmpMM:DocumentID>\n` +
    `      <xmpMM:InstanceID>${instanceId}</xmpMM:InstanceID>\n` +
    '      <xmpMM:VersionID>1</xmpMM:VersionID>\n' +
    '      <xmpMM:RenditionClass>default</xmpMM:RenditionClass>\n' +
    '      <pdfxid:GTS_PDFXVersion>PDF/X-4</pdfxid:GTS_PDFXVersion>\n' +
    '      <pdfx:GTS_PDFXVersion>PDF/X-4</pdfx:GTS_PDFXVersion>\n' +
    '      <dc:format>application/pdf</dc:format>\n' +
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
    `   /Resources << /XObject << /Im1 7 0 R ${brandMasks.map((_, i) => `/Brand${i} ${MASK_ID0 + i} 0 R`).join(' ')} >> >>\n` +
    '   /Contents 8 0 R\n' +
    '>>\nendobj\n',
  )

  // 6 — ICC Profile stream (FlateDecode compressed — 1.8 MB → ~1.3 MB)
  const iccZ = deflateSync(iccProfile)
  mark(6)
  push(`6 0 obj\n<< /N 4 /Length ${iccZ.length} /Filter /FlateDecode >>\nstream\n`)
  push(iccZ)
  push('\nendstream\nendobj\n')

  // 7 — Image XObject (raw samples, FlateDecode — avoids JPEG APP14 inversion
  // bug). 'print': sRGB-tagged (object 10), 'cmyk': output-profile CMYK.
  mark(7)
  push(
    '7 0 obj\n' +
    '<< /Type /XObject\n' +
    '   /Subtype /Image\n' +
    `   /Width ${PX_W}\n` +
    `   /Height ${PX_H}\n` +
    `   /ColorSpace [/ICCBased ${imageIcc ? IMAGE_ICC_ID : 6} 0 R]\n` +
    '   /BitsPerComponent 8\n' +
    '   /Filter /FlateDecode\n' +
    `   /Length ${imageZ.length}\n` +
    '>>\nstream\n',
  )
  push(imageZ)
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

  // 9 — Document info (PDF/X-4 requires /Trapped; dates must match the XMP)
  mark(9)
  push(
    '9 0 obj\n' +
    `<< /Title (WildCast Flyer) /Creator (WildCast) /Producer (WildCast)\n` +
    `   /CreationDate (${pdfDate}) /ModDate (${pdfDate})\n` +
    '   /Trapped /False /GTS_PDFXVersion (PDF/X-4) >>\nendobj\n',
  )

  // 10 — sRGB ICC profile for the 'print' mode image
  if (imageIcc) {
    const imageIccZ = deflateSync(imageIcc)
    mark(IMAGE_ICC_ID)
    push(`${IMAGE_ICC_ID} 0 obj\n<< /N 3 /Length ${imageIccZ.length} /Filter /FlateDecode >>\nstream\n`)
    push(imageIccZ)
    push('\nendstream\nendobj\n')
  }

  brandMasks.forEach((color, i) => {
    const id = MASK_ID0 + i
    const maskZ = deflateSync(color.mask)
    mark(id)
    push(`${id} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${PX_W} /Height ${PX_H} /ImageMask true /BitsPerComponent 1 /Decode [1 0] /Interpolate false /Filter /FlateDecode /Length ${maskZ.length} >>\nstream\n`)
    push(maskZ)
    push('\nendstream\nendobj\n')
  })

  // ── Cross-reference table ─────────────────────────────────────────────────
  const xrefOffset = tell()
  const N = MASK_ID0 + brandMasks.length  // fixed objects plus brand stencils
  push(`xref\n0 ${N}\n`)
  push('0000000000 65535 f \n')
  for (let i = 1; i < N; i++) {
    push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`)
  }

  // Trailer — /ID is mandatory for PDF/X-4
  const fileId = documentId.slice(5).replace(/-/g, '')
  push(`trailer\n<< /Size ${N} /Root 1 0 R /Info 9 0 R /ID [<${fileId}> <${fileId}>] >>\nstartxref\n${xrefOffset}\n%%EOF\n`)

  return Buffer.concat(chunks)
}
