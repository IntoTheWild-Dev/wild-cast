import { useState, useRef } from 'react'
import { PDFDocument, rgb, cmyk } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import Header from './components/Header'
import TemplatePicker from './components/TemplatePicker'
import FieldEditor from './components/FieldEditor'
import PreviewCanvas from './components/PreviewCanvas'

const DEFAULT_FIELDS = {
  headline: '',
  offer: '',
  sub_headline: '',
  tc: '',
  logoUrl: null,
  photoUrl: null,
  qrUrl: null,
}

// Injection map for the Promo Flyer Partner (promo-partner) template.
// Each entry covers the original text with a teal rect, then draws partner text on top.
// Coordinates are PDF points, bottom-left origin (matches PDF.js scan output).
const PROMO_PARTNER_MAP = [
  // ── Page 1 ──────────────────────────────────────────────────────
  // Sub-headline tagline above the restaurant name ("WIE WÄR'S MIT", y:312, fs:22)
  { field: 'sub_headline', page: 0,
    rect: { x: 22, y: 306, width: 272, height: 42 },
    text: { x: 89, y: 316, size: 18, maxWidth: 148 },
    fontKey: 'bold' },
  // Headline — restaurant name ("McDonald's", y:263, fs:54)
  { field: 'headline', page: 0,
    rect: { x: 22, y: 252, width: 272, height: 76 },
    text: { x: 29, y: 268, size: 38, maxWidth: 256 },
    fontKey: 'bold' },
  // T&C footer CTA ("Jetzt Wolt App downloaden...", y:121-132, fs:9)
  { field: 'tc', page: 0,
    rect: { x: 65, y: 108, width: 188, height: 36 },
    text: { x: 70, y: 132, size: 8, maxWidth: 178, lineHeight: 11 },
    fontKey: 'regular' },
  // ── Page 2 ──────────────────────────────────────────────────────
  // Sub-headline tagline at top of offer page ("WIE WÄR'S MIT", y:364, fs:22)
  { field: 'sub_headline', page: 1,
    rect: { x: 22, y: 357, width: 272, height: 42 },
    text: { x: 89, y: 367, size: 18, maxWidth: 148 },
    fontKey: 'bold' },
  // Offer amount — the big promo number ("3x10€", y:306, fs:74)
  { field: 'offer', page: 1,
    rect: { x: 58, y: 294, width: 204, height: 66 },
    text: { x: 66, y: 302, size: 55, maxWidth: 200 },
    fontKey: 'black' },
]

