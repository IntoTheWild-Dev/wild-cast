import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { DEFAULT_PRINT_PROFILE, printProfileFor } from '../src/lib/printProfile.js'

// Execute the actual editor transition handlers without requiring a native
// canvas. Setters simulate React state; canvas rendering is outside this test.
const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const handlers = ['beginNewDesign', 'handleSelectTemplate', 'handleSelectGeneratedCandidate', 'handleSelectTemplateFromBrief', 'openLoadedProject', 'handleSave', 'autoSave']
const code = handlers.map(name => {
  const match = source.match(new RegExp(`  (?:async )?function ${name}\\([^]*?\\n  }`))
  assert.ok(match, `Editor handler ${name} exists`)
  return match[0]
}).join('\n')
const plain = value => JSON.parse(JSON.stringify(value))
function editor() {
  const state = { currentProjectId: 'old', projectOwner: { email: 'old' }, projectFolder: 'old', iccProfile: 'fogra39', reviewStatus: 'approved', fontSizes: { headline: 80 }, hasUnsavedChanges: true, loadKey: 7 }
  const context = {
    DEFAULT_PRINT_PROFILE, printProfileFor, DEFAULT_FIELDS: { headline: '', restaurant_name: '', offer: '' },
    historyRef: { current: ['old'] }, pendingNewIdRef: { current: 'pending' },
    customTemplates: { cards: [], zonesById: {} }, TEMPLATE_ZONES: {},
    TEMPLATES: [{ id: 't', name: 'Template' }],
    notifications: { markProjectRead() {} },
    fetch: async () => ({ json: async () => ({ comments: [] }) }),
    resolvePartnerName: b => b.partner, fetchMerchantAssets: async () => ({ logoUrl: null }),
    buildCandidateFields: b => ({ restaurant_name: b.partner, offer: b.offer }), logoStartPct: () => 75,
    sessionStorage: { getItem: () => null },
    doSave: async () => ({}), offerMoreFormats: () => false,
    setTimeout() {}, showAlert() {}, console: { error() {} },
  }
  for (const match of source.matchAll(/\bset([A-Z][A-Za-z0-9]*)\(/g)) {
    const key = match[1][0].toLowerCase() + match[1].slice(1)
    context[`set${match[1]}`] = value => { state[key] = typeof value === 'function' ? value(state[key]) : value }
  }
  const ctx = vm.createContext(context)
  vm.runInContext(code, ctx)
  return { state, ctx }
}
const template = { id: 't', name: 'Template' }

test('new template clears previous ownership/profile/review/layout without changing field defaults', () => {
  const { state, ctx } = editor()
  ctx.handleSelectTemplate(template)
  assert.equal(state.currentProjectId, null)
  assert.equal(state.projectOwner, null)
  assert.equal(state.projectFolder, null)
  assert.equal(state.iccProfile, DEFAULT_PRINT_PROFILE)
  assert.equal(state.reviewStatus, 'design')
  assert.deepEqual(plain(state.fontSizes), {})
  assert.deepEqual(plain(state.fields), ctx.DEFAULT_FIELDS)
  assert.equal(state.restrictedReview, false)
  assert.equal(state.hasUnsavedChanges, false)
  assert.equal(state.loadKey, 8)
  assert.equal(ctx.pendingNewIdRef.current, null)
})
test('brief initialization retains its explicit name, folder, merchant and image placement', async () => {
  const { state, ctx } = editor()
  await ctx.handleSelectTemplateFromBrief(template, { partner: 'Merchant', offer: 'Lunch', projectName: '  Campaign  ', folder: 'Autumn', imageScales: { photo: 130 }, imagePositions: { photo: { x: 4, y: 5 } } })
  assert.equal(state.projectName, 'Campaign')
  assert.equal(state.projectFolder, 'Autumn')
  assert.equal(state.fields.restaurant_name, 'Merchant')
  assert.deepEqual(plain(state.imageScales), { photo: 130 })
  assert.deepEqual(plain(state.imagePositions), { photo: { x: 4, y: 5 } })
  assert.equal(state.reachedViaBrief, true)
  assert.equal(state.iccProfile, DEFAULT_PRINT_PROFILE)
})
test('reopening a saved design restores its own profile, ownership, review state and layout', async () => {
  const { state, ctx } = editor()
  await ctx.openLoadedProject({ id: 'saved', templateId: 't', iccProfile: 'fogra39', ownerEmail: 'owner@example.com', ownerName: 'Owner', folder: 'Saved', reviewStatus: 'review', fields: { headline: 'Saved headline' }, fontSizes: { headline: 33 }, imageScales: { photo: 150 } })
  assert.equal(state.currentProjectId, 'saved')
  assert.equal(state.iccProfile, 'fogra39')
  assert.equal(state.projectOwner.email, 'owner@example.com')
  assert.equal(state.projectFolder, 'Saved')
  assert.equal(state.reviewStatus, 'review')
  assert.equal(state.fields.headline, 'Saved headline')
  assert.equal(state.fontSizes.headline, 33)
  assert.equal(state.imageScales.photo, 150)
})
test('manual save keeps its confirmation; autosave stays silent and a failed save stays dirty', async () => {
  for (const method of ['handleSave', 'autoSave']) {
    const { state, ctx } = editor()
    await ctx[method]()
    assert.equal(state.hasUnsavedChanges, false)
    assert.equal(state.saving, false)
    assert.equal(Boolean(state.showSavedModal), method === 'handleSave')
    state.hasUnsavedChanges = true
    ctx.doSave = async () => { throw new Error('offline') }
    await ctx[method]()
    assert.equal(state.hasUnsavedChanges, true)
    assert.equal(state.saving, false)
  }
})
