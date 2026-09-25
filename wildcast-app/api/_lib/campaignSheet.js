// Shared access to the Wolt copy knowledge base (Google Sheet
// `wolt-copy-kb-clean.xlsx`, sheet ID below) — used by api/ai-suggest.js
// (few-shot grounding + patterns table + vertical word checks) and
// api/presets.js (lockup presets served verbatim, no AI). One
// fetch/parse/cache implementation so the two never drift on column names
// or field mapping.
//
// This is Mark's v1.2 schema and fully replaces the old two-tab sheet
// ("Headline Library" / "Vertical Guide"). Tabs the code reads:
//   Copy Library — one row per line; only rows with Field = headline/subline
//                  and Use as example = Y are ever sent to the model.
//   Skeletons    — proven fill-in skeletons (S16 is the flyer lockup).
//   Patterns     — the P01–P22 creative patterns, injected into the cached
//                  system prompt as a plain-text table.
//   Verticals    — per-vertical signal/blocked words, used by the code-side
//                  vertical contamination check (spec §9 C5).
// The Rules / Layouts / Fineprint / Changelog tabs are NOT read by code:
// the Rules are embedded verbatim in the system prompt, Layouts must never
// be sent as examples ("Whole-asset copy stacks"), Fineprint is never
// AI-generated.
import Papa from 'papaparse'

