// Real past Wolt copy from the Copy Library (same Google Sheet as
// ai-suggest.js — no second database), served verbatim: no AI, no cost, no
// wait. The "Choose preset" counterpart to AI Suggest.
//
// Mark's v1.2 (spec §5.1): for the headline, serve "Lockup: Headline"
// values and short headline rows that fit the field's box (max_chars_min_pt);
// for the sub-headline, "Lockup: Sub-headline" values (setup role) or
// subline rows (support role) that fit. Only tier A/B, matching vertical.
import {
  loadKnowledgeBase,
  filterRowsByVertical,
  matchRowsByPartner,
} from './_lib/campaignSheet.js'

// Case-insensitive contains on word starts — "wie wär's mit" lockup halves
// and merchant scoping.
// ── (no helper functions needed beyond the shared campaignSheet ones) ────────

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  try {
    const { field, partner, vertical } = req.query

    // Presets exist only for the two AI fields (spec §1/§5.1). Every other
    // field (offer, tc, restaurant_name, cta) renders a "Choose preset"
    // button too — serving it marketing headlines would be nonsense (the
    // old sheet mapping returned nothing for them; same behavior here).
    if (!['headline', 'sub_headline', 'subline'].includes(field)) {
      return res.status(200).json({ presets: [] })
    }

    // Box fit at min pt + the sub-headline's role, sent by PresetPicker via
    // FieldEditor from the template's §4.1 settings. Old callers that omit
    // them get length-agnostic lists (better a long preset than none).
    const maxChars = Number(req.query.max_chars_min_pt) || Number(req.query.max_chars) || 0
    const role = req.query.role === 'support' ? 'support' : 'setup'
    const lang = String(req.query.lang || 'de').toLowerCase() === 'en' ? 'EN' : 'DE'

    const isHeadline = field !== 'sub_headline' && field !== 'subline'

    const { rows } = await loadKnowledgeBase()
    // Vertical gate first (hard, never widened), then the soft partner
    // scope on top of the vertical's rows.
    const scopedRows = filterRowsByVertical(rows, vertical)
    const partnerRows = matchRowsByPartner(scopedRows, partner)
    const pool = partnerRows ?? scopedRows

    // Spec §5.1: tier A/B only, example-tagged rows only.
    const eligible = pool.filter(r =>
      (r.Tier || '').trim().toUpperCase() !== 'C' &&
      (r['Use as example'] || '').trim().toUpperCase() === 'Y')

    // German-family lines only — the sheet's market is Wolt DE and the
    // preset picker has no language toggle (showing an empty EN tab would
    // mislead; same reasoning as before the v1.2 sheet).
    const langOk = r => /^(DE|DE\+EN|DE \(Swabian\)|DE \(Austrian\)|DE\+IT|DE\+ES|Symbolic)/i.test(r.Language || '') || lang === 'EN'

    function fits(text) {
      if (!text) return false
      return !maxChars || text.length <= maxChars
    }

    const presets = []
    const seen = new Set()
    const push = (text, sortKey) => {
      const value = text.replace(/\s+/g, ' ').trim()
      const key = value.toLowerCase()
      if (!value || seen.has(key)) return
      seen.add(key)
      presets.push({ value, sortKey })
    }

    if (isHeadline) {
      // Lockup headlines first (the real Wolt form), then standalone
      // headline rows that fit the box at min pt.
      for (const r of eligible) {
        if (r['Lockup: Headline'] && r['Lockup: Sub-headline'] && fits(r['Lockup: Headline']) && langOk(r)) {
          push(r['Lockup: Headline'], 0)
        }
      }
      for (const r of eligible) {
        if (!r['Lockup: Headline'] && (r.Field || '').trim() === 'headline' && fits(r.Copy) && langOk(r)) {
          push(r.Copy, 1)
        }
      }
    } else if (role === 'setup') {
      // Setup sub-headlines lead into a big headline — the "Lockup:
      // Sub-headline" column is exactly that.
      for (const r of eligible) {
        if (r['Lockup: Sub-headline'] && r['Lockup: Headline'] && fits(r['Lockup: Sub-headline']) && langOk(r)) {
          push(r['Lockup: Sub-headline'], 0)
        }
      }
    } else {
      // Support sub-headlines add offer/product/CTA — standalone subline rows.
      for (const r of eligible) {
        if ((r.Field || '').trim() === 'subline' && fits(r.Copy) && langOk(r)) {
          push(r.Copy, 1)
        }
      }
    }

    // Lockup rows before standalone singles (partner scoping already
    // happened by choosing the pool).
    presets.sort((a, b) => a.sortKey - b.sortKey)

    return res.status(200).json({ presets: presets.slice(0, 12).map(p => p.value) })
  } catch (err) {
    console.error('presets error:', err)
    return res.status(500).json({ error: err.message })
  }
}
