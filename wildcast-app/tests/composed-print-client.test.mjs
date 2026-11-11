import { test, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { composedPrintQa } from '../api/_lib/composedPrintQa.js'
const pdf = Buffer.from('%PDF-test'), icc = Buffer.from('profile')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const proof = () => ({ status: 'pass', pdf_sha256: sha(pdf), profile_sha256: sha(icc), device: 'tiffsep', overprint: 'enable', dpi: 150, ink_limit_percent: 300, tolerance_percentage_points: 0, pages: [{ page: 1, status: 'pass', max_ink_percent: 299 }] })
afterEach(() => { mock.restoreAll(); delete process.env.PRINT_QA_URL; delete process.env.PRINT_QA_TOKEN; delete process.env.REQUIRE_COMPOSED_PRINT_QA })
function configured() { process.env.PRINT_QA_URL = 'http://127.0.0.1:8767/check'; process.env.PRINT_QA_TOKEN = 'dummy-test-only-print-qa-token-00000' }
test('an unconfigured proof is not claimed as a pass; a mandatory missing proof blocks', async () => {
  assert.equal(await composedPrintQa(pdf, icc), null)
  process.env.REQUIRE_COMPOSED_PRINT_QA = '1'
  await assert.rejects(composedPrintQa(pdf, icc), e => e.status === 503)
})
test('proof receives exact bytes and verifies binding to the PDF and ICC', async () => {
  configured()
  mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(options.body, pdf)
    assert.equal(options.headers['X-ICC-SHA256'], sha(icc))
    assert.equal(options.redirect, 'error')
    return new Response(JSON.stringify(proof()))
  })
  assert.equal((await composedPrintQa(pdf, icc)).status, 'pass')
})
test('a wrong PDF, wrong ICC, missing overprint, invalid maxima or unavailable worker never pass', async () => {
  configured()
  for (const patch of [{ pdf_sha256: 'wrong' }, { profile_sha256: 'wrong' }, { overprint: 'disable' }, { pages: [] }, { pages: [{ status: 'pass', max_ink_percent: null }] }, { status: 'not_checked' }]) {
    mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ ...proof(), ...patch })))
    await assert.rejects(composedPrintQa(pdf, icc), e => e.status === 503)
    mock.restoreAll()
  }
  mock.method(globalThis, 'fetch', async () => { throw new Error('offline') })
  await assert.rejects(composedPrintQa(pdf, icc), e => e.status === 503)
})
test('over-limit results block the download and retain page locations', async () => {
  configured()
  const report = { ...proof(), status: 'fail', pages: [{ page: 1, status: 'fail', max_ink_percent: 320, max_at_mm_from_top_left: [10, 20] }] }
  mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(report)))
  await assert.rejects(composedPrintQa(pdf, icc), e => e.status === 422 && e.report.pages[0].max_ink_percent === 320)
})