const SHEET_ID = '1FQ5R_go_zlA3RXddZ3wddEMbTVpbOcOY'
// gviz CSV endpoint works for link-shared sheets; tabs are addressed by
// name (gids aren't exposed without an authenticated session).
const TAB_URL = tab =>
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`

const COPY_LIBRARY_TAB = 'Copy Library'
const SKELETONS_TAB = 'Skeletons'
const PATTERNS_TAB = 'Patterns'
const VERTICALS_TAB = 'Verticals'

// Column names in the Copy Library tab (v1.2 schema).
export const COPY_FIELDS = {
  ID: 'ID',
  COPY: 'Copy',
  LOCKUP_SUB: 'Lockup: Sub-headline',
  LOCKUP_HEAD: 'Lockup: Headline',
  FIELD: 'Field',
  LANGUAGE: 'Language',
  MARKET: 'Market',
  CITY: 'City / District',
  MERCHANT: 'Merchant',
  CATEGORY: 'Category / Product',
  VERTICAL: 'Vertical',
  MECHANIC: 'Offer / Mechanic',
  PATTERN: 'Pattern',
  TIER: 'Tier',
  USE_AS_EXAMPLE: 'Use as example',
}

// The Copy Library header row carries an instruction note inside its first
// header cell ("One row = one line … Use as example = Y. ID"), so the raw
// first header is not literally "ID". Normalise it: the real column names
// start at the last whitespace-separated token of that cell.
function normalizeHeader(headerRow) {
  const header = (headerRow ?? []).map(h => (h || '').trim())
  if (header.length && !/^(id|copy|vertical|tier)$/i.test(header[0])) {
    const parts = header[0].split(/\s+/)
    header[0] = parts[parts.length - 1]
  }
  return header
}

function parseCsvRows(csvText) {
  const parsed = Papa.parse(csvText, { skipEmptyLines: true })
  const header = normalizeHeader(parsed.data[0])
  return parsed.data.slice(1)
    .map(row => {
      const obj = {}
      header.forEach((h, i) => { obj[h] = (row[i] || '').trim() })
      return obj
    })
}

async function fetchTab(tab) {
  const res = await fetch(TAB_URL(tab))
  if (!res.ok) throw new Error(`${tab} fetch failed: ${res.status}`)
  return parseCsvRows(await res.text())
}

let cachedKb = null
let cachedAt = 0
const CACHE_MS = 5 * 60 * 1000

// Loads and caches the four tabs the code reads. `rows` are Copy Library
// rows with a Copy value and a Field tag (the raw table minus fully empty
// lines); example filtering happens per-brief, not here.
export async function loadKnowledgeBase() {
  if (cachedKb && Date.now() - cachedAt < CACHE_MS) return cachedKb

  const [rows, skeletons, patterns, verticals] = await Promise.all([
    fetchTab(COPY_LIBRARY_TAB),
    fetchTab(SKELETONS_TAB),
    fetchTab(PATTERNS_TAB),
    fetchTab(VERTICALS_TAB),
  ])

  cachedKb = {
    rows: rows.filter(r => r.Copy && r.Field),
    skeletons: skeletons.filter(r => r.ID && r.Skeleton),
    patterns: patterns.filter(r => r.ID && r.Pattern),
    verticals: verticals.filter(r => r.Vertical),
  }
  cachedAt = Date.now()
  return cachedKb
}

// ── Vertical routing (spec §5 candidate gate + §9 C5) ───────────────────────

// Strict vertical allow-list — the retrieval core of the KB. Restaurant
// briefs may only see Restaurant + Cross-vertical / Brand examples; Retail
// briefs only Retail + Cross-vertical / Brand. "Mixed / Multi-vertical"
// rows are for briefs spanning both verticals only; "Needs review" is
// unvetted and never sent. An unknown/missing brief vertical (the spec's
// `unknown` case) falls back to Cross-vertical / Brand rows only — never
// the other vertical's language, whichever way the brief is missing.
export const VERTICAL_ALLOW_LIST = {
  Restaurant: ['Restaurant', 'Cross-vertical / Brand'],
  Retail: ['Retail', 'Cross-vertical / Brand'],
  'Mixed / Multi-vertical': ['Mixed / Multi-vertical', 'Cross-vertical / Brand'],
}
const ALWAYS_ALLOWED = ['Cross-vertical / Brand']

// Accepts the raw sheet's Vertical cell (and case/space variants of it) and
// returns the canonical label, or null when the row has no usable vertical.
function canonicalVertical(raw) {
  const v = (raw || '').trim().toLowerCase()
  if (!v) return null
  if (v === 'restaurant') return 'Restaurant'
  if (v === 'retail') return 'Retail'
  if (v.startsWith('mixed')) return 'Mixed / Multi-vertical'
  if (v.startsWith('cross-vertical')) return 'Cross-vertical / Brand'
  return raw.trim()
}

export function allowedVerticalsFor(vertical) {
  return VERTICAL_ALLOW_LIST[vertical] ?? ALWAYS_ALLOWED
}

// Narrows rows to the allow-list for a brief's vertical. An empty result
// stays empty: an unfiltered leak is worse than no examples.
export function filterRowsByVertical(rows, vertical) {
  const allowedSet = new Set(allowedVerticalsFor(vertical))
  return rows.filter(r => {
    const v = canonicalVertical(r.Vertical)
    return v !== null && allowedSet.has(v)
  })
}

// Blocked/signal words per vertical from the Verticals tab ("Blocked words
// (code)" column), used by the code-side vertical check (§9 C5). Falls back
// to empty lists for unknown verticals (nothing to enforce).
export function verticalWordRules(verticals, vertical) {
  const row = (verticals ?? []).find(r => canonicalVertical(r.Vertical) === vertical)
  const splitList = s => (s || '')
    .split(/[,;·]/)
    .map(w => w.trim())
    .filter(Boolean)
    .map(w => w.replace(/\s*\(.*?\)\s*$/, '').trim()) // drop trailing qualifiers
    .filter(Boolean)
  return {
    blocked: row ? splitList(row['Blocked words (code)']) : [],
    signal: row ? splitList(row['Signal words (code)']) : [],
  }
}

// ── Partner scope ────────────────────────────────────────────────────────────

// Narrows rows to the given partner/merchant, matched against the Copy
// Library's free-text "Merchant" column. Matches on either the full partner
// name or any of its individual words (min 3 chars, to skip noise like "&")
// appearing in the text, case-insensitive. Returns null when nothing
// matches (different from an empty match) so callers can fall back to the
// vertical's full row set — most of the library isn't tagged to today's
// partners yet, and an empty result is worse than an untargeted one.
export function matchRowsByPartner(rows, partnerName) {
  if (!partnerName || !partnerName.trim()) return null

  const needle = partnerName.trim().toLowerCase()
  const words = needle.split(/\s+/).filter(w => w.length >= 3)

  const matched = rows.filter(r => {
    const merchant = (r.Merchant || '').toLowerCase()
    if (!merchant) return false
    return merchant === needle ||
      merchant.includes(needle) ||
      words.some(w => merchant.includes(w))
  })

  return matched.length > 0 ? matched : null
}

// Legacy name kept for symmetry with the old module surface: falls back to
// the full row set when the partner has no tagged lines.
export function filterRowsByPartner(rows, partnerName) {
  return matchRowsByPartner(rows, partnerName) ?? rows
}

// ── Language matching (spec §5) ──────────────────────────────────────────────

// DE briefs accept the whole German family plus Symbolic; EN briefs accept
// EN, DE+EN and Symbolic. Anything else (IT/ES/...) matches neither.
const LANGUAGE_MATCH = {
  DE: ['DE', 'DE+EN', 'DE (Swabian)', 'DE (Austrian)', 'DE+IT', 'DE+ES', 'Symbolic'],
  EN: ['EN', 'DE+EN', 'Symbolic'],
}

function languageMatches(rowLanguage, briefLang) {
  const allowed = LANGUAGE_MATCH[(briefLang || 'DE').toUpperCase()] ?? LANGUAGE_MATCH.DE
  return allowed.includes((rowLanguage || '').trim())
}

// ── Example selection (spec §5) ──────────────────────────────────────────────
// Never send the whole library: score the eligible rows and send the top
// 8–15, under these hard limits:
//   max 3 rows from the same merchant, at least 4 different pattern IDs,
//   max 2 tier C rows, total 8–15.

const TIER_WEIGHT = { A: 3, B: 2, C: 1 }

const normText = s => (s || '').toLowerCase()

// Significant tokens of a free-text cell: words of 3+ chars, lowercased,
// punctuation stripped but offer symbols kept recognizable ("1+1", "2für1").
function tokens(text) {
  return normText(text)
    .split(/[^a-zäöüß0-9+%+]+/i)
    .map(t => t.trim())
    .filter(t => t.length >= 3 || /^\d/.test(t))
}

// True when the row's Offer / Mechanic cell shares a word (or an offer
// symbol like 1+1 / 2FÜR1 / %) with the brief's offer.
function mechanicOverlapsOffer(row, offerText) {
  const mechanic = normText(row.Mechanic)
  const offer = normText(offerText)
  if (!mechanic || !offer) return false
  if (/%/.test(mechanic) && /%/.test(offer)) return true
  const mTokens = new Set([...tokens(mechanic), ...symbols(mechanic)])
  const oTokens = new Set([...tokens(offer), ...symbols(offer)])
  for (const t of mTokens) if (oTokens.has(t)) return true
  return false
}

// Offer-symbol tokens: 1+1, 2für1, 3x10, 2x15 …
function symbols(text) {
  const t = normText(text)
  const out = []
  const plus = t.match(/\d\s*\+\s*\d/g)
  if (plus) out.push(...plus.map(s => s.replace(/\s+/g, '')))
  const für = t.match(/\d\s*für\s*\d/g)
  if (für) out.push(...für.map(s => s.replace(/\s+/g, '')))
  const mult = t.match(/\d\s*[x×]\s*\d*/g)
  if (mult) out.push(...mult.map(s => s.replace(/[\s×]/g, 'x')))
  return out
}

// "Haidhausen (Munich)" → "haidhausen"; compares the part before any
// parenthetical against the partner city, either direction.
function cityMatches(rowCity, partnerCity) {
  const a = normText(rowCity).replace(/\(.*?\)/g, '').trim()
  const b = normText(partnerCity).replace(/\(.*?\)/g, '').trim()
  if (!a || !b) return false
  return a === b || a.includes(b) || b.includes(a)
}

function merchantMatches(rowMerchant, partnerName) {
  const a = normText(rowMerchant)
  const b = normText(partnerName)
  if (!a || !b) return false
  if (a === b) return true
  const aw = a.split(/\s+/).filter(w => w.length >= 3)
  const bw = b.split(/\s+/).filter(w => w.length >= 3)
  return aw.some(w => bw.includes(w))
}

function categoryOverlaps(rowCategory, partnerCategory) {
  const a = tokens(rowCategory)
  const b = tokens(partnerCategory)
  return a.length > 0 && b.length > 0 && a.some(w => b.includes(w))
}

// Scores one Copy Library row against the brief (spec §5 score table).
export function scoreExampleRow(row, brief) {
  let score = TIER_WEIGHT[(row.Tier || 'C').trim().toUpperCase()] ?? 1
  if (row['Lockup: Sub-headline'] && row['Lockup: Headline']) score += 4
  if (merchantMatches(row.Merchant, brief.partnerName)) score += 3
  if (mechanicOverlapsOffer(row, brief.offerText)) score += 2
  if (cityMatches(row.City, brief.city)) score += 1
  if (categoryOverlaps(row.Category, brief.category)) score += 1
  return score
}

// The §5 candidate gate: example-tagged lockup/hook lines only, right
// language family, right vertical. Returns scored rows sorted best-first
// (lockup splits win ties so the real Wolt form floats up).
export function candidateExampleRows(rows, brief) {
  return rows
    .filter(r => (r['Use as example'] || '').trim().toUpperCase() === 'Y')
    .filter(r => ['headline', 'subline'].includes((r.Field || '').trim()))
    .filter(r => languageMatches(r.Language, brief.lang))
    .filter(r => {
      const v = canonicalVertical(r.Vertical)
      return v !== null && allowedVerticalsFor(brief.vertical).includes(v)
    })
    .map(r => ({ row: r, score: scoreExampleRow(r, brief) }))
    .sort((a, b) =>
      b.score - a.score ||
      ((b.row['Lockup: Headline'] ? 1 : 0) - (a.row['Lockup: Headline'] ? 1 : 0)) ||
      ((b.row.Tier || '').localeCompare(a.row.Tier || '')) ||
      (a.row.ID || '').localeCompare(b.row.ID || ''))
}

// Greedy pick under the merchant / tier-C limits, then repair the pattern
// diversity (≥4 distinct pattern IDs) by swapping in lower-scored rows that
// carry unused patterns when needed. Returns the winning row objects.
export function selectExamples(rows, brief, { max = 15, maxPerMerchant = 3, maxTierC = 2, minPatterns = 4 } = {}) {
  const candidates = candidateExampleRows(rows, brief)
  if (candidates.length === 0) return []

  const isTierC = c => (c.row.Tier || '').trim().toUpperCase() === 'C'
  const merchantOf = c => normText(c.row.Merchant) || '(none)'
  const patternOf = c => (c.row.Pattern || '').trim()

  // Pass 1: greedy by score with the per-merchant and tier-C caps.
  const picked = []
  const perMerchant = new Map()
  let tierC = 0
  for (const c of candidates) {
    if (picked.length >= max) break
    const m = merchantOf(c)
    if ((perMerchant.get(m) ?? 0) >= maxPerMerchant) continue
    if (isTierC(c) && tierC >= maxTierC) continue
    picked.push(c)
    perMerchant.set(m, (perMerchant.get(m) ?? 0) + 1)
    if (isTierC(c)) tierC += 1
  }

  // Pass 2: pattern diversity. If the picked set covers fewer than
  // minPatterns distinct IDs, replace the lowest-scored picks with
  // unused-pattern candidates (respecting the same caps).
  const distinctPatterns = new Set(picked.map(patternOf).filter(Boolean))
  if (distinctPatterns.size < minPatterns) {
    const unused = new Set(candidates.map(patternOf).filter(p => p && !distinctPatterns.has(p)))
    for (const pattern of unused) {
      if (distinctPatterns.size >= minPatterns) break
      const carrier = candidates.find(c =>
        patternOf(c) === pattern &&
        !picked.includes(c) &&
        (perMerchant.get(merchantOf(c)) ?? 0) < maxPerMerchant &&
        (!isTierC(c) || tierC < maxTierC))
      if (!carrier) continue
      // Swap out the lowest-scored pick whose pattern appears elsewhere in
      // the set (or a non-lockup pick), never the highest-scored ones.
      const swapIndex = [...picked.keys()]
        .reverse()
        .find(i => picked[i].score <= carrier.score ||
          (patternOf(picked[i]) && [...picked.keys()].filter(j => j !== i && patternOf(picked[j]) === patternOf(picked[i])).length > 0))
      if (swapIndex == null) continue
      const out = picked[swapIndex]
      perMerchant.set(merchantOf(out), perMerchant.get(merchantOf(out)) - 1)
      if (isTierC(out)) tierC -= 1
      picked[swapIndex] = carrier
      perMerchant.set(merchantOf(carrier), (perMerchant.get(merchantOf(carrier)) ?? 0) + 1)
      if (isTierC(carrier)) tierC += 1
      distinctPatterns.add(pattern)
    }
  }

  // The 8-row minimum is best-effort: a thin vertical (e.g. Retail today)
  // may legitimately have fewer eligible rows — send what exists.
  return picked.slice(0, max).map(c => c.row)
}

// Shapes selected Copy Library rows into the brief's `examples` array
// (spec §4.5): rows with a lockup split become {subheadline, headline}
// pairs; rows without one become `text` with "use": "idea_only" — the model
// may take the idea, not the form.
export function formatExamples(selectedRows) {
  return selectedRows.map(r => {
    const base = { id: r.ID, tier: r.Tier, pattern: r.Pattern, merchant: r.Merchant }
    if (r['Lockup: Sub-headline'] && r['Lockup: Headline']) {
      return { ...base, subheadline: r['Lockup: Sub-headline'], headline: r['Lockup: Headline'] }
    }
    return { ...base, text: r.Copy, use: 'idea_only' }
  })
}

// ── Skeletons + Patterns ─────────────────────────────────────────────────────

// Skeletons that fit the brief (spec §5): skip S02 (suspected scan error,
// "Do not use until verified") and the CTA skeletons ("Not written by the
// AI" — S09/S10/S11/S14, and S12's CTA half) — except in a support
// sub-headline, where CTA-led lines are allowed. S16 (the lockup skeleton)
// always fits. Three-line stacks (S01) need a 3-line headline field, which
// no current template has — skip when the headline box is 1 line.
export function skeletonsForBrief(skeletons, { subheadlineRole, headlineMaxLines = 1 } = {}) {
  const support = subheadlineRole === 'support'
  return (skeletons ?? []).filter(s => {
    const id = (s.ID || '').trim()
    if (id === 'S02') return false
    const field = (s.Field || '').toLowerCase()
    const isCta = field.includes('cta') || field.includes('qr')
    if (isCta && !support) return false
    if (id === 'S01' && headlineMaxLines > 1) return false
    if ((s.Notes || '').includes('Use ONLY when the template has a 3-line headline field') && headlineMaxLines <= 1) return false
    return true
  }).map(s => ({ id: s.ID, text: s.Skeleton }))
}

// The Patterns table for the cached system prompt (spec §6
// {{PATTERNS_TABLE}}): one line per pattern, `ID | Pattern | Formula |
// Guardrail`.
export function patternsTable(patterns) {
  return (patterns ?? [])
    .map(p => `${p.ID} | ${p.Pattern} | ${p.Formula} | ${p.Guardrail}`)
    .join('\n')
}
