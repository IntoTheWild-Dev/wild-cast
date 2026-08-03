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
    headline: brief.headline || '',
    sub_headline: brief.subline || '',
    restaurant_name: partnerName || '',
    tc: brief.tcs || '',
    offer: offerText,
    // Option B has no subline zone — its `cta` line is the closest fit, so it
    // reuses subline when present, falling back to the same objective text.
    cta: brief.subline?.trim() || offerText,
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
