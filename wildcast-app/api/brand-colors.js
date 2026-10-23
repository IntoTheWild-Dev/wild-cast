// Print colours setting (agency only). One small table per brand of screen
// HEX -> exact print CMYK, the same thing as an InDesign swatch. The export
// paints any exact HEX match with the stored CMYK (api/_lib/brandColors.js).
//   GET  /api/brand-colors?brand=wolt          -> { colors, defaults, updatedAt, updatedBy }
//   POST /api/brand-colors { action:'convert', hex | rgb | cmyk } -> { hex, rgb, cmyk }
//   POST /api/brand-colors { action:'save', brand, colors }       -> saved record
// Convert links the HEX / RGB / CMYK fields through PSO Coated v3 (see
// api/_lib/colorConvert.js); the UI only applies it to unlocked fields.
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { requireAgency } from './_lib/auth.js'
import { loadBrandSettings, saveBrandSettings } from './_lib/brandColors.js'
import { loadLut } from './_lib/cmykLut.js'
import { loadReverseLut, convertColor } from './_lib/colorConvert.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ICC = join(__dirname, 'icc')

export default async function handler(req, res) {
  const who = await requireAgency(req, res)
  if (!who) return
  res.setHeader('Cache-Control', 'no-store')

  try {
    if (req.method === 'GET') {
      return res.status(200).json(await loadBrandSettings(req.query.brand || 'wolt'))
    }
    if (req.method !== 'POST') return res.status(405).end()

    const { action } = req.body ?? {}
    if (action === 'convert') {
      const { hex, rgb, cmyk } = req.body
      return res.status(200).json(convertColor({ hex, rgb, cmyk }, {
        lut: loadLut(join(ICC, 'PSOcoated_v3.relcol-bpc.lut')),
        reverseLut: loadReverseLut(join(ICC, 'PSOcoated_v3.cmyk-to-srgb.lut')),
      }))
    }
    if (action === 'save') {
      return res.status(200).json(await saveBrandSettings(req.body.brand || 'wolt', req.body.colors, who))
    }
    return res.status(400).json({ error: 'Unknown action' })
  } catch (err) {
    // Validation messages are written for people (see validateLibrary).
    return res.status(400).json({ error: err.message })
  }
}
