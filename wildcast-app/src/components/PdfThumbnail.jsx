import { useEffect, useRef, useState } from 'react'
import { pdfjsLib } from '../lib/pdfSetup'

export default function PdfThumbnail({ pdfPath }) {
  const canvasRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!pdfPath) return
    let cancelled = false
    let loadingTask = null

    async function render() {
      try {
        loadingTask = pdfjsLib.getDocument({ url: pdfPath })
        const pdf = await loadingTask.promise
        const page = await pdf.getPage(1)
        if (cancelled) return

        const canvas = canvasRef.current
        if (!canvas) return

        const container = canvas.parentElement
        const containerWidth = container?.clientWidth ?? 260
        const viewport = page.getViewport({ scale: 1 })
        const scale = containerWidth / viewport.width
        const scaled = page.getViewport({ scale })

        canvas.width = scaled.width
        canvas.height = scaled.height

        await page.render({ canvasContext: canvas.getContext('2d'), viewport: scaled }).promise
        if (!cancelled) setLoading(false)
      } catch (e) {
        loadingTask?.destroy()
        if (!cancelled) {
          setLoading(false)
          setError(true)
        }
      }
    }

    render()
    return () => {
      cancelled = true
      loadingTask?.destroy()
    }
  }, [pdfPath])

  if (error) return (
    <div style={{ width: '100%', height: '100%', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontSize: 12, color: '#9ca3af' }}>Preview unavailable</span>
    </div>
  )

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {loading && (
        <div style={{ position: 'absolute', inset: 0, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
          <div style={{ width: 20, height: 20, border: '2px solid #e5e7eb', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%' }} />
    </div>
  )
}
