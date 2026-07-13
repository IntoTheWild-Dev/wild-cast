// Template zone configs for WildCast canvas editor.
// Canvas coordinates use top-left origin (Fabric.js standard).
// Zone positions are approximate and calibrated visually in the browser.
//
// Figma layer naming convention: [edit] layers → editable zones
// [edit] POTSDAMS NEUES → sub_headline
// [edit] DREAMTEAM      → headline
// [edit] 30% SPAREN     → offer
// [edit] fineprint       → tc
// Food + logo layers are baked into the background PNG for now.

const BG_FLYER1     = '/templates/A6 _ text_swap_wildcast.png'
// Real bleed exports via scripts/import-figma-template.js — 1259×1747px @288 DPI
// (Figma's image API caps scale at 4x = 288 DPI, not quite 300 but print-fine).
const BG_WEN_CHENG_V3 = '/templates/wen-cheng-v3.png'
const BG_OPT_B = '/templates/opt-b-designer-v3.png'

// Figma frame reference points (35.09% = WEN CHENG ♥ WOLT line, 70.38% = "Jetzt mit Wolt bestellen &")
// Canvas height = 441px, so: 16.56% → y≈73, 35.09% → y≈155, 70.38% → y≈310
const WEN_CHENG_ZONES = [
  {
    id: 'sub_headline',
    type: 'text',
    x: 10, y: 73,
    width: 296, height: 30,
    fontSize: 20,
    fontFamily: 'omnes-cond',
    fontWeight: 700,
    color: '#FFFFFF',
    align: 'center',
    autoShrink: true,
  },
  {
    id: 'headline',
    type: 'text',
    x: 10, y: 103,
    width: 296, height: 52,
    fontSize: 50,
    fontFamily: 'omnes-cond',
    fontWeight: 700,
    color: '#FFFFFF',
    align: 'center',
    autoShrink: true,
  },
  {
    id: 'offer',
    type: 'text',
    x: 60, y: 330,
    width: 200, height: 50,
    fontSize: 36,
    fontFamily: 'omnes-cond',
    fontWeight: 700,
    color: '#FFFFFF',
    align: 'center',
    autoShrink: true,
  },
  {
    id: 'tc',
    type: 'text',
    // Rotated -90° in lower-left area (67.59%–94.53% top, 7.31%–13.03% left in Figma)
    x: 23, y: 298,
    width: 18, height: 119,
    textWidth: 119,
    fontSize: 4.5,
    fontFamily: 'omnes-pro',
    fontWeight: 500,
    color: '#FFFFFF',
    align: 'left',
    rotate: -90,
  },
]

// ── Option A V3 — real bleed master via scripts/import-figma-template.js ───
// Source: Figma node 4859:24 ("FINAL — A6 Bleed Master, Template A"). Position
// math is script-derived (not hand pixel-scanned); fontFamily/fontWeight
// forced to 'omnes-cond'/700 since only that weight is Typekit-loaded (script
// read the Figma file's real "Omnes Cond"/900, which isn't available to load).
// `tc` is reused unchanged from WEN_CHENG_ZONES — it's rotated -90°, which the
// import script can't derive automatically, so it was left hand-tuned as-is.
// sub_headline/headline/offer positions come from their dedicated (non-
// overlapping) guide rectangles, not the raw text nodes — the text nodes'
// own bounding boxes overlapped each other by 15-23px since they reflect
// placeholder-text render height, not designed zone spacing.
const WEN_CHENG_V3_ZONES = [
  {
    id: 'sub_headline',
    type: 'text',
    x: 15.9, y: 77.8,
    width: 284.5, height: 34.7,
    fontSize: 37,
    fontFamily: 'omnes-cond',
    fontWeight: 700,
    color: '#FFFFFF',
    align: 'center',
    autoShrink: true,
  },
  {
    id: 'headline',
    type: 'text',
    x: 15.9, y: 112.5,
    width: 284.5, height: 38.9,
    fontSize: 54,
    fontFamily: 'omnes-cond',
    fontWeight: 700,
    color: '#FFFFFF',
    align: 'center',
    autoShrink: true,
  },
  {
    id: 'offer',
    type: 'text',
    x: 56.3, y: 333.2,
    width: 204.9, height: 26.3,
    fontSize: 30,
    fontFamily: 'omnes-cond',
    fontWeight: 700,
    color: '#FFFFFF',
    align: 'center',
    autoShrink: true,
  },
  WEN_CHENG_ZONES.find(z => z.id === 'tc'),
  {
    id: 'logo',
    type: 'image',
    fit: 'contain',
    label: 'Restaurant logo',
    hint: 'JPG or PNG',
    x: 121, y: 10.5,
    width: 73.3, height: 53.6,
  },
  {
    id: 'photo',
    type: 'image',
    fit: 'cover',
    label: 'Food photo',
    hint: 'PNG with transparent background',
    x: 15.9, y: 173.4,
    width: 284.5, height: 144,
  },
  {
    id: 'restaurant_name',
    type: 'text',
    x: 1.9, y: 149,
    width: 165, height: 28,
    fontSize: 20,
    fontFamily: 'omnes-cond',
    fontWeight: 700,
    color: '#FFFFFF',
    align: 'right',
    autoShrink: true,
  },
]

