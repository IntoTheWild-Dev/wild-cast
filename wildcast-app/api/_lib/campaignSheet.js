// Shared access to the published Google Sheet of real historical Wolt
// campaign copy — used by both api/ai-suggest.js (as few-shot grounding for
// Claude) and api/presets.js (served verbatim, no AI). One fetch/parse/cache
// implementation so the two never drift on column names or field mapping.
import Papa from 'papaparse'

const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSfD0VMulwdB55zZ2Vn-OqPxRXj_8pUZ2FSp8Idl_NQrcRUDuLDSJp5n4hLJFPRCV3RB5oTj6MYF7wT/pub?gid=0&single=true&output=csv'

// Maps a `field` prop value (from AISuggest.jsx / PresetPicker.jsx) to the
// sheet column(s) holding real examples of that field. BriefingForm.jsx and
// AISuggest.jsx don't agree on a name for the subline field ("subline" vs
// "sub_headline") — both are accepted here so callers don't need to care.
export const FIELD_COLUMNS = {
  headline: ['Headline'],
  subline: ['Sub Headline', 'Sub Headline 2'],
  sub_headline: ['Sub Headline', 'Sub Headline 2'],
  offer: ['Sticker'],
  tc: [],
}

let cachedRows = null
let cachedAt = 0
const CACHE_MS = 5 * 60 * 1000

export async function loadSheetRows() {
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

export function columnsForField(field) {
  return FIELD_COLUMNS[field] ?? []
}

export function collectExamples(rows, columns, limit = 25) {
  const values = []
  for (const row of rows) {
    for (const col of columns) {
      if (row[col]) values.push(row[col].replace(/\s+/g, ' ').trim())
    }
  }
  return [...new Set(values)].slice(0, limit)
}
