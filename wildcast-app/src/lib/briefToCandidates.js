import { getLibraryAssets } from './assetLibrary'
import { resolvePartnerName } from './briefConstants'
import { isCloseMatch } from './fuzzyMatch'

// The two live templates a brief can generate a candidate from today. Both
// are Restaurant/Flyer only (src/data/templates.js) - there's no live
// template for any other Business type/Format combination yet.
export const CANDIDATE_TEMPLATE_IDS = ['wen-cheng-flyer2-simple', 'opt-b-flyer2-simple']

// Returns the candidate template ids that actually match this brief, or []
// if nothing live matches yet (e.g. Retail, or Poster/Wild Poster only) -
// callers should show a plain "nothing to generate yet" message rather than
// assume candidates always exist.
export function getMatchingTemplateIds(brief) {
  if (brief.businessType !== 'Restaurant') return []
  if (!brief.formats.includes('flyer')) return []
  // If the partner pre-picked specific design(s) via the "Pick your
  // template first" popup, only generate those - not every live template
  // for this business type/format regardless of what was actually picked
  // (Julia's fix request, 2026-08-20).
  if (brief.preSelectedTemplateIds?.length > 0) {
    return CANDIDATE_TEMPLATE_IDS.filter(id => brief.preSelectedTemplateIds.includes(id))
  }
  return CANDIDATE_TEMPLATE_IDS
}

// Maps a submitted brief onto the {fields} shape TemplateCanvas/App.jsx
// expect. Deliberately does NOT special-case Option A vs B - a field with no
// matching zone on a given template is simply inert (TemplateCanvas only
// renders zones that exist in that template's own `zones` array), so Option
// B naturally ends up with a partial fill (no restaurant name/T&Cs zone
// there) without any per-template branching here.
// zones (optional): the target template's zones. When given, every text
// field set in an Omnes Cond zone is uppercased - the exact rule App.jsx's
// handleFieldChange applies to typed text. Without it, brief-built designs
// kept offer and name-on-design in mixed case ("Wen Cheng", "2x5€ sparen"),
// which the auto-resize then grew bigger than the canvas's own caps version
// (Julia's report, 2026-09-28: "WEN CHENG ♥ WOLT far too big").
export function buildCandidateFields(brief, { logoUrl, photoUrl, zones } = {}) {
  const fields = baseCandidateFields(brief, { logoUrl, photoUrl })
  for (const zone of zones ?? []) {
    if (zone.fontFamily === 'omnes-cond' && typeof fields[zone.id] === 'string') {
      fields[zone.id] = fields[zone.id].toUpperCase()
    }
  }
  return fields
}

function baseCandidateFields(brief, { logoUrl, photoUrl } = {}) {
  const partnerName = resolvePartnerName(brief)

  return {
    // Wolt's Omnes Cond headline/subline treatment is always uppercase -
    // enforced here rather than on the input field, so it's guaranteed on
    // the actual artwork regardless of how it was typed (and covers presets/
    // AI-suggested copy too, not just hand-typed text).
    headline: (brief.headline || '').toUpperCase(),
    sub_headline: (brief.subline || '').toUpperCase(),
    // Explicit Restaurant name wins when set (the display name on the flyer
    // can differ from Partner name, e.g. partner "McD" but flyer should read
    // "McDonald's Zentrum") - falls back to Partner name otherwise.
    restaurant_name: brief.restaurantName?.trim() || partnerName || '',
    tc: brief.tcs || '',
    // Left blank rather than pre-filled with the objective text (Julia's ask,
    // 2026-09-09) - "New Dish"/"Limited campaign" etc. read as a real typed
    // offer, not a placeholder, so partners kept it without noticing. The
    // editor now shows a greyed example instead (FieldEditor.jsx's Offer
    // placeholder).
    offer: brief.offer?.trim() || '',
    // Own field, distinct from Subline (Julia's ask, 2026-08-04) - falls back
    // to Subline only, not further to the objective text (same "New Dish"
    // problem as Offer above, just discovered on Option B's cta zone instead
    // - Julia's ask, 2026-09-09: it read as "Jetzt Wolt App downloaden und
    // New Dish", a nonsense sentence a partner could easily miss and publish
    // as-is). Left blank shows FieldEditor's own greyed example instead.
    cta: brief.cta?.trim() || brief.subline?.trim() || '',
    logoUrl: logoUrl || null,
    photoUrl: photoUrl || null,
    qrUrl: null,
    // Prompt Brief's answers for text zones beyond the known set (promo code
    // box, text sticker, ...), keyed by zone id.
    ...(brief.zoneTexts ?? {}),
    // Prompt Brief's uploaded/picked images for zones beyond logo and photo
    // (sticker, QR, ...). The canvas reads every image zone from
    // fields[`${zone.id}Url`], so a zone id with no matching zone on the
    // chosen template is simply inert, same as the text fields above.
    ...Object.fromEntries(Object.entries(brief.zoneImageUrls ?? {}).map(([id, url]) => [`${id}Url`, url])),
  }
}

// Starting Scale for the food photo / sticker of a design made in the Prompt
// Brief chat (Julia, 2026-09-28: "product image is huge"). The editor fits a
// photo zone by "cover", so a square cut-out dish is scaled to the box WIDTH
// and spills over the lines above it. This returns an imageScales entry per
// zone that fits the image's visible (non-transparent) content inside the
// zone box instead. Stored on the design exactly like a hand-set Scale, so
// TemplateCanvas.jsx's own rules are untouched and the partner can still
// change it. Photos WITH a background (no transparent pixels) are skipped -
// those are meant to fill the box.
export async function fitContentScales(zones, fields) {
  const { scales } = await fitContent(zones, fields)
  return scales
}

