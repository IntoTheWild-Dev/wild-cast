// Brand color library — Phase 1 of the WildCast print-color fix (see
// wildcast-print-export-color-findings.md / the 2026-09-25 developer brief).
//
// Problem this solves: export-cmyk.js used to convert every on-screen hex to
// CMYK mathematically (via sharp's ICC profile conversion). That's correct
// for arbitrary colors, but brands define their official *print* CMYK (or a
// Pantone spot) separately from their screen hex — the print value can't be
// reliably derived by converting the hex, no matter the conversion settings.
//
// This is a manually-entered lookup table, per brand: { hex -> official
// print CMYK }. At export time (see applyBrandColorLibrary in export-cmyk.js),
// any pixel whose on-screen RGB exactly matches a hex here gets the stored
// value painted by a raster stencil with exact PDF CMYK operands.
// Anything not in the table falls back to the old conversion behavior,
// unchanged — see requirement 2/3 in the brief.
//
// Phase 1 scope is Wolt Blue only (client-confirmed, 2026-09-25). McDonald's
// and other partner colors are explicitly out of scope — do not add them
// here without a fresh client sign-off.
export const BRAND_COLOR_LIBRARIES = {
  wolt: [
    {
      hex: '#00C2E8',
      // Official Wolt brand guide: C75 M0 Y10 K0 (matches Pantone 306).
      // Source: client-supplied brand guide, confirmed authoritative in the
      // 2026-09-25 brief (§5) — do not re-derive this by converting the hex.
      cmyk: { c: 75, m: 0, y: 10, k: 0 },
      label: 'Wolt Blue',
    },
  ],
}

export function getBrandLibrary(brand) {
  if (!brand) return []
  const key = String(brand).trim().toLowerCase()
  return Object.hasOwn(BRAND_COLOR_LIBRARIES, key) ? BRAND_COLOR_LIBRARIES[key] : []
}

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '')
  if (!m) return null
  const n = parseInt(m[1], 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

// Approximate backing-image bytes only. Exact PDF ink values use stencils.
export function cmykToBytes({ c, m, y, k }) {
  const toByte = pct => Math.round((pct / 100) * 255)
  return { c: toByte(c), m: toByte(m), y: toByte(y), k: toByte(k) }
}
