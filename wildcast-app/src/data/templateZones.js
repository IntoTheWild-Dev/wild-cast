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
const BG_FLYER2     = '/templates/A6 _ text&image_swap_wildcast.png'
const BG_FLYER2_V2  = '/templates/option-a-V2 _ text&image_swap_wildcast.png'
const BG_OPT_B      = '/templates/opt-b-designer.png'   // text+image: user uploads logo+photo
const BG_OPT_B_TEXT = '/templates/opt-b-text-bg.png'     // text-only: logo+photo baked in PNG

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

const WEN_CHENG_FLYER2_ZONES = [
  ...WEN_CHENG_ZONES,
  {
    id: 'logo',
    type: 'image',
    fit: 'contain',
    label: 'Restaurant logo',
    hint: 'PNG with transparent background · min 500×500px',
    x: 128, y: 5,
    width: 60, height: 63,
  },
  {
    id: 'photo',
    type: 'image',
    fit: 'cover',
    label: 'Food photo',
    hint: 'JPG or PNG · min 800×600px',
    x: 15, y: 160,
    width: 286, height: 150,
  },
]

// ── Option A V2 zones (text+image) — adds editable restaurant name ──────────
// Restaurant name sits left of the baked "♥ WOLT" line at y≈155 (35.09% of 441)
const WEN_CHENG_FLYER2_V2_ZONES = [
  ...WEN_CHENG_FLYER2_ZONES,
  {
    id: 'restaurant_name',
    type: 'text',
    x: 10, y: 151,
    width: 165, height: 28,
    fontSize: 20,
    fontFamily: 'omnes-cond',
    fontWeight: 700,
    color: '#FFFFFF',
    align: 'right',
    autoShrink: true,
  },
]

// ── Option B zones ─────────────────────────────────────────────────────────
// Canvas 316×441. Zones from Figma reference (node 4290-31):
//   logo (top center) · "WIE WÄR'S MIT" baked · restaurant name text · food photo
//   · baked body text + App Store/Play badges + Wolt bag
// No sub_headline / offer / tc — FieldEditor hides those automatically.
// ⚠️ Fine-tune y/h values in browser against the background PNG if needed.
// Canvas 316×441, PNG source 1191×1679 (scale ≈ 0.265×0.263).
// Zones calibrated from Guided PNG (text-only bg) and Designer PNG (text+image bg).
// Headline zone sits over the dashed name box in both PNGs.
const OPT_B_TEXT_ZONES = [
  {
    id: 'headline',
    type: 'text',
    x: 15, y: 121,
    width: 286, height: 50,
    fontSize: 50,
    fontFamily: 'omnes-cond',
    fontWeight: 700,
    color: '#FFFFFF',
    align: 'center',
    autoShrink: true,
  },
]

const OPT_B_IMAGE_ZONES = [
  {
    id: 'logo',
    type: 'image',
    fit: 'contain',
    label: 'Restaurant logo',
    hint: 'PNG with transparent background · min 500×500px',
    x: 128, y: 8,
    width: 60, height: 62,
  },
  {
    id: 'headline',
    type: 'text',
    x: 15, y: 121,
    width: 286, height: 50,
    fontSize: 50,
    fontFamily: 'omnes-cond',
    fontWeight: 700,
    color: '#FFFFFF',
    align: 'center',
    autoShrink: true,
  },
  {
    id: 'photo',
    type: 'image',
    fit: 'cover',
    overlapAbove: 20,
    label: 'Food photo',
    hint: 'JPG or PNG · min 800×600px',
    x: 15, y: 174,
    width: 286, height: 120,
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
    backgroundUrl: BG_FLYER2_V2,
    backgroundFill: '#00C2CB',
    zones: WEN_CHENG_FLYER2_V2_ZONES,
  },
  // Same layout as flyer2 but used with mode='non-designer' — canvas objects locked, guided right panel
  'wen-cheng-flyer2-simple': {
    canvasW: 316,
    canvasH: 441,
    backgroundUrl: BG_FLYER2_V2,
    backgroundFill: '#00C2CB',
    zones: WEN_CHENG_FLYER2_V2_ZONES,
  },
  // Same layout as flyer1 but used with mode='non-designer'
  'wen-cheng-flyer1-simple': {
    canvasW: 316,
    canvasH: 441,
    backgroundUrl: BG_FLYER1,
    backgroundFill: '#00C2CB',
    zones: WEN_CHENG_ZONES,
  },

  // ── Option B ────────────────────────────────────────────────────────────────
  // text-only: Guided PNG bg (logo + photo baked, user fills name text only)
  'opt-b-flyer1': {
    canvasW: 316,
    canvasH: 441,
    backgroundUrl: BG_OPT_B_TEXT,
    backgroundFill: '#00C2CB',
    zones: OPT_B_TEXT_ZONES,
  },
  'opt-b-flyer1-simple': {
    canvasW: 316,
    canvasH: 441,
    backgroundUrl: BG_OPT_B_TEXT,
    backgroundFill: '#00C2CB',
    zones: OPT_B_TEXT_ZONES,
  },
  // text+image: Designer PNG bg (user uploads logo, name text, and food photo)
  'opt-b-flyer2': {
    canvasW: 316,
    canvasH: 441,
    backgroundUrl: BG_OPT_B,
    backgroundFill: '#00C2CB',
    zones: OPT_B_IMAGE_ZONES,
  },
  'opt-b-flyer2-simple': {
    canvasW: 316,
    canvasH: 441,
    backgroundUrl: BG_OPT_B,
    backgroundFill: '#00C2CB',
    zones: OPT_B_IMAGE_ZONES,
  },
}
