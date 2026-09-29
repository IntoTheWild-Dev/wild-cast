import { sortIdsByFieldOrder } from './fieldOrder'
import { ADD_NEW, OBJECTIVES, PLACEHOLDER_PARTNERS, FORMAT_TEMPLATE_GROUP, DEFAULT_BRIEF } from './briefConstants'

// Question script for the Prompt Brief chat (Julia's ask, 2026-09-19): the
// chat asks the same questions, in the same order, as the brief form + the
// template's own editor fields would - so the script is built from two
// sources instead of being hardcoded per template:
//   1. The brief form's questions (partner, objective, project name).
//      Business type and Formats are NOT asked - picking a template already
//      implies both (BriefingForm.jsx's pickTemplate does the same).
//   2. One question per zone the chosen template actually defines, in the
//      editor's own field order (fieldOrder.js) - so Option B, which has no
//      offer/T&Cs zone, is never asked for them, and a future Figma import
//      gets sensible questions automatically.
// Each step: { id, kind: 'chips' | 'text' | 'upload', ask, hint?, options?,
//   optional?, placeholder?, aiField? (gets Suggest/Improve with AI),
//   whenAnswer? ({ stepId, value } - only asked once that answer is given),
//   unlessAnswered? (stepId - not asked once that step has a real answer) }.
// whenAnswer is plain data (not a function) so api/prompt-brief-chat.js can
// apply the same rule server-side.

// Same limits FieldEditor.jsx enforces (its CHAR_LIMITS) - duplicated rather
// than imported for the same reason api/ai-suggest.js duplicates it: the
// editor's copy isn't exported, and text past these won't fit the zone.
// Headline/sub-headline are only a fallback here: once the template is known
// they come from its copy-database box (aiFieldSettingsFor's
// max_chars_min_pt - the same capacity FieldEditor's counter and AI
// Suggest's C1 check use), which is far tighter (headline ~11, not 20).
const CHAR_LIMITS = { headline: 20, sub_headline: 25, offer: 20, tc: 120, restaurant_name: 30, cta: 60 }

const ZONE_QUESTIONS = {
  logo: {
    kind: 'upload', ask: 'Do you have a restaurant logo to put on the design?', hint: 'JPG or PNG',
    summaryLabel: 'Logo', optional: true,
  },
  sub_headline: {
    kind: 'text', ask: 'What should the sub-headline say?', hint: 'The short line near the top. It is always shown in capitals.',
    summaryLabel: 'Sub-headline', placeholder: 'e.g. Neu in Koblenz', aiField: 'sub_headline',
  },
  headline: {
    kind: 'text', ask: 'And the headline?', hint: 'The big, main line. Always shown in capitals.',
    summaryLabel: 'Headline', placeholder: 'e.g. Jetzt eröffnet', aiField: 'headline',
  },
  photo: {
    kind: 'upload', ask: 'Now the food photo. Which dish should be the star?', hint: 'High resolution PNG with a transparent background works best.',
    summaryLabel: 'Food photo', optional: true,
  },
  tc: {
    kind: 'text', ask: 'Is there any small print (T&Cs) that has to go on it?', hint: 'Printed very small along the edge.',
    summaryLabel: 'T&Cs', optional: true, placeholder: 'Type the T&Cs text',
  },
  cta: {
    kind: 'text', ask: 'What should the call-to-action line say?', hint: 'The closing line at the bottom of the design.',
    summaryLabel: 'Call to action', placeholder: 'e.g. bei uns bestellen',
  },
  offer: {
    kind: 'text', ask: "What's the offer?", hint: 'e.g. 30% sparen',
    summaryLabel: 'Offer', placeholder: 'Type the offer',
  },
}

