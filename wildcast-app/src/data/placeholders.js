// Generic pre-fill content shown in every text/image field until a manager
// replaces it - Notion card "Pre-filled Template Placeholders" (Annika,
// 2026-09-22). The import pipeline doesn't capture a template's real
// designed text/images (see api/_lib/figma-import.js - only geometry/font/
// color survive import), so these are deliberately generic, on-brand-neutral
// stand-ins rather than per-template "original design" content. Every value
// here fits under FieldEditor.jsx's CHAR_LIMITS for that field.
export const TEXT_PLACEHOLDERS = {
  headline:        'Headline',
  sub_headline:    'Subline',
  restaurant_name: 'Restaurant Name',
  offer:           '30% off',
  tc:              'Terms and conditions apply. Valid while stocks last. See in-store or online for full details.',
  cta:             'Order your favourite food on the app',
}

// Per-template placeholder overrides (Julia's exec ask, 2026-09-24): the
// generic "HEADLINE"/"SUBLINE" stand-ins above read as template jargon -
// the exec wanted placeholder copy that feels like a real-life flyer, per
// catalogue option. Keys are template ids minus the trailing "-simple"
// (both variants of a template share the same placeholder copy). Zones not
// listed here fall back to the generic TEXT_PLACEHOLDERS above, so e.g.
// Option B's app-download line and every T&C zone stay exactly as they
// were. Note: these deliberately mirror the real flyer artwork and can run
// slightly over FieldEditor's CHAR_LIMITS - placeholders are display-only
// (never saved/exported, see TemplateCanvas.jsx's getPng), so the limits
// don't apply to them.
const TEMPLATE_TEXT_PLACEHOLDERS = {
  // Option A (Wen Cheng art): the real flyer's "Potsdams neues Dreamteam"
  // hero text is two zones, not one - sub_headline carries the smaller
  // intro line, headline carries just the big dominant word below it.
  // Giving headline the FULL phrase (an earlier version of this fix) left
  // sub_headline showing nothing real above it and duplicated the
  // restaurant_name zone's "Wen Cheng ♥ Wolt" line instead of matching the
  // actual two-line headline split - corrected per Julia's confirmation,
  // 2026-09-24, checking against the real Wen Cheng flyer line-by-line.
  'wen-cheng-flyer2': {
    sub_headline: 'Potsdams neues',
    headline:     'Dreamteam',
    offer:        '30% sparen',
  },
  'wen-cheng-flyer1': {
    sub_headline: 'Potsdams neues',
    headline:     'Dreamteam',
    offer:        '30% sparen',
  },
  // Option B (McDonald's art): just the headline - no sub_headline zone on
  // this template at all, CTA at the bottom stays as the generic copy.
  'opt-b-flyer2': {
    headline: 'McDonald’s',
  },
  // Option C (ANKO Berlin art): same two-zone split as Option A - "Chick
  // this out," is the smaller intro line (sub_headline), "Berlin." is the
  // big dominant word (headline).
  'restaurant-flyer-option-c': {
    sub_headline: 'Chick this out,',
    headline:     'Berlin.',
  },
}

// '-simple' is purely a mode suffix (guided vs designer canvas lock) - both
// ids point at the identical zone layout, so they share placeholder copy.
function templatePlaceholderKey(templateId) {
  return templateId ? templateId.replace(/-simple$/, '') : null
}

// headline/sub_headline/offer/restaurant_name are always set in omnes-cond
// (the WOLTCond display font, see src/index.css's @font-face rules and every
// zone's fontFamily in templateZones.js) - App.jsx's handleFieldChange
// already uppercases real typed content for that font (zone?.fontFamily ===
// 'omnes-cond' ? value.toUpperCase() : value), so placeholder text must
// follow the same rule or it visibly mismatches real content's casing
// (Julia's ask, 2026-09-22: "make Wolt cond capital"). tc/cta are omnes-pro
// body text and stay as-typed. Falls back to 'omnes-cond' with no zone
// found, matching TemplateCanvas.jsx's own `zone.fontFamily || 'omnes-cond'`.
const CAPS_FONT_FAMILY = 'omnes-cond'
export function placeholderTextFor(zone, templateId) {
  const overrides = TEMPLATE_TEXT_PLACEHOLDERS[templatePlaceholderKey(templateId)]
  const text = overrides?.[zone?.id] ?? TEXT_PLACEHOLDERS[zone?.id]
  if (text == null) return undefined
  return (zone?.fontFamily || CAPS_FONT_FAMILY) === CAPS_FONT_FAMILY ? text.toUpperCase() : text
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

// Per-template photo placeholder overrides (Julia's ask, 2026-09-24): a flat
// grey "PHOTO" box doesn't show what kind of shot actually belongs in the
// zone - these are the real (WildScale-prepped, transparent-background)
// campaign photos for each catalogue option, shown at the same
// PLACEHOLDER_OPACITY as every other placeholder (see TemplateCanvas.jsx)
// so they read as a translucent guide, not real uploaded content. Same
// template-id-minus-"-simple" keying as TEMPLATE_TEXT_PLACEHOLDERS above.
const TEMPLATE_IMAGE_PLACEHOLDERS = {
  'wen-cheng-flyer2': { photo: '/placeholders/wen-cheng-photo.png' },
  'wen-cheng-flyer1': { photo: '/placeholders/wen-cheng-photo.png' },
  'opt-b-flyer2':     { photo: '/placeholders/mcdonalds-photo.png' },
  'restaurant-flyer-option-c': { photo: '/placeholders/akko-photo.png' },
}

export function placeholderImageFor(zone, templateId) {
  const overrides = TEMPLATE_IMAGE_PLACEHOLDERS[templatePlaceholderKey(templateId)]
  return overrides?.[zone?.id] ?? IMAGE_PLACEHOLDERS[zone?.id]
}
