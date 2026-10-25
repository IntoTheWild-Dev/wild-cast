// Print colours module API (agency only). See api/_lib/printColors/README.md.
//   GET  ?brand=wolt                                   -> settings + code snippet
//   POST { action:'convert', hex | rgb | cmyk }         -> { hex, rgb, cmyk }
//   POST { action:'save', brand, colors, printers, defaultPrinter } -> settings
//   POST { action:'grid', cmyk }                        -> calibration patches
//   POST { action:'sheet', label, hex, cmyk }           -> calibration sheet PDF
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadLut } from './_lib/cmykLut.js'
import { isEnabled, requireAgency, clearCache } from './_lib/printColors/index.js'
import { loadSettings, saveSettings, codeSnippet, STANDARD_PRINTER } from './_lib/printColors/store.js'
import { loadReverseLut, convertColor } from './_lib/printColors/convert.js'
import { calibrationGrid, calibrationSheetPdf } from './_lib/printColors/calibration.js'

const ICC = join(dirname(fileURLToPath(import.meta.url)), 'icc')
const luts = () => ({
  lut: loadLut(join(ICC, 'PSOcoated_v3.relcol-bpc.lut')),
  reverseLut: loadReverseLut(join(ICC, 'PSOcoated_v3.cmyk-to-srgb.lut')),
})
const cleanCmyk = raw => convertColor({ cmyk: raw }, luts()).cmyk
const withExtras = s => ({ ...s, standardPrinter: STANDARD_PRINTER, snippet: codeSnippet(s.brand, s.colors) })

export default async function handler(req, res) {
  if (!isEnabled()) return res.status(404).json({ error: 'Print colours is switched off.' })
  const who = await requireAgency(req, res)
  if (!who) return
  res.setHeader('Cache-Control', 'no-store')

  try {
    if (req.method === 'GET') return res.status(200).json(withExtras(await loadSettings(req.query.brand || 'wolt')))
    if (req.method !== 'POST') return res.status(405).end()

    const body = req.body ?? {}
    switch (body.action) {
      case 'convert':
        return res.status(200).json(convertColor({ hex: body.hex, rgb: body.rgb, cmyk: body.cmyk }, luts()))
      case 'save': {
        const saved = await saveSettings(body.brand || 'wolt', body, who)
        clearCache(saved.brand)
        return res.status(200).json(withExtras(saved))
      }
      case 'grid':
        return res.status(200).json(calibrationGrid(cleanCmyk(body.cmyk)))
      case 'sheet': {
        const pdf = await calibrationSheetPdf({
          label: String(body.label || 'Colour').slice(0, 40), hex: String(body.hex || ''), cmyk: cleanCmyk(body.cmyk),
          iccProfile: readFileSync(join(ICC, 'PSOcoated_v3.icc')),
        })
        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader('Content-Disposition', 'attachment; filename="calibration-sheet.pdf"')
        return res.status(200).send(pdf)
      }
      default:
        return res.status(400).json({ error: 'Unknown action' })
    }
  } catch (err) {
    // Validation messages are written for people (see store.js).
    return res.status(err.code === 'conflict' ? 409 : 400).json({ error: err.message })
  }
}
