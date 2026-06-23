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

const BG_FLYER1 = '/templates/A6 _ text_swap_wildcast.png'
const BG_FLYER2 = '/templates/A6 _ text&image_swap_wildcast.png'

// Figma frame reference points (35.09% = WEN CHENG ♥ WOLT line, 70.38% = "Jetzt mit Wolt bestellen &")
// Canvas height = 441px, so: 16.56% → y≈73, 35.09% → y≈155, 70.38% → y≈310
const WEN_CHENG_ZONES = [
  {
    id: 'sub_headline',
    type: 'text',
    x: 15, y: 74,
    width: 268, height: 33,
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
    x: 15, y: 107,
    width: 268, height: 37,
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
    x: 53, y: 317,
    width: 193, height: 25,
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
    x: 114, y: 10,
    width: 69, height: 51,
  },
  {
    id: 'photo',
    type: 'image',
    fit: 'cover',
    label: 'Food photo',
    hint: 'JPG or PNG · min 800×600px',
    x: 15, y: 165,
    width: 268, height: 137,
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
    backgroundUrl: BG_FLYER2,
    backgroundFill: '#00C2CB',
    zones: WEN_CHENG_FLYER2_ZONES,
  },
  // Same layout as flyer2 but used with mode='non-designer' — canvas objects locked, guided right panel
  'wen-cheng-flyer2-simple': {
    canvasW: 316,
    canvasH: 441,
    backgroundUrl: BG_FLYER2,
    backgroundFill: '#00C2CB',
    zones: WEN_CHENG_FLYER2_ZONES,
  },
  // Same layout as flyer1 but used with mode='non-designer'
  'wen-cheng-flyer1-simple': {
    canvasW: 316,
    canvasH: 441,
    backgroundUrl: BG_FLYER1,
    backgroundFill: '#00C2CB',
    zones: WEN_CHENG_ZONES,
  },
}
