// Print preflight for a finished PDF - the checks from the acceptance list in
// the layered-export plan (Annika's developer brief, 2026-10-01):
//   PDF/X-4 + output intent, trim/bleed boxes, fonts embedded, no unmanaged
//   RGB, exact brand CMYK present, total ink <= 300%, photos >= 300 ppi.
// Used by api/export-cmyk.js on every export (result in X-Preflight) and by
// scripts/preflight-report.mjs on any PDF (WildCast, InDesign, a proof file).
//
// Ink is measured on what will print: vector CMYK operators directly; CMYK
// images from their samples; sRGB-tagged images through the same Relative
// Colorimetric + BPC table a RIP uses for PSO Coated v3. Transparent pixels
// (soft mask < 50%) are ignored. Image resolution comes from the image's
// size on the page (the CTM where it is drawn), not from its pixel count.
import { Buffer } from 'node:buffer'
import { inflateSync } from 'zlib'
import sharp from 'sharp'
import { PDFDocument, PDFName, PDFArray, PDFDict, PDFRef, PDFRawStream } from 'pdf-lib'
import { applyLut } from './cmykLut.js'
import { tokenize } from './layeredPdf.js'

const mul = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
]

function decodeStream(stream) {
  const raw = Buffer.from(stream.getContents ? stream.getContents() : stream.contents)
  const filter = stream.dict.get(PDFName.of('Filter'))
  const f = !filter ? [] : filter instanceof PDFArray ? filter.asArray().map(String) : [String(filter)]
  if (!f.length) return { bytes: raw, dct: false }
  if (f.length === 1 && f[0] === '/FlateDecode') return { bytes: inflateSync(raw), dct: false }
  if (f.length === 1 && f[0] === '/DCTDecode') return { bytes: raw, dct: true }
  return null
}

function colorSpaceInfo(context, cs) {
  const v = context.lookup(cs)
  if (v instanceof PDFName) return { kind: String(v).slice(1), n: { DeviceRGB: 3, DeviceCMYK: 4, DeviceGray: 1 }[String(v).slice(1)] ?? 0 }
  if (v instanceof PDFArray) {
    const kind = String(v.get(0)).slice(1)
    if (kind === 'ICCBased') return { kind, n: context.lookup(v.get(1))?.dict?.get(PDFName.of('N'))?.asNumber?.() ?? 0 }
    return { kind, n: 0 }
  }
  return { kind: 'unknown', n: 0 }
}

async function imageInk(context, img, lut) {
  const cs = colorSpaceInfo(context, img.dict.get(PDFName.of('ColorSpace')))
  const w = img.dict.get(PDFName.of('Width')).asNumber()
  const h = img.dict.get(PDFName.of('Height')).asNumber()
  const dec = decodeStream(img)
  if (!dec || (cs.n !== 3 && cs.n !== 4)) return null
  const scale = Math.min(1, 600 / Math.max(w, h))
  const tw = Math.max(1, Math.round(w * scale)), th = Math.max(1, Math.round(h * scale))
  let samples
  try {
    const input = dec.dct ? sharp(dec.bytes) : sharp(dec.bytes, { raw: { width: w, height: h, channels: cs.n } })
    let p = input.resize(tw, th, { kernel: 'nearest' })
    if (cs.n === 4 && dec.dct) p = p.toColourspace('cmyk')
    samples = await p.raw().toBuffer()
  } catch { return null }
  const ch = samples.length / (tw * th)
  let alpha = null
  const smRef = img.dict.get(PDFName.of('SMask'))
  const sm = smRef ? context.lookup(smRef) : null
  if (sm) {
    const sd = decodeStream(sm)
    const sw = sm.dict.get(PDFName.of('Width')).asNumber(), sh = sm.dict.get(PDFName.of('Height')).asNumber()
    if (sd) {
      try {
        alpha = await (sd.dct ? sharp(sd.bytes) : sharp(sd.bytes, { raw: { width: sw, height: sh, channels: 1 } }))
          .resize(tw, th, { kernel: 'nearest' }).toColourspace('b-w').raw().toBuffer()
      } catch { alpha = null }
    }
  }
  let cmyk = samples
  if (cs.n === 3 || ch === 3) {
    const rgb = ch === 3 ? samples : Buffer.from(samples.filter((_, i) => i % ch < 3))
    cmyk = applyLut(rgb, lut)
  }
  let max = 0
  for (let p = 0; p < tw * th; p++) {
    if (alpha && alpha[p] < 128) continue
    const s = cmyk[p * 4] + cmyk[p * 4 + 1] + cmyk[p * 4 + 2] + cmyk[p * 4 + 3]
    if (s > max) max = s
  }
  return (max / 255) * 100
}

