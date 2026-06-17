// Template zone configs for WildCast canvas editor.
// Canvas coordinates use top-left origin (Fabric.js standard).
// Converted from PDF points (bottom-left origin) using: canvasY = pageH - pdfY - zoneH
//
// To activate a template's background PNG, upload the image to Vercel Blob
// (export from Figma with [EDIT] text layers hidden) and paste the Blob URL below.

const PAGE_H = 441  // Wen Cheng A6 flyer height in points

const WEN_CHENG_ZONES = [
  {
    id: 'sub_headline',
    type: 'text',
    x: 14,  y: PAGE_H - 318 - 42,  // canvas y = 81
    width: 288, height: 42,
    fontSize: 30,
    fontFamily: 'Omnes Cond Black',
    color: '#FFFFFF',
    align: 'center',
    autoShrink: true,
  },
  {
    id: 'headline',
    type: 'text',
    x: 14,  y: PAGE_H - 270 - 70,  // canvas y = 101
    width: 288, height: 70,
    fontSize: 44,
    fontFamily: 'Omnes Cond Black',
    color: '#FFFFFF',
    align: 'center',
    autoShrink: true,
  },
  {
    id: 'offer',
    type: 'text',
    x: 68,  y: PAGE_H - 78 - 35,   // canvas y = 328
    width: 184, height: 35,
    fontSize: 26,
    fontFamily: 'Omnes Black',
    color: '#FFFFFF',
    align: 'center',
    autoShrink: true,
  },
  {
    id: 'tc',
    type: 'text',
    // Rotated -90° — x/y/width/height define the visual bounding box
    x: 14,  y: PAGE_H - 22 - 130,  // canvas top-left y = 289
    width: 38, height: 130,
    textWidth: 126,                  // text content width before rotation
    fontSize: 5.5,
    fontFamily: 'Omnes Regular',
    color: '#FFFFFF',
    align: 'left',
    rotate: -90,
  },
  {
    id: 'photo',
    type: 'image',
    x: 14,  y: PAGE_H - 140 - 118, // canvas y = 183
    width: 288, height: 118,
  },
]

export const TEMPLATE_ZONES = {
  'wen-cheng-flyer1': {
    canvasW: 316,
    canvasH: PAGE_H,
    // ↓ Paste Vercel Blob URL here once Annika exports the PNG background
    backgroundUrl: null,
    backgroundFill: '#00C2CB',
    zones: WEN_CHENG_ZONES,
  },
  'wen-cheng-flyer2': {
    canvasW: 316,
    canvasH: PAGE_H,
    // ↓ Paste Vercel Blob URL here once Annika exports the PNG background
    backgroundUrl: null,
    backgroundFill: '#00C2CB',
    zones: WEN_CHENG_ZONES,
  },
}
