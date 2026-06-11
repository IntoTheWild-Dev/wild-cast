import { useEffect, useRef } from 'react'
import { pdfjsLib } from '../lib/pdfSetup'

export default function PreviewCanvas({ fields, pdfUrl }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    if (!pdfUrl) return
    let cancelled = false

    async function renderPdf() {
      try {
        const pdf = await pdfjsLib.getDocument({ url: pdfUrl }).promise
        const page = await pdf.getPage(1)
        if (cancelled) return

        const canvas = canvasRef.current
        if (!canvas) return

        const container = canvas.parentElement
        const containerWidth = container?.clientWidth ?? 400
        const viewport = page.getViewport({ scale: 1 })
        // Fit to container width, max ~480px
        const scale = Math.min(containerWidth / viewport.width, 480 / viewport.width)
        const scaled = page.getViewport({ scale })

        canvas.width = scaled.width
        canvas.height = scaled.height

        await page.render({ canvasContext: canvas.getContext('2d'), viewport: scaled }).promise
      } catch (e) {
        console.error('PreviewCanvas render error:', e)
      }
    }

    renderPdf()
    return () => { cancelled = true }
  }, [pdfUrl])

  return (
    <div style={{ flex: 1, background: '#2a2a2a', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 40, overflowY: 'auto' }}>
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

        {/* Live text overlay */}
        {pdfUrl && (
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
    </div>
  )
}
