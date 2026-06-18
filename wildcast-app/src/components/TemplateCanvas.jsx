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

    // Wire export + reset handles
    if (exportRef) {
      const snapZone = (zone) => {
        if (zone.type === 'image') {
          const img = zoneObjsRef.current[`${zone.id}-image`]
          if (!img) return
          const s = img._wcScale
          img.set({
            left: zone.x + (zone.width  - img.width  * s) / 2,
            top:  zone.y + (zone.height - img.height * s) / 2,
            scaleX: s, scaleY: s,
          })
          img.setCoords()
          return
        }
        const obj = zoneObjsRef.current[zone.id]
        if (!obj || obj.type !== 'textbox') return
        const isRotated = !!zone.rotate
        const cx = zone.x + zone.width / 2
        const cy = zone.y + zone.height / 2
        obj.set({
          left: isRotated ? cx : zone.x,
          top:  isRotated ? cy : zone.y,
        })
        obj.setCoords()
      }
      exportRef.current = {
        getPng: () => canvas.toDataURL({ format: 'png', multiplier: 4 }),
        resetLayout: () => {
          zones.forEach(snapZone)
          canvas.renderAll()
        },
        resetZone: (zoneId) => {
          const zone = zones.find(z => z.id === zoneId)
          if (zone) { snapZone(zone); canvas.renderAll() }
        },
      }
    }

    loadFonts().then(() => {
      if (destroyed) return

      function addZones() {
        // Guide goes in first so it renders below all text and image zones
        const guideX = canvasW / 2
        const guide = new fabric.Line([guideX, 0, guideX, canvasH], {
          stroke: 'rgba(255,255,255,0.6)',
          strokeWidth: 1.5,
          strokeDashArray: [6, 5],
          selectable: false,
          evented: false,
          excludeFromExport: true,
        })
        canvas.add(guide)
        zoneObjsRef.current['_centre-guide'] = guide

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
              hasControls:    true,
              hasBorders:     true,
              borderColor:    'rgba(0,194,203,0.7)',
              cornerColor:    'rgba(0,194,203,0.9)',
              cornerStyle:    'circle',
              cornerSize:     10,
              splitByGrapheme: false,
              _wcZoneId: zone.id,
            })
            // Show only the right-edge handle — dragging it reflows text width (Fabric.js Textbox built-in)
            tb.setControlsVisibility({ tl: false, tr: false, bl: false, br: false, mt: false, mb: false, ml: false, mtr: false })

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
            scaleX: canvas.getWidth()  / img.width,
            scaleY: canvas.getHeight() / img.height,
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

  // ── Sync image uploads → canvas (handles any image zone: photo, logo, etc.) ──
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas || !config) return

    config.zones.filter(z => z.type === 'image').forEach(zone => {
      const urlField = `${zone.id}Url`
      const url = fields[urlField]

      const existing = zoneObjsRef.current[`${zone.id}-image`]
      if (existing) {
        canvas.remove(existing)
        delete zoneObjsRef.current[`${zone.id}-image`]
      }

      const ph = zoneObjsRef.current[`${zone.id}-placeholder`]

      if (!url) {
        if (ph) { ph.set('visible', true); canvas.renderAll() }
        return
      }

      if (ph) ph.set('visible', false)

      fabric.Image.fromURL(url, img => {
        if (!fabricRef.current) return
        const scale = Math.min(zone.width / img.width, zone.height / img.height)
        img.set({
          left:    zone.x + (zone.width  - img.width  * scale) / 2,
          top:     zone.y + (zone.height - img.height * scale) / 2,
          scaleX:  scale,
          scaleY:  scale,
          selectable:   true,
          evented:      true,
          hasControls:  true,
          hasBorders:   true,
          borderColor:  'rgba(0,194,203,0.7)',
          cornerColor:  'rgba(0,194,203,0.9)',
          cornerStyle:  'circle',
          cornerSize:   10,
          lockUniScaling: true,
          lockRotation:   true,
        })
        // Corner handles only — no edge or rotation handles
        img.setControlsVisibility({ mt: false, mb: false, ml: false, mr: false, mtr: false })
        img._wcZoneId = zone.id
        img._wcScale = scale
        canvas.add(img)
        Object.values(zoneObjsRef.current).forEach(o => {
          if (o.type === 'textbox') canvas.bringToFront(o)
        })
        zoneObjsRef.current[`${zone.id}-image`] = img
        canvas.renderAll()
      }, { crossOrigin: 'anonymous' })
    })
  }, [fields, config]) // eslint-disable-line react-hooks/exhaustive-deps

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
