import { preflightPdf } from './preflight.js'
import { finishPdf } from './printColors/index.js'

const REQUIRED_PRINT_CHECKS = new Set(['pdfx', 'profile', 'content', 'boxes', 'fonts', 'cmyk', 'ink', 'ppi'])

// Check the bytes that will actually be downloaded, including printer labelling.
export async function finalizePrintPdf(bytes, { printer, mode, lut, iccProfile }) {
  let pdf, report
  try {
    pdf = await finishPdf(bytes, printer)
    report = await preflightPdf(pdf, { lut, requireCmyk: mode === 'cmyk', expectedIcc: iccProfile })
  } catch (cause) {
    const error = new Error('Print validation could not be completed. Please retry; no unchecked PDF was downloaded.', { cause })
    error.status = 503
    throw error
  }
  const problems = report.checks.filter(c => c.status !== 'pass')
  if (mode === 'cmyk') {
    const failures = problems.filter(c => REQUIRED_PRINT_CHECKS.has(c.id))
    if (failures.length) {
      const error = new Error('Print checks failed: ' + failures.map(c => `${c.label}: ${c.detail}`).join('; '))
      error.status = 422
      throw error
    }
  }
  return { pdf, problems }
}
