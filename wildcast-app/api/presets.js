// Real historical Wolt campaign copy from the knowledge base, served
// verbatim — no AI, no cost, no wait. The "pick something that's already
// proven to work" counterpart to AI Suggest (ai-suggest.js), which generates
// new tailored copy instead. A `vertical` query param ("Restaurant" /
// "Retail") strictly gates which rows come back — Retail briefs never see
// Restaurant lines and vice versa; only Cross-vertical / Brand lines are
// shared between the two.
import {
  loadKnowledgeBase,
  contentTypeForField,
  collectExamples,
  filterRowsByPartner,
  filterRowsByVertical,
} from './_lib/campaignSheet.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  try {
    const { field, partner, vertical } = req.query
    const { rows } = await loadKnowledgeBase()
    // Vertical gate first (hard, never widened), then the soft partner
    // scope on top of the vertical's rows.
    const scopedRows = filterRowsByVertical(rows, vertical)
    const partnerRows = filterRowsByPartner(scopedRows, partner)
    const presets = collectExamples(partnerRows, contentTypeForField(field), 12)
    return res.status(200).json({ presets })
  } catch (err) {
    console.error('presets error:', err)
    return res.status(500).json({ error: err.message })
  }
}
