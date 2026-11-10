// Print preflight for a finished PDF - the checks from the acceptance list in
// the layered-export plan (Annika's developer brief, 2026-10-01):
//   PDF/X-4 + output intent, trim/bleed boxes, fonts embedded, no unmanaged
//   RGB, exact brand CMYK present, total ink <= 300%, photos >= 300 ppi.
// Used by api/export-cmyk.js on every export (result in X-Preflight) and by
// scripts/preflight-report.mjs on any PDF (WildCast, InDesign, a proof file).
//
// Component-ink check, not a full RIP/compositing simulation: vector CMYK
// values directly; CMYK images from their samples; RGB preview estimates
// through the selected profile's Relative Colorimetric + BPC table. Strict
// checks inspect every pixel, ignoring only fully transparent ones; preview
// estimates ignore alpha <50%. Image ppi comes from drawn size, not metadata.
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
    if (kind === 'Indexed') {
      const base = colorSpaceInfo(context, v.get(1))
      return { kind: `Indexed/${base.kind}`, n: base.n }
    }
    if (kind === 'ICCBased') return { kind, n: context.lookup(v.get(1))?.dict?.get(PDFName.of('N'))?.asNumber?.() ?? 0 }
    return { kind, n: 0 }
  }
  return { kind: 'unknown', n: 0 }
}

async function imageInk(context, img, lut, fullResolution = false) {
  const cs = colorSpaceInfo(context, img.dict.get(PDFName.of('ColorSpace')))
  const w = img.dict.get(PDFName.of('Width')).asNumber()
  const h = img.dict.get(PDFName.of('Height')).asNumber()
  const dec = decodeStream(img)
  if (!dec || (cs.n !== 3 && cs.n !== 4) || cs.kind.startsWith('Indexed/')) return null
  if (img.dict.get(PDFName.of('BitsPerComponent'))?.asNumber?.() !== 8 ||
      img.dict.has(PDFName.of('Decode')) || img.dict.has(PDFName.of('DecodeParms'))) return null
  // A sampled preview cannot prove an ink limit: strict print checks inspect
  // every pixel, including isolated dark marks that downsampling could miss.
  const scale = fullResolution ? 1 : Math.min(1, 600 / Math.max(w, h))
  const tw = Math.max(1, Math.round(w * scale)), th = Math.max(1, Math.round(h * scale))
  let samples
  try {
    const input = dec.dct ? sharp(dec.bytes) : sharp(dec.bytes, { raw: { width: w, height: h, channels: cs.n } })
    let p = input.resize(tw, th, { kernel: 'nearest' })
    if (cs.n === 4 && dec.dct) p = p.toColourspace('cmyk')
    samples = await p.raw().toBuffer()
  } catch { return null }
  const ch = samples.length / (tw * th)
  if (ch !== cs.n) return null
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
    if (alpha && alpha[p] < (fullResolution ? 1 : 128)) continue
    const s = cmyk[p * 4] + cmyk[p * 4 + 1] + cmyk[p * 4 + 2] + cmyk[p * 4 + 3]
    if (s > max) max = s
  }
  return (max / 255) * 100
}