export async function preflightPdf(bytes, { lut, inkLimit = 300, minPpi = 300, brandOps = ['0.75 0 0.1 0'] } = {}) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false })
  const ctx = doc.context
  const page = doc.getPages()[0]
  const state = { vectorInkMax: 0, rgbOps: 0, cmykOps: new Set(), textShows: 0, images: [], fonts: new Map(), deviceRgb: 0 }
  const seenForms = new Set()

  function noteFonts(resources) {
    const fonts = resources?.lookup?.(PDFName.of('Font'))
    if (!(fonts instanceof PDFDict)) return
    for (const [, ref] of fonts.entries()) {
      const f = ctx.lookup(ref)
      if (!(f instanceof PDFDict)) continue
      const sub = String(f.get(PDFName.of('Subtype')))
      const name = String(f.get(PDFName.of('BaseFont')) ?? sub)
      let embedded = sub === '/Type3'
      const desc = sub === '/Type0'
        ? ctx.lookup(ctx.lookup(f.get(PDFName.of('DescendantFonts')))?.get(0))?.lookup?.(PDFName.of('FontDescriptor'))
        : f.lookup(PDFName.of('FontDescriptor'))
      // Type3 glyphs are drawn by procedures inside the PDF itself: always embedded.
      if (sub !== '/Type3' && desc instanceof PDFDict) embedded = ['FontFile', 'FontFile2', 'FontFile3'].some(k => desc.has(PDFName.of(k)))
      state.fonts.set(name, { subtype: sub.slice(1), embedded })
    }
  }

  function walk(content, resources, ctm) {
    noteFonts(resources)
    const xobjects = resources?.lookup?.(PDFName.of('XObject'))
    const tokens = tokenize(content)
    const stack = []
    let m = ctm
    let operands = []
    for (const t of tokens) {
      if (t.t !== 'op') { operands.push(t); continue }
      const nums = operands.map(o => Number(o.v))
      switch (t.v) {
        case 'q': stack.push(m); break
        case 'Q': m = stack.pop() ?? ctm; break
        case 'cm': if (nums.length === 6) m = mul(m, nums); break
        case 'k': case 'K':
          if (nums.length === 4) {
            state.vectorInkMax = Math.max(state.vectorInkMax, nums.reduce((a, b) => a + b, 0) * 100)
            state.cmykOps.add(nums.map(v => +v.toFixed(4)).join(' '))
          }
          break
        case 'rg': case 'RG': state.rgbOps++; break
        case 'Tj': case 'TJ': case "'": case '"': state.textShows++; break
        case 'Do': {
          const name = operands[0]?.v?.slice(1)
          const ref = xobjects instanceof PDFDict ? xobjects.get(PDFName.of(name)) : null
          const obj = ref ? ctx.lookup(ref) : null
          const sub = String(obj?.dict?.get(PDFName.of('Subtype')) ?? '')
          if (sub === '/Form' && !seenForms.has(ref)) {
            seenForms.add(ref)
            const fm = obj.dict.lookup(PDFName.of('Matrix'))
            const fmat = fm instanceof PDFArray ? fm.asArray().map(v => v.asNumber()) : [1, 0, 0, 1, 0, 0]
            const dec = decodeStream(obj)
            if (dec && !dec.dct) walk(dec.bytes.toString('latin1'), obj.dict.lookup(PDFName.of('Resources')), mul(m, fmat))
          } else if (sub === '/Image' && !obj.dict.get(PDFName.of('ImageMask'))?.asBoolean?.()) {
            const w = obj.dict.get(PDFName.of('Width')).asNumber()
            const h = obj.dict.get(PDFName.of('Height')).asNumber()
            const ptW = Math.hypot(m[0], m[1]), ptH = Math.hypot(m[2], m[3])
            const cs = colorSpaceInfo(ctx, obj.dict.get(PDFName.of('ColorSpace')))
            if (cs.kind === 'DeviceRGB') state.deviceRgb++
            state.images.push({ ref, name, w, h, ppi: Math.min(w / (ptW / 72), h / (ptH / 72)), widthMm: (ptW / 72) * 25.4, colorSpace: cs.kind + (cs.kind === 'ICCBased' ? `/${cs.n}` : ''), softMask: obj.dict.has(PDFName.of('SMask')) })
          }
          break
        }
      }
      operands = []
    }
  }

  const contents = page.node.get(PDFName.of('Contents'))
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents]
  let content = ''
  for (const r of refs) {
    const s = ctx.lookup(r instanceof PDFRef ? r : r)
    const arr = s instanceof PDFArray ? s.asArray().map(x => ctx.lookup(x)) : [s]
    for (const st of arr) { const d = st && decodeStream(st); if (d) content += d.bytes.toString('latin1') + '\n' }
  }
  walk(content, page.node.Resources(), [1, 0, 0, 1, 0, 0])

  // Colour-space resources declared as DeviceRGB anywhere count as unmanaged.
  for (const [, obj] of ctx.enumerateIndirectObjects()) {
    if (obj instanceof PDFDict && obj.get(PDFName.of('ColorSpace')) instanceof PDFName && String(obj.get(PDFName.of('ColorSpace'))) === '/DeviceRGB' && !(obj instanceof PDFRawStream)) state.deviceRgb++
  }

  let imageInkMax = 0
  const uniqueImages = [...new Map(state.images.map(i => [String(i.ref), i])).values()]
  for (const img of uniqueImages) {
    img.inkMax = lut ? await imageInk(ctx, ctx.lookup(img.ref), lut) : null
    if (img.inkMax != null) imageInkMax = Math.max(imageInkMax, img.inkMax)
  }

  const header = Buffer.from(bytes).toString('latin1', 0, 8)
  const intent = doc.catalog.lookup(PDFName.of('OutputIntents'))?.lookup?.(0)
  const xmpStream = doc.catalog.lookup(PDFName.of('Metadata'))
  const xmp = xmpStream ? Buffer.from(xmpStream.getContents()).toString('utf8') : ''
  const trim = page.getTrimBox(), bleed = page.getBleedBox(), media = page.getMediaBox()
  const fonts = [...state.fonts.entries()].map(([name, f]) => ({ name, ...f }))
  const lowRes = state.images.filter(i => i.ppi < minPpi - 0.5)
  const inkMax = Math.max(state.vectorInkMax, imageInkMax)

  const checks = []
  const add = (id, label, ok, detail, level = 'fail') => checks.push({ id, label, status: ok ? 'pass' : level, detail })
  add('pdfx', 'PDF/X-4 with an output intent', /PDF\/X-4/.test(xmp) && Boolean(intent),
    `${header.trim()}, intent ${intent?.get(PDFName.of('OutputConditionIdentifier'))?.decodeText?.() ?? 'missing'}`)
  add('boxes', 'Trim and bleed boxes set', trim.width > 0 && bleed.width >= trim.width,
    `media ${media.width.toFixed(1)}x${media.height.toFixed(1)} pt, trim ${(trim.width / 72 * 25.4).toFixed(1)}x${(trim.height / 72 * 25.4).toFixed(1)} mm`)
  add('fonts', 'All fonts embedded', fonts.every(f => f.embedded),
    fonts.length ? fonts.map(f => `${f.name.replace(/^\/[A-Z]{6}\+/, '/')} ${f.embedded ? 'embedded' : 'NOT embedded'}`).join(', ') : 'no fonts (text is outlined or raster)')
  add('livetext', 'Live (selectable) text present', state.textShows > 0, `${state.textShows} text runs`, 'warn')
  add('rgb', 'No unmanaged RGB', state.deviceRgb === 0 && state.rgbOps === 0,
    `${state.deviceRgb} DeviceRGB object(s), ${state.rgbOps} RGB colour operator(s)`)
  add('brand', 'Brand colours as exact CMYK', brandOps.every(op => state.cmykOps.has(op)),
    brandOps.map(op => `${op} k ${state.cmykOps.has(op) ? 'found' : 'missing'}`).join(', '), 'warn')
  add('ink', `Total ink <= ${inkLimit}%`, inkMax <= inkLimit + 0.5,
    `max ${inkMax.toFixed(0)}% (vector ${state.vectorInkMax.toFixed(0)}%, images ${imageInkMax.toFixed(0)}%)`, 'warn')
  add('ppi', `Images >= ${minPpi} ppi at print size`, lowRes.length === 0,
    state.images.length ? state.images.map(i => `${i.w}x${i.h}px at ${i.widthMm.toFixed(0)} mm = ${Math.round(i.ppi)} ppi`).join('; ') : 'no images', 'warn')

  return {
    ok: checks.every(c => c.status === 'pass'),
    checks,
    inkMax: Math.round(inkMax),
    lowResImages: lowRes.map(i => ({ name: i.name, ppi: Math.round(i.ppi) })),
    images: uniqueImages.map(img => ({ name: img.name, w: img.w, h: img.h, widthMm: img.widthMm, colorSpace: img.colorSpace, softMask: img.softMask, ppi: Math.round(img.ppi), inkMax: img.inkMax == null ? null : Math.round(img.inkMax) })),
    fonts,
  }
}
