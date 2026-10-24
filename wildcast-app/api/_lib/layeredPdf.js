// Layered print PDF (2026-10-06): builds the export the way InDesign does,
// instead of flattening the editor into one raster.
//
//   L1  the template's vector background - the PDF the Figma plugin stores
//       next to the PNG (templates/<slot>-bg.pdf). Its sRGB fills/strokes are
//       rewritten to CMYK numbers: brand colours to their official values
//       (Wolt Blue 75/0/10/0), white to 0/0/0/0, near-black to K100, anything
//       else through the Relative Colorimetric + BPC table.
//   L2  photos, logos, stickers, QR codes - one image per editor object, with
//       its alpha as a soft mask, so shadows and edges blend into the real
//       CMYK blue underneath (no halo: there is only one blue on the page).
//   L3  editable text as live text, the WOLT font files embedded, positioned
//       from the editor's own line layout (see TemplateCanvas getLayoutSnapshot).
//
// Coordinates arrive in editor canvas units (canvasW x canvasH = the trim
// box, background stretched per axis to fill it - TemplateCanvas.jsx), so one
// affine map places everything exactly where the editor showed it.
import { Buffer } from 'node:buffer'
import { readFileSync } from 'fs'
import { join } from 'path'
import { inflateSync, deflateSync } from 'zlib'
import sharp from 'sharp'
import fontkit from '@pdf-lib/fontkit'
import {
  PDFDocument, PDFName, PDFArray, PDFDict, PDFRawStream, PDFRef, PDFNumber,
  PDFHexString, PDFString,
} from 'pdf-lib'
import { applyLut } from './cmykLut.js'
import { hexToRgb } from './brandColors.js'

// ── Fonts ────────────────────────────────────────────────────────────────────
// Same files and weights as src/index.css. `percent` mirrors its unicode-range
// patch: two WOLT faces ship a zero-height '%' glyph, the browser borrows it
// from a neighbouring weight, so the PDF does too.
const FONT_FILES = {
  'omnes-cond': { 500: 'WOLTCondMedium.otf', 700: 'WOLTCond-Bold.otf', 900: 'WOLTCondBlack.otf' },
  'omnes-pro': { 400: 'WOLTRegular.otf', 600: 'WOLTSemiBold.otf', 700: 'WOLTBold.otf', 900: 'WOLTBlack.otf' },
}
const PERCENT_FROM = {
  'omnes-cond:900': 'WOLTCond-Bold.otf',
  'omnes-pro:400': 'WOLTSemiBold.otf',
}

// CSS font matching (CSS Fonts 4, §5.2 weight rules) over the available weights.
export function pickWeight(available, desired) {
  const ws = available.map(Number).sort((a, b) => a - b)
  if (ws.includes(desired)) return desired
  const below = ws.filter(w => w < desired).reverse()
  const above = ws.filter(w => w > desired)
  if (desired >= 400 && desired <= 500) {
    const upTo500 = above.filter(w => w <= 500)
    return upTo500[0] ?? below[0] ?? above[0]
  }
  if (desired < 400) return below[0] ?? above[0]
  return above[0] ?? below[0]
}

