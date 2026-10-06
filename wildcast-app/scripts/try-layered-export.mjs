// Manual harness for the layered export: node scripts/try-layered-export.mjs <template-bg.pdf> <layout.json> <outDir>
// layout.json = what TemplateCanvas.getLayoutSnapshot() returns (canvasW, canvasH, items).
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildLayeredPdf } from '../api/_lib/layeredPdf.js'
import { loadLut } from '../api/_lib/cmykLut.js'
import { getBrandLibrary } from '../api/_lib/brandColors.js'

const [templatePath, layoutPath, outDir = '.'] = process.argv.slice(2)
const layout = JSON.parse(readFileSync(layoutPath, 'utf8'))
for (const mode of ['print', 'cmyk']) {
  const t = Date.now()
  const r = await buildLayeredPdf({
    templatePdf: readFileSync(templatePath), layout, mode,
    library: getBrandLibrary('wolt'),
    lut: loadLut(new URL('../api/icc/PSOcoated_v3.relcol-bpc.lut', import.meta.url)),
    iccProfile: readFileSync(new URL('../api/icc/PSOcoated_v3.icc', import.meta.url)),
    profileMeta: { identifier: 'FOGRA51', info: 'PSO Coated v3 FOGRA51 (ISO 12647-2:2013)' },
    fontsDir: fileURLToPath(new URL('../public/fonts/wolt', import.meta.url)),
    srgbIcc: readFileSync(new URL('../api/icc/sRGB_IEC61966-2-1.icc', import.meta.url)),
    page: { PT_W: 314.646, PT_H: 436.535, BLEED_PT: 8.504 },
  })
  writeFileSync(join(outDir, `layered-${mode}.pdf`), r.pdf)
  console.log(mode, `${(r.pdf.length / 1e6).toFixed(2)} MB`, `${Date.now() - t} ms`, JSON.stringify(r.stats), 'unverified colours:', r.unverifiedColorCount)
}
