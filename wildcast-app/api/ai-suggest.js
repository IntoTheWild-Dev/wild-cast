// Real AI copy suggestions for AISuggest.jsx, grounded in real historical
// Wolt campaign copy (a published-to-web Google Sheet, fetched as CSV).
import Papa from 'papaparse'

const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSfD0VMulwdB55zZ2Vn-OqPxRXj_8pUZ2FSp8Idl_NQrcRUDuLDSJp5n4hLJFPRCV3RB5oTj6MYF7wT/pub?gid=0&single=true&output=csv'

// Maps AISuggest's `field` prop to the sheet column(s) holding real examples
// of that field. `describe` is the fallback instruction for field values
// that don't have a column in the sheet (FieldEditor.jsx passes arbitrary
// zone ids, not just headline/sub_headline).
const FIELD_MAP = {
  headline: { columns: ['Headline'], describe: 'a short, punchy headline' },
  sub_headline: { columns: ['Sub Headline', 'Sub Headline 2'], describe: 'a supporting subline' },
  offer: { columns: ['Sticker'], describe: 'a short offer/discount badge line' },
  tc: { columns: [], describe: 'a realistic German T&Cs disclaimer line for a Wolt promotion' },
}

// Sheet changes rarely — cache in module scope so repeated requests within
// the same warm serverless instance don't refetch on every keystroke-adjacent
// call. Cold starts just refetch, which is fine at this traffic level.
let cachedRows = null
let cachedAt = 0
const CACHE_MS = 5 * 60 * 1000

async function loadSheetRows() {
  if (cachedRows && Date.now() - cachedAt < CACHE_MS) return cachedRows

  const res = await fetch(SHEET_CSV_URL)
  if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`)
  const csvText = await res.text()

  const parsed = Papa.parse(csvText, { skipEmptyLines: true })
  // Row 0 is a blank leading-column artifact from the sheet export; row 1
  // is the real header (Tasks, Type of Campaign, Headline, Sub Headline, ...).
  const header = parsed.data[1] ?? []
  const rows = parsed.data.slice(2)
    .map(row => {
      const obj = {}
      header.forEach((h, i) => { obj[(h || '').trim()] = (row[i] || '').trim() })
      return obj
    })
    .filter(r => r['Headline'] || r['Sub Headline'] || r['Sticker'])

  cachedRows = rows
  cachedAt = Date.now()
  return rows
}

function buildExamples(rows, columns, limit = 25) {
  const values = []
  for (const row of rows) {
    for (const col of columns) {
      if (row[col]) values.push(row[col].replace(/\s+/g, ' ').trim())
    }
  }
  return [...new Set(values)].slice(0, limit)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured' })
  }

  try {
    const { field, lang = 'de', context = {} } = req.body ?? {}
    const fieldConfig = FIELD_MAP[field] ?? { columns: [], describe: `a short line of copy for "${field}"` }

    const rows = await loadSheetRows()
    const examples = buildExamples(rows, fieldConfig.columns)

    const langLabel = lang === 'en' ? 'English' : 'German'
    const briefLines = [
      context.businessType && `Business type: ${context.businessType}`,
      context.about && `Brief: ${context.about}`,
      context.objective && `Objective: ${context.objective}`,
      context.partnerName && `Partner: ${context.partnerName}`,
    ].filter(Boolean).join('\n')

    const prompt = `You are writing marketing copy for a Wolt food-delivery partner flyer/poster.

Generate 4 options for ${fieldConfig.describe}, in ${langLabel}, matching Wolt's punchy promotional style.
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
