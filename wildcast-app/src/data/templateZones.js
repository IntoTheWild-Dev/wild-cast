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
    label: 'Restaurant logo',
    hint: 'PNG with transparency preferred',
    x: 95, y: 15,
    width: 126, height: 55,
  },
  {
    id: 'photo',
    type: 'image',
    label: 'Food photo',
    hint: 'JPG or PNG, min 800×600px',
    x: 48, y: 155,
    width: 220, height: 160,
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
}
