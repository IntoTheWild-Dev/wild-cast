// Real AI copy suggestions for AISuggest.jsx, grounded in real historical
// Wolt campaign copy (see api/_lib/campaignSheet.js for the sheet source).
import { loadSheetRows, columnsForField, collectExamples } from './_lib/campaignSheet.js'

// Fallback instruction text for field values with no dedicated sheet column
// (FieldEditor.jsx passes arbitrary zone ids, not just headline/sub_headline).
const FIELD_DESCRIPTIONS = {
  headline: 'a short, punchy standalone headline — NOT a combined headline+tagline',
  sub_headline: 'a supporting subline that complements a headline, on its own',
  subline: 'a supporting subline that complements a headline, on its own',
  offer: 'a short offer/discount badge line',
  tc: 'a realistic German T&Cs disclaimer line for a Wolt promotion',
}

// Same limits FieldEditor.jsx enforces on these fields (see its CHAR_LIMITS) —
// matched here so AI suggestions actually fit the template zones instead of
// getting cut off or overflowing. Kept as a separate constant rather than a
// shared import since FieldEditor.jsx's copy is frontend-only and this is a
// serverless function; duplication here is one small object, not worth a
// cross-boundary shared module for.
const CHAR_LIMITS = { headline: 30, sub_headline: 60, subline: 60, offer: 20, tc: 120, restaurant_name: 30, cta: 60 }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const apiKey = process.env.WILDCAST_COPY
  if (!apiKey) {
    return res.status(500).json({ error: 'WILDCAST_COPY (Anthropic API key) is not configured' })
  }

  try {
    const { field, lang = 'de', context = {} } = req.body ?? {}
    const describe = FIELD_DESCRIPTIONS[field] ?? `a short line of copy for "${field}"`
    const limit = CHAR_LIMITS[field]

    const rows = await loadSheetRows()
    const examples = collectExamples(rows, columnsForField(field))

    const langLabel = lang === 'en' ? 'English' : 'German'
    const briefLines = [
      context.businessType && `Business type: ${context.businessType}`,
      context.about && `Brief: ${context.about}`,
      context.objective && `Objective: ${context.objective}`,
      context.partnerName && `Partner: ${context.partnerName}`,
    ].filter(Boolean).join('\n')

    const prompt = `You are writing marketing copy for a Wolt food-delivery partner flyer/poster.

Generate 6 options for ${describe}, in ${langLabel}, matching Wolt's punchy promotional style.
${limit ? `\nHARD LIMIT: each option must be ${limit} characters or fewer, including spaces and punctuation. This is a strict print-layout constraint — options over the limit are useless, not just less ideal. If ${describe} implies two ideas, pick ONE and cut the rest; do not try to fit multiple sentences or thoughts into a single option.\n` : ''}${examples.length ? `\nReal examples of past approved Wolt campaign copy (tone/style reference only — do not copy directly, and note these are historical examples that may run longer than today's ${limit ?? 'target'}-character limit):\n${examples.map(e => `- ${e}`).join('\n')}\n` : ''}${briefLines ? `\nThis specific brief:\n${briefLines}\n` : ''}
Call provide_suggestions with exactly 6 options, each independently respecting the character limit above.`

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
        tools: [{
          name: 'provide_suggestions',
          description: 'Return the generated copy suggestions.',
          input_schema: {
            type: 'object',
            properties: {
              suggestions: {
                type: 'array',
                items: { type: 'string' },
                description: 'Exactly 6 suggested lines of copy, each within the stated character limit.',
              },
            },
            required: ['suggestions'],
          },
        }],
        tool_choice: { type: 'tool', name: 'provide_suggestions' },
      }),
    })

    if (!aiRes.ok) {
      const errBody = await aiRes.text()
      throw new Error(`Anthropic API ${aiRes.status}: ${errBody}`)
    }

    const data = await aiRes.json()
    const toolUse = data.content?.find(c => c.type === 'tool_use')
    let suggestions = toolUse?.input?.suggestions ?? []

    // Defensive: LLMs don't always obey character limits even when asked
    // clearly, and an over-limit "suggestion" is actively wrong here (it
    // won't fit the template zone), not just a style miss — filter rather
    // than trust the prompt alone. Requesting 6 gives headroom so filtering
    // still leaves a real choice.
    if (limit) {
      suggestions = suggestions.filter(s => s.length <= limit)
    }
    suggestions = suggestions.slice(0, 4)

    return res.status(200).json({ suggestions })
  } catch (err) {
    console.error('ai-suggest error:', err)
    return res.status(500).json({ error: err.message })
  }
}
