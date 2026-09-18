// Canonical field order shared by the "Edit content" panel (FieldEditor.jsx)
// and the on-canvas step numbers (TemplateCanvas.jsx), so the number shown
// next to a zone on the canvas always matches its step number in the panel.
// Julia's ask, 2026-09-18: Logo, Subline, Headline, Photo, Sticker, T&Cs,
// App download line/Offer - a template that doesn't define one of these
// just skips it; anything not in this list (e.g. a QR code, restaurant
// name) falls in after it, keeping whatever relative order it already had.
const FIELD_PRIORITY = ['logo', 'sub_headline', 'headline', 'photo', 'sticker', 'tc', 'cta', 'offer']

function priorityRank(id) {
  if (id?.includes('sticker')) return FIELD_PRIORITY.indexOf('sticker')
  const idx = FIELD_PRIORITY.indexOf(id)
  return idx === -1 ? FIELD_PRIORITY.length : idx
}

// Stable sort (Array.prototype.sort is stable in every supported engine) -
// keeps every unranked or tied id in its original relative order.
export function sortIdsByFieldOrder(ids) {
  return [...ids].sort((a, b) => priorityRank(a) - priorityRank(b))
}
