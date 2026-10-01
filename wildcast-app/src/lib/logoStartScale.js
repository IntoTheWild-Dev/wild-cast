// Starting Scale for the restaurant logo, per template (Julia, 2026-10-01).
// A contain-fit logo at 100% touches the zone's tighter side, and the zone
// clips there - so Option C's logo picked from Assets looked slightly cut
// off. 95% still clipped (only ~2.5% of breathing room per side, and Option
// C's white logo tab has large rounded bottom corners that a wide logo
// reaches), so all three restaurant flyers now start at 90%.
// Applied when a logo is SET (upload, Choose from Assets, canvas drop, brief
// hand-off) - never when reopening a saved design, so existing and approved
// designs keep the exact Scale they were saved with. The partner can still
// change it. Keyed by the template id with the "-simple" Guided suffix
// stripped, so both variants share it. Option C's zones live in the Figma-
// import record (not in this repo), hence a key here rather than a zone
// property.
const LOGO_START_PCT = {
  'wen-cheng-flyer1': 90,       // Restaurant Flyer - Option A
  'wen-cheng-flyer2': 90,
  'opt-b-flyer2': 90,           // Restaurant Flyer - Option B
  'restaurant-flyer-option-c': 90,
}
export function logoStartPct(templateId) {
  return LOGO_START_PCT[String(templateId ?? '').replace(/-simple$/, '')] ?? null
}
