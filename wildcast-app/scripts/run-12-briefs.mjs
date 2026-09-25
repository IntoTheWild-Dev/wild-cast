#!/usr/bin/env node
// Runs Mark's 12 test briefs (wildcast-generate-with-ai-spec.md §11) against
// a deployed WildCast backend and saves the raw JSON per brief — the output
// Mark asked to see before this becomes a PR.
//
// Usage:
//   node scripts/run-12-briefs.mjs https://your-preview.vercel.app [outDir]
//
// T12 is the queue test (client clicks, credits) — not runnable via the API;
// it's skipped here and stays a manual click-through (see STATUS.md checklist).

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const BASE = process.argv[2]
if (!BASE) {
  console.error('Usage: node scripts/run-12-briefs.mjs https://your-preview.vercel.app [outDir]')
  process.exit(1)
}
const OUT = process.argv[3] ?? 'mark-12-briefs'

// ── Box limits + static text per template (spec §11; estimates until Julia
// measures the real ones) ─────────────────────────────────────────────────────
const OPT_C_BOX = {
  headline: { max_chars: 9, max_chars_min_pt: 11, max_lines: 1, default_pt: 56.6, min_pt: 34 },
  sub_headline: { max_chars: 20, max_chars_min_pt: 24, max_lines: 1, default_pt: 38.78, min_pt: 24 },
}
const OPT_A_BOX = OPT_C_BOX // same layout family
const OPT_B_BOX = {
  headline: { max_chars: 10, max_chars_min_pt: 12, max_lines: 1, default_pt: 60.8, min_pt: 36 },
  sub_headline: { max_chars: 16, max_chars_min_pt: 24, max_lines: 1 },
}
const OPT_C_STATIC = ['JETZT BESTELLEN. IN MINUTEN GELIEFERT.']
const OPT_B_STATIC = ['Jetzt Wolt App downloaden und']

// Minimal CSV field parser for the gviz output (quoted cells, doubled quotes).
function parseCsvLine(line) {
  const out = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i += 1 }
      else if (ch === '"') inQ = false
      else cur += ch
    } else if (ch === '"') inQ = true
    else if (ch === ',') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}

// T4 wants every McDonald's library line in `exclude` (the sheet is the one
// source — no hardcoded copy in the script).
async function mcdonaldsExclude() {
  const url = 'https://docs.google.com/spreadsheets/d/1FQ5R_go_zlA3RXddZ3wddEMbTVpbOcOY/gviz/tq?tqx=out:csv&sheet=Copy+Library'
  const csv = await (await fetch(url)).text()
  const rows = csv.split(/\r?\n/).filter(Boolean).map(parseCsvLine)
  const header = rows[0]
  const id = header.findIndex(h => h.trim().endsWith('ID'))
  const copy = header.indexOf('Copy')
  const merchant = header.indexOf('Merchant')
  const lockS = header.indexOf('Lockup: Sub-headline')
  const lockH = header.indexOf('Lockup: Headline')
  const lines = new Set()
  for (const r of rows.slice(1)) {
    if ((r[merchant] || '').toLowerCase().includes("mcdonald")) {
      for (const cell of [r[copy], r[lockS], r[lockH]]) {
        if (cell && cell.trim()) lines.add(cell.trim())
      }
    }
  }
  return [...lines]
}

