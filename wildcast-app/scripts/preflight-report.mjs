// Print preflight report for any PDF (WildCast export, InDesign export, proof):
//   node scripts/preflight-report.mjs <file.pdf> [more.pdf ...] [--json]
// Same checks as the export runs (api/_lib/preflight.js): PDF/X-4 + intent,
// boxes, fonts embedded, live text, no unmanaged RGB, Wolt Blue as exact
// CMYK, total ink <= 300%, images >= 300 ppi at print size.
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { preflightPdf } from '../api/_lib/preflight.js'
import { loadLut } from '../api/_lib/cmykLut.js'

const args = process.argv.slice(2)
const json = args.includes('--json')
const files = args.filter(a => a !== '--json')
if (!files.length) {
  console.error('Usage: node scripts/preflight-report.mjs <file.pdf> [...] [--json]')
  process.exit(2)
}
const lut = loadLut(new URL('../api/icc/PSOcoated_v3.relcol-bpc.lut', import.meta.url))
const mark = { pass: 'PASS', warn: 'WARN', fail: 'FAIL' }
for (const file of files) {
  const r = await preflightPdf(readFileSync(file), { lut })
  if (json) { console.log(JSON.stringify({ file, ...r }, null, 2)); continue }
  console.log(`\n${basename(file)}  ->  ${r.ok ? 'all checks pass' : 'see below'}`)
  for (const c of r.checks) console.log(`  ${mark[c.status]}  ${c.label.padEnd(36)} ${c.detail}`)
}