export default function App() {
  const [screen, setScreen] = useState('picker')
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [fields, setFields] = useState(DEFAULT_FIELDS)
  const [lang, setLang] = useState('de')
  const [pdfUrl, setPdfUrl] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [pdfPageCount, setPdfPageCount] = useState(1)
  const previewBlobRef = useRef(null)
  const fileInputRef = useRef(null)

  function handleSelectTemplate(template) {
    setSelectedTemplate(template)
    setFields(DEFAULT_FIELDS)
    setPdfUrl(template.pdfPath ?? null)
    setPreviewUrl(null)
    setScreen('editor')
  }

  function handleFieldChange(key, value) {
    setFields(prev => ({ ...prev, [key]: value }))
  }

  function handleScan(allPageItems) {
    const page1 = allPageItems[0] || []
    const page2 = allPageItems[1] || []

    // Deduplicate page 1 — "McDonald's" is drawn 4× for a visual layering effect
    const seen = new Set()
    const unique1 = page1.filter(it => seen.has(it.str) ? false : seen.add(it.str))

    // Map by font size: large = headline, medium = sub_headline, small = tc
    const headline    = unique1.find(it => it.transform[0] >= 30)?.str ?? ''
    const sub_headline = unique1.find(it => it.transform[0] >= 14 && it.transform[0] < 30)?.str ?? ''
    const tc = unique1
      .filter(it => it.transform[0] >= 7 && it.transform[0] < 14)
      .map(it => it.str).join(' ').trim()

    // Page 2: offer = the largest text item (typically the promo amount e.g. "3x10€")
    const seen2 = new Set()
    const unique2 = page2.filter(it => seen2.has(it.str) ? false : seen2.add(it.str))
    const offer = unique2.reduce(
      (best, it) => (!best || it.transform[0] > best.transform[0]) ? it : best, null
    )?.str ?? ''

    setFields(prev => ({ ...prev, headline, sub_headline, tc, offer }))
  }

  function handlePdfImport(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setPdfUrl(URL.createObjectURL(file))
    setPreviewUrl(null)
  }

  // Shared pdf-lib work — used by both Preview and Export
  async function buildModifiedPdf() {
    const res = await fetch(pdfUrl)
    const bytes = await res.arrayBuffer()
    const doc = await PDFDocument.load(bytes)
    doc.registerFontkit(fontkit)

    // Remove extra pages from multi-restaurant batch source file.
    // PDF.js reports 2 visible pages; the raw file has many more hidden ones.
    while (doc.getPageCount() > Math.max(1, pdfPageCount)) {
      doc.removePage(doc.getPageCount() - 1)
    }

    // Load all three Omnes weights in parallel
    const [boldBytes, blackBytes, regularBytes] = await Promise.all([
      fetch('/fonts/Omnes Bold.ttf').then(r => r.arrayBuffer()),
      fetch('/fonts/Omnes Black.ttf').then(r => r.arrayBuffer()),
      fetch('/fonts/Omnes Regular.ttf').then(r => r.arrayBuffer()),
    ])
    const fonts = {
      bold:    await doc.embedFont(boldBytes),
      black:   await doc.embedFont(blackBytes),
      regular: await doc.embedFont(regularBytes),
    }

    // Exact Wolt teal (CMYK 75/0/10/0) — rect blends with the template background
    const teal  = cmyk(0.75, 0, 0.10, 0)
    const white = rgb(1, 1, 1)

    const map = selectedTemplate?.id === 'promo-partner' ? PROMO_PARTNER_MAP : []

    // Pass 1: draw all cover rects so no text gets painted over by a later rect
    for (const entry of map) {
      if (!entry.rect || entry.page >= doc.getPageCount()) continue
      doc.getPage(entry.page).drawRectangle({ ...entry.rect, color: teal })
    }

    // Pass 2: draw all partner text on top of the clean teal surface
    for (const entry of map) {
      const value = fields[entry.field]
      if (!value || entry.page >= doc.getPageCount()) continue
      doc.getPage(entry.page).drawText(value, {
        x:          entry.text.x,
        y:          entry.text.y,
        size:       entry.text.size,
        font:       fonts[entry.fontKey],
        color:      white,
        maxWidth:   entry.text.maxWidth,
        lineHeight: entry.text.lineHeight,
      })
    }

    return doc.save()
  }

  async function handlePreview() {
    if (!pdfUrl) return
    try {
      const pdfBytes = await buildModifiedPdf()
      if (previewBlobRef.current) URL.revokeObjectURL(previewBlobRef.current)
      const blob = new Blob([pdfBytes], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      previewBlobRef.current = url
      setPreviewUrl(url)
    } catch (err) {
      console.error('Preview error:', err)
    }
  }

  async function handleExport() {
    if (!pdfUrl) { alert('No template loaded.'); return }
    try {
      const pdfBytes = await buildModifiedPdf()
      const blob = new Blob([pdfBytes], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `wildcast-${selectedTemplate?.id ?? 'export'}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export error:', err)
      alert('Error: ' + err.message)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header onLogoClick={() => setScreen('picker')} />

      {screen === 'picker' && (
        <TemplatePicker onSelect={handleSelectTemplate} />
      )}

      {screen === 'editor' && (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', height: 'calc(100vh - 58px)' }}>

          {/* Left: breadcrumb + PDF preview */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Breadcrumb */}
            <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span onClick={() => setScreen('picker')} style={{ fontSize: 13, color: 'var(--mid)', cursor: 'pointer' }}>Templates</span>
              <span style={{ fontSize: 13, color: 'var(--light)' }}>→</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--dark)' }}>{selectedTemplate?.name}</span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={{ fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 7, cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--mid)', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                  </svg>
                  Replace PDF
                </button>
                <input ref={fileInputRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={handlePdfImport} />
              </div>
            </div>

            {/* previewUrl shows the modified PDF; falls back to the original template */}
            <PreviewCanvas
              fields={fields}
              pdfUrl={previewUrl ?? pdfUrl}
              onNumPages={setPdfPageCount}
              onScan={handleScan}
              isPreview={!!previewUrl}
            />
          </div>

          <FieldEditor
            fields={fields}
            onChange={handleFieldChange}
            lang={lang}
            onLangChange={setLang}
            onPreview={handlePreview}
            onExport={handleExport}
            template={selectedTemplate}
          />
        </div>
      )}

      <footer style={{ background: 'var(--dark)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>
          <span>WildCast — Print templates for Wolt partners.</span>
          <span>Built by Wild Stack</span>
        </div>
      </footer>
    </div>
  )
}
