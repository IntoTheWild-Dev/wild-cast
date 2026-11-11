import { createHash } from 'node:crypto'

export async function composedPrintQa(pdf, icc) {
  const endpoint = process.env.PRINT_QA_URL
  if (!endpoint && process.env.REQUIRE_COMPOSED_PRINT_QA !== '1') return null
  const unavailable = () => Object.assign(new Error('Composed-page ink validation is unavailable; no unchecked print PDF was downloaded.'), { status: 503 })
  if (!endpoint || !process.env.PRINT_QA_TOKEN) throw unavailable()
  let url
  try { url = new URL(endpoint) } catch { throw unavailable() }
  if (url.username || url.password || url.search || url.hash || !(url.protocol === 'https:' || (url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)))) throw unavailable()
  const digest = value => createHash('sha256').update(value).digest('hex')
  let report
  try {
    const response = await fetch(url, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(45_000),
      headers: { 'Content-Type': 'application/pdf', Authorization: `Bearer ${process.env.PRINT_QA_TOKEN}`, 'X-ICC-SHA256': digest(icc) },
      body: pdf,
    })
    if (!response.ok) throw unavailable()
    const text = await response.text()
    if (text.length > 100_000) throw unavailable()
    report = JSON.parse(text)
  } catch { throw unavailable() }
  if (report.pdf_sha256 !== digest(pdf) || report.profile_sha256 !== digest(icc) || report.device !== 'tiffsep' || report.overprint !== 'enable' || report.dpi !== 150 || report.ink_limit_percent !== 300 || report.tolerance_percentage_points !== 0 || !Array.isArray(report.pages) || !report.pages.length) throw unavailable()
  if (report.status === 'fail') throw Object.assign(new Error('Composed-page ink exceeds 300%; correct the overlapping artwork before downloading.'), { status: 422, report })
  if (report.status !== 'pass' || report.pages.some(page => page.status !== 'pass' || !Number.isFinite(page.max_ink_percent) || page.max_ink_percent > 300)) throw unavailable()
  return report
}
