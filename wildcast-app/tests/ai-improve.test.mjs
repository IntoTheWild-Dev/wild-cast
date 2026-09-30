// Run with: npm test
// "Improve with AI" / "Suggest with AI" through the real /api/ai-suggest route,
// with only Claude and the copy sheet stubbed. Covers the saved-design case
// that returned nothing: the editor stores caps-template text UPPERCASED, the
// other field arrives as locked UPPERCASE text, and the model (told to write
// in normal case) answers in normal case.
import { test, mock, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

mock.module('@vercel/blob', {
  namedExports: {
    list: async () => ({ blobs: [] }),
    put: async path => ({ pathname: path }),
  },
})

const SHEET = {
  'Copy Library': 'ID,Copy,Lockup: Sub-headline,Lockup: Headline,Field,Language,Vertical,Tier,Use as example\nL1,Wie wär\'s mit McDonald\'s,Wie wär\'s mit,McDonald\'s,headline,DE,Restaurant,A,Y',
  'Skeletons': 'ID,Skeleton\nS16,{sub} / {head}',
  'Patterns': 'ID,Pattern\nP01,Pun',
  'Verticals': 'Vertical,Signal words,Blocked words\nRestaurant,essen,Wocheneinkauf',
}

let claudeBrief = null
let claudePairs = []
const realFetch = globalThis.fetch
function stubFetch() {
  globalThis.fetch = async (url, opts) => {
    const u = String(url)
    if (u.includes('api.anthropic.com')) {
      claudeBrief = JSON.parse(JSON.parse(opts.body).messages[0].content)
      return new Response(JSON.stringify({ content: [{ type: 'tool_use', name: 'return_pairs', input: { raw_material: [], vertical_used: 'Restaurant', flags: [], pairs: claudePairs } }] }), { status: 200 })
    }
    if (u.includes('docs.google.com')) return new Response(SHEET[decodeURIComponent(u.split('sheet=')[1])], { status: 200 })
    return realFetch(url, opts)
  }
}

const { default: aiSuggest } = await import('../api/ai-suggest.js')

async function call(body) {
  const out = { code: null, data: null }
  const res = { status(c) { out.code = c; return this }, json(d) { out.data = d; return this }, end() { return this } }
  await aiSuggest({ method: 'POST', headers: { 'x-activation-key': 'K' }, body }, res)
  return out
}
const pair = (subheadline, headline, rank) => ({ subheadline, headline, reads_as: `${subheadline} ${headline}`, route: 'variation', pattern: 'P01', based_on: 'current', rank, why: 'test' })
const brief = fields => ({ template_name: 'Option A', vertical: 'Restaurant', partner: { name: 'Burger Bros' }, offer: { text: '' }, fields, box: { headline: { max_chars: 30, max_lines: 1 }, sub_headline: { max_chars: 30, max_lines: 1 } }, exclude: [] })

beforeEach(() => {
  process.env.WILDCAST_KEYS = 'K|Tester|100|partner'
  process.env.WILDCAST_COPY = 'test-key'
  delete process.env.ACTIVATION_KEYS_END
  claudeBrief = null
  stubFetch()
})
afterEach(() => { globalThis.fetch = realFetch; mock.restoreAll() })

test('typed draft reaches the model in rewrite mode, in the requested language', async () => {
  claudePairs = [pair('Wir alle', 'Lieben uns', 1), pair('Alle lieben', 'Burger', 2)]
  const out = await call({ field: 'headline', lang: 'en', brief: brief({ headline: { current: 'We love burger', kind: 'user_draft' }, sub_headline: { current: '', kind: 'placeholder' } }) })
  assert.equal(out.code, 200)
  assert.equal(claudeBrief.task.mode, 'rewrite')
  assert.equal(claudeBrief.task.language, 'EN')
  assert.equal(claudeBrief.task.headline.current, 'We love burger')
})

test('saved design: UPPERCASE locked partner line answered in normal case still returns results, restored exactly', async () => {
  claudePairs = [pair('Wir lieben', 'Burger', 1), pair('Wir lieben', 'Burger & mehr', 2)]
  const out = await call({
    field: 'headline', lang: 'de',
    brief: brief({ headline: { current: 'BURGER', kind: 'user_draft' }, sub_headline: { current: 'WIR LIEBEN', kind: 'user_draft', role: 'setup', position: 'above' } }),
  })
  assert.equal(out.code, 200, JSON.stringify(out.data))
  assert.equal(out.data.pairs.length, 2)
  for (const p of out.data.pairs) assert.equal(p.subheadline, 'WIR LIEBEN', 'locked text comes back exactly as on the design')
})

test('a pair that really changes the locked line is still dropped', async () => {
  claudePairs = [pair('Ganz anders', 'Burger', 1)]
  const out = await call({
    field: 'headline', lang: 'de',
    brief: brief({ headline: { current: 'BURGER', kind: 'user_draft' }, sub_headline: { current: 'WIR LIEBEN', kind: 'user_draft', role: 'setup', position: 'above' } }),
  })
  assert.equal(out.code, 502)
})
