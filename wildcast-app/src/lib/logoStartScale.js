// Starting Scale for the restaurant logo, per template (Julia, 2026-10-01:
// Option C's logo picked from Assets at 100% was slightly cut off at the
// zone edge). A contain-fit logo at 100% touches the zone's tighter side and
// the zone clips there, so Option C starts a little smaller. Applied when a
// logo is SET (upload, Choose from Assets, drop, brief hand-off) - never
// when reopening a saved design, so existing and approved designs keep the
// exact Scale they were saved with. The partner can still change it. Keyed
// by the template's slot key; the "-simple" Guided twin shares it.
const LOGO_START_PCT = { 'restaurant-flyer-option-c': 95 }
export function logoStartPct(templateId) {
  return LOGO_START_PCT[String(templateId ?? '').replace(/-simple$/, '')] ?? null
}
