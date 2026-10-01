// Run with: npm test
// The restaurant flyers' logo starts at 90% (it was slightly cut off at the
// zone edge at 100%, and still at 95% on Option C); other templates keep the
// default.
import { test } from 'node:test'
import assert from 'node:assert/strict'

const { logoStartPct } = await import('../src/lib/logoStartScale.js')

test('Option A, B and C (designer and Guided twin) start at 90%', () => {
  for (const id of ['wen-cheng-flyer1', 'wen-cheng-flyer2', 'opt-b-flyer2', 'restaurant-flyer-option-c']) {
    assert.equal(logoStartPct(id), 90, id)
    assert.equal(logoStartPct(`${id}-simple`), 90, `${id}-simple`)
  }
})

test('every other template keeps the default (null = leave at 100%)', () => {
  for (const id of ['restaurant-poster-option-c', 'retail-flyer-option-c', 'some-new-template', undefined, null, '']) {
    assert.equal(logoStartPct(id), null, String(id))
  }
})
