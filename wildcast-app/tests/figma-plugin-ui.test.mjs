// Run with: npm test
// The plugin window's buttons (figma-plugin/ui.html script) against a tiny fake
// DOM: the "Update background only" section fills from the template list, a
// draft updates on one click, a LIVE template needs a second click (Figma's
// plugin window blocks confirm()), and the status texts are right.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'

const html = readFileSync(new URL('../figma-plugin/ui.html', import.meta.url), 'utf8')
const script = html.match(/<script>([\s\S]*)<\/script>/)[1]

function boot() {
  const els = {}
  for (const id of ['slot', 'importBtn', 'status', 'existing', 'bgBtn']) els[id] = { id, value: '', innerHTML: '', textContent: '', className: '', disabled: false }
  const posted = [] // plain copies: objects made inside the vm have another Object.prototype
  const ctx = {
    document: { getElementById: id => els[id] },
    parent: { postMessage: m => posted.push(JSON.parse(JSON.stringify(m.pluginMessage))) },
    confirm: () => { throw new Error('confirm() must not be used in the plugin window') },
    window: {},
  }
  vm.createContext(ctx)
  vm.runInContext(script, ctx)
  const send = pluginMessage => ctx.window.onmessage({ data: { pluginMessage } })
  return { els, posted, send }
}
const slots = [{ slotKey: 'restaurant-flyer-option-f', label: 'Restaurant Flyer · Option F', category: 'restaurant', format: 'Flyer' }]
const existing = [{ slotKey: 'restaurant-flyer-option-e', label: 'Restaurant Flyer · Option E', live: false }, { slotKey: 'restaurant-flyer-option-d', label: 'Restaurant Flyer · Option D', live: true }]

test('the update section fills from the existing templates and enables its button', () => {
  const { els, send } = boot()
  send({ type: 'slots', slots, existing })
  assert.equal(els.bgBtn.disabled, false)
  assert.equal(els.existing.disabled, false)
  assert.match(els.existing.innerHTML, /Option E<\/option>|Option E \(draft\)/)
  assert.match(els.existing.innerHTML, /Option D \(live\)/)
  assert.equal(els.importBtn.disabled, false)
})

test('works even when there is no empty slot left to import into', () => {
  const { els, send } = boot()
  send({ type: 'slots', slots: [], existing })
  assert.equal(els.bgBtn.disabled, false)
})

test('a draft template updates on one click', () => {
  const { els, posted, send } = boot()
  send({ type: 'slots', slots, existing })
  els.existing.value = 'restaurant-flyer-option-e'
  els.bgBtn.onclick()
  assert.deepEqual(posted, [{ type: 'update-background', slotKey: 'restaurant-flyer-option-e', label: 'Restaurant Flyer · Option E' }])
  assert.equal(els.bgBtn.disabled, true)
  assert.equal(els.importBtn.disabled, true)
})

test('a LIVE template needs a second click, and picking another template cancels the first', () => {
  const { els, posted, send } = boot()
  send({ type: 'slots', slots, existing })
  els.existing.value = 'restaurant-flyer-option-d'
  els.bgBtn.onclick()
  assert.equal(posted.length, 0)
  assert.match(els.bgBtn.textContent, /LIVE - click again/)
  els.existing.onchange() // user picks something else, then back
  assert.equal(els.bgBtn.textContent, 'Update background only')
  els.bgBtn.onclick()
  assert.equal(posted.length, 0, 'armed again, not posted')
  els.bgBtn.onclick()
  assert.equal(posted[0].type, 'update-background')
  assert.equal(posted[0].slotKey, 'restaurant-flyer-option-d')
})

test('done and error messages re-enable the buttons with the right wording', () => {
  const { els, send } = boot()
  send({ type: 'slots', slots, existing })
  els.bgBtn.disabled = true; els.importBtn.disabled = true
  send({ type: 'done', kind: 'background', label: 'Restaurant Flyer · Option E', needsReview: [], pdfNote: ' Saved: background, pdf, tile.' })
  assert.match(els.status.textContent, /Updated the background of "Restaurant Flyer · Option E"\. Zones and settings are unchanged\. Saved: background, pdf, tile\./)
  assert.equal(els.bgBtn.disabled, false)
  assert.equal(els.importBtn.disabled, false)
  send({ type: 'done', label: 'Restaurant Flyer · Option E', needsReview: ['ailabel'], pdfNote: ' Saved: pdf.' })
  assert.match(els.status.textContent, /Imported "Restaurant Flyer · Option E" as a draft — check font settings for: ailabel/)
  els.bgBtn.disabled = true
  send({ type: 'error', message: 'different shape' })
  assert.equal(els.bgBtn.disabled, false)
  assert.match(els.status.textContent, /different shape/)
})

test('the normal Import button still sends the full import', () => {
  const { els, posted, send } = boot()
  send({ type: 'slots', slots, existing })
  els.slot.value = 'restaurant-flyer-option-f'
  els.importBtn.onclick()
  assert.deepEqual(posted, [{ type: 'import', slotKey: 'restaurant-flyer-option-f', label: 'Restaurant Flyer · Option F', cat: 'restaurant', format: 'Flyer' }])
  assert.equal(els.bgBtn.disabled, true, 'both buttons are locked while an import runs')
})