// Same fit, plus an imagePositions offset that centres the visible content
// in the zone - a dish sitting off-centre in its PNG would otherwise still
// be clipped on one side even at the right Scale. Used by the editor when a
// new photo/sticker is set (App.jsx autoFitImage).
export async function fitContent(zones, fields) {
  const scales = {}, positions = {}
  for (const zone of zones ?? []) {
    if (zone.type !== 'image' || !(zone.id === 'photo' || zone.id.includes('sticker'))) continue
    const url = fields?.[`${zone.id}Url`]
    if (!url) continue
    try {
      const fit = await contentFit(zone, url)
      if (fit) { scales[zone.id] = fit.pct; positions[zone.id] = fit.offset }
    } catch {
      // Unreadable image - keep the editor's default fit.
    }
  }
  return { scales, positions }
}

// Mirrors TemplateCanvas.jsx's image load: its base scale ("cover" = fill,
// with a MIN_NUDGE_SLACK overscan margin; "contain" = fit) that the Scale
// percentage multiplies, and its placement (image centred in the zone, then
// shifted by the Position offset). Keep in step if that formula changes.
const CANVAS_MIN_NUDGE_SLACK = 24
// As big as the zone allows (Anang, 2026-09-30: "sampai mentok") - the
// visible content touches the zone on its tighter side. pct rounds DOWN so
// rounding can never push it a fraction past the edge.
const CONTENT_FILL = 1
// The food photo specifically sits a touch smaller than "as big as the zone
// allows" (Julia, 2026-09-30: "food photo is a bit large") - ~10% smaller,
// still centred and never cut. One knob for every template and every route
// (upload, Library pick, reopened design, Prompt Brief previews); stickers
// keep CONTENT_FILL. Raise toward 1 for bigger, lower for smaller.
const PHOTO_FILL = 0.9

function canvasBaseScale(zone, w, h) {
  if (zone.fit !== 'cover') return Math.min(zone.width / w, zone.height / h)
  const base = Math.max(zone.width / w, zone.height / h)
  const tightDim = (zone.width / w) >= (zone.height / h) ? zone.width : zone.height
  return base * Math.max(1.15, 1 + (2 * CANVAS_MIN_NUDGE_SLACK) / tightDim)
}

async function contentFit(zone, url) {
  const img = await new Promise((resolve, reject) => {
    const i = new Image()
    i.crossOrigin = 'anonymous'
    i.onload = () => resolve(i)
    i.onerror = reject
    i.src = url
  })
  const w = img.naturalWidth, h = img.naturalHeight
  if (!w || !h) return null
  // Alpha bounding box on a downscaled copy (fast; ~1% precision is plenty).
  const k = Math.min(1, 400 / Math.max(w, h))
  const cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k))
  const cv = document.createElement('canvas')
  cv.width = cw; cv.height = ch
  const ctx = cv.getContext('2d')
  ctx.drawImage(img, 0, 0, cw, ch)
  const data = ctx.getImageData(0, 0, cw, ch).data
  let minX = cw, minY = ch, maxX = -1, maxY = -1, clear = 0
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      if (data[(y * cw + x) * 4 + 3] > 16) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      } else {
        clear++
      }
    }
  }
  if (maxX < 0) return null
  // Not a cut-out: (almost) no transparent pixels. Counted over the whole
  // image, not just the margin - a bowl cropped tight to its rim still has
  // clear corners and still gets cut off by cover-fit.
  if (clear / (cw * ch) < 0.03) return null
  const contentW = (maxX - minX + 1) / k
  const contentH = (maxY - minY + 1) / k
  const target = Math.min(zone.width / contentW, zone.height / contentH) * (zone.id === 'photo' ? PHOTO_FILL : CONTENT_FILL)
  const pct = Math.max(20, Math.min(300, Math.floor((100 * target) / canvasBaseScale(zone, w, h))))
  const s = canvasBaseScale(zone, w, h) * pct / 100
  // Shift from "image centred" to "content centred" (canvas units).
  const offset = {
    x: s * (w / 2 - (minX + maxX + 1) / 2 / k),
    y: s * (h / 2 - (minY + maxY + 1) / 2 / k),
  }
  return { pct, offset }
}

// Best-effort pull of this merchant's existing logo/product-image from the
// shared Library, so picking an existing partner doesn't require a fresh
// upload every time. Silent blank fallback on any failure or no match -
// getLibraryAssets() itself already swallows fetch errors and returns [].
// Cannot be verified against local `vite dev` (no local serverless emulation
// for /api/library-assets) - only against a real deploy, or a mocked fetch.
export async function fetchMerchantAssets(merchantName) {
  if (!merchantName) return { logoUrl: null, photoUrl: null }
  const assets = await getLibraryAssets()
  // Close match, not exact - same typo tolerance as the chat's asset offer.
  const belongsToMerchant = a => !!a.merchant && a.merchant !== 'General' && isCloseMatch(a.merchant, merchantName)
  const logo = assets.find(a => a.folder === 'logos' && belongsToMerchant(a))
  const photo = assets.find(a => a.folder === 'product-images' && belongsToMerchant(a))
  return { logoUrl: logo?.src ?? null, photoUrl: photo?.src ?? null }
}
