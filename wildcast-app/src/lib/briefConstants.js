// Shared between BriefingForm.jsx (collects answers) and briefToCandidates.js
// (maps answers onto real template zones) — kept in one place so the two
// never drift apart on what an objective/format value actually means.

export const ADD_NEW = '__add_new__'

// Placeholder partner list — no backend wiring yet, this is just so the
// dropdown feels real while Julia checks the form itself is correct.
export const PLACEHOLDER_PARTNERS = ['Wen Cheng', 'Fressnapf Koblenz', 'AKKO Chicken & Grilled']

export const OBJECTIVES = [
  { value: 'new_opening', label: 'New opening', followUp: "What's the new name of the restaurant?" },
  { value: 'promotion', label: 'Promotion', followUp: "What's the promotion?" },
  { value: 'special_offer', label: 'Special offer', followUp: "What's the offer?" },
  { value: 'new_dish', label: 'New Dish', followUp: null },
  { value: 'limited_campaign', label: 'Limited campaign', followUp: null },
]

// LED Backpack deliberately excluded — decided out of scope (motion format,
// WildCast's pipeline only produces static print). See project memory.
export const FORMATS = [
  { value: 'flyer', label: 'Flyer (A6, A5)' },
  { value: 'poster', label: 'Poster (A0, A1, A2)' },
  { value: 'wild_poster', label: 'Wild Poster' },
]

export const STICKERS = ['26% OFF badge', 'NEW badge', 'Limited time badge']
export const REQUEST_NEW_STICKER = '__request_new__'

export const DEFAULT_BRIEF = {
  partner: '', partnerNew: '',
  businessType: '',
  about: '',
  objective: '', objectiveFollowUp: '',
  formats: [],
  headline: '', subline: '',
  sticker: '', stickerRequest: '',
  tcs: '',
  qrNeeded: null, // null | true | false
  qrFileName: '',
}

// Resolves the "Partner name" field to a plain string regardless of whether
// it came from the existing-partner dropdown or the "+ Add new" text input.
export function resolvePartnerName(brief) {
  return brief.partner === ADD_NEW ? brief.partnerNew.trim() : brief.partner
}
