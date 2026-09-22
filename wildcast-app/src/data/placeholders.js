// Generic pre-fill content shown in every text/image field until a manager
// replaces it - Notion card "Pre-filled Template Placeholders" (Annika,
// 2026-09-22). The import pipeline doesn't capture a template's real
// designed text/images (see api/_lib/figma-import.js - only geometry/font/
// color survive import), so these are deliberately generic, on-brand-neutral
// stand-ins rather than per-template "original design" content. Every value
// here fits under FieldEditor.jsx's own CHAR_LIMITS for that field.
export const TEXT_PLACEHOLDERS = {
  headline:        'Your headline here',
  sub_headline:    'Place your subline here',
  restaurant_name: 'Restaurant Name',
  offer:           '30% off',
  tc:              'Terms and conditions apply. Valid while stocks last. See in-store or online for full details.',
  cta:             'Order your favourite food on the app',
}

// Neutral labeled box, not a fake photo/logo/QR - matches the "greyed out,
// obviously a placeholder" approach (not an attempt to fake real per-template
// content, which the app has no source for - see comment above).
function placeholderSvg(label) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
    <rect width="400" height="400" fill="#F3F4F6"/>
    <rect x="24" y="24" width="352" height="352" rx="16" fill="none" stroke="#E5E7EB" stroke-width="3" stroke-dasharray="10 8"/>
    <text x="200" y="212" font-family="Helvetica, Arial, sans-serif" font-size="30" font-weight="700" letter-spacing="1" fill="#9CA3AF" text-anchor="middle">${label}</text>
  </svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

// Keyed by zone id (logo/photo/sticker/qr - see IMAGE_ZONE_CONFIG in
// api/_lib/figma-import.js). "QR code must say QR code" (Julia, 2026-09-22)
// - it's a label, not a scannable placeholder code.
export const IMAGE_PLACEHOLDERS = {
  logo:    placeholderSvg('LOGO'),
  photo:   placeholderSvg('PHOTO'),
  sticker: placeholderSvg('DISCOUNT'),
  qr:      placeholderSvg('QR CODE'),
}