export function fontFileFor(family, weight) {
  const key = String(family || '').toLowerCase().replace(/['"]/g, '').split(',')[0].trim()
  const faces = FONT_FILES[key] ?? FONT_FILES['omnes-pro']
  const famKey = FONT_FILES[key] ? key : 'omnes-pro'
  const w = pickWeight(Object.keys(faces), Number(weight) || 400)
  return { file: faces[w], percentFile: PERCENT_FROM[`${famKey}:${w}`] ?? null }
}

// ── Colour mapping ──────────────────────────────────────────────────────────
// rgb 0-255 -> CMYK 0-1. Exact brand colours first, then the two neutrals
// with a fixed print rule, then the colour-managed table.
export function makeColorMapper(library, lut) {
  const brand = new Map()
  for (const entry of library) {
    const rgb = hexToRgb(entry.hex)
    if (rgb) brand.set((rgb.r << 16) | (rgb.g << 8) | rgb.b, ['c', 'm', 'y', 'k'].map(ch => entry.cmyk[ch] / 100))
  }
  const unverified = new Set()
  function map(r, g, b) {
    const key = (r << 16) | (g << 8) | b
    if (brand.has(key)) return { cmyk: brand.get(key), exact: true }
    if (r === 255 && g === 255 && b === 255) return { cmyk: [0, 0, 0, 0], exact: true }
    if (Math.max(r, g, b) <= 12) return { cmyk: [0, 0, 0, 1], exact: true }  // text black: K100 only
    unverified.add(key)
    const out = applyLut(Buffer.from([r, g, b]), lut)
    return { cmyk: [...out].map(v => v / 255), exact: false }
  }
  return { map, unverified }
}

// CSS colour as the canvas reads it: #rgb, #rgba, #rrggbb, #rrggbbaa, rgb(),
// rgba() and the two names templates use. Anything unreadable is black, as
// on a canvas (never white, which would hide the text on a light area).
const NAMED = { black: [0, 0, 0], white: [255, 255, 255] }
export function parseCssColor(value) {
  const s = String(value ?? '').trim().toLowerCase()
  if (NAMED[s]) return { r: NAMED[s][0], g: NAMED[s][1], b: NAMED[s][2], a: 1 }
  let m = /^#([0-9a-f]{3,8})$/.exec(s)
  if (m && [3, 4, 6, 8].includes(m[1].length)) {
    const h = m[1].length <= 4 ? [...m[1]].map(c => c + c).join('') : m[1]
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 }
  }
  m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(s)
  if (m) {
    const c = v => Math.max(0, Math.min(255, Math.round(Number(v))))
    return { r: c(m[1]), g: c(m[2]), b: c(m[3]), a: m[4] == null ? 1 : Math.max(0, Math.min(1, Number(m[4]))) }
  }
  return { r: 0, g: 0, b: 0, a: 1 }
}

const num = v => {
  const s = (Math.round(v * 10000) / 10000).toString()
  return s === '-0' ? '0' : s
}

// ── L1: recolour the template PDF's content streams ─────────────────────────
// A small tokenizer (enough for Figma/pdf-lib output: numbers, names, strings,
// hex strings, arrays/dicts, operators; inline images are copied through).
export function tokenize(src) {
  const tokens = []
  let i = 0
  const n = src.length
  const isWs = c => c === ' ' || c === '\n' || c === '\r' || c === '\t' || c === '\f' || c === '\0'
  const isDelim = c => '()<>[]{}/%'.includes(c)
  while (i < n) {
    const c = src[i]
    if (isWs(c)) { i++; continue }
    if (c === '%') { while (i < n && src[i] !== '\n' && src[i] !== '\r') i++; continue }
    const start = i
    if (c === '(') {
      let depth = 0
      for (; i < n; i++) {
        if (src[i] === '\\') { i++; continue }
        if (src[i] === '(') depth++
        else if (src[i] === ')' && --depth === 0) { i++; break }
      }
      tokens.push({ t: 'str', v: src.slice(start, i) }); continue
    }
    if (c === '<' && src[i + 1] === '<') { tokens.push({ t: 'raw', v: '<<' }); i += 2; continue }
    if (c === '>' && src[i + 1] === '>') { tokens.push({ t: 'raw', v: '>>' }); i += 2; continue }
    if (c === '<') {
      // Unterminated hex string (damaged file): take the rest; never loop back to 0.
      const close = src.indexOf('>', i)
      i = close < 0 ? n : close + 1
      tokens.push({ t: 'str', v: src.slice(start, i) }); continue
    }
    if (c === '[' || c === ']' || c === '{' || c === '}') { tokens.push({ t: 'raw', v: c }); i++; continue }
    if (c === '/') {
      i++
      while (i < n && !isWs(src[i]) && !isDelim(src[i])) i++
      tokens.push({ t: 'name', v: src.slice(start, i) }); continue
    }
    while (i < n && !isWs(src[i]) && !isDelim(src[i])) i++
    const word = src.slice(start, i)
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)) tokens.push({ t: 'num', v: word })
    else if (word === 'BI') {
      // Inline image: copy verbatim through "EI".
      const end = src.indexOf('EI', i)
      const stop = end < 0 ? n : end + 2
      tokens.push({ t: 'raw', v: src.slice(start, stop) }); i = stop
    } else tokens.push({ t: 'op', v: word })
  }
  return tokens
}

