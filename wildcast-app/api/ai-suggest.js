// Real AI copy suggestions for AISuggest.jsx, grounded in the Wolt AI
// copywriting knowledge base (see api/_lib/campaignSheet.js for the sheet
// source). Generation is strictly vertical-scoped: Restaurant briefs only
// retrieve Restaurant + Cross-vertical / Brand reference examples, Retail
// briefs only Retail + Cross-vertical / Brand — the two verticals' copy
// rules never mix.
import {
  loadKnowledgeBase,
  contentTypeForField,
  collectExamples,
  filterRowsByPartner,
  filterRowsByVertical,
  verticalRulesBlock,
} from './_lib/campaignSheet.js'

// Fallback instruction text for field values with no dedicated KB content
// type (FieldEditor.jsx passes arbitrary zone ids, not just the core three).
const FIELD_DESCRIPTIONS = {
  headline: 'a short, punchy standalone headline — NOT a combined headline+tagline',
  sub_headline: 'a supporting subline that complements a headline, on its own',
  subline: 'a supporting subline that complements a headline, on its own',
  cta: 'an action-oriented call to action, e.g. "Jetzt auf Wolt bestellen"',
  offer: 'a short offer/discount badge line',
  tc: 'a realistic German T&Cs disclaimer line for a Wolt promotion',
}

