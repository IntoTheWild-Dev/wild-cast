// Print colours module - the only things the rest of the app imports.
// See README.md in this folder for what it does and how to remove it.
import process from 'node:process'
import { getBrandLibrary } from '../brandColors.js'
import { verifySession } from '../accounts.js'
import { resolveKeyRole } from '../auth.js'
import { loadSettings } from './store.js'
import { relabelLikeInDesign } from './relabel.js'

// PRINT_COLORS=off switches the whole module off: exports use the code table
// in brandColors.js and standard PDF/X-4 labelling, the API refuses.
export const isEnabled = () => String(process.env.PRINT_COLORS || 'on').toLowerCase() !== 'off'

const cache = new Map()  // brand -> { at, value }
const CACHE_MS = 30_000
export const clearCache = brand => cache.delete(brand)

function fallback(brand) {
  return { library: getBrandLibrary(brand), printer: { id: 'standard', label: 'pdfx4' } }
}

// What the export needs for one brand: the colour library (with the default
// printer's overrides applied) and the printer's file label. Never throws -
// a Blob hiccup must not change export colours, so it falls back to code.
export async function resolvePrintSettings(brand) {
  if (!brand || !isEnabled()) return fallback(brand)
  const hit = cache.get(brand)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value
  let value = fallback(brand)
  try {
    const s = await loadSettings(brand)
    const printer = s.printers.find(p => p.id === s.defaultPrinter) ?? { id: 'standard', label: 'pdfx4', overrides: {} }
    value = {
      library: s.colors.map(c => ({ hex: c.hex, label: c.label, cmyk: printer.overrides?.[c.hex] ?? c.cmyk })),
      printer: { id: printer.id, label: printer.label },
    }
  } catch (err) {
    console.error('printColors: using code defaults', err)
  }
  cache.set(brand, { at: Date.now(), value })
  return value
}

// Last step of an export: relabel the finished PDF when the brand's default
// printer asks for "Like InDesign". Returns the buffer unchanged otherwise.
export async function finishPdf(pdfBuffer, printer) {
  if (printer?.label !== 'indesign') return pdfBuffer
  try {
    return await relabelLikeInDesign(pdfBuffer)
  } catch (err) {
    console.error('printColors: relabel failed, sending PDF/X-4 file', err)
    return pdfBuffer
  }
}

// Agency-only gate (Wild Stack's own keys or team accounts with role
// 'agency'). Returns a "who" label for history, or null after the 403.
export async function requireAgency(req, res) {
  if (resolveKeyRole(req.headers['x-activation-key']) === 'agency') return 'agency key'
  const email = req.headers['x-account-email']
  const token = req.headers['x-account-token']
  if (email && token) {
    try {
      const account = await verifySession(email, token)
      if (account?.role === 'agency') return account.email || email
    } catch (err) {
      console.error('printColors requireAgency:', err)
    }
  }
  res.status(403).json({ error: 'Only Wild Stack team accounts can change print colours.' })
  return null
}