// ── Chat-first template choice (Julia's ask, 2026-09-28) ────────────────────
// The chat now opens before any template is picked. It asks what the partner
// is making (flyer / poster / wild poster - buttons AND typeable) and whether
// the design needs a sticker or QR code, then matches those needs against the
// live templates and asks the partner to confirm the pick (Julia picked
// option B: show a preview, one tap to use it or choose a different one).
// The template-independent questions (partner, objective, project name,
// headline, sub-headline) are askable BEFORE the template exists, so a
// pasted whole-brief first message gets everything it can out of one turn -
// the confirmed template's own step list re-includes those same step ids
// and simply finds them already answered.

// Special templateConfirm option values. The step looks like a normal chips
// step to the AI (which may record it from typed text like "yes, use it"),
// but the chat intercepts both values itself: __use_template__ resolves the
// matched template (App then loads its zones), __choose_different__ opens
// the template picker popup. Neither value is ever brief content.
export const CONFIRM_USE = '__use_template__'
export const CONFIRM_DIFFERENT = '__choose_different__'

// Flow-control steps: never shown in the finished-design summary and never
// mapped into the brief (see summarizeAnswers / assembleBrief) - they steer
// the conversation, they are not design content.
const FLOW_STEP_IDS = new Set(['format', 'needsSticker', 'needsQr', 'needsSubline', 'templateConfirm'])

export function buildPreSteps(matched, formats = []) {
  const confirmAsk = matched
    ? `I've picked the ${matched.label.split(' · ').pop()} template (${matched.format}) for you. Shall I use it?`
    : 'Shall I use this template?'
  return [
    {
      id: 'format', kind: 'chips', ask: 'What are you making - a flyer, poster or wild poster?', summaryLabel: 'Format',
      options: formats.map(f => ({ label: f, value: f })),
      hint: 'Pick one, or just type it.',
    },
    {
      id: 'needsSticker', kind: 'chips', ask: 'Does the design need a discount sticker or badge?', summaryLabel: 'Sticker',
      options: [{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }],
    },
    {
      id: 'needsQr', kind: 'chips', ask: 'Does it need a QR code?', summaryLabel: 'QR code',
      options: [{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }],
    },
    // Asked before the template is picked so the pick isn't a guess (Julia's
    // test, 2026-09-28: step by step it proposed Option B without asking) -
    // skipped when a sub-line was already given, e.g. in a pasted brief.
    {
      id: 'needsSubline', kind: 'chips', ask: 'Do you want a sub-line above the headline, or just a headline?', summaryLabel: 'Sub-line',
      options: [{ label: 'Headline + sub-line', value: 'yes' }, { label: 'Just a headline', value: 'no' }],
      unlessAnswered: 'sub_headline',
    },
    {
      id: 'templateConfirm', kind: 'chips', ask: confirmAsk, summaryLabel: 'Template',
      options: [
        { label: 'Use this template', value: CONFIRM_USE },
        { label: 'Choose a different one', value: CONFIRM_DIFFERENT },
      ],
    },
  ]
}

