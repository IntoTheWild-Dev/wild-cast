// Small, conservative typo-tolerance helpers - shared between DesignsPage.jsx
// (grouping merchant filter options so "Wen Chen"/"Wen Cheng" count as the
// same merchant) and FieldEditor.jsx (the inline "Did you mean...?" hint on
// the Restaurant name field). Julia's ask, 2026-09-15: a case-insensitive-only
// fix (shipped first) caught "WEN CHENG" vs "Wen Cheng", but not a genuine
// one-letter typo like "Wen Chen" missing the "g" - she wants that caught
// too, "even if there is a spelling mistake no matter how small."

// Standard Levenshtein edit distance (single-char insert/delete/substitute).
export function levenshtein(a, b) {
  const m = a.length, n = b.length
  if (m === 0) return n
  if (n === 0) return m
  let prev = new Array(n + 1)
  let curr = new Array(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j - 1], prev[j], curr[j - 1])
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[n]
}

const digitsOf = s => (s.match(/\d+/g) || []).join('')

// True if `a` and `b` are close enough to be the same real name typed with a
// small mistake. Deliberately conservative:
// - distance <= 1 (one missing/extra/wrong letter) for short-ish names,
//   loosening slightly to <=2 only once both names are long enough that a
//   2-edit gap is still clearly "the same word", not a coincidence.
// - Never matches two strings whose digit runs differ ("Flyer 2" vs
//   "Flyer 3" is a real, deliberately-different pair the threshold above
//   would otherwise wrongly merge - a sequence number isn't a typo).
// - Exact match (post-normalize) always counts, regardless of digits.
export function isCloseMatch(a, b) {
  const normA = a.trim().toLowerCase()
  const normB = b.trim().toLowerCase()
  if (normA === normB) return true
  const dA = digitsOf(normA), dB = digitsOf(normB)
  if ((dA || dB) && dA !== dB) return false
  const maxLen = Math.max(normA.length, normB.length)
  const threshold = maxLen >= 10 ? 2 : 1
  return levenshtein(normA, normB) <= threshold
}

// Finds the closest match to `input` among `candidates` that's a close-but-
// NOT-exact match (nothing to suggest if it's already spelled right, or
// already too different to plausibly be the same name). Returns the
// candidate string, or null.
export function findCloseSuggestion(input, candidates) {
  const norm = input.trim().toLowerCase()
  if (!norm) return null
  let best = null
  let bestDist = Infinity
  for (const c of candidates) {
    const cNorm = c.trim().toLowerCase()
    if (cNorm === norm) return null // already exact - nothing to suggest
    if (!isCloseMatch(input, c)) continue
    const dist = levenshtein(norm, cNorm)
    if (dist < bestDist) { bestDist = dist; best = c }
  }
  return best
}