// Rewrites RGB colour operators to CMYK. `rgbSpaces` = colour-space resource
// names that are 3-component RGB (DeviceRGB or ICCBased N=3).
export function recolorContent(src, rgbSpaces, mapColor) {
  const tokens = tokenize(src)
  const out = []
  const operands = []
  const state = { fill: 'DeviceGray', stroke: 'DeviceGray' }
  const stack = []
  let changed = 0
  const flush = () => { for (const o of operands) out.push(o.v); operands.length = 0 }
  for (const tok of tokens) {
    if (tok.t !== 'op') { operands.push(tok); continue }
    const op = tok.v
    const nums = operands.map(o => (o.t === 'num' ? Number(o.v) : NaN))
    const threeNums = operands.length === 3 && nums.every(Number.isFinite)
    if (op === 'q') stack.push({ ...state })
    else if (op === 'Q') Object.assign(state, stack.pop() ?? state)
    else if (op === 'cs' || op === 'CS') {
      const name = operands[0]?.v?.slice(1)
      const space = name === 'DeviceRGB' || rgbSpaces.has(name) ? 'RGB' : name
      if (op === 'cs') state.fill = space; else state.stroke = space
    } else if (op === 'rg' || op === 'RG') {
      if (op === 'rg') state.fill = 'RGB'; else state.stroke = 'RGB'
    } else if (op === 'g') state.fill = 'DeviceGray'
    else if (op === 'G') state.stroke = 'DeviceGray'
    else if (op === 'k') state.fill = 'DeviceCMYK'
    else if (op === 'K') state.stroke = 'DeviceCMYK'

    const isFill = op === 'rg' || op === 'sc' || op === 'scn'
    const isStroke = op === 'RG' || op === 'SC' || op === 'SCN'
    // A Form XObject inherits the caller's colour space (Figma sets "/C1 cs"
    // on the page, then paints inside a form). Three operands can only be an
    // RGB colour, so an inherited/unknown space with three numbers is RGB.
    const space = isFill ? state.fill : state.stroke
    const inRgb = op === 'rg' || op === 'RG' || space === 'RGB' || (space === 'DeviceGray' && threeNums)
    if ((isFill || isStroke) && threeNums && inRgb) {
      const [r, g, b] = nums.map(v => Math.round(Math.min(1, Math.max(0, v)) * 255))
      const { cmyk } = mapColor(r, g, b)
      operands.length = 0
      out.push(`${cmyk.map(num).join(' ')} ${isFill ? 'k' : 'K'}`)
      changed++
      continue
    }
    flush()
    out.push(op)
  }
  flush()
  return { text: out.join(' ').replace(/ (BT|ET|q|Q|BDC|EMC|BMC) /g, '\n$1\n'), changed }
}

function streamBytes(stream) {
  const filter = stream.dict.get(PDFName.of('Filter'))
  const raw = Buffer.from(stream.getContents ? stream.getContents() : stream.contents)
  if (!filter) return raw
  const f = filter instanceof PDFArray ? filter.asArray().map(String) : [String(filter)]
  if (f.length === 1 && f[0] === '/FlateDecode') return inflateSync(raw)
  return null  // unsupported filter on a content stream: leave untouched
}

function setStreamBytes(context, ref, oldStream, bytes) {
  const dict = oldStream.dict.clone(context)
  dict.set(PDFName.of('Filter'), PDFName.of('FlateDecode'))
  dict.delete(PDFName.of('DecodeParms'))
  const z = deflateSync(bytes)
  dict.set(PDFName.of('Length'), PDFNumber.of(z.length))
  context.assign(ref, PDFRawStream.of(dict, z))
}

function rgbSpaceNames(context, resources) {
  const names = new Set()
  const cs = resources?.lookup(PDFName.of('ColorSpace'))
  if (!(cs instanceof PDFDict)) return names
  for (const [key, val] of cs.entries()) {
    const v = context.lookup(val)
    if (v instanceof PDFName && String(v) === '/DeviceRGB') names.add(key.decodeText ? key.decodeText() : String(key).slice(1))
    if (v instanceof PDFArray && String(v.get(0)) === '/ICCBased') {
      const icc = context.lookup(v.get(1))
      if (icc?.dict?.get(PDFName.of('N'))?.asNumber?.() === 3) names.add(String(key).slice(1))
    }
  }
  return names
}

