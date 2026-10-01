// Run with: npm test
// Option C's restaurant logo starts at 95% (it was slightly cut off at 100%);
// every other template keeps the default.
import { test } from 'node:test'
import assert from 'node:assert/strict'

const { logoStartPct } = await import('../src/lib/logoStartScale.js')

test('Option C (designer and Guided twin) starts at 95%', () => {
  assert.equal(logoStartPct('restaurant-flyer-option-c'), 95)
  assert.equal(logoStartPct('restaurant-flyer-option-c-simple'), 95)
})

test('every other template keeps the default (null = leave at 100%)', () => {
  for (const id of ['wen-cheng-flyer1', 'wen-cheng-flyer2-simple', 'restaurant-flyer-option-b', 'restaurant-poster-option-c', undefined, null, '']) {
    assert.equal(logoStartPct(id), null, String(id))
  }
})
