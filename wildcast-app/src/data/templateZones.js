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

const BG_FLYER1 = 'https://nd2c9p2q8as8wmla.public.blob.vercel-storage.com/Flyer%201_test%201_text%20only.png'

const WEN_CHENG_ZONES = [
  {
    id: 'sub_headline',
    type: 'text',
    x: 10, y: 95,
    width: 296, height: 90,
    fontSize: 30,
    fontFamily: 'Omnes Cond Black',
    color: '#FFFFFF',
    align: 'center',
    autoShrink: true,
  },
  {
    id: 'headline',
    type: 'text',
    x: 10, y: 175,
    width: 296, height: 90,
    fontSize: 55,
    fontFamily: 'Omnes Cond Black',
    color: '#FFFFFF',
    align: 'center',
    autoShrink: true,
  },
  {
    id: 'offer',
    type: 'text',
    x: 60, y: 355,
    width: 200, height: 55,
    fontSize: 30,
    fontFamily: 'Omnes Black',
    color: '#FFFFFF',
    align: 'center',
    autoShrink: true,
  },
  {
    id: 'tc',
    type: 'text',
    // Rotated -90° — x/y/width/height define the visual bounding box
    x: 0, y: 100,
    width: 18, height: 250,
    textWidth: 240,
    fontSize: 5,
    fontFamily: 'Omnes Regular',
    color: '#FFFFFF',
    align: 'left',
    rotate: -90,
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
    backgroundUrl: BG_FLYER1,
    backgroundFill: '#00C2CB',
    zones: WEN_CHENG_ZONES,
  },
}
