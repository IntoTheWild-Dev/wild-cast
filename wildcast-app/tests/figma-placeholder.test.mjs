// Run with: npm test
// The copy designed into a Figma text layer becomes the zone's translucent
// placeholder: plugin node -> toCanvasZoneFromPluginNode -> placeholderTextFor.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toCanvasZoneFromPluginNode, placeholderFromText, BLEED_UNITS } from '../api/_lib/figma-import.js'
import { placeholderTextFor } from '../src/data/placeholders.js'

const frameBox = { x: 0, y: 0, width: 314.646, height: 436.535 }
const box = { x: BLEED_UNITS + 20, y: BLEED_UNITS + 30, width: 200, height: 60 }
const textNode = (extra = {}) => ({
  name: 'zone:headline', type: 'TEXT', absoluteBoundingBox: box, _zIndex: 3,
  fontSize: 40, fontFamily: 'Omnes Cond', fontWeightName: 'Bold', textAlignHorizontal: 'CENTER',
  ...extra,
})

test('text layer copy is kept as the zone placeholder', () => {
  const zone = toCanvasZoneFromPluginNode(textNode({ characters: 'Potsdams neues Dreamteam' }), frameBox, [])
  assert.equal(zone.placeholder, 'Potsdams neues Dreamteam')
})

test('line breaks collapse to spaces, empty text gives no placeholder, long text is capped', () => {
  assert.equal(placeholderFromText('  Two\nlines\r\nhere  '), 'Two lines here')
  assert.equal(placeholderFromText('   '), undefined)
  assert.equal(placeholderFromText(undefined), undefined)
  assert.equal(placeholderFromText('x'.repeat(500)).length, 200)
  const zone = toCanvasZoneFromPluginNode(textNode({ characters: '' }), frameBox, [])
  assert.equal('placeholder' in zone, false)
})

test('boundary-box zone takes the copy from its sibling text layer', () => {
  const boundary = { name: 'zone:headline', type: 'RECTANGLE', absoluteBoundingBox: box, _zIndex: 1 }
  const sibling = textNode({ name: 'headline', characters: 'Chick this out' })
  const zone = toCanvasZoneFromPluginNode(boundary, frameBox, [boundary, sibling])
  assert.equal(zone.placeholder, 'Chick this out')
})

test('image zones never get a text placeholder', () => {
  const photo = { name: 'zone:photo', type: 'RECTANGLE', absoluteBoundingBox: box, _zIndex: 0, characters: 'nope' }
  assert.equal('placeholder' in toCanvasZoneFromPluginNode(photo, frameBox, []), false)
})

test('editor order: per-template override, then Figma copy, then generic', () => {
  const figmaZone = { id: 'headline', fontFamily: 'omnes-cond', placeholder: 'Potsdams neues Dreamteam' }
  // Figma copy wins over the generic "HEADLINE", uppercased for the cond font
  assert.equal(placeholderTextFor(figmaZone, 'some-new-template'), 'POTSDAMS NEUES DREAMTEAM')
  // body font keeps its casing
  assert.equal(placeholderTextFor({ id: 'tc', fontFamily: 'omnes-pro', placeholder: 'Valid in Berlin.' }, 'x'), 'Valid in Berlin.')
  // hand-written override for a built-in template still wins
  assert.equal(placeholderTextFor(figmaZone, 'wen-cheng-flyer1'), 'DREAMTEAM')
  // no Figma copy -> generic fallback, unchanged behaviour for old records
  assert.equal(placeholderTextFor({ id: 'headline', fontFamily: 'omnes-cond' }, 'some-new-template'), 'HEADLINE')
})