// Gradients (sh operator, or a shading pattern used via scn): Figma exports
// them as axial/radial shadings in RGB with a Type 2 function (two stops) or a
// Type 3 stitching function of Type 2s. Their colour stops get the same
// mapping as flat colours and the shading becomes DeviceCMYK. Anything else
// (sampled/PostScript functions) is left as is and flagged as unverified.
function isRgbSpace(context, cs) {
  const v = context.lookup(cs)
  if (v instanceof PDFName) return String(v) === '/DeviceRGB'
  if (v instanceof PDFArray && String(v.get(0)) === '/ICCBased') return context.lookup(v.get(1))?.dict?.get(PDFName.of('N'))?.asNumber?.() === 3
  return false
}
function mapStops(context, fn, mapColor) {
  const f = context.lookup(fn)
  if (!(f instanceof PDFDict)) return false
  const type = f.get(PDFName.of('FunctionType'))?.asNumber?.()
  if (type === 2) {
    const out = {}
    for (const key of ['C0', 'C1']) {
      const arr = f.lookup(PDFName.of(key))
      const rgb = arr instanceof PDFArray ? arr.asArray().map(n => n.asNumber()) : (key === 'C0' ? [0, 0, 0] : [1, 1, 1])
      if (rgb.length !== 3) return false
      out[key] = mapColor(...rgb.map(v => Math.round(Math.min(1, Math.max(0, v)) * 255))).cmyk
    }
    for (const key of ['C0', 'C1']) f.set(PDFName.of(key), context.obj(out[key]))
    return true
  }
  if (type === 3) {
    const subs = f.lookup(PDFName.of('Functions'))
    return subs instanceof PDFArray && subs.asArray().every(s => mapStops(context, s, mapColor))
  }
  return false
}
function recolorShading(context, shRef, mapColor, stats, done) {
  if (done.has(shRef)) return
  done.add(shRef)
  const sh = context.lookup(shRef)
  const dict = sh instanceof PDFDict ? sh : sh?.dict
  if (!(dict instanceof PDFDict) || !isRgbSpace(context, dict.get(PDFName.of('ColorSpace')))) return
  if (!mapStops(context, dict.get(PDFName.of('Function')), mapColor)) { stats.unconvertedShadings++; return }
  dict.set(PDFName.of('ColorSpace'), PDFName.of('DeviceCMYK'))
  dict.delete(PDFName.of('Background'))
  stats.shadings++
}

// Walks a content-bearing object (page or Form XObject) and everything it
// draws. Soft-mask groups (ExtGState /SMask /G) are left alone: their colours
// define a luminosity mask, not ink.
function recolorTree(context, contentsRefs, resources, mapColor, seen, skip, stats) {
  const rgb = rgbSpaceNames(context, resources)
  const shadings = resources instanceof PDFDict ? resources.lookup(PDFName.of('Shading')) : null
  if (shadings instanceof PDFDict) for (const [, ref] of shadings.entries()) recolorShading(context, ref, mapColor, stats, stats.shadingSeen)
  const patterns = resources instanceof PDFDict ? resources.lookup(PDFName.of('Pattern')) : null
  if (patterns instanceof PDFDict) {
    for (const [, ref] of patterns.entries()) {
      const p = context.lookup(ref)
      const pd = p instanceof PDFDict ? p : p?.dict
      if (pd?.get(PDFName.of('PatternType'))?.asNumber?.() === 2) recolorShading(context, pd.get(PDFName.of('Shading')), mapColor, stats, stats.shadingSeen)
    }
  }
  for (const ref of contentsRefs) {
    const stream = context.lookup(ref)
    if (!stream || seen.has(ref)) continue
    seen.add(ref)
    const bytes = streamBytes(stream)
    if (!bytes) continue
    const { text, changed } = recolorContent(bytes.toString('latin1'), rgb, mapColor)
    stats.ops += changed
    if (changed) setStreamBytes(context, ref, stream, Buffer.from(text, 'latin1'))
  }
  if (!(resources instanceof PDFDict)) return
  const gs = resources.lookup(PDFName.of('ExtGState'))
  if (gs instanceof PDFDict) {
    for (const [, val] of gs.entries()) {
      const g = context.lookup(val)
      const sm = g instanceof PDFDict ? g.lookup(PDFName.of('SMask')) : null
      const G = sm instanceof PDFDict ? sm.get(PDFName.of('G')) : null
      if (G instanceof PDFRef) skip.add(G)
    }
  }
  const xo = resources.lookup(PDFName.of('XObject'))
  if (!(xo instanceof PDFDict)) return
  for (const [, val] of xo.entries()) {
    if (!(val instanceof PDFRef) || seen.has(val) || skip.has(val)) continue
    const obj = context.lookup(val)
    const sub = obj?.dict?.get(PDFName.of('Subtype'))
    if (String(sub) === '/Form') {
      recolorTree(context, [val], obj.dict.lookup(PDFName.of('Resources')), mapColor, seen, skip, stats)
    } else if (String(sub) === '/Image') {
      stats.images.push(val)
    }
  }
}

function pageContentRefs(page) {
  const c = page.node.get(PDFName.of('Contents'))
  if (c instanceof PDFRef) {
    const v = page.doc.context.lookup(c)
    if (v instanceof PDFArray) return v.asArray()
    return [c]
  }
  if (c instanceof PDFArray) return c.asArray()
  return []
}

// Template images arrive at Figma's export resolution (up to ~1000 ppi on the
// A6 page). Above this they are resampled down: the editor's photo layer and
// InDesign's PDF/X-4 output both sit at 300-360 ppi.
const MAX_TEMPLATE_IMAGE_PX = 2400

