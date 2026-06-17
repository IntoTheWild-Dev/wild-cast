import { PDFDocument, rgb, cmyk, degrees } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { list } from '@vercel/blob'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Injection maps (mirrors App.jsx) ─────────────────────────────────────────

const PROMO_PARTNER_MAP = [
  { field: 'sub_headline', page: 0,
    rect: { x: 22, y: 306, width: 272, height: 42 },
    text: { x: 89, y: 316, size: 18, maxWidth: 148 },
    fontKey: 'bold' },
  { field: 'headline', page: 0,
    rect: { x: 22, y: 252, width: 272, height: 76 },
    text: { x: 29, y: 268, size: 38, maxWidth: 256 },
    fontKey: 'bold' },
  { field: 'tc', page: 0,
    rect: { x: 65, y: 108, width: 188, height: 36 },
    text: { x: 70, y: 132, size: 8, maxWidth: 178, lineHeight: 11 },
    fontKey: 'regular' },
  { field: 'sub_headline', page: 1,
    rect: { x: 22, y: 357, width: 272, height: 42 },
    text: { x: 89, y: 367, size: 18, maxWidth: 148 },
    fontKey: 'bold' },
  { field: 'offer', page: 1,
    rect: { x: 58, y: 294, width: 204, height: 66 },
    text: { x: 66, y: 302, size: 55, maxWidth: 200 },
    fontKey: 'black' },
]

const WEN_CHENG_POTSDAM_MAP = [
  { field: 'sub_headline', page: 0,
    rect:  { x: 14,  y: 318, width: 288, height: 42 },
    text:  { x: 14,  y: 325, size: 30,  maxWidth: 288, align: 'center' },
    fontKey: 'condBlack' },
  { field: 'headline', page: 0,
    rect:  { x: 14,  y: 255, width: 288, height: 85 },
    text:  { x: 14,  y: 283, size: 44,  maxWidth: 288, align: 'center' },
    fontKey: 'condBlack' },
  { field: 'offer', page: 0,
    rect:  { x: 68,  y: 78,  width: 184, height: 35 },
    text:  { x: 68,  y: 84,  size: 26,  maxWidth: 184, align: 'center' },
    fontKey: 'black' },
  { field: 'tc', page: 0,
    rect:  { x: 14,  y: 22,  width: 38,  height: 130 },
    text:  { x: 46,  y: 26,  size: 5.5, maxWidth: 126, rotate: 90 },
    fontKey: 'regular' },
]

const TEMPLATE_CONFIG = {
  'wen-cheng-flyer1': {
    blobFilename: 'Flyer_1_reduced.pdf',
    map: WEN_CHENG_POTSDAM_MAP,
  },
  'wen-cheng-flyer2': {
    blobFilename: 'Flyer_2_reduced.pdf',
    map: WEN_CHENG_POTSDAM_MAP,
  },
  'promo-partner': {
    blobFilename: null, // not yet uploaded
    map: PROMO_PARTNER_MAP,
  },
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { templateId, fields, pageCount = 1, photoBase64, photoType } = req.body
  const config = TEMPLATE_CONFIG[templateId]

  if (!config || !config.blobFilename) {
    return res.status(400).json({ error: 'Unknown or unsupported template' })
  }

  // ── 1. Fetch template PDF from Vercel Blob ──────────────────────────────────
  const { blobs } = await list({
    prefix: config.blobFilename,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  })

  if (!blobs.length) {
    return res.status(404).json({ error: 'Template PDF not found in blob storage' })
  }

  const pdfResponse = await fetch(blobs[0].url, {
    headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
  })

  if (!pdfResponse.ok) {
    return res.status(502).json({ error: 'Failed to fetch template from storage' })
  }

  const pdfBytes = await pdfResponse.arrayBuffer()

  // ── 2. Load and inject via pdf-lib ─────────────────────────────────────────
  const doc = await PDFDocument.load(pdfBytes)
  doc.registerFontkit(fontkit)

  // Trim to the visible page count
  while (doc.getPageCount() > Math.max(1, pageCount)) {
    doc.removePage(doc.getPageCount() - 1)
  }

  const fontsDir = join(__dirname, 'fonts')
  const fonts = {
    bold:      await doc.embedFont(readFileSync(join(fontsDir, 'Omnes Bold.ttf'))),
    black:     await doc.embedFont(readFileSync(join(fontsDir, 'Omnes Black.ttf'))),
    regular:   await doc.embedFont(readFileSync(join(fontsDir, 'Omnes Regular.ttf'))),
    condBlack: await doc.embedFont(readFileSync(join(fontsDir, 'Omnes Cond Black.ttf'))),
  }

  const teal  = cmyk(0.75, 0, 0.10, 0)
  const white = rgb(1, 1, 1)
  const map   = config.map

  // Pass 1: cover rects
  for (const entry of map) {
    if (!entry.rect || entry.page >= doc.getPageCount()) continue
    doc.getPage(entry.page).drawRectangle({ ...entry.rect, color: teal })
  }

  // Pass 2: partner text with optional center alignment
  for (const entry of map) {
    const value = fields[entry.field]
    if (!value || entry.page >= doc.getPageCount()) continue
    let drawX = entry.text.x
    if (entry.text.align === 'center' && !entry.text.rotate) {
      const textWidth = fonts[entry.fontKey].widthOfTextAtSize(value, entry.text.size)
      drawX = entry.rect.x + (entry.rect.width - textWidth) / 2
      if (drawX < entry.rect.x) drawX = entry.rect.x
    }
    const textOpts = {
      x:          drawX,
      y:          entry.text.y,
      size:       entry.text.size,
      font:       fonts[entry.fontKey],
      color:      white,
      maxWidth:   entry.text.maxWidth,
      lineHeight: entry.text.lineHeight,
    }
    if (entry.text.rotate) textOpts.rotate = degrees(entry.text.rotate)
    doc.getPage(entry.page).drawText(value, textOpts)
  }

  // Pass 3: product photo — cover three-circles area and draw uploaded image
  if (photoBase64) {
    const imgBuffer = Buffer.from(photoBase64, 'base64')
    const image = photoType === 'image/png'
      ? await doc.embedPng(imgBuffer)
      : await doc.embedJpg(imgBuffer)

    const PHOTO_AREA = { x: 14, y: 140, width: 288, height: 118 }
    const dims = image.scale(1)
    const scale = Math.min(PHOTO_AREA.width / dims.width, PHOTO_AREA.height / dims.height)
    const drawW = dims.width * scale
    const drawH = dims.height * scale
    const drawX = PHOTO_AREA.x + (PHOTO_AREA.width - drawW) / 2
    const drawY = PHOTO_AREA.y + (PHOTO_AREA.height - drawH) / 2

    doc.getPage(0).drawRectangle({ ...PHOTO_AREA, color: teal })
    doc.getPage(0).drawImage(image, { x: drawX, y: drawY, width: drawW, height: drawH })
  }

  // Also update the map to use center alignment
  const outputBytes = await doc.save()

  // ── 3. Stream the modified PDF directly back to the browser ────────────────
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="wildcast-${templateId}.pdf"`)
  return res.send(Buffer.from(outputBytes))
}
