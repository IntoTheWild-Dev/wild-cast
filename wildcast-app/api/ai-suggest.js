// Real AI copy suggestions for AISuggest.jsx, grounded in real historical
// Wolt campaign copy (see api/_lib/campaignSheet.js for the sheet source).
import { loadSheetRows, columnsForField, collectExamples } from './_lib/campaignSheet.js'

// Fallback instruction text for field values with no dedicated sheet column
// (FieldEditor.jsx passes arbitrary zone ids, not just headline/sub_headline).
const FIELD_DESCRIPTIONS = {
  headline: 'a short, punchy headline',
  sub_headline: 'a supporting subline',
  subline: 'a supporting subline',
  offer: 'a short offer/discount badge line',
  tc: 'a realistic German T&Cs disclaimer line for a Wolt promotion',
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const apiKey = process.env.WILDCAST_COPY
  if (!apiKey) {
    return res.status(500).json({ error: 'WILDCAST_COPY (Anthropic API key) is not configured' })
  }

  try {
    const { field, lang = 'de', context = {} } = req.body ?? {}
    const describe = FIELD_DESCRIPTIONS[field] ?? `a short line of copy for "${field}"`

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

Generate 4 options for ${describe}, in ${langLabel}, matching Wolt's punchy promotional style.
${examples.length ? `\nReal examples of past approved Wolt campaign copy (tone/style reference only — do not copy directly):\n${examples.map(e => `- ${e}`).join('\n')}\n` : ''}${briefLines ? `\nThis specific brief:\n${briefLines}\n` : ''}
Call provide_suggestions with exactly 4 options.`

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 500,
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
                description: 'Exactly 4 suggested lines of copy.',
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
    const suggestions = toolUse?.input?.suggestions ?? []

    return res.status(200).json({ suggestions })
  } catch (err) {
    console.error('ai-suggest error:', err)
    return res.status(500).json({ error: err.message })
  }
}
