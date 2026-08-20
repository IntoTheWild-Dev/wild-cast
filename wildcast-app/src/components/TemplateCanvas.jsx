import { useEffect, useRef, useState, useCallback } from 'react'
import { fabric } from 'fabric'

// Visual-only bleed margin drawn around the canvas in the editor, matching
// the Figma master's own look (solid page edge + inset dashed trim line) —
// canvas is 316px wide representing 105mm trim, so 3mm bleed ≈ 316/105*3 ≈
// 9px at this same scale. Purely a CSS wrapper outside the actual canvas;
// does not change canvasW/canvasH or any zone coordinate.
const BLEED_MARGIN = 9

// Figma-imported zone coordinates land on arbitrary fractional pixels
// (e.g. x: 15.9, y: 77.8), so two guide rects with the same strokeWidth
// anti-alias differently and visibly look thicker/thinner than each other.
// Snapping every guide coordinate to the same .5px offset keeps their
// anti-aliasing consistent across the canvas. Guides are visual-only
// (hidden on export), so this never touches real content placement.
const snapHalf = v => Math.round(v) + 0.5

async function loadFonts() {
  // document.fonts.ready resolves when @font-face declarations are parsed —
  // but the actual font FILES may not be downloaded yet (especially on first
  // production load where they aren't cached). document.fonts.load() actively
  // fetches the specific font files and waits until they are usable.
  await document.fonts.ready
  try {
    await Promise.all([
      document.fonts.load('700 16px omnes-cond'),
      document.fonts.load('700 16px omnes-pro'),
      document.fonts.load('500 16px omnes-pro'),
    ])
  } catch {
    // Proceed if a font file fails to load (network error, etc.) — also
    // covers omnes-pro/500, which has no self-hosted WOLT face yet (see
    // src/index.css); the browser falls back to the nearest registered
    // weight rather than throwing.
  }
}

