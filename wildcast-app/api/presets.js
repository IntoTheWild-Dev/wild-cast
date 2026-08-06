// Real historical Wolt campaign copy, served verbatim — no AI, no cost,
// no wait. The "pick something that's already proven to work" counterpart
// to AI Suggest (ai-suggest.js), which generates new tailored copy instead.
import { loadSheetRows, columnsForField, collectExamples } from './_lib/campaignSheet.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  try {
    const { field } = req.query
    const rows = await loadSheetRows()
    const presets = collectExamples(rows, columnsForField(field), 12)
    return res.status(200).json({ presets })
  } catch (err) {
    console.error('presets error:', err)
    return res.status(500).json({ error: err.message })
  }
}
