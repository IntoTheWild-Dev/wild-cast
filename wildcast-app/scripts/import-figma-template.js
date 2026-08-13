#!/usr/bin/env node
// Pulls a template's zone geometry + a print-resolution background PNG straight
// out of Figma, via Figma's REST API — replaces manual pixel-scanning.
//
// Extraction logic lives in api/_lib/figma-import.js. This script just
// handles the local-CLI concerns: loading the token, writing files to disk —
// the deployed web app imports via the WildCast Figma plugin instead (no
// token needed there); this REST+token path now only exists here.
//
// Usage:
//   node --env-file=.env.local scripts/import-figma-template.js <figma-url> <output-name>
//
// Example:
//   node --env-file=.env.local scripts/import-figma-template.js \
//     "https://www.figma.com/design/UZcgHrJp7jxLjbtgUoyvpp/WOLT-DE---2026?node-id=4861-2" \
//     koblenz-test

import { writeFile, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { importFigmaTemplate } from '../api/_lib/figma-import.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

async function loadToken() {
  if (process.env.FIGMA_TOKEN) return process.env.FIGMA_TOKEN
  // Fallback for anyone who forgets --env-file: read .env.local directly.
  try {
    const raw = await readFile(join(ROOT, '.env.local'), 'utf8')
    const match = raw.match(/^FIGMA_TOKEN=(.+)$/m)
    if (match) return match[1].trim()
  } catch { /* no .env.local — fall through to the error below */ }
  throw new Error(
    'FIGMA_TOKEN not set. Either run with `node --env-file=.env.local ...`, ' +
    'or make sure wildcast-app/.env.local has a FIGMA_TOKEN= line filled in.'
  )
}

async function main() {
  const [, , url, outputName] = process.argv
  if (!url || !outputName) {
    console.error('Usage: node --env-file=.env.local scripts/import-figma-template.js <figma-url> <output-name>')
    process.exit(1)
  }

  const token = await loadToken()

  console.log(`Fetching node from ${url}...`)
  const result = await importFigmaTemplate({ figmaUrl: url, token })

  console.log(`Frame: "${result.frameName}" — ${result.frameWidth.toFixed(1)}×${result.frameHeight.toFixed(1)}pt`)
  console.log(`Found ${result.zones.length} zone: marker(s) — ${result.zones.map(z => z.id).join(', ')}`)
  console.log(`Exporting background at ${result.scale}x scale (${result.effectiveDpi} DPI)...`)

  const pngPath = join(ROOT, 'public', 'templates', `${outputName}.png`)
  await writeFile(pngPath, result.imageBuffer)
  console.log(`Saved background: public/templates/${outputName}.png (${(result.imageBuffer.byteLength / 1024).toFixed(0)}KB)`)

  const snippet = `const ${outputName.toUpperCase().replace(/-/g, '_')}_ZONES = ${JSON.stringify(result.zones, null, 2)}\n`
  const snippetPath = join(ROOT, 'scripts', `${outputName}-zones.generated.js`)
  await writeFile(snippetPath, snippet)
  console.log(`Saved zone config: scripts/${outputName}-zones.generated.js`)

  if (result.needsReview.length) {
    console.log(`\n⚠️  ${result.needsReview.length} zone(s) had no live text to sample font info from — double-check fontSize/fontFamily/fontWeight before shipping: ${result.needsReview.join(', ')}`)
  }
}

main().catch(err => {
  console.error(err.message)
  process.exit(1)
})
