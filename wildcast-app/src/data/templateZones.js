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

const BG_FLYER1 = 'https://nd2c9p2q8as8wmla.private.blob.vercel-storage.com/Flyer%201_test%201_text%20only.png?vercel-blob-delegation=eyJzdG9yZUlkIjoic3RvcmVfbkQyQzlQMlE4QXM4d21MYSIsIm93bmVySWQiOiJ0ZWFtX1FHWDdFQzM2S3lDWFhsdXpKNklCTWhrcCIsInBhdGhuYW1lIjoiKiIsIm9wZXJhdGlvbnMiOlsiZ2V0IiwiaGVhZCJdLCJ2YWxpZFVudGlsIjoxNzgxNzM1MjkxOTYwLCJpYXQiOjE3ODE2OTIwOTIyODB9.JKeU6KjnY1L7Qrz18O0APUbSnX_lkBMQCf-U1so94GY&vercel-blob-signature=y5j3W_Glia481mjQviyOUNi1NE3yTz3GbaY7tYfP-EQ'

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
    // Rotated -90° along left edge, spanning full text area height
    x: 5, y: 73,
    width: 15, height: 258,
    textWidth: 252,
    fontSize: 5,
    fontFamily: 'omnes-pro',
    fontWeight: 400,
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
