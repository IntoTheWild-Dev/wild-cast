import { useEffect, useRef, useState } from 'react'
import { fabric } from 'fabric'

async function loadFonts() {
  // Fonts are served via Adobe Fonts (typekit link in index.html).
  // Wait for the browser to finish loading them before rendering.
  await document.fonts.ready
}

export default function TemplateCanvas({ config, fields, onFieldChange, exportRef, fontSizes, alignments }) {
  const containerRef = useRef(null)
  const canvasElRef = useRef(null)
  const fabricRef = useRef(null)
  const zoneObjsRef = useRef({})
  const syncing = useRef(false)
  const [loading, setLoading] = useState(true)

  // ── Initialise canvas when template config changes ──────────────────────────
  useEffect(() => {
    if (!canvasElRef.current || !config) return
    let destroyed = false

    const { canvasW, canvasH, backgroundUrl, backgroundFill, zones } = config

    const canvas = new fabric.Canvas(canvasElRef.current, {
      width: canvasW,
      height: canvasH,
      selection: false,
      backgroundColor: backgroundFill || '#00C2CB',
      enableRetinaScaling: true,
    })
    fabricRef.current = canvas
    zoneObjsRef.current = {}

    // Wire export handle
    if (exportRef) {
      exportRef.current = {
        getPng: () => canvas.toDataURL({ format: 'png', multiplier: 4 }),
      }
    }

    loadFonts().then(() => {
      if (destroyed) return

      function addZones() {
        zones.forEach(zone => {
          if (zone.type === 'text') {
            const isRotated = !!zone.rotate
            const cx = zone.x + zone.width / 2
            const cy = zone.y + zone.height / 2
            const textW = zone.textWidth ?? zone.width

            const tb = new fabric.Textbox(fields[zone.id] || '', {
              left:    isRotated ? cx : zone.x,
              top:     isRotated ? cy : zone.y,
              originX: isRotated ? 'center' : 'left',
              originY: isRotated ? 'center' : 'top',
              width:   textW,
              fontSize:   fontSizes?.[zone.id] ?? zone.fontSize,
              fontFamily: zone.fontFamily,
              fontWeight: zone.fontWeight ? String(zone.fontWeight) : 'normal',
              fill:    zone.color || '#FFFFFF',
              textAlign: alignments?.[zone.id] ?? zone.align ?? 'left',
              angle:   zone.rotate || 0,
              editable:       true,
              selectable:     true,
              hasControls:    false,
              hasBorders:     false,
              lockMovementX:  true,
              lockMovementY:  true,
              splitByGrapheme: false,
              _wcZoneId: zone.id,
            })

            tb.on('changed', () => {
              if (syncing.current) return
              syncing.current = true
              onFieldChange?.(zone.id, tb.text)
              syncing.current = false
            })

            canvas.add(tb)
            zoneObjsRef.current[zone.id] = tb

          } else if (zone.type === 'image') {
            // Dashed placeholder shown until user uploads a photo
            const rect = new fabric.Rect({
              left:   zone.x,
              top:    zone.y,
              width:  zone.width,
              height: zone.height,
              fill:   'transparent',
              stroke: 'rgba(255,255,255,0.45)',
              strokeWidth: 1.5,
              strokeDashArray: [6, 4],
              rx: 4, ry: 4,
              selectable: false,
              evented:    false,
              _wcZoneId: `${zone.id}-placeholder`,
            })
            canvas.add(rect)
            zoneObjsRef.current[`${zone.id}-placeholder`] = rect
          }
        })

        canvas.renderAll()
        if (!destroyed) setLoading(false)
      }

      // Load background PNG, then add zones on top
      if (backgroundUrl) {
        fabric.Image.fromURL(backgroundUrl, img => {
          if (destroyed) { canvas.dispose(); return }
          img.set({
            left: 0, top: 0,
            scaleX: config.canvasW / img.width,
            scaleY: config.canvasH / img.height,
            selectable: false,
            evented:    false,
          })
          canvas.setBackgroundImage(img, () => {
            canvas.renderAll()
            addZones()
          })
        }, { crossOrigin: 'anonymous' })
      } else {
        addZones()
      }
    })

    return () => {
      destroyed = true
      canvas.dispose()
      fabricRef.current = null
      zoneObjsRef.current = {}
      setLoading(true)
    }
  }, [config]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync right-panel text → canvas ─────────────────────────────────────────
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return
    Object.entries(fields).forEach(([id, value]) => {
      const obj = zoneObjsRef.current[id]
      if (obj && obj.type === 'textbox' && obj.text !== (value || '')) {
        if (syncing.current) return
        syncing.current = true
        obj.set('text', value || '')
        canvas.renderAll()
        syncing.current = false
      }
    })
  }, [fields])

  // ── Sync font size overrides → canvas ──────────────────────────────────────
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas || !config) return
    config.zones.forEach(zone => {
      const obj = zoneObjsRef.current[zone.id]
      if (!obj || obj.type !== 'textbox') return
      const size = fontSizes?.[zone.id] ?? zone.fontSize
      if (obj.fontSize !== size) obj.set('fontSize', size)
    })
    canvas.renderAll()
  }, [fontSizes, config])

  // ── Sync alignment overrides → canvas ──────────────────────────────────────
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas || !config) return
    config.zones.forEach(zone => {
      const obj = zoneObjsRef.current[zone.id]
      if (!obj || obj.type !== 'textbox') return
      const align = alignments?.[zone.id] ?? zone.align ?? 'left'
      if (obj.textAlign !== align) obj.set('textAlign', align)
    })
    canvas.renderAll()
  }, [alignments, config])

  // ── Sync photo upload → canvas ──────────────────────────────────────────────
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas || !config) return
    const photoZone = config.zones.find(z => z.id === 'photo')
    if (!photoZone) return

    // Remove existing photo
    const existing = zoneObjsRef.current['photo-image']
    if (existing) {
      canvas.remove(existing)
      delete zoneObjsRef.current['photo-image']
    }

    if (!fields.photoUrl) {
      // Restore placeholder
      const ph = zoneObjsRef.current['photo-placeholder']
      if (ph) { ph.set('visible', true); canvas.renderAll() }
      return
    }

    // Hide placeholder, load and draw photo
    const ph = zoneObjsRef.current['photo-placeholder']
    if (ph) ph.set('visible', false)

    fabric.Image.fromURL(fields.photoUrl, img => {
      if (!fabricRef.current) return
      const scaleX = photoZone.width  / img.width
      const scaleY = photoZone.height / img.height
      const scale  = Math.min(scaleX, scaleY)

      img.set({
        left: photoZone.x + (photoZone.width  - img.width  * scale) / 2,
        top:  photoZone.y + (photoZone.height - img.height * scale) / 2,
        scaleX: scale,
        scaleY: scale,
        selectable: false,
        evented:    false,
      })

      canvas.add(img)
      // Keep text zones on top
      Object.values(zoneObjsRef.current).forEach(o => {
        if (o.type === 'textbox') canvas.bringToFront(o)
      })
      zoneObjsRef.current['photo-image'] = img
      canvas.renderAll()
    }, { crossOrigin: 'anonymous' })
  }, [fields.photoUrl, config]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!config) {
    return (
      <div style={{ flex: 1, background: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>No template selected</span>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        background: '#2a2a2a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
        overflow: 'auto',
        position: 'relative',
      }}
    >
      {loading && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: '#2a2a2a', zIndex: 10,
        }}>
          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Loading canvas…</span>
        </div>
      )}
      <div style={{
        boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
        borderRadius: 3,
        overflow: 'hidden',
        flexShrink: 0,
      }}>
        <canvas ref={canvasElRef} />
      </div>
    </div>
  )
}
