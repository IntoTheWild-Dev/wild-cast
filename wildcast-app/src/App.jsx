import { useState, useRef } from 'react'
import { PDFDocument, rgb, cmyk, degrees } from 'pdf-lib'
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

// Injection map for the Wen Cheng Potsdam flyers (Flyer 1 & Flyer 2).
// Page: 314.6 × 438 pts. Coordinates in pdf-lib bottom-left origin.
// Teal background matches Wolt teal (CMYK 75/0/10/0) throughout the design.
const WEN_CHENG_POTSDAM_MAP = [
  // City tagline line: "POTSDAMS NEUES" (OmnesCondBlack size 35, top of page)
  // pdfplumber: top=82.9, bottom=117.9 → pdf-lib: y=320, height=38
  { field: 'sub_headline', page: 0,
    rect:  { x: 14,  y: 318, width: 288, height: 42 },
    text:  { x: 22,  y: 325, size: 30,  maxWidth: 276 },
    fontKey: 'condBlack' },
  // Main tagline: "DREAMTEAM" (OmnesCondBlack size 51)
  // pdfplumber: top=114.2, bottom=165.2 → pdf-lib: y=272, height=54
  { field: 'headline', page: 0,
    rect:  { x: 14,  y: 270, width: 288, height: 56 },
    text:  { x: 22,  y: 276, size: 44,  maxWidth: 276 },
    fontKey: 'condBlack' },
  // Offer badge: "30% SPAREN*" (OmnesVF/Black size 31)
  // pdfplumber: top=327, bottom=358 → pdf-lib: y=80, height=33
  { field: 'offer', page: 0,
    rect:  { x: 68,  y: 78,  width: 184, height: 35 },
    text:  { x: 76,  y: 84,  size: 26,  maxWidth: 172 },
    fontKey: 'black' },
  // T&C — vertical text strip on the left edge, rotated 90°
  // pdfplumber: x=14–50, top=287–414 → pdf-lib: x=14, y=24, rotated up
  { field: 'tc', page: 0,
    rect:  { x: 14,  y: 22,  width: 38,  height: 130 },
    text:  { x: 46,  y: 26,  size: 5.5, maxWidth: 126, rotate: 90 },
    fontKey: 'regular' },
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

    // Deduplicate — some elements are drawn multiple times for visual layering
    const seen = new Set()
    const unique1 = page1.filter(it => seen.has(it.str) ? false : seen.add(it.str))

    // Sort by font size descending so picks are stable regardless of stream order
    const bySize = [...unique1].sort((a, b) => b.transform[0] - a.transform[0])

    // headline = LARGEST text block (≥30pt)
    const headline = bySize.find(it => it.transform[0] >= 30)?.str ?? ''
    // sub_headline = second-largest distinct item (≥14pt, not already headline)
    const sub_headline = bySize.find(
      it => it.transform[0] >= 14 && it.str !== headline
    )?.str ?? ''
    // tc = small text (7–13pt)
    const tc = unique1
      .filter(it => it.transform[0] >= 7 && it.transform[0] < 14)
      .map(it => it.str).join(' ').trim()

    // offer: page 2 for multi-page; third-largest distinct block for single-page
    let offer = ''
    if (page2.length > 0) {
      const seen2 = new Set()
      const unique2 = page2.filter(it => seen2.has(it.str) ? false : seen2.add(it.str))
      offer = unique2.reduce(
        (best, it) => (!best || it.transform[0] > best.transform[0]) ? it : best, null
      )?.str ?? ''
    } else {
      offer = bySize.find(it => it.str !== headline && it.str !== sub_headline)?.str ?? ''
    }

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

    // Load all Omnes weights in parallel (condBlack needed for Wen Cheng headlines)
    const [boldBytes, blackBytes, regularBytes, condBlackBytes] = await Promise.all([
      fetch('/fonts/Omnes Bold.ttf').then(r => r.arrayBuffer()),
      fetch('/fonts/Omnes Black.ttf').then(r => r.arrayBuffer()),
      fetch('/fonts/Omnes Regular.ttf').then(r => r.arrayBuffer()),
      fetch('/fonts/Omnes Cond Black.ttf').then(r => r.arrayBuffer()),
    ])
    const fonts = {
      bold:      await doc.embedFont(boldBytes),
      black:     await doc.embedFont(blackBytes),
      regular:   await doc.embedFont(regularBytes),
      condBlack: await doc.embedFont(condBlackBytes),
    }

    // Exact Wolt teal (CMYK 75/0/10/0) — rect blends with the template background
    const teal  = cmyk(0.75, 0, 0.10, 0)
    const white = rgb(1, 1, 1)

    const wenChengIds = ['wen-cheng-flyer1', 'wen-cheng-flyer2']
    const map = selectedTemplate?.id === 'promo-partner'
      ? PROMO_PARTNER_MAP
      : wenChengIds.includes(selectedTemplate?.id)
        ? WEN_CHENG_POTSDAM_MAP
        : []

    // Pass 1: draw all cover rects so no text gets painted over by a later rect
    for (const entry of map) {
      if (!entry.rect || entry.page >= doc.getPageCount()) continue
      doc.getPage(entry.page).drawRectangle({ ...entry.rect, color: teal })
    }

    // Pass 2: draw all partner text on top of the clean teal surface
    for (const entry of map) {
      const value = fields[entry.field]
      if (!value || entry.page >= doc.getPageCount()) continue
      const textOpts = {
        x:          entry.text.x,
        y:          entry.text.y,
        size:       entry.text.size,
        font:       fonts[entry.fontKey],
        color:      white,
        maxWidth:   entry.text.maxWidth,
        lineHeight: entry.text.lineHeight,
      }
      if (entry.text.rotate) textOpts.rotate = degrees(entry.text.rotate)
      doc.getPage(entry.page).drawText(value, textOpts)
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

    // Use the serverless API for named templates (production path)
    if (selectedTemplate?.id && selectedTemplate.id !== 'custom-upload') {
      try {
        const res = await fetch('/api/generate-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            templateId: selectedTemplate.id,
            fields,
            pageCount: pdfPageCount,
          }),
        })
        if (!res.ok) {
          const { error } = await res.json().catch(() => ({}))
          throw new Error(error ?? `Server error ${res.status}`)
        }
        const { url, filename } = await res.json()
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
        return
      } catch (err) {
        console.error('API export error:', err)
        alert('Export error: ' + err.message)
        return
      }
    }

    // Fallback: client-side export for custom uploaded PDFs
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