export async function preflightPdf(bytes, { lut, inkLimit = 300, minPpi = 300, brandOps = ['0.75 0 0.1 0'], requireCmyk = false, expectedIcc } = {}) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false })
  const ctx = doc.context
  const page = doc.getPages()[0]
  const state = { vectorInkMax: 0, rgbOps: 0, cmykOps: new Set(), textShows: 0, images: [], fonts: new Map(), deviceRgb: 0, nonCmyk: 0, uncheckedContent: 0 }
  const activeForms = new Set()
  const activeGlyphFonts = new Set()

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

  function walk(content, resources, ctm, inherited = {}) {
    noteFonts(resources)
    const noteColor = cs => {
      const info = colorSpaceInfo(ctx, cs)
      if (info.n !== 1 && info.n !== 4) state.nonCmyk++
    }
    const xobjects = resources?.lookup?.(PDFName.of('XObject'))
    const tokens = tokenize(content)
    const stack = []
    let m = ctm
    let fillCS = inherited.fillCS ?? PDFName.of('DeviceGray')
    let strokeCS = inherited.strokeCS ?? PDFName.of('DeviceGray')
    let textMode = inherited.textMode ?? 0
    let textFont = inherited.textFont ?? null
    let operands = []
    for (const t of tokens) {
      if (t.t !== 'op') { operands.push(t); continue }
      const nums = operands.map(o => Number(o.v))
      switch (t.v) {
        case 'q': stack.push({ m, fillCS, strokeCS, textMode, textFont }); break
        case 'Q': {
          const saved = stack.pop()
          if (saved) { m = saved.m; fillCS = saved.fillCS; strokeCS = saved.strokeCS; textMode = saved.textMode; textFont = saved.textFont }
          break
        }
        case 'cm': if (nums.length === 6) m = mul(m, nums); break
        case 'k': case 'K':
          if (t.v === 'k') fillCS = PDFName.of('DeviceCMYK'); else strokeCS = PDFName.of('DeviceCMYK')
          if (nums.length === 4) {
            state.vectorInkMax = Math.max(state.vectorInkMax, nums.reduce((a, b) => a + b, 0) * 100)
            state.cmykOps.add(nums.map(v => +v.toFixed(4)).join(' '))
          }
          break
        case 'rg': case 'RG':
          state.rgbOps++
          if (t.v === 'rg') fillCS = PDFName.of('DeviceRGB'); else strokeCS = PDFName.of('DeviceRGB')
          break
        case 'g': fillCS = PDFName.of('DeviceGray'); break
        case 'G': strokeCS = PDFName.of('DeviceGray'); break
        case 'cs': case 'CS': {
          const name = PDFName.of(String(operands[0]?.v ?? '').slice(1))
          const cs = resources?.lookup?.(PDFName.of('ColorSpace'))?.get?.(name) ?? name
          if (t.v === 'cs') fillCS = cs; else strokeCS = cs
          break
        }
        case 'sh': {
          const name = PDFName.of(String(operands[0]?.v ?? '').slice(1))
          const shading = resources?.lookup?.(PDFName.of('Shading'))?.lookup?.(name)
          noteColor(shading?.get?.(PDFName.of('ColorSpace')))
          break
        }
        case 'Tf': {
          const name = PDFName.of(String(operands[0]?.v ?? '').slice(1))
          textFont = resources?.lookup?.(PDFName.of('Font'))?.lookup?.(name)
          break
        }
        case 'Tr': textMode = nums[0]; break
        case 'f': case 'F': case 'f*': noteColor(fillCS); break
        case 'S': case 's': noteColor(strokeCS); break
        case 'B': case 'B*': case 'b': case 'b*': noteColor(fillCS); noteColor(strokeCS); break
        case 'Tj': case 'TJ': case "'": case '"':
          state.textShows++
          if (textMode === 3 || textMode === 7) break
          if (String(textFont?.get?.(PDFName.of('Subtype'))) === '/Type3') {
            // Type3 can contain only width metadata (invisible accessibility
            // text), or paint its own glyph colours. Inspect its procedures
            // rather than assuming the inherited text colour is painted.
            if (activeGlyphFonts.has(textFont)) { state.uncheckedContent++; break }
            activeGlyphFonts.add(textFont)
            const procedures = textFont.lookup(PDFName.of('CharProcs'))
            if (!(procedures instanceof PDFDict)) state.uncheckedContent++
            else for (const [, ref] of procedures.entries()) {
              const glyph = ctx.lookup(ref)
              const data = glyph instanceof PDFRawStream ? decodeStream(glyph) : null
              if (data && !data.dct) walk(data.bytes.toString('latin1'), textFont.lookup(PDFName.of('Resources')) ?? resources, m, { fillCS, strokeCS, textMode, textFont })
              else state.uncheckedContent++
            }
            activeGlyphFonts.delete(textFont)
            break
          }
          if (!(textFont instanceof PDFDict)) state.uncheckedContent++
          if ([0, 2, 4, 6].includes(textMode)) noteColor(fillCS)
          if ([1, 2, 5, 6].includes(textMode)) noteColor(strokeCS)
          break
        case 'Do': {
          const name = operands[0]?.v?.slice(1)
          const ref = xobjects instanceof PDFDict ? xobjects.get(PDFName.of(name)) : null
          const obj = ref ? ctx.lookup(ref) : null
          const sub = String(obj?.dict?.get(PDFName.of('Subtype')) ?? '')
          if (sub === '/Form' && !activeForms.has(ref)) {
            activeForms.add(ref)
            const fm = obj.dict.lookup(PDFName.of('Matrix'))
            const fmat = fm instanceof PDFArray ? fm.asArray().map(v => v.asNumber()) : [1, 0, 0, 1, 0, 0]
            const dec = decodeStream(obj)
            if (dec && !dec.dct) walk(dec.bytes.toString('latin1'), obj.dict.lookup(PDFName.of('Resources')) ?? resources, mul(m, fmat), { fillCS, strokeCS, textMode, textFont })
            else state.uncheckedContent++
            activeForms.delete(ref)
          } else if (sub === '/Form') {
            state.uncheckedContent++
          } else if (sub === '/Image' && !obj.dict.get(PDFName.of('ImageMask'))?.asBoolean?.()) {
            const w = obj.dict.get(PDFName.of('Width')).asNumber()
            const h = obj.dict.get(PDFName.of('Height')).asNumber()
            const ptW = Math.hypot(m[0], m[1]), ptH = Math.hypot(m[2], m[3])
            const cs = colorSpaceInfo(ctx, obj.dict.get(PDFName.of('ColorSpace')))
            if (cs.kind === 'DeviceRGB') state.deviceRgb++
            if (cs.n !== 1 && cs.n !== 4) state.nonCmyk++
            state.images.push({ ref, name, w, h, ppi: Math.min(w / (ptW / 72), h / (ptH / 72)), widthMm: (ptW / 72) * 25.4, colorSpace: cs.kind + (cs.kind === 'ICCBased' ? `/${cs.n}` : ''), softMask: obj.dict.has(PDFName.of('SMask')) })
          } else if (sub === '/Image') {
            noteColor(fillCS) // An image mask is painted in the active fill colour.
          } else state.uncheckedContent++
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
    for (const st of arr) {
      const d = st && decodeStream(st)
      if (d && !d.dct) content += d.bytes.toString('latin1') + '\n'
      else state.uncheckedContent++
    }
  }
  walk(content, page.node.Resources(), [1, 0, 0, 1, 0, 0])

  // Colour-space resources declared as DeviceRGB anywhere count as unmanaged.
  for (const [, obj] of ctx.enumerateIndirectObjects()) {
    if (obj instanceof PDFDict && obj.get(PDFName.of('ColorSpace')) instanceof PDFName && String(obj.get(PDFName.of('ColorSpace'))) === '/DeviceRGB' && !(obj instanceof PDFRawStream)) state.deviceRgb++
  }

  let imageInkMax = 0
  let unmeasuredInk = 0
  const uniqueImages = [...new Map(state.images.map(i => [String(i.ref), i])).values()]
  for (const img of uniqueImages) {
    img.inkMax = lut ? await imageInk(ctx, ctx.lookup(img.ref), lut, requireCmyk) : null
    if (img.inkMax != null) imageInkMax = Math.max(imageInkMax, img.inkMax)
    else if (img.colorSpace !== 'DeviceGray' && img.colorSpace !== 'ICCBased/1') unmeasuredInk++
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
  if (expectedIcc) {
    const profile = intent?.lookup?.(PDFName.of('DestOutputProfile'))
    const decoded = profile instanceof PDFRawStream ? decodeStream(profile) : null
    add('profile', 'Selected output ICC profile', Boolean(decoded && Buffer.from(decoded.bytes).equals(Buffer.from(expectedIcc))),
      'Embedded output profile must match the selected profile byte-for-byte')
  }
  add('content', 'Page content can be checked', state.uncheckedContent === 0, `${state.uncheckedContent} unsupported content stream(s)`)
  add('boxes', 'Trim and bleed boxes set', page.node.has(PDFName.of('TrimBox')) && page.node.has(PDFName.of('BleedBox')) &&
    trim.width > 0 && trim.height > 0 && bleed.x <= trim.x && bleed.y <= trim.y &&
    bleed.x + bleed.width >= trim.x + trim.width && bleed.y + bleed.height >= trim.y + trim.height,
    `media ${media.width.toFixed(1)}x${media.height.toFixed(1)} pt, trim ${(trim.width / 72 * 25.4).toFixed(1)}x${(trim.height / 72 * 25.4).toFixed(1)} mm`)
  add('fonts', 'All fonts embedded', fonts.every(f => f.embedded),
    fonts.length ? fonts.map(f => `${f.name.replace(/^\/[A-Z]{6}\+/, '/')} ${f.embedded ? 'embedded' : 'NOT embedded'}`).join(', ') : 'no fonts (text is outlined or raster)')
  add('livetext', 'Live (selectable) text present', state.textShows > 0, `${state.textShows} text runs`, 'warn')
  add('rgb', 'No unmanaged RGB', state.deviceRgb === 0 && state.rgbOps === 0,
    `${state.deviceRgb} DeviceRGB object(s), ${state.rgbOps} RGB colour operator(s)`)
  if (requireCmyk) add('cmyk', 'CMYK-only colour content', state.nonCmyk === 0,
    `${state.nonCmyk} painted RGB, spot or unverified colour space(s); ${state.rgbOps} RGB declarations`)
  add('brand', 'Brand colours as exact CMYK', brandOps.every(op => state.cmykOps.has(op)),
    brandOps.map(op => `${op} k ${state.cmykOps.has(op) ? 'found' : 'missing'}`).join(', '), 'warn')
  add('ink', `Total ink <= ${inkLimit}%`, inkMax <= inkLimit && (!requireCmyk || unmeasuredInk === 0),
    `max ${inkMax.toFixed(0)}% (vector ${state.vectorInkMax.toFixed(0)}%, images ${imageInkMax.toFixed(0)}%); ${unmeasuredInk} image(s) not measured`, 'warn')
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