// Deterministic template pick - no AI involved, so the offer is reproducible
// and the model never chooses the product. Score each candidate:
//   +2 when a sticker/QR/sub-line answer matches what the template offers,
//   -4 when the template LACKS a feature the partner asked for (a missing
//      must-have is far worse than an unused extra zone),
//   -1 for carrying a sticker/QR zone the partner said they don't need,
//   +1 / -2 per piece of copy the partner already gave (e.g. a pasted
//      sub-headline): the template has a zone for it / would silently drop
//      it - so "headline + subline, no sticker/QR" lands on a template with
//      a sub-headline, not the simplest one (Julia's test, 2026-09-28: a
//      pasted subline was lost to Option B, which has no sub-headline zone),
//   and a tiny bonus for fewer zones overall, so with no feature answers
//   the simplest template wins ("only a headline -> simplest option").
// Ties keep the catalogue's own order (BASE_TEMPLATES order). When the
// answers name a format, only that format's candidates are considered at
// all - the format chips only ever offer formats that have live templates.
export function matchTemplate(choices, answers = {}) {
  const format = answers.format?.value
  const candidates = (choices ?? []).filter(c => c.zones?.length && (!format || c.format === format))
  if (!candidates.length) return null
  const hasSticker = c => c.zones.some(z => z.id === 'sticker' || String(z.id).includes('sticker'))
  const hasQr = c => c.zones.some(z => z.id === 'qr')
  const wantSticker = answers.needsSticker?.value === 'yes'
  const wantQr = answers.needsQr?.value === 'yes'
  const askedSticker = answers.needsSticker?.value === 'yes' || answers.needsSticker?.value === 'no'
  const askedQr = answers.needsQr?.value === 'yes' || answers.needsQr?.value === 'no'
  const hasSub = c => c.zones.some(z => z.id === 'sub_headline')
  const wantSub = answers.needsSubline?.value === 'yes'
  const askedSub = answers.needsSubline?.value === 'yes' || answers.needsSubline?.value === 'no'
  // Copy already given for a zone at least one candidate has (flow/form
  // answers like partner or objective never match a zone id).
  const givenCopy = Object.entries(answers)
    .filter(([id, a]) => a && !a.skipped && String(a.value ?? '').trim()
      && candidates.some(c => c.zones.some(z => z.id === id)))
    .map(([id]) => id)
  let best = null
  let bestScore = -Infinity
  for (const c of candidates) {
    let score = -c.zones.length * 0.01
    for (const id of givenCopy) score += c.zones.some(z => z.id === id) ? 1 : -2
    if (askedSticker) {
      if (hasSticker(c) === wantSticker) score += 2
      else if (wantSticker) score -= 4
      else score -= 1
    }
    if (askedQr) {
      if (hasQr(c) === wantQr) score += 2
      else if (wantQr) score -= 4
      else score -= 1
    }
    if (askedSub) {
      if (hasSub(c) === wantSub) score += 2
      else if (wantSub) score -= 4
      else score -= 1
    }
    if (score > bestScore) { bestScore = score; best = c }
  }
  return best
}

// Scripted lead-in for an upload step where the partner has exactly one
// matching asset on file (Julia's own example wording, 2026-09-28). The AI
// never sees library data, so this line is always scripted, never generated.
export function reuseAskText(step, partnerName) {
  return `This is ${partnerName}. We have the ${(step.summaryLabel || step.id).toLowerCase()}. Use it?`
}

// Same, when the partner has several matching assets (e.g. a few dishes) -
// they're shown as thumbnails to tap instead of guessing one (Julia's ask,
// 2026-09-28: "we want it to bring up the images" too, not only one logo).
export function reuseManyAskText(step, partnerName, count) {
  return `This is ${partnerName}. We have ${count} on file for the ${(step.summaryLabel || step.id).toLowerCase()} - tap one below, or upload a new one.`
}

