import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clearLegacyOwnerCache } from '../src/lib/projectCache.js'
test('identity migration retires legacy project caches once, preserving unrelated state and later saves', () => {
  const previous = globalThis.sessionStorage
  const data = new Map([['wildcast_project_old', 'legacy owner'], ['unrelated', 'keep']])
  globalThis.sessionStorage = {
    get length() { return data.size }, key: i => [...data.keys()][i],
    getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k),
  }
  try {
    clearLegacyOwnerCache()
    assert.equal(data.has('wildcast_project_old'), false); assert.equal(data.get('unrelated'), 'keep')
    data.set('wildcast_project_new', 'canonical owner')
    clearLegacyOwnerCache()
    assert.equal(data.get('wildcast_project_new'), 'canonical owner')
  } finally { globalThis.sessionStorage = previous }
})
