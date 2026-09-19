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
//   optional?, placeholder?, aiField? (gets Suggest/Improve with AI), when?(answers) }.

// Same limits FieldEditor.jsx enforces (its CHAR_LIMITS) - duplicated rather
// than imported for the same reason api/ai-suggest.js duplicates it: the
// editor's copy isn't exported, and text past these won't fit the zone.
const CHAR_LIMITS = { headline: 20, sub_headline: 25, offer: 20, tc: 120, restaurant_name: 30, cta: 60 }

const ZONE_QUESTIONS = {
  logo: {
    kind: 'upload', ask: 'Do you have a restaurant logo to put on the design?', hint: 'JPG or PNG',
    summaryLabel: 'Logo', optional: true,
    options: [{ label: 'Use the logo from my Library', value: '__library__' }],
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

function humanize(id) {
  const s = id.replace(/[_-]+/g, ' ').trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function zoneStep(zone, partnerLabel) {
  if (zone.id === 'restaurant_name') {
    return {
      id: zone.id, kind: 'text', maxLength: CHAR_LIMITS.restaurant_name, ask: 'What name should appear on the design?', summaryLabel: 'Name on design',
      hint: 'This can differ from the partner name, e.g. "McDonald\'s Zentrum".',
      options: [{ label: 'Use the partner name', value: '__partner__' }],
      placeholder: partnerLabel ? `e.g. ${partnerLabel} Zentrum` : 'Type the name',
    }
  }
  const known = ZONE_QUESTIONS[zone.id]
  if (known) return { id: zone.id, maxLength: CHAR_LIMITS[zone.id], ...known }
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

export function buildSteps(zones = []) {
  const formSteps = [
    {
      id: 'partner', kind: 'chips', ask: 'Which partner is this design for?', summaryLabel: 'Partner',
      options: [
        ...PLACEHOLDER_PARTNERS.map(p => ({ label: p, value: p })),
        { label: '+ Add new partner', value: ADD_NEW },
      ],
    },
    {
      id: 'partnerNew', kind: 'text', ask: "What's the new partner's name?", summaryLabel: 'New partner',
      placeholder: 'New partner name', when: a => a.partner?.value === ADD_NEW,
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

  const zoneIds = sortIdsByFieldOrder(zones.map(z => z.id))
  const zoneSteps = zoneIds.map(id => zoneStep(zones.find(z => z.id === id)))
  return [...formSteps, ...zoneSteps]
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
    .filter(s => !s.when || s.when(answers))
    .filter(s => s.id !== 'partnerNew')
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
  }
}
