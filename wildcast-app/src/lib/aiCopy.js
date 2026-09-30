// Shared client side of /api/ai-suggest, used by BOTH AI entry points: the
// editor's queue (usePairQueue.js) and the Prompt Brief chat
// (PromptBriefChat.jsx). "Improve with AI" = the clicked field already holds
// the user's own text, which must reach the API as that field's `current`
// with kind `user_draft` (the API then runs in rewrite mode). Keeping the
// brief's field block and the language rule here stops the two callers from
// drifting apart again - the chat used to send only already-submitted answers
// and silently dropped the text typed in its input box.
import { activationHeaders } from './activationKey'

const REQUEST_TIMEOUT_MS = 45_000

const GERMAN_HINTS = new Set([
  'der', 'die', 'das', 'und', 'ist', 'wir', 'ihr', 'du', 'ich', 'mit', 'für', 'fur', 'nicht', 'ein', 'eine', 'auf',
  'jetzt', 'bei', 'von', 'zu', 'im', 'dem', 'den', 'auch', 'alle', 'liebe', 'lieben', 'neu', 'neues', 'heute',
  'bestellen', 'sparen', 'dein', 'deine', 'uns', 'euch', 'sind', 'wie', 'was', 'bis', 'nur',
])
const ENGLISH_HINTS = new Set([
  'the', 'and', 'is', 'we', 'you', 'your', 'our', 'with', 'for', 'not', 'a', 'an', 'on', 'now', 'at', 'of', 'to',
  'in', 'all', 'love', 'each', 'other', 'new', 'today', 'order', 'save', 'are', 'how', 'what', 'up', 'only',
  'get', 'it', 'this', 'that', 'from', 'off', 'free', 'delivered', 'lets', 'go', 'yes', 'eat', 'good', 'fresh', 'hot',
])

// 'en' | 'de' for a piece of user text; `fallback` (the language the user is
// currently working in) when the text is empty or gives no clear signal.
export function detectLang(text, fallback = 'de') {
  const t = (text || '').toLowerCase()
  if (!t.trim()) return fallback
  if (/[äöüß]/.test(t)) return 'de'
  const words = t.match(/[a-zäöüß']+/g) ?? []
  let de = 0
  let en = 0
  for (const w of words) {
    if (GERMAN_HINTS.has(w)) de += 1
    if (ENGLISH_HINTS.has(w)) en += 1
  }
  if (en > de) return 'en'
  if (de > en) return 'de'
  return fallback
}

export const langName = lang => (lang === 'en' ? 'English' : 'German')

// The `fields` block of the §4.5 brief. `clickedField` is the field the user
// pressed the AI button on; `draft` (when given) is the text currently
// sitting in it, which wins over whatever the caller has committed so far.
export function draftFieldBlock({ current, kind }) {
  const text = (current ?? '').trim()
  return { current: text, kind: text ? (kind === 'kept' ? 'kept' : 'user_draft') : 'placeholder' }
}

// POSTs to /api/ai-suggest and returns the parsed { pairs, flags, ... }.
// Throws Error(message) on any failure - callers only charge a credit after
// this resolves (a failed call costs nothing).
export async function requestAiPairs({ field, lang, brief }) {
  // Never spin forever: the route can make two Claude calls, so allow a
  // generous but finite wait and then say so.
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS)
  let res
  try {
    res = await fetch('/api/ai-suggest', {
      method: 'POST',
      // activationHeaders() identifies the caller to the API (key and/or
      // account session) - the AI route checks it and records usage.
      headers: { 'Content-Type': 'application/json', ...activationHeaders() },
      signal: ctrl.signal,
      body: JSON.stringify({ field, lang, brief }),
    })
  } catch (err) {
    throw new Error(err?.name === 'AbortError' ? 'The AI took too long. Try again.' : 'Could not reach the AI. Check your connection and try again.', { cause: err })
  } finally {
    clearTimeout(timer)
  }
  let data = null
  try { data = await res.json() } catch { /* non-JSON error body (e.g. a platform timeout page) */ }
  if (!res.ok) throw new Error(data?.error || (res.status === 504 ? 'The AI took too long. Try again.' : 'Could not write a line. Try again.'))
  if (!data?.pairs?.length) throw new Error('Could not write a line. Try again.')
  return data
}