// 'cmyk' mode: template images (sRGB JPEG/raw) -> CMYK through the same table.
async function convertImageToCmyk(context, ref, lut) {
  const img = context.lookup(ref)
  const filter = String(img.dict.get(PDFName.of('Filter')) ?? '')
  let w = img.dict.get(PDFName.of('Width')).asNumber()
  let h = img.dict.get(PDFName.of('Height')).asNumber()
  const raw = Buffer.from(img.getContents ? img.getContents() : img.contents)
  let pipeline
  if (filter.includes('DCTDecode')) pipeline = sharp(raw)
  else if (filter.includes('FlateDecode')) {
    const flat = inflateSync(raw)
    if (flat.length !== w * h * 3) return false
    pipeline = sharp(flat, { raw: { width: w, height: h, channels: 3 } })
  } else return false
  const scale = Math.min(1, MAX_TEMPLATE_IMAGE_PX / Math.max(w, h))
  if (scale < 1) { w = Math.round(w * scale); h = Math.round(h * scale); pipeline = pipeline.resize(w, h) }
  const rgb = await pipeline.removeAlpha().toColourspace('srgb').raw().toBuffer()
  if (rgb.length !== w * h * 3) return false
  const dict = img.dict.clone(context)
  dict.set(PDFName.of('ColorSpace'), PDFName.of('DeviceCMYK'))
  dict.set(PDFName.of('Filter'), PDFName.of('FlateDecode'))
  dict.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8))
  dict.set(PDFName.of('Width'), PDFNumber.of(w))
  dict.set(PDFName.of('Height'), PDFNumber.of(h))
  dict.delete(PDFName.of('DecodeParms'))
  await resampleSoftMask(context, img.dict, w, h)
  const z = deflateSync(applyLut(rgb, lut))
  dict.set(PDFName.of('Length'), PDFNumber.of(z.length))
  context.assign(ref, PDFRawStream.of(dict, z))
  return true
}

// Keeps an image's soft mask at the same pixel size as the resampled image.
async function resampleSoftMask(context, imgDict, w, h) {
  const ref = imgDict.get(PDFName.of('SMask'))
  const sm = ref ? context.lookup(ref) : null
  if (!sm) return
  const sw = sm.dict.get(PDFName.of('Width')).asNumber()
  const sh = sm.dict.get(PDFName.of('Height')).asNumber()
  if (sw === w && sh === h) return
  const filter = String(sm.dict.get(PDFName.of('Filter')) ?? '')
  const raw = Buffer.from(sm.getContents ? sm.getContents() : sm.contents)
  let gray
  if (filter.includes('FlateDecode')) gray = await sharp(inflateSync(raw), { raw: { width: sw, height: sh, channels: 1 } }).resize(w, h).raw().toBuffer()
  else if (filter.includes('DCTDecode')) gray = await sharp(raw).resize(w, h).toColourspace('b-w').raw().toBuffer()
  else return
  const dict = sm.dict.clone(context)
  dict.set(PDFName.of('Width'), PDFNumber.of(w))
  dict.set(PDFName.of('Height'), PDFNumber.of(h))
  dict.set(PDFName.of('Filter'), PDFName.of('FlateDecode'))
  dict.delete(PDFName.of('DecodeParms'))
  const z = deflateSync(gray)
  dict.set(PDFName.of('Length'), PDFNumber.of(z.length))
  context.assign(ref, PDFRawStream.of(dict, z))
}

// ── L2: images ──────────────────────────────────────────────────────────────
const dataUrlBytes = url => Buffer.from(String(url).replace(/^data:image\/[a-z+]+;base64,/, ''), 'base64')