// Same limits FieldEditor.jsx enforces on these fields (see its CHAR_LIMITS) —
// matched here so AI suggestions actually fit the template zones instead of
// getting cut off or overflowing. Kept as a separate constant rather than a
// shared import since FieldEditor.jsx's copy is frontend-only and this is a
// serverless function; duplication here is one small object, not worth a
// cross-boundary shared module for.
const CHAR_LIMITS = { headline: 20, sub_headline: 25, subline: 25, offer: 20, tc: 120, restaurant_name: 30, cta: 60 }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const apiKey = process.env.WILDCAST_COPY
  if (!apiKey) {
    return res.status(500).json({ error: 'WILDCAST_COPY (Anthropic API key) is not configured' })
  }

  try {
    const { field, lang = 'de', context = {}, seed, exclude } = req.body ?? {}
    const describe = FIELD_DESCRIPTIONS[field] ?? `a short line of copy for "${field}"`
    const limit = CHAR_LIMITS[field]
    const trimmedSeed = typeof seed === 'string' ? seed.trim() : ''
    const excludeList = Array.isArray(exclude) ? exclude.filter(Boolean) : []

    // Vertical comes from the design itself ("Restaurant" / "Retail"),
    // attached at brief submit and persisted with each saved project. When
    // it's unknown (older saved designs) the KB falls back to Cross-vertical
    // / Brand examples only — never the other vertical's language.
    const vertical = context.vertical ?? context.businessType ?? ''

    const { rows, verticalGuide } = await loadKnowledgeBase()
    // Order matters: the vertical gate is hard (never widened), the
    // partner scope is a soft narrowing that falls back to the vertical's
    // full row set when the partner has no tagged lines yet.
    const scopedRows = filterRowsByVertical(rows, vertical)
    const partnerRows = filterRowsByPartner(scopedRows, context.partnerName)
    const contentType = contentTypeForField(field)
    const examples = collectExamples(partnerRows, contentType)
    const rules = verticalRulesBlock(verticalGuide, vertical)

    const langLabel = lang === 'en' ? 'English' : 'German'
    const briefLines = [
      vertical && `Vertical: ${vertical}`,
      context.businessType && `Business type: ${context.businessType}`,
      context.about && `Brief: ${context.about}`,
      context.objective && `Objective: ${context.objective}`,
      context.partnerName && `Partner: ${context.partnerName}`,
    ].filter(Boolean).join('\n')

    // "Improve with AI" (AISuggest.jsx mode="improve") sends the line the
    // partner already wrote as `seed` instead of generating from scratch —
    // detect its language and either polish it (already in langLabel) or
    // translate it naturally (written in the other language), rather than
    // inventing an unrelated new line.
    const taskBlock = trimmedSeed
      ? `The partner has already written this exact line for ${describe}: "${trimmedSeed}"

Generate 6 revised options in ${langLabel}:
- First work out what language their line is already written in.
- If it's already in ${langLabel}, give polished/tightened variants that keep the same meaning and energy, just sharper.
- If it's written in a different language, give natural, idiomatic translations into ${langLabel} — not word-for-word — plus a couple of polished variations of that translation.
- Preserve their intended meaning; you are refining or translating what they wrote, not inventing an unrelated new line.`
      : `Generate 6 options for ${describe}, in ${langLabel}, matching Wolt's punchy promotional style.

Make the 6 genuinely different from each other, not six near-identical rewordings of the same sentence. Spread them across different angles and tones, for example: one straightforward/informative, one playful or funny, one bold or "spicy", one urgency-driven, one wordplay-driven, one very short and punchy. Favor short, punchy, memorable lines over long descriptive ones — think "Dream Team" or "Burger Me!" rather than a full sentence.`

    const structuredBlock = `- headline: the primary creative hook — short, punchy, rhythmic (max ${CHAR_LIMITS.headline} characters)
- subline: the supporting copy — product name, delivery speed, offer mechanics (max ${CHAR_LIMITS.subline} characters)
- cta: an action-oriented call to action, e.g. "Jetzt auf Wolt bestellen" (max ${CHAR_LIMITS.cta} characters)`

    const prompt = `You are writing marketing copy for a Wolt food-delivery partner flyer/poster${vertical ? ` (${vertical} vertical)` : ''}.

${taskBlock}

Every option must be split into three distinct structured fields:
${structuredBlock}
Fill all three fields for each option — an empty string is allowed only when a field genuinely doesn't apply.${limit ? `\n\nHARD LIMIT for the "${field}" field: ${limit} characters or fewer, including spaces and punctuation. This is a strict print-layout constraint — options over the limit are useless, not just less ideal. If ${describe} implies two ideas, pick ONE and cut the rest; do not try to fit multiple sentences or thoughts into a single option.` : ''}
${rules ? `\nVertical copy rules (follow these exactly):\n${rules}\n` : ''}${vertical ? `STRICT VERTICAL RULE: this brief is ${vertical}. Only ${vertical}-appropriate language is allowed. Never use copy rules, vocabulary or hooks from the other vertical — restaurant language (essen, bestellen, Lieblingsessen, food puns) belongs to Restaurant briefs only; retail language (einkaufen, shoppen, ohne schleppen, grocery) belongs to Retail briefs only. Cross-vertical / Brand hooks are allowed but must be completed with ${vertical}-specific language.\n` : ''}${examples.length ? `\nReal examples of past approved Wolt campaign copy (${vertical ? `${vertical} + Cross-vertical / Brand` : 'Cross-vertical / Brand'} only — tone/style reference, these show voice and vocabulary, not sentence length or structure to copy):\n${examples.map(e => `- ${e}`).join('\n')}\n` : ''}${briefLines ? `\nThis specific brief:\n${briefLines}\n` : ''}${excludeList.length ? `\nThe partner already saw these options in an earlier round — do not repeat, closely rephrase, or lightly edit any of them; give genuinely new options instead:\n${excludeList.map(e => `- ${e}`).join('\n')}\n` : ''}
Call provide_suggestions with exactly 6 structured options, each independently respecting the character limits above.`

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }],
        tools: [{
          name: 'provide_suggestions',
          description: 'Return the generated copy suggestions as structured Headline/Subline/CTA triples.',
          input_schema: {
            type: 'object',
            properties: {
              suggestions: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    headline: { type: 'string', description: 'Primary creative hook — short, punchy, rhythmic.' },
                    subline: { type: 'string', description: 'Supporting copy — product name, delivery speed, offer mechanics.' },
                    cta: { type: 'string', description: 'Action-oriented call to action, e.g. "Jetzt auf Wolt bestellen".' },
                  },
                  required: ['headline', 'subline', 'cta'],
                },
                description: 'Exactly 6 structured copy options, each within the stated character limits.',
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
    // Parse structured triples, normalizing whatever came back (the schema
    // demands objects, but tolerate string items defensively).
    const structured = (toolUse?.input?.suggestions ?? [])
      .map(s => typeof s === 'string'
        ? { headline: s, subline: '', cta: '' }
        : {
            headline: (s?.headline ?? '').trim(),
            subline: (s?.subline ?? '').trim(),
            cta: (s?.cta ?? '').trim(),
          })

    // The UI writes one field at a time (FieldEditor.jsx zone ids), so the
    // flat `suggestions` list is the requested field's text extracted from
    // each triple. `structured` carries the full triples for callers that
    // want all three at once. Non-target fields fall back to their own
    // triple value when the target one is empty, so a single-line polish in
    // improve mode still yields something applicable.
    const fromTriple = t => {
      const primary = field === 'cta' ? t.cta : field === 'subline' || field === 'sub_headline' ? t.subline : t.headline
      return primary || t.cta || t.subline || t.headline
    }

    // Defensive: LLMs don't always obey character limits even when asked
    // clearly, and an over-limit "suggestion" is actively wrong here (it
    // won't fit the template zone), not just a style miss — filter rather
    // than trust the prompt alone. Requesting 6 gives headroom so filtering
    // still leaves a real choice.
    let suggestions = structured.map(fromTriple)
    if (limit) suggestions = suggestions.filter(s => s.length <= limit)
    suggestions = suggestions.slice(0, 4)

    return res.status(200).json({ suggestions, structured: structured.slice(0, 4) })
  } catch (err) {
    console.error('ai-suggest error:', err)
    return res.status(500).json({ error: err.message })
  }
}