// ── Option B zones — first template built via the Figma import pipeline ─────
// Source: Figma node 4861:2 ("FINAL — A6 Bleed Master (Template B)"), derived
// from the McDonald's Q4 Tactical Koblenz flyer. Zone coords computed (not
// hand pixel-scanned) from Figma's real geometry:
//   canvasX = (figmaX - BLEED_UNITS) * (316 / TRIM_W_UNITS)
//   canvasY = (figmaY - BLEED_UNITS) * (441 / TRIM_H_UNITS)
// fontSize scaled the same way (55pt Figma × 441/419.53 ≈ 58).
// The line that named McDonald's ("...bei McDonald's bestellen.") was masked
// out of the background art and replaced by the free-text `cta` zone below,
// so any partner can fill in their own line — no partner branding is baked in.
const OPT_B_ZONES = [
  {
    id: 'headline',
    type: 'text',
    x: 15.9, y: 125.1,
    width: 284.5, height: 44.1,
    fontSize: 58,
    fontFamily: 'omnes-cond',
    fontWeight: 700,
    color: '#FFFFFF',
    align: 'center',
    autoShrink: true,
  },
  {
    id: 'logo',
    type: 'image',
    fit: 'contain',
    label: 'Restaurant logo',
    hint: 'JPG or PNG',
    x: 121, y: 0,
    width: 73, height: 73,
  },
  {
    id: 'photo',
    type: 'image',
    fit: 'cover',
    label: 'Food photo',
    hint: 'PNG with transparent background',
    x: 25.5, y: 169.2,
    width: 266.5, height: 122,
  },
  // Line 1 ("Jetzt Wolt App downloaden und") stays baked in the background —
  // line 2 was McDonald's-specific ("...bei McDonald's bestellen.") and is now
  // masked out of the background art, replaced by this free-text zone so any
  // partner can fill in their own line instead of a fill-in-the-blank template.
  {
    id: 'cta',
    type: 'text',
    x: 59.5, y: 307,
    width: 198.5, height: 17,
    fontSize: 11,
    fontFamily: 'omnes-pro',
    fontWeight: 500,
    color: '#FFFFFF',
    align: 'center',
    autoShrink: true,
  },
]

export const TEMPLATE_ZONES = {
  'wen-cheng-flyer1': {
    canvasW: 316,
    canvasH: 441,
    backgroundUrl: BG_FLYER1,
    backgroundFill: '#00C2CB',
    zones: WEN_CHENG_ZONES,
  },
  'wen-cheng-flyer2': {
    canvasW: 316,
    canvasH: 441,
    backgroundUrl: BG_WEN_CHENG_V3,
    backgroundFill: '#00C2CB',
    zones: WEN_CHENG_V3_ZONES,
  },
  // Same layout as flyer2 but used with mode='non-designer' — canvas objects locked, guided right panel
  'wen-cheng-flyer2-simple': {
    canvasW: 316,
    canvasH: 441,
    backgroundUrl: BG_WEN_CHENG_V3,
    backgroundFill: '#00C2CB',
    zones: WEN_CHENG_V3_ZONES,
  },
  // Same layout as flyer1 but used with mode='non-designer'
  'wen-cheng-flyer1-simple': {
    canvasW: 316,
    canvasH: 441,
    backgroundUrl: BG_FLYER1,
    backgroundFill: '#00C2CB',
    zones: WEN_CHENG_ZONES,
  },

  // ── Option B — real bleed export via the Figma import pipeline ────────────
  'opt-b-flyer2': {
    canvasW: 316,
    canvasH: 441,
    backgroundUrl: BG_OPT_B,
    backgroundFill: '#00C2CB',
    zones: OPT_B_ZONES,
  },
  'opt-b-flyer2-simple': {
    canvasW: 316,
    canvasH: 441,
    backgroundUrl: BG_OPT_B,
    backgroundFill: '#00C2CB',
    zones: OPT_B_ZONES,
  },
}