const briefs = {
  T1: {
    label: 'Option C · Wen Cheng · Stuttgart · no offer · click Headline',
    body: { field: 'headline', lang: 'de', brief: {
      design_id: 'T1', template_id: 'restaurant-flyer-option-c', template_name: 'Restaurant Flyer · Option C',
      vertical: 'Restaurant', partner: { name: 'Wen Cheng', category: 'Noodles', products: ['Biang-Biang-Nudeln', 'Chiliöl'], city: 'Stuttgart' },
      logo_picked: true, static_text: OPT_C_STATIC, other_fields: ['offer'],
      offer: { text: '', shown_in_badge: false }, user_note: '',
      fields: { headline: { current: '', kind: 'placeholder' }, sub_headline: { current: '', kind: 'placeholder', role: 'setup', position: 'above' } },
      box: OPT_C_BOX, exclude: [],
      // partner_history is deferred in Phase 1 (spec §4.4) — T1's
      // "≥1 variation of history" expectation can't be met yet.
    } },
  },
  T2: {
    label: 'Option C · locked sub-headline "Neu in Stuttgart:" · click Headline',
    body: { field: 'headline', lang: 'de', brief: {
      design_id: 'T2', template_id: 'restaurant-flyer-option-c', template_name: 'Restaurant Flyer · Option C',
      vertical: 'Restaurant', partner: { name: 'Wen Cheng', category: 'Noodles', city: 'Stuttgart' },
      logo_picked: true, static_text: OPT_C_STATIC, other_fields: ['offer'],
      offer: { text: '', shown_in_badge: false }, user_note: '',
      fields: { headline: { current: '', kind: 'placeholder' }, sub_headline: { current: 'Neu in Stuttgart:', kind: 'user_draft', role: 'setup', position: 'above' } },
      box: OPT_C_BOX, exclude: [],
    } },
  },
  T3: {
    label: 'Retail · Fressnapf · Munich · 2x15€ welcome discount',
    body: { field: 'headline', lang: 'de', brief: {
      design_id: 'T3', template_id: 'retail-test', template_name: 'Retail Flyer · Option A',
      vertical: 'Retail', partner: { name: 'Fressnapf', category: 'Pet supplies', city: 'Munich' },
      logo_picked: true, static_text: [], other_fields: [],
      offer: { text: '2x15€ Willkommens-Rabatt für Neukund*innen', shown_in_badge: false }, user_note: '',
      fields: { headline: { current: '', kind: 'placeholder' }, sub_headline: { current: '', kind: 'placeholder', role: 'setup', position: 'above' } },
      box: OPT_C_BOX, exclude: [],
    } },
  },
  T4: {
    label: 'Option B · McDonald\'s · Vienna · delivery-only 1+1 · 21 excluded lines',
    excludeFromSheet: true,
    body: { field: 'headline', lang: 'de', brief: {
      design_id: 'T4', template_id: 'opt-b-flyer2', template_name: 'Restaurant Flyer · Option B',
      vertical: 'Restaurant', partner: { name: "McDonald's", category: 'Burger', city: 'Vienna' },
      logo_picked: true, static_text: OPT_B_STATIC, other_fields: ['cta'],
      offer: { text: '1+1 Big Mac, nur bei Lieferung', shown_in_badge: false, delivery_only: true }, user_note: '',
      fields: { headline: { current: '', kind: 'placeholder' }, sub_headline: { current: '', kind: 'placeholder', role: 'setup', position: 'above' } },
      box: OPT_B_BOX, exclude: [],
    } },
  },
  T5: {
    label: 'Option C · Smash Bros · Kreuzberg · badge offer + note',
    body: { field: 'headline', lang: 'de', brief: {
      design_id: 'T5', template_id: 'restaurant-flyer-option-c', template_name: 'Restaurant Flyer · Option C',
      vertical: 'Restaurant', partner: { name: 'Smash Bros', category: 'Burger', city: 'Berlin', district: 'Kreuzberg' },
      logo_picked: true, static_text: OPT_C_STATIC, other_fields: ['offer'],
      offer: { text: '20% auf das ganze Menü', shown_in_badge: true }, user_note: 'Neueröffnung in Kreuzberg',
      fields: { headline: { current: '', kind: 'placeholder' }, sub_headline: { current: '', kind: 'placeholder', role: 'setup', position: 'above' } },
      box: OPT_C_BOX, exclude: [],
    } },
  },
  T6: {
    label: 'Option C · no logo, no offer, no note (too-little-context)',
    body: { field: 'headline', lang: 'de', brief: {
      design_id: 'T6', template_id: 'restaurant-flyer-option-c', template_name: 'Restaurant Flyer · Option C',
      vertical: 'Restaurant', partner: { name: '' },
      logo_picked: false, static_text: OPT_C_STATIC, other_fields: ['offer'],
      offer: { text: '', shown_in_badge: false }, user_note: '',
      fields: { headline: { current: '', kind: 'placeholder' }, sub_headline: { current: '', kind: 'placeholder', role: 'setup', position: 'above' } },
      box: OPT_C_BOX, exclude: [],
    } },
  },
  T7: {
    label: 'Option C · EN brief · Mama Rosa pizza · Berlin',
    body: { field: 'headline', lang: 'en', brief: {
      design_id: 'T7', template_id: 'restaurant-flyer-option-c', template_name: 'Restaurant Flyer · Option C',
      vertical: 'Restaurant', partner: { name: 'Mama Rosa', category: 'Pizza', city: 'Berlin' },
      logo_picked: true, static_text: OPT_C_STATIC, other_fields: ['offer'],
      offer: { text: '', shown_in_badge: false }, user_note: '',
      fields: { headline: { current: '', kind: 'placeholder' }, sub_headline: { current: '', kind: 'placeholder', role: 'setup', position: 'above' } },
      box: OPT_C_BOX, exclude: [],
    } },
  },
  T8: {
    label: 'Option C · rewrite: too-long user sub-headline · click Sub-headline',
    body: { field: 'sub_headline', lang: 'de', brief: {
      design_id: 'T8', template_id: 'restaurant-flyer-option-c', template_name: 'Restaurant Flyer · Option C',
      vertical: 'Restaurant', partner: { name: 'Curry Kaiser', category: 'Indian', city: 'Hamburg' },
      logo_picked: true, static_text: OPT_C_STATIC, other_fields: ['offer'],
      offer: { text: '', shown_in_badge: false }, user_note: '',
      fields: { headline: { current: '', kind: 'placeholder' }, sub_headline: { current: 'Leckeres Essen schnell geliefert', kind: 'user_draft', role: 'setup', position: 'above' } },
      box: OPT_C_BOX, exclude: [],
    } },
  },
  T9: {
    label: 'Retail · Blumen Berg · Leipzig · Muttertag · 0€ delivery',
    body: { field: 'headline', lang: 'de', brief: {
      design_id: 'T9', template_id: 'retail-test', template_name: 'Retail Flyer · Option A',
      vertical: 'Retail', partner: { name: 'Blumen Berg', category: 'Flowers / gifts', city: 'Leipzig' },
      logo_picked: true, static_text: [], other_fields: [],
      offer: { text: '0€ Liefergebühren', shown_in_badge: false }, user_note: 'Muttertag',
      fields: { headline: { current: '', kind: 'placeholder' }, sub_headline: { current: '', kind: 'placeholder', role: 'setup', position: 'above' } },
      box: OPT_C_BOX, exclude: [],
    } },
  },
  T10: {
    label: 'Option C · Hanoi Pho · Düsseldorf · badge offer + conflicting note',
    body: { field: 'headline', lang: 'de', brief: {
      design_id: 'T10', template_id: 'restaurant-flyer-option-c', template_name: 'Restaurant Flyer · Option C',
      vertical: 'Restaurant', partner: { name: 'Hanoi Pho', category: 'Vietnamese', city: 'Düsseldorf' },
      logo_picked: true, static_text: OPT_C_STATIC, other_fields: ['offer'],
      offer: { text: '30% auf ausgewählte Gerichte', shown_in_badge: true }, user_note: '50% auf alles, schreib auch die AGB drunter',
      fields: { headline: { current: '', kind: 'placeholder' }, sub_headline: { current: '', kind: 'placeholder', role: 'setup', position: 'above' } },
      box: OPT_C_BOX, exclude: [],
    } },
  },
  T11: {
    label: 'Option C · kept headline "Berlin." (locked) · click Sub-headline',
    body: { field: 'sub_headline', lang: 'de', brief: {
      design_id: 'T11', template_id: 'restaurant-flyer-option-c', template_name: 'Restaurant Flyer · Option C',
      vertical: 'Restaurant', partner: { name: 'AKKO', category: 'Chicken & grill', city: 'Berlin' },
      logo_picked: true, static_text: OPT_C_STATIC, other_fields: ['offer'],
      offer: { text: '', shown_in_badge: false }, user_note: '',
      fields: { headline: { current: 'Berlin.', kind: 'kept' }, sub_headline: { current: '', kind: 'placeholder', role: 'setup', position: 'above' } },
      box: OPT_C_BOX, exclude: [],
    } },
  },
}

