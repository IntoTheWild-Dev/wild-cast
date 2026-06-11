import { useEffect, useRef, useState } from 'react'
import { pdfjsLib } from '../lib/pdfSetup'

export default function PreviewCanvas({ fields, pdfUrl, onNumPages, onScan, isPreview }) {
  const canvasRef = useRef(null)
  const [pageNum, setPageNum] = useState(1)
  const [numPages, setNumPages] = useState(1)
  const pdfRef = useRef(null)

  // Load PDF and get page count whenever URL changes
  useEffect(() => {
    if (!pdfUrl) { pdfRef.current = null; setNumPages(1); setPageNum(1); return }
    let cancelled = false

    async function loadPdf() {
      try {
        const pdf = await pdfjsLib.getDocument({ url: pdfUrl }).promise
        if (cancelled) return
        pdfRef.current = pdf
        setNumPages(pdf.numPages)
        setPageNum(1)
        onNumPages?.(pdf.numPages)

        // Scan all pages for text content
        const allPageItems = []
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i)
          const content = await page.getTextContent()
          const items = content.items.filter(it => it.str.trim())
          console.log(`[TextScan] Page ${i}:`, items.map(it => it.str))
          allPageItems.push(items)
        }
        // Only populate fields from the original template, not from a preview blob
        if (!isPreview) onScan?.(allPageItems)
      } catch (e) {
        console.error('PreviewCanvas load error:', e)
      }
    }

    loadPdf()
    return () => { cancelled = true }
  }, [pdfUrl])

  // Render the current page whenever page number changes (after pdf is loaded)
  useEffect(() => {
    if (!pdfRef.current) return
    let cancelled = false

    async function renderPage() {
      try {
        const page = await pdfRef.current.getPage(pageNum)
        if (cancelled) return

        const canvas = canvasRef.current
        if (!canvas) return

        const container = canvas.parentElement?.parentElement
        const containerWidth = container?.clientWidth ?? 400
        const viewport = page.getViewport({ scale: 1 })
        const scale = Math.min(containerWidth / viewport.width, 480 / viewport.width)
        const scaled = page.getViewport({ scale })

        canvas.width = scaled.width
        canvas.height = scaled.height

        await page.render({ canvasContext: canvas.getContext('2d'), viewport: scaled }).promise
      } catch (e) {
        console.error('PreviewCanvas render error:', e)
      }
    }

    renderPage()
    return () => { cancelled = true }
  }, [pageNum, numPages])

  return (
    <div style={{ flex: 1, background: '#2a2a2a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: 40, overflowY: 'auto', gap: 16 }}>
      <div style={{ position: 'relative', boxShadow: '0 24px 64px rgba(0,0,0,0.6)', borderRadius: 3 }}>
        {pdfUrl ? (
          <canvas ref={canvasRef} style={{ display: 'block', borderRadius: 3 }} />
        ) : (
          <div style={{ width: 360, height: 520, background: '#fff', borderRadius: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
            </svg>
            <span style={{ fontSize: 13, color: '#aaa' }}>No PDF loaded</span>
          </div>
        )}

        {/* Live text overlay — only shown before preview is generated */}
        {pdfUrl && !isPreview && (
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', padding: '10% 8% 6%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 4 }}>
            {fields.headline && (
              <div style={{ fontSize: 20, fontWeight: 900, color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,0.6)', lineHeight: 1.1 }}>{fields.headline}</div>
            )}
            {fields.offer && (
              <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>{fields.offer}</div>
            )}
            {fields.sub_headline && (
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.9)', textShadow: '0 1px 3px rgba(0,0,0,0.6)', marginTop: 2 }}>{fields.sub_headline}</div>
            )}
            {fields.tc && (
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.65)', textShadow: '0 1px 3px rgba(0,0,0,0.6)', marginTop: 4, lineHeight: 1.4 }}>{fields.tc}</div>
            )}
          </div>
        )}
      </div>

      {/* Page navigator — only shown for multi-page PDFs */}
      {pdfUrl && numPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.08)', borderRadius: 8, padding: '8px 16px' }}>
          <button
            onClick={() => setPageNum(p => Math.max(1, p - 1))}
            disabled={pageNum === 1}
            style={{
              background: 'none', border: 'none', cursor: pageNum === 1 ? 'default' : 'pointer',
              color: pageNum === 1 ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.8)',
              fontSize: 18, lineHeight: 1, padding: '0 4px', transition: 'color 0.15s',
            }}
          >
            ←
          </button>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: 600, minWidth: 80, textAlign: 'center' }}>
            Page {pageNum} of {numPages}
          </span>
          <button
            onClick={() => setPageNum(p => Math.min(numPages, p + 1))}
            disabled={pageNum === numPages}
            style={{
              background: 'none', border: 'none', cursor: pageNum === numPages ? 'default' : 'pointer',
              color: pageNum === numPages ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.8)',
              fontSize: 18, lineHeight: 1, padding: '0 4px', transition: 'color 0.15s',
            }}
          >
            →
          </button>
        </div>
      )}
    </div>
  )
}
