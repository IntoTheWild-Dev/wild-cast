// Same slugify TemplateImportPage.jsx uses to derive a slotKey from a label -
// duplicated (not imported) to keep this file's only dependency on that one
// small and obvious; must stay byte-identical to match slotKeys correctly.
export function slotKeyFor(label) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

// ── Template data ─────────────────────────────────────────────────────────────
// This is the fixed 30-slot skeleton (labels/categories/formats never change).
// Which slots are actually "live" can come from here (Option A/B, hardcoded)
// or be overlaid at runtime from Figma-imported templates - see
// overlayCustomCards() below, used by the default-exported TemplatePicker.
export const BASE_TEMPLATES = [
  {
    label: 'Restaurant Flyer · Option A',
    category: 'restaurant', format: 'Flyer',
    groupThumb: '/templates/tile-restaurant-flyer.png',
    thumb: '/templates/preview_opt-a.png',
    live: true,
    templateIdGuided:        'wen-cheng-flyer2-simple',
    templateIdGuidedText:    'wen-cheng-flyer1-simple',
    templateIdDesigner:      'wen-cheng-flyer2',
    templateIdDesignerText:  'wen-cheng-flyer1',
  },
  {
    label: 'Restaurant Flyer · Option B',
    category: 'restaurant', format: 'Flyer',
    thumb: '/templates/preview_opt-b.png',
    live: true,
    templateIdGuided:   'opt-b-flyer2-simple',
    templateIdDesigner: 'opt-b-flyer2',
  },
  // thumb here is a curated catalogue tile, separate from the real Figma
  // background overlayCustomCards() would otherwise default to - see that
  // function's comment for how a slot's own thumb now wins when set.
  { label: 'Restaurant Flyer · Option C', category: 'restaurant', format: 'Flyer',       live: false, thumb: '/templates/preview_opt-c.png' },
  { label: 'Restaurant Flyer · Option D', category: 'restaurant', format: 'Flyer',       live: false },
  { label: 'Restaurant Flyer · Option E', category: 'restaurant', format: 'Flyer',       live: false },
  { label: 'Restaurant Poster · Option A', category: 'restaurant', format: 'Poster',     live: false },
  { label: 'Restaurant Poster · Option B', category: 'restaurant', format: 'Poster',     live: false },
  { label: 'Restaurant Poster · Option C', category: 'restaurant', format: 'Poster',     live: false },
  { label: 'Restaurant Poster · Option D', category: 'restaurant', format: 'Poster',     live: false },
  { label: 'Restaurant Poster · Option E', category: 'restaurant', format: 'Poster',     live: false },
  { label: 'Restaurant Wild Poster · Option A', category: 'restaurant', format: 'Wild Poster', live: false },
  { label: 'Restaurant Wild Poster · Option B', category: 'restaurant', format: 'Wild Poster', live: false },
  { label: 'Restaurant Wild Poster · Option C', category: 'restaurant', format: 'Wild Poster', live: false },
  { label: 'Restaurant Wild Poster · Option D', category: 'restaurant', format: 'Wild Poster', live: false },
  { label: 'Restaurant Wild Poster · Option E', category: 'restaurant', format: 'Wild Poster', live: false },
  { label: 'Retail Flyer · Option A', category: 'retail', format: 'Flyer', live: false },
  { label: 'Retail Flyer · Option B', category: 'retail', format: 'Flyer', live: false },
  { label: 'Retail Flyer · Option C', category: 'retail', format: 'Flyer', live: false },
  { label: 'Retail Flyer · Option D', category: 'retail', format: 'Flyer', live: false },
  { label: 'Retail Flyer · Option E', category: 'retail', format: 'Flyer', live: false },
  { label: 'Retail Poster · Option A', category: 'retail', format: 'Poster', live: false },
  { label: 'Retail Poster · Option B', category: 'retail', format: 'Poster', live: false },
  { label: 'Retail Poster · Option C', category: 'retail', format: 'Poster', live: false },
  { label: 'Retail Poster · Option D', category: 'retail', format: 'Poster', live: false },
  { label: 'Retail Poster · Option E', category: 'retail', format: 'Poster', live: false },
  { label: 'Retail Wild Poster · Option A', category: 'retail', format: 'Wild Poster', live: false },
  { label: 'Retail Wild Poster · Option B', category: 'retail', format: 'Wild Poster', live: false },
  { label: 'Retail Wild Poster · Option C', category: 'retail', format: 'Wild Poster', live: false },
  { label: 'Retail Wild Poster · Option D', category: 'retail', format: 'Wild Poster', live: false },
  { label: 'Retail Wild Poster · Option E', category: 'retail', format: 'Wild Poster', live: false },
]