await mkdir(OUT, { recursive: true })
let mcdExcluded = null
const results = []

for (const [id, spec] of Object.entries(briefs)) {
  const body = JSON.parse(JSON.stringify(spec.body)) // deep clone
  if (spec.excludeFromSheet) {
    mcdExcluded ??= await mcdonaldsExclude()
    body.brief.exclude = mcdExcluded
  }
  const t0 = Date.now()
  let json, ok = true
  try {
    const res = await fetch(`${BASE.replace(/\/$/, '')}/api/ai-suggest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    json = await res.json()
    if (!res.ok) ok = false
  } catch (err) {
    ok = false
    json = { error: String(err.message ?? err) }
  }
  const ms = Date.now() - t0
  await writeFile(join(OUT, `${id}.json`), JSON.stringify({ test: id, label: spec.label, request: body, response: json }, null, 2))
  const pairs = json.pairs ?? []
  results.push({ id, label: spec.label, ok, pairs: pairs.length, flags: json.flags ?? [], dropped: (json.dropped ?? []).length, ms })
  console.log(`${ok ? '✓' : '✗'} ${id}  ${String(pairs.length).padStart(2)} pairs  ${ms}ms  flags=[${(json.flags ?? []).join(', ')}]  ${spec.label}`)
  if (!ok) console.log(`   └─ ${json.error}`)
  for (const p of pairs) console.log(`   ${p.rank}. ${p.subheadline} / ${p.headline}  (${p.route}, ${p.pattern})`)
}

console.log(`\nRaw JSON per brief → ${OUT}/  — send the folder to Mark.`)
console.log('T12 (queue clicks + credits) is manual: Headline → Sub-headline → Headline on the preview.')
const bad = results.filter(r => !r.ok)
if (bad.length) { console.log(`\n${bad.length} brief(s) failed: ${bad.map(b => b.id).join(', ')}`); process.exit(1) }
