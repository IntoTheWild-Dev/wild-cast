// Shared access to the Wolt AI copywriting knowledge base
// (Wolt_AI_Copywriting_Knowledge_Base_Merged_Restaurant_Retail.xlsx) — used
// by both api/ai-suggest.js (as few-shot grounding for Claude) and
// api/presets.js (served verbatim, no AI). One fetch/parse/cache
// implementation so the two never drift on column names or field mapping.
//
// The merged KB is long-format: one row per Copy line, tagged with
// "Content Type" (Headline / Subline / CTA / ...) and "Vertical"
// (Restaurant / Retail / Cross-vertical / Brand / ...). Sibling tabs
// (Vertical Guide, AI Instructions) carry the tone rules — the Vertical
// Guide rows are injected into generation prompts so the model gets the
// vertical-specific nouns/verbs/guardrails, not just raw examples.
import Papa from 'papaparse'

const SHEET_ID = '1F-6mpmPzPqE4wsj47hVkER7q3OCkH62G'
// gviz CSV endpoint works for link-shared sheets; tabs are addressed by
// name (gids aren't exposed without an authenticated session).
const TAB_URL = tab =>
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`

const HEADLINE_LIBRARY_TAB = 'Headline Library'
const VERTICAL_GUIDE_TAB = 'Vertical Guide'

// Maps a `field` prop value (from AISuggest.jsx / PresetPicker.jsx) to the
// "Content Type" holding real examples of that field. BriefingForm.jsx and
// AISuggest.jsx don't agree on a name for the subline field ("subline" vs
// "sub_headline") — both are accepted here so callers don't need to care.
// offer/tc have no dedicated content type in the KB yet → null (no examples).
export const FIELD_CONTENT_TYPES = {
  headline: 'Headline',
  subline: 'Subline',
  sub_headline: 'Subline',
  cta: 'CTA',
  offer: null,
  tc: null,
}

export function contentTypeForField(field) {
  return FIELD_CONTENT_TYPES[field] ?? null
}

// Strict vertical allow-list — the retrieval core of the merged KB.
// Restaurant briefs may only see Restaurant + Cross-vertical / Brand
// examples; Retail briefs only Retail + Cross-vertical / Brand. Every other
// row ("Mixed / Multi-vertical" is for briefs spanning both verticals per
// the Vertical Guide's own AI rule; "Needs review" is unvetted) is excluded
// whenever a vertical is known, so Restaurant and Retail copy rules can
// never contaminate each other.
export const VERTICAL_ALLOW_LIST = {
  Restaurant: ['Restaurant', 'Cross-vertical / Brand'],
  Retail: ['Retail', 'Cross-vertical / Brand'],
}

// Accepts the raw sheet's Vertical cell (and case/space variants of it) and
// returns the canonical label, or null when the row has no usable vertical.
function canonicalVertical(raw) {
  const v = (raw || '').trim().toLowerCase()
  if (!v) return null
  if (v === 'restaurant') return 'Restaurant'
  if (v === 'retail') return 'Retail'
  if (v.startsWith('cross-vertical')) return 'Cross-vertical / Brand'
  if (v.startsWith('mixed')) return 'Mixed / Multi-vertical'
  return raw.trim()
}

// The only vertical that is safe for every brief: neutral brand/delivery
// hooks. Used as the fallback whenever a brief's vertical is unknown.
const ALWAYS_ALLOWED = ['Cross-vertical / Brand']

// Narrows rows to the allow-list for a brief's vertical. Restaurant briefs
// see Restaurant + Cross-vertical / Brand rows; Retail briefs see Retail +
// Cross-vertical / Brand rows; an unknown/missing vertical (e.g. a design
// saved before verticals shipped) falls back to Cross-vertical / Brand rows
// only — never the other vertical's language, whichever way the brief is
// missing. An empty result stays empty: an unfiltered leak is worse than no
// examples.
export function filterRowsByVertical(rows, vertical) {
  const allowed = VERTICAL_ALLOW_LIST[vertical] ?? ALWAYS_ALLOWED
  const allowedSet = new Set(allowed)
  return rows.filter(r => {
    const v = canonicalVertical(r['Vertical'])
    return v !== null && allowedSet.has(v)
  })
}

// Narrows rows to the given partner/merchant, matched against the KB's
// free-text "Merchant / Context" column. Matches on either the full partner
// name or any of its individual words (min 3 chars, to skip noise like "&")
// appearing in the text, case-insensitive. Falls back to the full row set
// when nothing matches — most of the library isn't tagged to any of today's
// partners yet, and an empty result is worse than an untargeted one.
export function filterRowsByPartner(rows, partnerName) {
  if (!partnerName || !partnerName.trim()) return rows

  const needle = partnerName.trim().toLowerCase()
  const words = needle.split(/\s+/).filter(w => w.length >= 3)

  const matched = rows.filter(r => {
    const merchant = (r['Merchant / Context'] || '').toLowerCase()
    if (!merchant) return false
    return merchant.includes(needle) || words.some(w => merchant.includes(w))
  })

  return matched.length > 0 ? matched : rows
}

// Real examples of a field's content type, extracted from the KB rows.
// Limit defaults lower than the old sheet's 25 because a structured prompt
// block carries the vertical rules too.
export function collectExamples(rows, contentType, limit = 20) {
  if (!contentType) return []
  const values = []
  for (const row of rows) {
    if ((row['Content Type'] || '').trim() === contentType && row['Copy']) {
      values.push(row['Copy'].replace(/\s+/g, ' ').trim())
    }
  }
  return [...new Set(values)].slice(0, limit)
}

let cachedKb = null
let cachedAt = 0
const CACHE_MS = 5 * 60 * 1000

function parseCsvRows(csvText) {
  const parsed = Papa.parse(csvText, { skipEmptyLines: true })
  const header = (parsed.data[0] ?? []).map(h => (h || '').trim())
  return parsed.data.slice(1)
    .map(row => {
      const obj = {}
      header.forEach((h, i) => { obj[h] = (row[i] || '').trim() })
      return obj
    })
}

export async function loadKnowledgeBase() {
  if (cachedKb && Date.now() - cachedAt < CACHE_MS) return cachedKb

  const [libRes, guideRes] = await Promise.all([
    fetch(TAB_URL(HEADLINE_LIBRARY_TAB)),
    fetch(TAB_URL(VERTICAL_GUIDE_TAB)),
  ])
  if (!libRes.ok) throw new Error(`Headline Library fetch failed: ${libRes.status}`)
  if (!guideRes.ok) throw new Error(`Vertical Guide fetch failed: ${guideRes.status}`)

  const rows = parseCsvRows(await libRes.text())
    .filter(r => r['Copy'] && r['Content Type'])
  const verticalGuide = parseCsvRows(await guideRes.text())
    .filter(r => r['Vertical'])

  cachedKb = { rows, verticalGuide }
  cachedAt = Date.now()
  return cachedKb
}

// Formats the Vertical Guide rules relevant to a brief's vertical into a
// prompt block. Same allow-list semantics as filterRowsByVertical (unknown
// vertical → Cross-vertical / Brand rules only) so the prose rules and the
// few-shot examples can never disagree on vertical.
export function verticalRulesBlock(verticalGuide, vertical) {
  const allowed = new Set(VERTICAL_ALLOW_LIST[vertical] ?? ALWAYS_ALLOWED)
  if (!verticalGuide?.length) return ''
  const lines = verticalGuide
    .map(r => ({ ...r, vertical: canonicalVertical(r['Vertical']) }))
    .filter(r => r.vertical && allowed.has(r.vertical))
    .map(r => {
      const parts = [
        `${r.vertical}: ${r['Definition']}`,
        r['Typical subjects / nouns'] && `Typical subjects: ${r['Typical subjects / nouns']}`,
        r['Typical verbs / mechanisms'] && `Typical verbs/mechanisms: ${r['Typical verbs / mechanisms']}`,
        r['AI rule'] && `AI rule: ${r['AI rule']}`,
      ].filter(Boolean)
      return `- ${parts.join(' | ')}`
    })
  return lines.length ? lines.join('\n') : ''
}