export default function TemplateCanvas({ config, fields, onFieldChange, exportRef, fontSizes, alignments, imageScales, imagePositions, mode, loadKey, zonePositions, onZoneDragStart, onReady, textPositions }) {
  const containerRef = useRef(null)
  const canvasElRef = useRef(null)
  const fabricRef = useRef(null)
  const zoneObjsRef = useRef({})
  const zoneCfgRef = useRef({})      // zone.id → zone config, for use in sync effects
  const modeRef    = useRef(mode)    // always current, safe to read inside effects
  modeRef.current  = mode
  const fontSizesRef = useRef(fontSizes) // always current, used in auto-shrink
  fontSizesRef.current = fontSizes
  const imageScalesRef = useRef(imageScales ?? {}) // always current, applied on image load
  imageScalesRef.current = imageScales ?? {}
  const imagePositionsRef = useRef(imagePositions ?? {}) // always current, applied on image load
  imagePositionsRef.current = imagePositions ?? {}
  const alignmentsRef = useRef(alignments ?? {}) // always current, used inside async canvas-init closure
  alignmentsRef.current = alignments ?? {}
  const zonePositionsRef = useRef(zonePositions ?? {}) // saved drag positions, applied on canvas init
  zonePositionsRef.current = zonePositions ?? {}
  const onZoneDragStartRef = useRef(onZoneDragStart) // always current, read inside canvas-init closure
  onZoneDragStartRef.current = onZoneDragStart
  const onReadyRef = useRef(onReady) // always current, read inside canvas-init closure
  onReadyRef.current = onReady
  const syncing = useRef(false)
  const prevFieldsRef = useRef({})       // tracks previous text values for auto-shrink gating
  const [loading, setLoading] = useState(true)
  const [zoom, setZoom] = useState(100)

  // Clamps a user nudge offset to how far the image can move without breaking
  // its fit contract, so a nudge can never reveal zone background behind it
  // (cover) or push the image outside its own box (contain).
  //
  // Cover-fit images are scaled >= the zone in both dimensions (overflow), so
  // slack = (scaledDim - zoneDim)/2 — how far the oversized image can shift
  // before its edge reaches the zone edge. Contain-fit images (e.g. logos) are
  // scaled <= the zone in the non-binding dimension (letterboxed underflow),
  // so the same formula went negative and Math.max(0, …) floored it to zero —
  // nudge was permanently a no-op for any contain-fit zone. Math.abs() unifies
  // both cases: it's the same "how far can this edge travel" distance either way.
  function clampOffset(zone, scaledW, scaledH, rawOffset) {
    const slackX = Math.abs(scaledW  - zone.width)  / 2
    const slackY = Math.abs(scaledH - zone.height) / 2
    const raw = rawOffset ?? { x: 0, y: 0 }
    return {
      x: Math.max(-slackX, Math.min(slackX, raw.x)),
      y: Math.max(-slackY, Math.min(slackY, raw.y)),
    }
  }

  // ── Initialise canvas when template config changes ──────────────────────────
  useEffect(() => {
    if (!canvasElRef.current || !config) return
    let destroyed = false

    const { canvasW, canvasH, backgroundUrl, backgroundFill, backgroundScale, backgroundOffset, bleedExtraBottom, zones } = config

    // The fabric canvas normally renders exactly the trim area (canvasW ×
    // canvasH) — this app deliberately doesn't draw real bleed in the
    // editor (see trim-guide comment below). bleedExtraBottom is a narrow,
    // opt-in escape hatch: a few extra pixels of real canvas below the trim
    // line so art that intentionally bleeds past the bottom edge (e.g. a
    // product photo hanging off a card) isn't hard-clipped by the canvas
    // boundary itself. Every zone/guide coordinate below still uses
    // canvasH (the trim height) unchanged — only the fabric canvas's own
    // pixel height grows. getPng() crops back to canvasH before export, so
    // nothing about the print output changes.
    const renderH = canvasH + (bleedExtraBottom || 0)

    const canvas = new fabric.Canvas(canvasElRef.current, {
      width: canvasW,
      height: renderH,
      selection: false,
      backgroundColor: backgroundFill || '#00C2CB',
      enableRetinaScaling: true,
    })
    fabricRef.current = canvas
    zoneObjsRef.current = {}

    // Smart centre guide — show while dragging, hide otherwise (Figma-style). Not needed in non-designer mode.
    if (mode !== 'non-designer') {
      canvas.on('object:moving', () => {
        const g = zoneObjsRef.current['_centre-guide']
        if (g) { g.set('visible', true); canvas.requestRenderAll() }
      })
      canvas.on('mouse:up', () => {
        const g = zoneObjsRef.current['_centre-guide']
        if (g) { g.set('visible', false); canvas.requestRenderAll() }
      })
      // Snapshot the pre-drag position so a text-zone move/resize is undoable —
      // fires on mousedown (before any position change), not on the eventual
      // object:modified, so the snapshot captures the state to undo BACK TO.
      canvas.on('mouse:down', opt => {
        if (opt.target?.type === 'textbox' && opt.target._wcZoneId) {
          onZoneDragStartRef.current?.(opt.target._wcZoneId)
        }
      })
    }

    // Wire export + reset handles
    if (exportRef) {
      const snapZone = (zone) => {
        if (zone.type === 'image') {
          const img = zoneObjsRef.current[`${zone.id}-image`]
          if (!img) return
          const s = img._wcBaseScale
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
        getZonePositions: () => {
          const positions = {}
          zones.forEach(zone => {
            if (zone.type !== 'text') return
            const obj = zoneObjsRef.current[zone.id]
            if (!obj) return
            positions[zone.id] = { left: obj.left, top: obj.top, width: obj.width }
          })
          return positions
        },
        // Returns the actual displayed font size for every text zone (post auto-shrink).
        // doSave() uses this so the saved fontSizes matches what was on screen, making
        // re-opens deterministic regardless of font-loading timing at auto-shrink time.
        getEffectiveFontSizes: () => {
          const sizes = {}
          zones.forEach(zone => {
            if (zone.type !== 'text') return
            const obj = zoneObjsRef.current[zone.id]
            if (!obj) return
            sizes[zone.id] = obj.fontSize
          })
          return sizes
        },
        getPng: () => {
          // Hide all guide rects + centre guide — save state to restore after export
          const guideObjs = Object.values(zoneObjsRef.current).filter(o => o._wcGuide)
          const prevVis = guideObjs.map(o => o.visible !== false)
          guideObjs.forEach(o => o.set('visible', false))
          const cg = zoneObjsRef.current['_centre-guide']
          if (cg) cg.set('visible', false)
          canvas.renderAll()
          // left/top/width/height crop back to the trim area — bleedExtraBottom
          // (if any) added real canvas pixels below the trim line purely so
          // overflow art isn't hard-clipped on screen; export must still only
          // ever contain the trim-sized image the rest of the pipeline expects.
          const data = canvas.toDataURL({ format: 'png', multiplier: 4, left: 0, top: 0, width: canvasW, height: canvasH })
          guideObjs.forEach((o, i) => o.set('visible', prevVis[i]))
          canvas.renderAll()
          return data
        },
        resetLayout: () => {
          zones.forEach(snapZone)
          canvas.renderAll()
        },
        resetZone: (zoneId) => {
          const zone = zones.find(z => z.id === zoneId)
          if (zone) { snapZone(zone); canvas.renderAll() }
        },
        // Restores text-zone positions from an undo snapshot (mirrors the saved-project
        // restore in the canvas-init effect, but callable at any time with arbitrary data).
        applyZonePositions: (positions) => {
          if (!positions) return
          zones.forEach(zone => {
            if (zone.type !== 'text') return
            const p = positions[zone.id]
            if (!p) return
            const obj = zoneObjsRef.current[zone.id]
            if (!obj) return
            obj.set({ left: p.left, top: p.top, width: p.width })
            obj.setCoords()
          })
          canvas.renderAll()
        },
      }
    }

    loadFonts().then(() => {
      if (destroyed) return

      function addZones() {
        const locked = mode === 'non-designer'
        zoneCfgRef.current = {}

        // Shrink a textbox's fontSize until its rendered height fits within the zone.
        // Resets to the base size first so it can grow back if text is deleted.
        // A rotated zone's pre-rotation `height` becomes the visual THICKNESS once
        // drawn at -90°, so it must fit within zone.width, not zone.height — the
        // axes are swapped by the rotation.
        function shrinkToFit(tb, zone) {
          if (!zone.autoShrink) return
          const fitLimit = zone.rotate ? zone.width : zone.height
          const base = fontSizes?.[zone.id] ?? zone.fontSize ?? 24
          let size = base
          tb.set('fontSize', size)
          tb.initDimensions()
          while (tb.height > fitLimit + 2 && size > 6) {
            size -= 0.5
            tb.set('fontSize', size)
            tb.initDimensions()
          }
        }

        // Guide goes in first so it renders below all text and image zones
        const guideX = snapHalf(canvasW / 2)
        const guide = new fabric.Line([guideX, 0, guideX, canvasH], {
          stroke: '#FF3182',
          strokeWidth: 1.5,
          strokeDashArray: [4, 4],
          selectable: false,
          evented: false,
          visible: false,
        })
        canvas.add(guide)
        zoneObjsRef.current['_centre-guide'] = guide

        // Trim-line guide — the canvas itself IS the trim size (this app never
        // renders real bleed in the editor; bleed is only added at export time
        // by mirroring the trim edge outward, see api/export-cmyk.js). A thin
        // dashed outline right at the canvas edge marks that cut line so nothing
        // important gets placed too close to it. Always visible while editing,
        // hidden on export like the other guides (_wcGuide).
        //
        // Drawn as 4 independent Lines, not one Rect, and inset 1px from the
        // true canvas edge rather than running flush along it. Measured with
        // a pixel-level probe: a stroke whose outer edge sits exactly at the
        // canvas boundary (x=0 or x=canvasW) renders at half the physical
        // width of one that doesn't — reproducible identically whether drawn
        // as a Rect or as separate Lines, so it's Fabric/canvas clipping the
        // edge-touching half of the stroke, not a rect-vs-line rasterization
        // quirk. Staying 1px clear of every boundary avoids the clip
        // entirely; strokeWidth 1 centered on a half-integer coordinate
        // (the classic crisp-line trick) keeps each line itself anti-alias-free.
        const trimX0 = 1.5, trimY0 = 1.5, trimX1 = canvasW - 1.5, trimY1 = canvasH - 1.5
        // trimGapBottom: [x0, x1] skips drawing the bottom trim line across
        // that span — for art that intentionally bleeds past the bottom
        // edge (bleedExtraBottom), the dashed line reading on top of that
        // art looks like a stray mark cutting across it rather than a cut
        // guide, since there's nothing to actually cut there in that span.
        const bottomEdges = config.trimGapBottom
          ? [
              [trimX1, trimY1, config.trimGapBottom[1], trimY1],
              [config.trimGapBottom[0], trimY1, trimX0, trimY1],
            ]
          : [[trimX1, trimY1, trimX0, trimY1]]
        const trimEdges = [
          [trimX0, trimY0, trimX1, trimY0], // top
          [trimX1, trimY0, trimX1, trimY1], // right
          ...bottomEdges, // bottom (possibly split around trimGapBottom)
          [trimX0, trimY1, trimX0, trimY0], // left
        ]
        trimEdges.forEach((pts, i) => {
          const edge = new fabric.Line(pts, {
            stroke: '#FF3182',
            strokeWidth: 1,
            strokeDashArray: [4, 4],
            selectable: false,
            evented: false,
            _wcGuide: true,
          })
          canvas.add(edge)
          zoneObjsRef.current[`_trim-guide-${i}`] = edge
        })

        zones.forEach(zone => {
          zoneCfgRef.current[zone.id] = zone

          // Zone boundary guide for text zones — visible in editor (designer + guided), hidden on export
          if (zone.type === 'text' && !zone.rotate) {
            const gLeft = snapHalf(zone.x)
            const gTop  = snapHalf(zone.y)
            const gr = new fabric.Rect({
              left:   gLeft,
              top:    gTop,
              width:  snapHalf(zone.x + zone.width) - gLeft,
              height: snapHalf(zone.y + zone.height) - gTop,
              fill:   'transparent',
              stroke: 'rgba(255,255,255,0.5)',
              strokeWidth: 1.5,
              strokeDashArray: [6, 4],
              rx: 4, ry: 4,
              selectable: false,
              evented:    false,
              _wcGuide: true,
              _wcZoneId: `${zone.id}-guide`,
            })
            canvas.add(gr)
            zoneObjsRef.current[`${zone.id}-guide`] = gr
          }

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
              // A Figma import zone whose source node had no live text to sample
              // (_needsFontReview, see api/_lib/figma-import.js) saves fontSize/
              // fontFamily as null pending a human filling them in — but Fabric's
              // Textbox crashes hard measuring text with a null fontFamily
              // ("Cannot read properties of null (reading 'toLowerCase')" deep in
              // its text-measurement code), which stops the WHOLE canvas from
              // ever finishing its load. Always fall back to a real value so the
              // canvas can load and the zone stays editable/reviewable at all.
              fontSize:   fontSizes?.[zone.id] ?? zone.fontSize ?? 24,
              fontFamily: zone.fontFamily || 'omnes-cond',
              fontWeight: zone.fontWeight ? String(zone.fontWeight) : 'normal',
              fill:    zone.color || '#FFFFFF',
              textAlign: modeRef.current === 'non-designer'
                ? (zone.align ?? 'left')
                : (alignmentsRef.current?.[zone.id] ?? zone.align ?? 'left'),
              angle:   zone.rotate || 0,
              editable:       !locked,
              selectable:     !locked,
              hasControls:    !locked,
              hasBorders:     !locked,
              borderColor:    '#FF3182',
              cornerColor:    '#FF3182',
              cornerStyle:    'circle',
              cornerSize:     10,
              splitByGrapheme: false,
              _wcZoneId: zone.id,
            })
            // Show only the right-edge handle — dragging it reflows text width (Fabric.js Textbox built-in)
            if (!locked) tb.setControlsVisibility({ tl: false, tr: false, bl: false, br: false, mt: false, mb: false, ml: false, mtr: false })

            tb.on('changed', () => {
              if (syncing.current) return
              syncing.current = true
              onFieldChange?.(zone.id, tb.text)
              syncing.current = false
            })

            canvas.add(tb)
            zoneObjsRef.current[zone.id] = tb

          } else if (zone.type === 'image') {
            // Image zone guide — stays visible as a boundary indicator even after upload, hidden on export
            const pLeft = snapHalf(zone.x)
            const pTop  = snapHalf(zone.y)
            const rect = new fabric.Rect({
              left:   pLeft,
              top:    pTop,
              width:  snapHalf(zone.x + zone.width) - pLeft,
              height: snapHalf(zone.y + zone.height) - pTop,
              fill:   'transparent',
              stroke: 'rgba(255,255,255,0.5)',
              strokeWidth: 1.5,
              strokeDashArray: [6, 4],
              rx: 4, ry: 4,
              selectable: false,
              evented:    false,
              _wcGuide: true,
              _wcZoneId: `${zone.id}-placeholder`,
            })
            canvas.add(rect)
            zoneObjsRef.current[`${zone.id}-placeholder`] = rect
          }
        })

        // Shrink text zones with pre-filled content on initial load — guided mode
        // always; designer mode too for zones marked `alwaysShrink` (no manual
        // size controls exposed in FieldEditor, e.g. restaurant_name, so there's
        // no other way for the user to fix an overflow).
        // If a saved font size exists, apply it directly — it already represents
        // the exact displayed state from last save (post-shrink + any manual adjustments).
        // Only run the shrink loop when there is NO saved size (first open of a fresh template).
        zones.forEach(zone => {
          if (zone.type !== 'text' || !zone.autoShrink) return
          if (!locked && !zone.alwaysShrink) return
          const tb = zoneObjsRef.current[zone.id]
          if (!tb || !tb.text) return
          const savedSize = fontSizesRef.current?.[zone.id]
          // A rotated zone's pre-rotation height becomes the visual thickness once
          // drawn at -90° — must fit zone.width, not zone.height (axes swap).
          const fitLimit = zone.rotate ? zone.width : zone.height
          if (savedSize != null) {
            // Saved size is the source of truth — skip auto-shrink entirely.
            tb.set('fontSize', savedSize)
            tb.initDimensions()
          } else {
            // First open with no saved state — shrink from the zone default to fit.
            let size = zone.fontSize ?? 24
            tb.set('fontSize', size)
            tb.initDimensions()
            while (tb.height > fitLimit + 2 && size > 6) {
              size -= 0.5
              tb.set('fontSize', size)
              tb.initDimensions()
            }
          }
        })

        canvas.renderAll()
        if (!destroyed) {
          setLoading(false)
          onReadyRef.current?.()
        }
      }

      // Restore saved drag positions for text zones (designer mode re-open)
      function applyZonePositions() {
        const saved = zonePositionsRef.current
        if (!saved || !Object.keys(saved).length) return
        zones.forEach(zone => {
          if (zone.type !== 'text') return
          const p = saved[zone.id]
          if (!p) return
          const obj = zoneObjsRef.current[zone.id]
          if (!obj) return
          obj.set({ left: p.left, top: p.top, width: p.width })
          obj.setCoords()
        })
        canvas.renderAll()
      }

      // Load background PNG, then add zones on top
      if (backgroundUrl) {
        fabric.Image.fromURL(backgroundUrl, img => {
          if (destroyed) { canvas.dispose(); return }
          // backgroundScale (>1 zooms in / <1 shrinks) resizes the whole
          // background image, opening up (or closing) a margin of
          // `backgroundFill` around it instead of always stretching the art
          // to fill the canvas exactly. Per-axis {x, y} because the source
          // art's own aspect ratio rarely matches the canvas's exactly, so a
          // single uniform factor can't hit the same margin on both axes at
          // once. Omit it (or 1) to keep the old fill-the-canvas-exactly
          // behaviour.
          //
          // Positioning defaults to centered, but backgroundOffset can
          // override left/top explicitly per axis — needed when the art
          // isn't symmetric (e.g. Option B's Wolt bag graphic bleeds all the
          // way to the source PNG's own bottom edge with zero spare pixels,
          // so centering a Y zoom pushes it past the canvas and clips it;
          // an explicit top-anchored offset keeps the top margin precise
          // without dragging the bag down with it).
          // canvasW/canvasH (the trim size), not canvas.getWidth()/getHeight() —
          // the fabric canvas's own pixel height is renderH when
          // bleedExtraBottom is set, which would throw off scale/centering
          // math that's meant to be relative to the trim area.
          const bgScaleX = backgroundScale?.x ?? backgroundScale ?? 1
          const bgScaleY = backgroundScale?.y ?? backgroundScale ?? 1
          const scaleX = (canvasW / img.width)  * bgScaleX
          const scaleY = (canvasH / img.height) * bgScaleY
          const left = backgroundOffset?.x ?? (canvasW - img.width  * scaleX) / 2
          const top  = backgroundOffset?.y ?? (canvasH - img.height * scaleY) / 2
          img.set({
            left, top,
            scaleX, scaleY,
            selectable: false,
            evented:    false,
          })
          canvas.setBackgroundImage(img, () => {
            canvas.renderAll()
            addZones()
            applyZonePositions()
          })
        }, { crossOrigin: 'anonymous' })
      } else {
        addZones()
        applyZonePositions()
      }
    })

    return () => {
      destroyed = true
      canvas.dispose()
      fabricRef.current = null
      zoneObjsRef.current = {}
      setLoading(true)
      setZoom(100)
    }
  }, [config]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync right-panel text → canvas (with auto-shrink) ─────────────────────
  // When a project is loaded, sync prevFieldsRef to the incoming fields BEFORE
  // the fields effect runs so auto-shrink doesn't misread them as new typed input.
  useEffect(() => {
    prevFieldsRef.current = { ...fields }
  }, [loadKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return
    let changed = false
    Object.entries(fields).forEach(([id, value]) => {
      const obj = zoneObjsRef.current[id]
      if (!obj || obj.type !== 'textbox') return
      if (syncing.current) return
      syncing.current = true
      if (obj.text !== (value || '')) {
        obj.set('text', value || '')
        changed = true
      }
      // Auto-shrink in guided mode — only when THIS field's text actually changed.
      // Uploading a photo changes fields.photoUrl, not the text content, so we must
      // not re-shrink text zones the user may have manually sized up.
      const textChanged = prevFieldsRef.current[id] !== value
      const zone = zoneCfgRef.current[id]
      if (textChanged && zone?.autoShrink && (modeRef.current === 'non-designer' || zone.alwaysShrink)) {
        let size = fontSizesRef.current?.[zone.id] ?? zone.fontSize
        obj.set('fontSize', size)
        obj.initDimensions()
        // A rotated zone's pre-rotation height becomes the visual thickness once
        // drawn at -90° — must fit zone.width, not zone.height (axes swap).
        const fitLimit = zone.rotate ? zone.width : zone.height
        while (obj.height > fitLimit + 2 && size > 6) {
          size -= 0.5
          obj.set('fontSize', size)
          obj.initDimensions()
        }
        changed = true
      }
      syncing.current = false
    })
    prevFieldsRef.current = { ...fields }
    if (changed) canvas.renderAll()
  }, [fields])

  // ── Sync font size overrides → canvas ──────────────────────────────────────
  // Real bug found 2026-08-03 (Julia: "sizing the headline also resizes the
  // subline"): this used to fall back to zone.fontSize (the static default)
  // for any zone with no entry in `fontSizes`. `fontSizes` is a brand-new
  // object reference every time ANY zone's size changes, so this whole effect
  // re-ran on every single font-size edit — and for a zone that had been
  // auto-shrunk on load (its real Fabric fontSize applied directly, never
  // written back into this React state), that meant its shrunk size got
  // silently overwritten back to the unfit static default the moment a
  // DIFFERENT zone's size was touched. Only ever apply an explicit entry in
  // `fontSizes` — a zone with no entry keeps whatever size it currently has.
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas || !config) return
    let changed = false
    config.zones.forEach(zone => {
      if (!fontSizes || !(zone.id in fontSizes)) return
      const obj = zoneObjsRef.current[zone.id]
      if (!obj || obj.type !== 'textbox') return
      const size = fontSizes[zone.id]
      if (obj.fontSize !== size) { obj.set('fontSize', size); changed = true }
    })
    if (changed) canvas.renderAll()
  }, [fontSizes, config])

  // ── Sync alignment overrides → canvas ──────────────────────────────────────
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas || !config) return
    config.zones.forEach(zone => {
      const obj = zoneObjsRef.current[zone.id]
      if (!obj || obj.type !== 'textbox') return
      const align = modeRef.current === 'non-designer'
        ? (zone.align ?? 'left')
        : (alignments?.[zone.id] ?? zone.align ?? 'left')
      if (obj.textAlign !== align) obj.set('textAlign', align)
    })
    canvas.renderAll()
  }, [alignments, config])

  // ── Sync text-zone nudge offsets → canvas ─────────────────────────────────
  // Mirrors the image nudge pattern below, but for specific text zones (e.g.
  // headline/sub_headline in the restricted review mode — see FieldEditor.jsx)
  // — the only other way to move text is a Designer-mode canvas drag, which
  // this mode disallows entirely. Only zones present as a key in
  // `textPositions` are touched; every other flow passes {} and this is a no-op.
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas || !config || !textPositions) return
    let changed = false
    config.zones.forEach(zone => {
      if (zone.type !== 'text') return
      const offset = textPositions[zone.id]
      if (!offset) return
      const obj = zoneObjsRef.current[zone.id]
      if (!obj) return
      const isRotated = !!zone.rotate
      const baseLeft = isRotated ? zone.x + zone.width / 2 : zone.x
      const baseTop  = isRotated ? zone.y + zone.height / 2 : zone.y
      const left = baseLeft + (offset.x ?? 0)
      const top  = baseTop  + (offset.y ?? 0)
      if (obj.left !== left || obj.top !== top) {
        obj.set({ left, top })
        obj.setCoords()
        changed = true
      }
    })
    if (changed) canvas.renderAll()
  }, [textPositions, config])

  // ── Sync image scale adjustments → canvas ─────────────────────────────────
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas || !config) return
    config.zones.filter(z => z.type === 'image').forEach(zone => {
      const img = zoneObjsRef.current[`${zone.id}-image`]
      if (!img || img._wcBaseScale == null) return
      const userPct = imageScales?.[zone.id] ?? 100
      const finalScale = img._wcBaseScale * (userPct / 100)
      const scaledW = img.width  * finalScale
      const scaledH = img.height * finalScale
      const offset = clampOffset(zone, scaledW, scaledH, imagePositions?.[zone.id])
      img.set({
        scaleX: finalScale,
        scaleY: finalScale,
        left: zone.x + (zone.width  - scaledW) / 2 + offset.x,
        top:  zone.y + (zone.height - scaledH) / 2 + offset.y,
      })
      img.setCoords()
    })
    canvas.renderAll()
  }, [imageScales, imagePositions, config])

  // ── Zoom controls (button-driven only — no scroll wheel) ───────────────────
  const handleZoomIn  = useCallback(() => setZoom(z => Math.min(400, Math.round(z / 10) * 10 + 10)), [])
  const handleZoomOut = useCallback(() => setZoom(z => Math.max(40,  Math.round(z / 10) * 10 - 10)), [])
  const handleZoomReset = useCallback(() => setZoom(100), [])

  // After zoom re-renders, recalculate canvas offset so pointer events map correctly
  useEffect(() => {
    requestAnimationFrame(() => { fabricRef.current?.calcOffset() })
  }, [zoom])

  // ── Sync image uploads → canvas (handles any image zone: photo, logo, etc.) ──
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas || !config) return

    config.zones.filter(z => z.type === 'image').forEach(zone => {
      const urlField = `${zone.id}Url`
      const url = fields[urlField]

      const existing = zoneObjsRef.current[`${zone.id}-image`]

      // URL unchanged — image already on canvas, don't touch it (preserves user resize/move)
      if (existing && existing._wcUrl === url) return

      if (existing) {
        canvas.remove(existing)
        delete zoneObjsRef.current[`${zone.id}-image`]
      }

      const ph = zoneObjsRef.current[`${zone.id}-placeholder`]

      if (!url) {
        if (ph) { ph.set('visible', true); canvas.renderAll() }
        return
      }

      fabric.Image.fromURL(url, img => {
        if (!fabricRef.current) return
        // Photos use cover (fill zone, crop center); logos use contain (full logo visible)
        const isCover = zone.fit === 'cover'
        // Small always-on overscan so the Position nudge has a little crop room in
        // BOTH directions from the start — otherwise whichever dimension "cover" binds
        // to (matches the zone exactly) has zero slack until the user also bumps Scale.
        const NUDGE_MARGIN = 1.06
        const scale = isCover
          ? Math.max(zone.width / img.width, zone.height / img.height) * NUDGE_MARGIN
          : Math.min(zone.width / img.width, zone.height / img.height)
        const scaledW = img.width  * scale
        const scaledH = img.height * scale
        const imgLocked = !fabricRef.current || mode === 'non-designer'
        const offset0 = clampOffset(zone, scaledW, scaledH, imagePositionsRef.current?.[zone.id])
        img.set({
          left:    zone.x + (zone.width  - scaledW) / 2 + offset0.x,
          top:     zone.y + (zone.height - scaledH) / 2 + offset0.y,
          scaleX:  scale,
          scaleY:  scale,
          selectable:   !imgLocked,
          evented:      !imgLocked,
          hasControls:  !imgLocked,
          hasBorders:   !imgLocked,
          borderColor:  '#FF3182',
          cornerColor:  '#FF3182',
          cornerStyle:  'circle',
          cornerSize:   10,
          lockUniScaling: true,
          lockRotation:   true,
          // Clip to zone boundaries. overlapAbove extends the clip region upward
          // so the image can visually overlap the zone above it (e.g. food photo over headline).
          clipPath: new fabric.Rect({
            left:   zone.x,
            top:    zone.y - (zone.overlapAbove ?? 0),
            width:  zone.width,
            height: zone.height + (zone.overlapAbove ?? 0),
            absolutePositioned: true,
            originX: 'left',
            originY: 'top',
          }),
        })
        // Corner handles only — no edge or rotation handles
        if (!imgLocked) img.setControlsVisibility({ mt: false, mb: false, ml: false, mr: false, mtr: false })
        img._wcZoneId = zone.id
        img._wcBaseScale = scale
        img._wcUrl = url

        // Apply saved user scale immediately after load (the imageScales effect
        // runs before image load completes, so it can't do this itself).
        const userPct = imageScalesRef.current?.[zone.id] ?? 100
        if (userPct !== 100) {
          const finalScale = scale * (userPct / 100)
          const scaledW = img.width  * finalScale
          const scaledH = img.height * finalScale
          const offset1 = clampOffset(zone, scaledW, scaledH, imagePositionsRef.current?.[zone.id])
          img.set({
            scaleX: finalScale,
            scaleY: finalScale,
            left: zone.x + (zone.width  - scaledW) / 2 + offset1.x,
            top:  zone.y + (zone.height - scaledH) / 2 + offset1.y,
          })
          img.setCoords()
        }

        canvas.add(img)
        zoneObjsRef.current[`${zone.id}-image`] = img
        // Z-order: images → guide rects (so border shows on top of image) → textboxes
        // → overlap images (float above text for layering effect).
        // Re-applied in full (not just for this zone) every time ANY image zone
        // loads — each zone's fabric.Image.fromURL callback fires independently
        // and asynchronously, so re-uploading e.g. the logo after the photo was
        // already loaded would otherwise re-bring textboxes above the photo and
        // silently break its overlap until the photo was re-uploaded too.
        Object.values(zoneObjsRef.current).forEach(o => {
          if (o._wcGuide) canvas.bringToFront(o)
        })
        Object.values(zoneObjsRef.current).forEach(o => {
          if (o.type === 'textbox') canvas.bringToFront(o)
        })
        config.zones.filter(z => z.type === 'image' && z.overlapAbove).forEach(z => {
          const overlapImg = zoneObjsRef.current[`${z.id}-image`]
          if (overlapImg) canvas.bringToFront(overlapImg)
        })
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

  const canvasW = config?.canvasW ?? 316
  const canvasH = config?.canvasH ?? 441
  const renderH = canvasH + (config?.bleedExtraBottom ?? 0)
  // When bleedExtraBottom is set, the canvas itself now renders real
  // content into that space — stacking the decorative BLEED_MARGIN white
  // padding underneath it too would leave a second, contentless white gap
  // between that art and the true outer edge. Drop the bottom padding in
  // that case so the canvas's own bottom edge doubles as the outer edge.
  const bleedPadBottom = config?.bleedExtraBottom ? 0 : BLEED_MARGIN
  const scale = zoom / 100

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        minHeight: 0,
        background: '#2a2a2a',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
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

      {mode === 'non-designer' && !loading && (
        <div style={{
          position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--primary)', color: '#fff',
          fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
          padding: '5px 14px', borderRadius: 20,
          display: 'flex', alignItems: 'center', gap: 6,
          whiteSpace: 'nowrap', zIndex: 5, pointerEvents: 'none',
        }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          Guided mode · canvas locked
        </div>
      )}
      {/* Space-holder: takes up the zoomed canvas size (plus the bleed margin
          drawn around it below) so the container scrolls correctly */}
      <div style={{
        position: 'relative',
        flexShrink: 0,
        width: (canvasW + BLEED_MARGIN * 2) * scale,
        height: (renderH + BLEED_MARGIN + bleedPadBottom) * scale,
        marginBottom: 36,
      }}>
        {/* CSS transform scales the actual canvas element */}
        <div style={{
          position: 'absolute',
          top: 0, left: 0,
          transformOrigin: 'top left',
          transform: `scale(${scale})`,
        }}>
          {/* Bleed margin, drawn around the canvas exactly like the Figma
              master (solid outer edge = true page/bleed boundary; the pink
              dashed trim line is drawn just inside the canvas's own edge —
              see the trim-guide fabric.Rect in the effect above). This is
              purely a visual guide outside the actual canvas — canvas
              dimensions and every zone coordinate stay trim-only/unchanged. */}
          <div style={{
            paddingTop: BLEED_MARGIN, paddingLeft: BLEED_MARGIN, paddingRight: BLEED_MARGIN,
            paddingBottom: bleedPadBottom,
            background: '#fff',
            // border: '1px solid rgba(0,0,0,0.25)',
            boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
          }}>
            <div style={{ borderRadius: 3, overflow: 'hidden' }}>
              <canvas ref={canvasElRef} />
            </div>
          </div>
        </div>
        {/* Zoom controls */}
        <div style={{
          position: 'absolute', bottom: -38, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', alignItems: 'center', gap: 4,
          background: 'rgba(0,0,0,0.55)', borderRadius: 20, padding: '5px 10px',
          userSelect: 'none', whiteSpace: 'nowrap',
        }}>
          <button onClick={handleZoomOut} title="Zoom out" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.75)', padding: '0 4px', fontSize: 15, lineHeight: 1, display: 'flex', alignItems: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
          </button>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', minWidth: 32, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{zoom}%</span>
          <button onClick={handleZoomIn} title="Zoom in" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.75)', padding: '0 4px', fontSize: 15, lineHeight: 1, display: 'flex', alignItems: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
          </button>
          {zoom !== 100 && (
            <button onClick={handleZoomReset} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 10, padding: '0 2px', marginLeft: 2 }}>· Reset</button>
          )}
        </div>
      </div>
    </div>
  )
}