function humanize(id) {
  const s = id.replace(/[_-]+/g, ' ').trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function zoneStep(zone, partnerLabel, aiSettings) {
  if (zone.id === 'restaurant_name') {
    return {
      id: zone.id, kind: 'text', maxLength: CHAR_LIMITS.restaurant_name, ask: 'What name should appear on the design?', summaryLabel: 'Name on design',
      hint: 'This can differ from the partner name, e.g. "McDonald\'s Zentrum".',
      options: [{ label: 'Use the partner name', value: '__partner__' }],
      placeholder: partnerLabel ? `e.g. ${partnerLabel} Zentrum` : 'Type the name',
    }
  }
  const known = ZONE_QUESTIONS[zone.id]
  if (known) return { id: zone.id, maxLength: aiSettings?.[zone.id]?.max_chars_min_pt ?? CHAR_LIMITS[zone.id], ...known }
  const isSticker = zone.id.includes('sticker')
  if (zone.type === 'image') {
    return {
      id: zone.id, kind: 'upload', optional: true, summaryLabel: zone.label || humanize(zone.id),
      ask: `Please upload the ${(zone.label || humanize(zone.id)).toLowerCase()}.`, hint: zone.hint,
    }
  }
  return {
    id: zone.id, kind: 'text', optional: isSticker, summaryLabel: zone.label || humanize(zone.id),
    ask: isSticker ? 'Which sticker would you like on the design?' : `What should the "${zone.label || humanize(zone.id)}" say?`,
    hint: zone.hint,
  }
}

const isGiven = a => !!a && !a.skipped && String(a.value ?? '').trim() !== ''

// Mirrored in api/prompt-brief-chat.js's applies() - keep the two in step.
export const stepApplies = (step, answers) =>
  (!step.whenAnswer || answers[step.whenAnswer.stepId]?.value === step.whenAnswer.value)
  && (!step.unlessAnswered || !isGiven(answers[step.unlessAnswered]))

// The brief-form questions, exported separately so the chat can also ask
// them before a template is confirmed (see module comment at the top).
export const FORM_STEPS = [
  {
    id: 'partner', kind: 'chips', ask: 'Which partner is this design for?', summaryLabel: 'Partner',
    options: [
      ...PLACEHOLDER_PARTNERS.map(p => ({ label: p, value: p })),
      { label: '+ Add new partner', value: ADD_NEW },
    ],
  },
  {
    id: 'partnerNew', kind: 'text', ask: "What's the new partner's name?", summaryLabel: 'New partner',
    placeholder: 'New partner name', whenAnswer: { stepId: 'partner', value: ADD_NEW },
  },
  {
    id: 'objective', kind: 'chips', ask: 'What is the objective?', summaryLabel: 'Objective',
    options: OBJECTIVES.map(o => ({ label: o.label, value: o.value })),
  },
  {
    id: 'projectName', kind: 'text', optional: true, ask: 'Want to give the project a name?', summaryLabel: 'Project name',
    hint: 'It labels the saved design and the PDF filename. Skip it and we will name it for you.',
    placeholder: 'e.g. Wen Cheng – Wolt Promo June',
  },
]

// Text zones every template defines, so their questions are askable before
// the template is confirmed - this is what lets one pasted brief fill them
// in a single turn (the confirmed template's step list re-includes these
// ids and finds them answered). Zones that only SOME templates have (offer
// vs cta, T&Cs, sticker, QR, photos) stay post-confirm.
const GENERIC_TEXT_ZONE_IDS = ['headline', 'sub_headline']

export function buildGenericTextSteps() {
  return GENERIC_TEXT_ZONE_IDS.map(id => zoneStep({ id, type: 'text' }))
}

// aiSettings: aiFieldSettingsFor(...) for the template, or null.
export function buildSteps(zones = [], aiSettings = null) {
  const zoneIds = sortIdsByFieldOrder(zones.map(z => z.id))
  const zoneSteps = zoneIds.map(id => zoneStep(zones.find(z => z.id === id), undefined, aiSettings))
  return [...FORM_STEPS, ...zoneSteps]
}

// Headline/sub-headline answers that don't fit the template's box. A pasted
// brief records them before any template exists, so they were only checked
// against the generic fallback limits - this re-checks them once it's known.
export function answersOverTemplateLimit(answers, aiSettings) {
  return GENERIC_TEXT_ZONE_IDS
    .map(id => ({ id, limit: aiSettings?.[id]?.max_chars_min_pt, a: answers[id] }))
    .filter(({ limit, a }) => limit && a && !a.skipped && String(a.value ?? '').trim().length > limit)
    .map(({ id, limit, a }) => ({ id, limit, text: String(a.display ?? a.value) }))
}

// Answers are stored per step as { value, display, imageUrl?, skipped? }.
export function partnerNameFrom(answers) {
  const p = answers.partner
  if (!p || p.skipped) return ''
  if (p.value === ADD_NEW) return answers.partnerNew?.value?.trim() ?? ''
  return p.value
}

// Rows for the "finished design" summary. Skipped optional steps are listed
// as such (rather than hidden) so the partner can see what's still empty
// before choosing Edit.
export function summarizeAnswers(steps, answers) {
  return steps
    .filter(s => stepApplies(s, answers))
    .filter(s => s.id !== 'partnerNew' && !FLOW_STEP_IDS.has(s.id))
    .map(s => {
      const a = answers[s.id]
      if (!a) return null
      const value = s.id === 'partner' ? partnerNameFrom(answers) : a.display
      return { id: s.id, label: s.summaryLabel, value: a.skipped ? null : value, imageUrl: a.imageUrl ?? null }
    })
    .filter(Boolean)
}

// Builds a brief in the same shape BriefingForm submits (DEFAULT_BRIEF), so
// the chat's result can enter the existing brief -> editor pipeline as-is.
// logoUrl/photoUrl carry the chat's uploaded images (blob: URLs, exactly what
// the editor's own uploads produce and doPersist already converts on save).
// Answer ids assembleBrief already maps onto their own brief fields - anything
// else the chat asked about is a zone this template defines beyond the known
// set (a promo "code" box, a text sticker, ...).
const KNOWN_ANSWER_IDS = new Set([
  'partner', 'partnerNew', 'objective', 'projectName', 'about', 'restaurant_name',
  'headline', 'sub_headline', 'cta', 'tc', 'offer', 'logo', 'photo',
  // Flow-control steps (template choice) - answers exist but are not design
  // content, so they must never land in zoneTexts/zoneImageUrls below.
  'format', 'needsSticker', 'needsQr', 'needsSubline', 'templateConfirm',
])

export function assembleBrief(answers, entry) {
  const text = id => {
    const a = answers[id]
    return a && !a.skipped ? String(a.value ?? '').trim() : ''
  }
  const partnerVal = answers.partner?.value
  const knownPartner = PLACEHOLDER_PARTNERS.includes(partnerVal)
  const objectiveRaw = text('objective')
  const objective = OBJECTIVES.find(o => o.value === objectiveRaw || o.label.toLowerCase() === objectiveRaw.toLowerCase())?.value ?? objectiveRaw

  const partnerName = partnerNameFrom(answers)
  const restaurantName = answers.restaurant_name?.value === '__partner__' ? '' : text('restaurant_name')
  const formats = Object.keys(FORMAT_TEMPLATE_GROUP).filter(k => FORMAT_TEMPLATE_GROUP[k] === entry.format)
  const category = entry.category ?? 'restaurant'

  return {
    ...DEFAULT_BRIEF,
    partner: knownPartner ? partnerVal : ADD_NEW,
    partnerNew: knownPartner ? '' : (partnerVal === ADD_NEW ? text('partnerNew') : partnerName),
    preSelectedTemplateIds: [entry.templateIdGuided],
    businessType: category.charAt(0).toUpperCase() + category.slice(1),
    formats,
    about: text('about'),
    objective,
    projectName: text('projectName'),
    restaurantName,
    headline: text('headline'),
    subline: text('sub_headline'),
    cta: text('cta'),
    tcs: text('tc'),
    offer: text('offer'),
    logoUrl: answers.logo?.imageUrl ?? null,
    photoUrl: answers.photo?.imageUrl ?? null,
    // Every other image zone the chat asked about (sticker, QR, ...) - keyed
    // by zone id. Without this only logo/photo made it out of the chat, so
    // an uploaded sticker or QR code was collected and then silently dropped.
    // Same idea for text: extra text zones are keyed by zone id and land in
    // fields[zoneId], which is exactly what the canvas reads for a text zone.
    zoneTexts: Object.fromEntries(
      Object.entries(answers)
        .filter(([id, a]) => !KNOWN_ANSWER_IDS.has(id) && !a?.imageUrl && !a?.skipped && String(a?.value ?? '').trim())
        .map(([id, a]) => [id, String(a.value).trim()])
    ),
    zoneImageUrls: Object.fromEntries(
      Object.entries(answers)
        .filter(([id, a]) => a?.imageUrl && id !== 'logo' && id !== 'photo')
        .map(([id, a]) => [id, a.imageUrl])
    ),
  }
}