// Fills empty ("coming soon") slots with matching Figma-imported templates,
// and separately lets a HARDCODED live slot (Option A/B) be archived too -
// via a lightweight "override" record (isOverrideOnly:true, no real
// zones/background, see src/lib/customTemplates.js) keyed by the same
// slugified label a real Figma import uses. Never touches a hardcoded
// slot's underlying data, only whether it's shown. Matched by exact label +
// category + format - the designer picks the target slot by label when
// importing, so this only needs a direct match, not fuzzy logic.
export function overlayCustomCards(baseTemplates, customCards, customRecords = []) {
  return baseTemplates.map(slot => {
    if (slot.live) {
      const override = customRecords.find(r => r.slotKey === slotKeyFor(slot.label) && r.isOverrideOnly)
      // Archived hardcoded slot → hide exactly like an archived import does.
      // Restoring just clears the override, so the slot goes right back to live.
      return override?.archived ? { ...slot, live: false } : slot
    }
    const designerCard = customCards.find(c =>
      c.mode === 'designer' && c.name === slot.label && c.cat === slot.category && c.format === slot.format
    )
    // Archived records stay invisible everywhere - same as if nothing had
    // ever been imported into this slot, freeing it up for a fresh import.
    if (!designerCard || designerCard.archived) return slot
    return {
      ...slot,
      // A slot's own curated thumb (set directly in BASE_TEMPLATES, e.g.
      // Option C's preview_opt-c.png) wins over the raw Figma background
      // designerCard.thumb would otherwise default to - same idea as
      // Option A/B's hardcoded thumb, just also usable on an
      // otherwise-dynamic Figma-imported slot. Julia's ask, 2026-09-11.
      thumb: slot.thumb ?? designerCard.thumb,
      live: designerCard.live,
      templateIdGuided: `${designerCard.id}-simple`,
      templateIdDesigner: designerCard.id,
    }
  })
}

// Resolves a candidate id from the front-of-brief template pick (Julia's
// ask, 2026-09-10: picking a template is now Step 1, and submitting the
// brief opens LayoutModal directly for it, skipping the card-grid screen
// entirely) to the "entry" shape LayoutModal expects - same overlay logic
// BriefTemplatePicker already runs, so a Figma-imported override still
// resolves correctly here too, not just for the two hardcoded options.
export function entryForGuidedId(templateId, customCards = [], customRecords = []) {
  if (!templateId) return null
  const overlaid = overlayCustomCards(BASE_TEMPLATES, customCards, customRecords)
  return overlaid.find(e => e.templateIdGuided === templateId) ?? null
}

// Derive unique groups from a templates array, preserving order.
export function deriveGroups(templates) {
  const seen = new Set()
  const groups = []
  for (const t of templates) {
    const key = `${t.category}__${t.format}`
    if (!seen.has(key)) {
      seen.add(key)
      const members = templates.filter(x => x.category === t.category && x.format === t.format)
      const hero    = members.find(x => x.live) ?? null
      const liveCount = members.filter(x => x.live).length
      groups.push({ category: t.category, format: t.format, key, members, hero, liveCount })
    }
  }
  return groups
}

// Which BASE_TEMPLATES `format` strings actually have at least one live
// template for a given category, factoring in Figma imports the same way
// the real picker does (overlayCustomCards) - so this stays correct as
// templates get published, not just for the two hardcoded flyers today.
// Used by BriefingForm.jsx to grey out/disable "coming soon" formats in the
// brief instead of letting a partner pick one the tool can't produce yet
// (checklist i10, 2026-09-08).
export function liveFormatsFor(category, customCards = [], customRecords = []) {
  const allTemplates = overlayCustomCards(BASE_TEMPLATES, customCards, customRecords)
  return deriveGroups(allTemplates)
    .filter(g => g.category === category && g.liveCount > 0)
    .map(g => g.format)
}

