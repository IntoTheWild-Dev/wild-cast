import { getLibraryAssets } from './assetLibrary'
import { OBJECTIVES, resolvePartnerName } from './briefConstants'

// The two live templates a brief can generate a candidate from today. Both
// are Restaurant/Flyer only (src/data/templates.js) — there's no live
// template for any other Business type/Format combination yet.
export const CANDIDATE_TEMPLATE_IDS = ['wen-cheng-flyer2-simple', 'opt-b-flyer2-simple']

// Returns the candidate template ids that actually match this brief, or []
// if nothing live matches yet (e.g. Retail, or Poster/Wild Poster only) —
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

function objectiveText(brief) {
  const objective = OBJECTIVES.find(o => o.value === brief.objective)
  return brief.objectiveFollowUp?.trim() || objective?.label || ''
}

// Maps a submitted brief onto the {fields} shape TemplateCanvas/App.jsx
// expect. Deliberately does NOT special-case Option A vs B — a field with no
// matching zone on a given template is simply inert (TemplateCanvas only
// renders zones that exist in that template's own `zones` array), so Option
// B naturally ends up with a partial fill (no restaurant name/T&Cs zone
// there) without any per-template branching here.
export function buildCandidateFields(brief, { logoUrl, photoUrl } = {}) {
  const partnerName = resolvePartnerName(brief)
  const offerText = objectiveText(brief)

  return {
    // Wolt's Omnes Cond headline/subline treatment is always uppercase —
    // enforced here rather than on the input field, so it's guaranteed on
    // the actual artwork regardless of how it was typed (and covers presets/
    // AI-suggested copy too, not just hand-typed text).
    headline: (brief.headline || '').toUpperCase(),
    sub_headline: (brief.subline || '').toUpperCase(),
    // Explicit Restaurant name wins when set (the display name on the flyer
    // can differ from Partner name, e.g. partner "McD" but flyer should read
    // "McDonald's Zentrum") — falls back to Partner name otherwise.
    restaurant_name: brief.restaurantName?.trim() || partnerName || '',
    tc: brief.tcs || '',
    offer: offerText,
    // Own field, distinct from Subline (Julia's ask, 2026-08-04) — falls back
    // to Subline, then the objective text, so a brief filled out before this
    // field existed (or left blank) still fills Option B's second line.
    cta: brief.cta?.trim() || brief.subline?.trim() || offerText,
    logoUrl: logoUrl || null,
    photoUrl: photoUrl || null,
    // No live template has a `qr` zone yet (checked directly against
    // templateZones.js) — collected in the brief, but nothing to render onto
    // today. Kept as a real key so it's harmless once a qr zone exists.
    qrUrl: null,
  }
}

// Best-effort pull of this merchant's existing logo/product-image from the
// shared Library, so picking an existing partner doesn't require a fresh
// upload every time. Silent blank fallback on any failure or no match —
// getLibraryAssets() itself already swallows fetch errors and returns [].
// Cannot be verified against local `vite dev` (no local serverless emulation
// for /api/library-assets) — only against a real deploy, or a mocked fetch.
export async function fetchMerchantAssets(merchantName) {
  if (!merchantName) return { logoUrl: null, photoUrl: null }
  const assets = await getLibraryAssets()
  const belongsToMerchant = a => (a.merchant || 'General') === merchantName
  const logo = assets.find(a => a.folder === 'logos' && belongsToMerchant(a))
  const photo = assets.find(a => a.folder === 'product-images' && belongsToMerchant(a))
  return { logoUrl: logo?.src ?? null, photoUrl: photo?.src ?? null }
}