// `src` is the object's colour (PNG with alpha, or a JPEG); `alphaSrc` is an
// optional separate grayscale PNG mask. Photos arrive as JPEG + mask so the
// request stays under the 4.5 MB upload limit (a PNG photo alone can be 6 MB).
async function embedImage(doc, dataUrl, mode, lut, srgbRef, alphaUrl = null) {
  const { data, info } = await sharp(dataUrlBytes(dataUrl)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const n = info.width * info.height
  const rgb = Buffer.alloc(n * 3)
  const alpha = Buffer.alloc(n)
  let opaque = true
  const mask = alphaUrl
    ? await sharp(dataUrlBytes(alphaUrl)).resize(info.width, info.height, { fit: 'fill' }).toColourspace('b-w').extractChannel(0).raw().toBuffer()
    : null
  for (let p = 0; p < n; p++) {
    rgb[p * 3] = data[p * 4]; rgb[p * 3 + 1] = data[p * 4 + 1]; rgb[p * 3 + 2] = data[p * 4 + 2]
    alpha[p] = mask ? mask[p] : data[p * 4 + 3]
    if (alpha[p] !== 255) opaque = false
  }
  const ctx = doc.context
  const base = { Type: 'XObject', Subtype: 'Image', Width: info.width, Height: info.height, BitsPerComponent: 8 }
  let smaskRef
  if (!opaque) {
    smaskRef = ctx.register(ctx.flateStream(alpha, { ...base, ColorSpace: 'DeviceGray' }))
  }
  const samples = mode === 'cmyk' ? applyLut(rgb, lut) : rgb
  const dict = { ...base, ColorSpace: mode === 'cmyk' ? 'DeviceCMYK' : PDFArray.withContext(ctx) }
  if (mode !== 'cmyk') { dict.ColorSpace.push(PDFName.of('ICCBased')); dict.ColorSpace.push(srgbRef) }
  if (smaskRef) dict.SMask = smaskRef
  return { ref: ctx.register(ctx.flateStream(samples, dict)), width: info.width, height: info.height }
}

// ── L3: text ────────────────────────────────────────────────────────────────
function glyphRuns(fkFont, text) {
  const run = fkFont.layout(text)
  return run.glyphs.map((glyph, i) => ({ id: glyph.id, adv: glyph.advanceWidth, xAdv: run.positions[i].xAdvance }))
}

// ── Assemble ────────────────────────────────────────────────────────────────
export async function buildLayeredPdf({
  templatePdf, layout, mode, library, lut, iccProfile, profileMeta, fontsDir, srgbIcc,
  page: { PT_W, PT_H, BLEED_PT },
}) {
  const doc = await PDFDocument.load(templatePdf, { updateMetadata: false })
  doc.registerFontkit(fontkit)
  const ctx = doc.context
  const [page] = doc.getPages()
  for (let i = doc.getPageCount() - 1; i > 0; i--) doc.removePage(i)
  if (page.getRotation().angle % 360 !== 0) throw new Error('Template PDF page is rotated')

  // The template is placed onto the bleed box the same way the editor shows
  // its background: stretched per axis to fill it. Today's templates are
  // already exactly bleed-sized at the origin (identity); a template exported
  // at another size or with an offset MediaBox would otherwise print shifted.
  const mb = page.getMediaBox()
  const fit = [PT_W / mb.width, 0, 0, PT_H / mb.height, -mb.x * (PT_W / mb.width), -mb.y * (PT_H / mb.height)]
  const identity = Math.abs(fit[0] - 1) < 1e-4 && Math.abs(fit[3] - 1) < 1e-4 && Math.abs(fit[4]) < 1e-3 && Math.abs(fit[5]) < 1e-3

  // Page boxes exactly as the flat export (and InDesign): bleed media, A6 trim.
  page.setMediaBox(0, 0, PT_W, PT_H)
  page.setBleedBox(0, 0, PT_W, PT_H)
  const r3 = v => Math.round(v * 1000) / 1000
  page.setTrimBox(BLEED_PT, BLEED_PT, r3(PT_W - 2 * BLEED_PT), r3(PT_H - 2 * BLEED_PT))
  page.node.delete(PDFName.of('CropBox'))
  page.node.delete(PDFName.of('ArtBox'))

  // L1 - recolour
  const { map: mapColor, unverified } = makeColorMapper(library, lut)
  const stats = { ops: 0, images: [], shadings: 0, unconvertedShadings: 0, shadingSeen: new Set() }
  recolorTree(ctx, pageContentRefs(page), page.node.Resources(), mapColor, new Set(), new Set(), stats)
  for (let i = 0; i < stats.unconvertedShadings; i++) unverified.add(`shading-${i}`)
  if (mode === 'cmyk') for (const ref of stats.images) await convertImageToCmyk(ctx, ref, lut)

  // Shared sRGB profile for L2 images in 'print' mode.
  const srgbRef = ctx.register(ctx.flateStream(srgbIcc, { N: 3 }))

  // Canvas units -> PDF points (y up).
  const sx = (PT_W - 2 * BLEED_PT) / layout.canvasW
  const sy = (PT_H - 2 * BLEED_PT) / layout.canvasH
  const A = [sx, 0, 0, -sy, BLEED_PT, PT_H - BLEED_PT]
  const mul = (m, n) => [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ]

  const fontCache = new Map()
  async function font(file) {
    if (!fontCache.has(file)) {
      const bytes = readFileSync(join(fontsDir, file))
      const pdfFont = await doc.embedFont(bytes, { subset: false })
      fontCache.set(file, { pdfFont, fk: fontkit.create(bytes), name: null })
    }
    return fontCache.get(file)
  }

  const resources = page.node.Resources()
  const xobjects = resources.lookup(PDFName.of('XObject')) ?? (() => { const d = ctx.obj({}); resources.set(PDFName.of('XObject'), d); return d })()
  const fontsDict = resources.lookup(PDFName.of('Font')) ?? (() => { const d = ctx.obj({}); resources.set(PDFName.of('Font'), d); return d })()
  const extGStates = resources.lookup(PDFName.of('ExtGState')) ?? (() => { const d = ctx.obj({}); resources.set(PDFName.of('ExtGState'), d); return d })()
  let seq = 0
  const ops = []
  const usedFonts = new Set()
  const sourcePpi = []

  for (const item of layout.items) {
    if (item.type === 'image' && item.src) {
      const img = await embedImage(doc, item.src, mode, lut, srgbRef, item.alpha)
      const key = `WCIm${seq++}`
      xobjects.set(PDFName.of(key), img.ref)
      // Image space is the unit square, top row first: map it onto the
      // object's box in canvas units, then onto the page.
      const [x, y, w, h] = item.box
      if (item.sourceScale > 0) sourcePpi.push({ zoneId: item.zoneId, ppi: Math.round(72 / (item.sourceScale * Math.max(sx, sy))) })
      const m = mul(A, [w, 0, 0, -h, x, y + h])
      ops.push(`q ${m.map(num).join(' ')} cm /${key} Do Q`)
    } else if (item.type === 'text') {
      const { file, percentFile } = fontFileFor(item.fontFamily, item.fontWeight)
      const color = parseCssColor(item.fill)
      const { cmyk } = mapColor(color.r, color.g, color.b)
      // Colour alpha x object opacity -> a /ca graphics state, like the canvas.
      const alphaFill = Math.max(0, Math.min(1, color.a * (Number.isFinite(item.opacity) ? item.opacity : 1)))
      if (alphaFill === 0) continue
      let gsOp = ''
      if (alphaFill < 0.999) {
        const key = `WCGs${Math.round(alphaFill * 1000)}`
        if (!extGStates.get(PDFName.of(key))) extGStates.set(PDFName.of(key), ctx.obj({ Type: 'ExtGState', ca: alphaFill }))
        gsOp = `/${key} gs `
      }
      const tc = ((item.charSpacing || 0) / 1000) * item.fontSize
      for (const line of item.lines) {
        if (!line.text || !line.text.trim()) continue
        // Split into runs that share a face ('%' may come from another weight).
        const runs = []
        for (const ch of Array.from(line.text)) {
          const f = ch === '%' && percentFile ? percentFile : file
          if (runs.length && runs[runs.length - 1].file === f) runs[runs.length - 1].text += ch
          else runs.push({ file: f, text: ch })
        }
        const tm = mul(mul(A, item.matrix), [1, 0, 0, -1, line.x, line.y])
        let body = ''
        for (const run of runs) {
          const f = await font(run.file)
          if (!f.name) {
            f.name = `WCF${fontCache.size}`
            fontsDict.set(PDFName.of(f.name), f.pdfFont.ref)
          }
          usedFonts.add(f.pdfFont)
          f.pdfFont.encodeText(run.text)  // registers glyphs for widths/ToUnicode
          const glyphs = glyphRuns(f.fk, run.text)
          const upm = f.fk.unitsPerEm
          const parts = []
          for (const g of glyphs) {
            parts.push(`<${g.id.toString(16).padStart(4, '0')}>`)
            const kern = g.xAdv - g.adv
            if (kern) parts.push(num((-kern * 1000) / upm))
          }
          body += `/${f.name} ${num(item.fontSize)} Tf [${parts.join(' ')}] TJ `
        }
        ops.push(`q ${gsOp}${cmyk.map(num).join(' ')} k BT ${num(tc)} Tc ${tm.map(num).join(' ')} Tm ${body}ET Q`)
      }
    }
  }

  const overlay = ctx.flateStream(Buffer.from(ops.join('\n'), 'latin1'))
  const overlayRef = ctx.register(overlay)
  const existing = page.node.get(PDFName.of('Contents'))
  const contents = PDFArray.withContext(ctx)
  // Wrap the template content in q/Q so its graphics state can't leak.
  contents.push(ctx.register(ctx.flateStream(Buffer.from(identity ? 'q\n' : `q ${fit.map(num).join(' ')} cm\n`))))
  for (const ref of pageContentRefs(page)) contents.push(ref)
  contents.push(ctx.register(ctx.flateStream(Buffer.from('\nQ\n'))))
  contents.push(overlayRef)
  if (existing) page.node.set(PDFName.of('Contents'), contents)

  // Blend transparency in CMYK, like InDesign's PDF/X-4 export.
  page.node.set(PDFName.of('Group'), ctx.obj({ Type: 'Group', S: 'Transparency', CS: 'DeviceCMYK' }))

  // ── PDF/X-4 wrapper (same content as the flat export's buildPdfX4) ─────────
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  const pdfDate = `D:${now.replace(/[-:T]/g, '').replace('Z', '')}Z`
  const uuid = () => globalThis.crypto.randomUUID()
  const documentId = `uuid:${uuid()}`
  const instanceId = `uuid:${uuid()}`
  const iccRef = ctx.register(ctx.flateStream(iccProfile, { N: 4 }))
  const intent = ctx.obj({
    Type: 'OutputIntent', S: 'GTS_PDFX',
    OutputConditionIdentifier: PDFString.of(profileMeta.identifier),
    Info: PDFString.of(profileMeta.info.replace(/\\/g, '')),
    RegistryName: PDFString.of('http://www.color.org'),
    DestOutputProfile: iccRef,
  })
  doc.catalog.set(PDFName.of('OutputIntents'), ctx.obj([ctx.register(intent)]))
  const xmp = Buffer.from(
    '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>\n' +
    '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n' +
    '<rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/" xmlns:xmp="http://ns.adobe.com/xap/1.0/"' +
    ' xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/" xmlns:pdfx="http://ns.adobe.com/pdfx/1.3/"' +
    ' xmlns:pdfxid="http://www.npes.org/pdfx/ns/id/" xmlns:dc="http://purl.org/dc/elements/1.1/">\n' +
    '<pdf:Producer>WildCast</pdf:Producer><pdf:Trapped>False</pdf:Trapped><xmp:CreatorTool>WildCast</xmp:CreatorTool>\n' +
    `<xmp:CreateDate>${now}</xmp:CreateDate><xmp:ModifyDate>${now}</xmp:ModifyDate><xmp:MetadataDate>${now}</xmp:MetadataDate>\n` +
    `<xmpMM:DocumentID>${documentId}</xmpMM:DocumentID><xmpMM:InstanceID>${instanceId}</xmpMM:InstanceID>` +
    '<xmpMM:VersionID>1</xmpMM:VersionID><xmpMM:RenditionClass>default</xmpMM:RenditionClass>\n' +
    '<pdfxid:GTS_PDFXVersion>PDF/X-4</pdfxid:GTS_PDFXVersion><pdfx:GTS_PDFXVersion>PDF/X-4</pdfx:GTS_PDFXVersion>\n' +
    '<dc:format>application/pdf</dc:format><dc:title><rdf:Alt><rdf:li xml:lang="x-default">WildCast Flyer</rdf:li></rdf:Alt></dc:title>\n' +
    '</rdf:Description></rdf:RDF></x:xmpmeta>\n<?xpacket end="w"?>', 'utf8')
  // XMP must stay uncompressed for preflight tools.
  const meta = ctx.stream(xmp, { Type: 'Metadata', Subtype: 'XML' })
  doc.catalog.set(PDFName.of('Metadata'), ctx.register(meta))
  const info = ctx.obj({
    Title: PDFString.of('WildCast Flyer'), Creator: PDFString.of('WildCast'), Producer: PDFString.of('WildCast'),
    CreationDate: PDFString.of(pdfDate), ModDate: PDFString.of(pdfDate),
    Trapped: 'False', GTS_PDFXVersion: PDFString.of('PDF/X-4'),
  })
  ctx.trailerInfo.Info = ctx.register(info)
  const fileId = PDFHexString.of(documentId.slice(5).replace(/-/g, ''))
  ctx.trailerInfo.ID = ctx.obj([fileId, fileId])

  const bytes = Buffer.from(await doc.save({ useObjectStreams: false, updateFieldAppearances: false }))
  // pdf-lib always writes "%PDF-1.7"; PDF/X-4 is defined on PDF 1.6. Same
  // length, so no offset in the xref table moves.
  if (bytes.toString('latin1', 0, 8) === '%PDF-1.7') bytes.write('%PDF-1.6', 0, 'latin1')
  return {
    pdf: bytes,
    stats: { recoloredOps: stats.ops, templateImages: stats.images.length, items: layout.items.length, fonts: usedFonts.size },
    sourcePpi,
    unverifiedColorCount: unverified.size,
  }
}
