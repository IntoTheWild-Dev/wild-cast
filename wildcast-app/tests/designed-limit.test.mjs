// Run with: npm test
// A line the designer put in a Figma text layer must not be cut off at the
// global per-field limit (offer 20 chars) - and built-in templates are unaffected.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { designedCharLimit } from '../src/lib/designedLimit.js'

const designedOffer = 'Und so sicherst du dir deinen Gratis-Americano Smashed Cheeseburger!'

test('a long designed line raises the limit to its own length', () => {
  assert.equal(designedCharLimit({ id: 'offer', placeholder: designedOffer }, 20), designedOffer.length)
})
test('a short designed line, or none, leaves the global limit alone', () => {
  assert.equal(designedCharLimit({ id: 'offer', placeholder: '30% off' }, 20), undefined)
  assert.equal(designedCharLimit({ id: 'offer', placeholder: 'x'.repeat(20) }, 20), undefined)
  assert.equal(designedCharLimit({ id: 'offer' }, 20), undefined) // built-in template zone
  assert.equal(designedCharLimit(undefined, 20), undefined)
})
test('upper-casing is counted (a German sharp s becomes SS)', () => {
  assert.equal(designedCharLimit({ placeholder: 'Straße'.repeat(5) }, 20), 'STRASSE'.length * 5)
})
test('fields with no global limit never get one invented', () => {
  assert.equal(designedCharLimit({ placeholder: 'x'.repeat(50) }, undefined), undefined)
})
