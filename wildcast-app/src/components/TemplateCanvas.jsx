import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { fabric } from 'fabric'
import { sortIdsByFieldOrder } from '../lib/fieldOrder'
import { TEXT_PLACEHOLDERS, placeholderTextFor, placeholderImageFor } from '../data/placeholders'
import { contentFitForImage } from '../lib/briefToCandidates'
import { aiFieldSettingsFor } from '../data/templateZones'
import useIsMobile from '../lib/useIsMobile'

// Pre-filled Template Placeholders (Notion card, 2026-09-22): the opacity a
// zone is dimmed to while it's still showing generic placeholder content
// instead of something the manager actually entered.
const PLACEHOLDER_OPACITY = 0.45

// Visual-only bleed margin drawn around the canvas in the editor, matching
// the Figma master's own look (solid page edge + inset dashed trim line) -
// canvas is 316px wide representing 105mm trim, so 3mm bleed ≈ 316/105*3 ≈
// 9px at this same scale. Purely a CSS wrapper outside the actual canvas;
// does not change canvasW/canvasH or any zone coordinate.
const BLEED_MARGIN = 9

// Sharpness (Anang, 2026-09-30: "preview seems blurry"). fabric's object
// caching draws each text/image into its own offscreen canvas and then
// pastes that bitmap onto the main canvas at a fractional-pixel position,
// which resamples it - headline edges measured ~30% softer than drawing
// directly. This canvas only ever holds a dozen objects, so drawing them
// straight each frame costs nothing noticeable. And photos/logos are far
// bigger than their zone, so ask the browser for its high-quality
// downscale instead of the default ('low', which aliases). This is the
// app's only fabric canvas, so the global switches only affect it.
fabric.Object.prototype.objectCaching = false
const renderImageFill = fabric.Image.prototype._renderFill
fabric.Image.prototype._renderFill = function (ctx) {
  ctx.imageSmoothingQuality = 'high'
  return renderImageFill.call(this, ctx)
}

// Editor zoom scales the canvas element with CSS, so the canvas's backing
// store has to carry zoom × screen density or zoomed-in text looks blurry.
// Capped by total pixels (per canvas layer) so 400% on a retina screen
// stays well under Safari's ~16.7M-pixel canvas limit - past the cap it
// just gets slightly soft again instead of failing to draw.
const MAX_BACKSTORE_PIXELS = 12_000_000
function screenPixelRatio() {
  return Math.max(1, window.devicePixelRatio || 1)
}
function editorPixelRatio(zoom, w, h) {
  const base = screenPixelRatio()
  const wanted = base * Math.max(1, zoom / 100)
  const cap = Math.sqrt(MAX_BACKSTORE_PIXELS / (w * h))
  return Math.max(base, Math.min(wanted, cap))
}

// Figma-imported zone coordinates land on arbitrary fractional pixels
// (e.g. x: 15.9, y: 77.8), so two guide rects with the same strokeWidth
// anti-alias differently and visibly look thicker/thinner than each other.
// Snapping every guide coordinate to the same .5px offset keeps their
// anti-aliasing consistent across the canvas. Guides are visual-only
// (hidden on export), so this never touches real content placement.
const snapHalf = v => Math.round(v) + 0.5

// Stacks every zone (text or image) in the order Julia actually arranged the
// layers in Figma, instead of a hardcoded rule here that needed a code
// change every time she wanted a different template's z-order changed (her
// ask, 2026-09-11: "sticker above everything, then food, then headline..." -
// a different order per template, meant to be set by her). A zone's `zIndex`
// (api/_lib/figma-import.js) is that layer's actual position in Figma's own
// Layers panel at the moment it was imported - lower zIndex = further back,
// higher = further front, straight from document order. Falls back to each
// zone's own position in `config.zones` (its declaration order) when zIndex
// is missing - every template imported before this feature shipped, plus
// Option A/B, which are hardcoded in templateZones.js and never went through
// Figma import at all (confirmed both existing `overlapAbove` zones - Option
// A/B's photo - are already declared after their headline zone in that
// array, so this fallback doesn't change their established overlap
// behavior). WildCast's own editing guides are always brought to the very
// front after, regardless of content z-order, so zone boundaries stay
// visible while editing even when a zone with a high zIndex covers real
// content. Called after every zone-image load (not just the zone that just
// loaded) - each image zone's fabric.Image.fromURL callback fires
// independently and asynchronously, so re-uploading e.g. the logo after the
// photo was already loaded would otherwise leave the photo's stacking stale
// until the photo itself was re-uploaded too.
function applyZoneStackingOrder(canvas, config, zoneObjs) {
  const orderKey = zone => zone.zIndex ?? config.zones.findIndex(z => z.id === zone.id)
  config.zones
    .slice()
    .sort((a, b) => orderKey(a) - orderKey(b))
    .forEach(zone => {
      const obj = zoneObjs[zone.type === 'image' ? `${zone.id}-image` : zone.id]
      if (obj) canvas.bringToFront(obj)
    })
  // Two passes, not one - Julia's report, 2026-09-18: a number chip could
  // end up stacked BELOW a different zone's own boundary rect (each
  // bringToFront call only wins until the next one, so whichever guide
  // this loop happened to process last came out on top - not necessarily
  // every chip). Bringing every non-chip guide (rects) forward first, then
  // every chip forward after, guarantees every chip sits above every rect,
  // regardless of how many zones or what order they were declared in.
  const guideObjs = Object.values(zoneObjs).filter(o => o._wcGuide)
  guideObjs.filter(o => !o._wcChip).forEach(o => canvas.bringToFront(o))
  guideObjs.filter(o => o._wcChip).forEach(o => canvas.bringToFront(o))
}

// Numbered zone-guide chip color on the editor canvas - Julia's ask,
// 2026-09-18: one flat coral for every zone type, not a blue/coral split by
// text vs image. Literal hex, not var(--primary) - a raw <canvas> 2D
// context can't resolve CSS custom properties, only the DOM's own style
// system can (see src/index.css for the source of truth - this is that
// same --primary value).
const ZONE_LABEL_COLOR = '#df6f6d'

async function loadFonts() {
  // document.fonts.ready resolves when @font-face declarations are parsed -
  // but the actual font FILES may not be downloaded yet (especially on first
  // production load where they aren't cached). document.fonts.load() actively
  // fetches the specific font files and waits until they are usable.
  await document.fonts.ready
  try {
    await Promise.all([
      document.fonts.load('500 16px omnes-cond'),
      document.fonts.load('700 16px omnes-cond'),
      // '%' sample text pulls in the %-only patch faces declared in index.css (the supplied
      // WOLTCondBlack/WOLTRegular files have a broken % glyph); load() defaults to a space otherwise.
      document.fonts.load('900 16px omnes-cond', '%'), // WOLTCondBlack - registered 2026-09-11, was deployed but unused before
      document.fonts.load('400 16px omnes-pro', '%'),
      document.fonts.load('600 16px omnes-pro'),
      document.fonts.load('700 16px omnes-pro'),
      document.fonts.load('900 16px omnes-pro'), // WOLTBlack - same fix as above
    ])
  } catch {
    // Proceed if a font file fails to load (network error, etc.) - also
    // covers omnes-pro/500, the one weight that still has no exact
    // self-hosted WOLT face (only the condensed family has a Medium/500
    // cut - see src/index.css); the browser falls back to the nearest
    // registered weight rather than throwing.
  }
}

// Text-fit rule (Julia's ask, 2026-09-19): auto-shrink used to check HEIGHT
// only, so a single line could fill the zone edge to edge - and a zone is
// wider than the visible panel on some templates (e.g. Option B's headline
// zone is ~300 wide, its blue panel ~278), so a 17-letter headline touched
// both panel edges. A single line of text must now also fit within 92% of the
// zone's width (~276 of ~300 there, just inside the panel). Only applies to
// unrotated, single-line text: wrapped paragraphs (T&Cs) fill their width by
// design, and a rotated zone's width axis is its visual height.
const FIT_WIDTH_RATIO = 0.92

// The CTA ("App download line" on Option B) finishes a sentence printed in
// the background art ("Jetzt Wolt App downloaden und" -> "bei uns
// bestellen!"), so it must stay close to that printed line's weight -
// shrink to fit if too long, never grow to fill its box like a headline
// (Julia's report, first 2026-09-28 "cta is too big", same report again
// 2026-09-29 on this branch's own test design once she saw it rendered).
// Built once already (eacb501, as part of a broader zoneCanGrow change
// covering cta/tc/restaurant_name) then reverted with everything else in
// b491aba when several chat-driven changes leaked into the shared editor
// canvas - only T&Cs came back on its own after that (59dd090). This is
// that same fix, rebuilt from scratch, added back zone by zone as each one
// gets confirmed rather than all at once (which is most of why the
// original went wrong): cta first, T&Cs already had its own separate wrap
// fix. restaurant_name is the same story - it sits right next to a printed
// "♥ WOLT" glyph baked into Option A's art (Julia, 2026-09-29: "should be
// the same as 'heart wolt'"), same reasoning as the CTA, now confirmed.
// tc added last, same day: on any template where 'tc' has autoShrink: true
// (Option C - Option A's tc has no autoShrink at all, so it's unaffected;
// see 59dd090's own wrap fix for that separate case), this same grow loop
// was pushing legal fine print up to fill its box instead of staying small
// - Julia found it on an old saved design rendering T&Cs at 9pt. Fine print
// should only ever shrink for long text, never grow for short text, same
// reasoning as cta/restaurant_name above.
const NEVER_GROW_ZONE_IDS = new Set(['cta', 'restaurant_name', 'tc'])
function zoneCanGrow(zone) {
  return zone.autoGrow ?? !NEVER_GROW_ZONE_IDS.has(zone.id)
}

function overflowsFitWidth(obj, zone) {
  if (zone.rotate || (obj.textLines?.length ?? 1) > 1) return false
  return obj.calcTextWidth() > zone.width * FIT_WIDTH_RATIO
}

// Bug fix, 2026-09-24 (Julia: long headlines lost centering after the
// auto-resize rework): Fabric's Textbox silently widens itself past our
// fixed `width` whenever a single word doesn't fit at the current font
// size (`dynamicMinWidth` in fabric's textbox.class.js) - and it never
// narrows back down once that happens. Every unrotated zone is left-
// anchored (originX:'left', left: zone.x - see the Textbox construction
// below), so a box that's silently grown wider stays pinned at the same
// left edge and its right edge drifts past the zone/canvas edge -
// textAlign:'center' only centers glyphs *inside* the box, it can't fix
// the box itself no longer matching the zone rectangle. Short headlines
// rarely contain a single word wide enough to trigger this; long ones
// (more words, longer words) hit it often, matching exactly what was
// reported: short headlines fine, long ones drifted off-center.
// Applies a font size, pins the box back to the zone's real width every
// time, and folds "a word didn't fit at this width" into the same
// overflow signal the resize loops already check - a too-wide word
// should mean "still doesn't fit, keep shrinking," not "silently expand
// the box instead."
// Headline "middle ground" (Julia's ask, 2026-09-29): the fit check below
// compares Fabric's own obj.height, which is a lineHeight(1.05)*fontSize
// estimate sized for the font's FULL ascent+descent - space this all-caps,
// single-line text (headline/sub-headline are forced .toUpperCase()) never
// actually uses, since Omnes Cond's caps have no descenders. That's why the
// headline used to stop growing at 37.1pt in a box designed for 56.6pt - it
// still had real room left. The straight fix (checking the real rendered
// ink height instead) was tried once before as a blanket change to every
// autoShrink zone (2026-09-24, 09e9492) and came out "far too big" -
// reverted the same day (2b455c1). This is narrower on purpose: real ink
// height, measured via canvas measureText's actual glyph bounds (accounts
// for accents like Ü, which sit above cap height), but ONLY for the
// headline zone specifically (see CAP_FIT_ZONE_IDS) - sub-headline,
// restaurant_name, offer and cta keep the old, more conservative check, so
// this can't repeat the "grew everything" outcome that got reverted.
// Measured against a real Option A headline before shipping: the old check
// stopped at 37.1pt (real ink 33.3 of a 40.46 limit - 7 units left unused);
// this lands at 47.1pt (real ink 42.2) - bigger, not maxed out to the raw
// 56.6pt Figma value, which is what "far too big" actually was.
const CAP_FIT_ZONE_IDS = new Set(['headline'])
let capMeasureCtx = null
function inkHeightOf(text, fontSize, fontFamily, fontWeight) {
  if (!capMeasureCtx) capMeasureCtx = document.createElement('canvas').getContext('2d')
  capMeasureCtx.font = `${fontWeight || 400} ${fontSize}px ${fontFamily}`
  const m = capMeasureCtx.measureText(text || 'M')
  const asc = m.actualBoundingBoxAscent
  const desc = m.actualBoundingBoxDescent
  return asc != null && desc != null ? asc + desc : null
}

// Where the headline sits vertically (Julia, 2026-10-01: "headline needs to
// move up" on Options A, B and C - the greyed guide looked right, the typed
// headline sat lower and crowded the line below it). The guide is drawn at
// the zone's designed size with its top at the zone's top, so its BASELINE
// (the letters' bottom edge) sits at a known height. A typed headline grows
// to fill the box (see CAP_FIT_ZONE_IDS) but stayed pinned by its top edge,
// so every point of extra size pushed its baseline further down. Now the
// typed headline keeps the guide's baseline at any size and grows upward.
// Fabric 5 draws a single line's baseline at top + fontSize * mult * (1 -
// fraction) (text.class.js _renderTextCommon / _renderChar).
function baselineOffsetOf(obj) {
  return obj.fontSize * obj._fontSizeMult * (1 - obj._fontSizeFraction)
}

// Single-line, unrotated headline holding real text, with a known guide
// baseline. Everything else (placeholders, wrapped headlines, other zones,
// zones with no placeholder copy) keeps its old top-anchored position.
function anchorHeadlineToGuide(obj, zone) {
  if (!CAP_FIT_ZONE_IDS.has(zone.id) || zone.rotate || obj._wcPlaceholder || obj._wcGuideBaseline == null) return
  if ((obj.textLines?.length ?? 1) !== 1) return
  // Never LOWER than where the guide's own top sits: text smaller than the
  // guide (a long headline shrunk to fit) stays top-anchored as it always
  // was; only text bigger than the guide moves up to hold the baseline.
  obj.set('top', Math.min(zone.y + (zone.placeholderDy ?? 0), obj._wcGuideBaseline - baselineOffsetOf(obj)))
  obj.setCoords()
}

// How tall the headline's letters may be: the zone's height, but never more
// than the room between the zone's top and the baseline it sits on, so a big
// word grows up to the top of its box instead of poking out above it.
function headlineFitLimit(obj, zone, fitLimit) {
  if (obj._wcGuideBaseline == null || obj._wcPlaceholder) return fitLimit
  const room = obj._wcGuideBaseline - zone.y
  return room < fitLimit - 1 ? room : fitLimit // ignore sub-unit differences: A/B sit exactly on their box bottom
}

// Baseline of the faded guide text for a zone: the guide is fitted from the
// zone's designed size, shrinking only (same loop as the placeholder branches
// below), with its top at zone.y + placeholderDy. Measured on the zone's own
// textbox, temporarily showing the guide copy, then put back exactly as it
// was - so a design reopened with a typed headline gets the same answer as an
// empty one.
function guideBaselineFor(tb, zone, guideText) {
  const saved = { text: tb.text, fontSize: tb.fontSize, top: tb.top, placeholder: tb._wcPlaceholder }
  tb._wcPlaceholder = true // skips anchoring while measuring
  tb.set('text', guideText)
  let size = zone.fontSize ?? 24
  let overflows = applyFontSizeAndCheckFit(tb, size, zone, zone.height)
  while (overflows && size > 6) {
    size -= 0.5
    overflows = applyFontSizeAndCheckFit(tb, size, zone, zone.height)
  }
  const baseline = zone.y + (zone.placeholderDy ?? 0) + baselineOffsetOf(tb)
  tb.set({ text: saved.text, fontSize: saved.fontSize, top: saved.top })
  tb._wcPlaceholder = saved.placeholder
  tb.initDimensions()
  return baseline
}

function applyFontSizeAndCheckFit(obj, fontSize, zone, fitLimit) {
  const textW = zone.textWidth ?? zone.width
  obj.set('fontSize', fontSize)
  obj.set('width', textW)
  obj.initDimensions()
  if (obj.width > textW) {
    obj.set('width', textW)
    obj.initDimensions()
  }
  anchorHeadlineToGuide(obj, zone)
  // Only meaningful for a single line - a wrapped multi-line block's real
  // height is dominated by line count/spacing, not one line's cap height,
  // so that case falls through to the same check every other zone uses.
  if (CAP_FIT_ZONE_IDS.has(zone.id) && !zone.rotate && (obj.textLines?.length ?? 1) === 1) {
    const ink = inkHeightOf(obj.text, fontSize, obj.fontFamily, obj.fontWeight)
    if (ink != null) return ink > headlineFitLimit(obj, zone, fitLimit) + 2 || overflowsFitWidth(obj, zone)
  }
  return obj.height > fitLimit + 2 || overflowsFitWidth(obj, zone)
}

export default function TemplateCanvas({ config, fields, onFieldChange, exportRef, fontSizes, alignments, imageScales, imagePositions, mode, loadKey, zonePositions, onZoneDragStart, onReady, textPositions, onAutoShrink, restricted, locked, onImageDrop, activeZoneId, templateId, overlay, topRight }) {
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
  const onAutoShrinkRef = useRef(onAutoShrink) // always current, read inside the fields-sync effect
  onAutoShrinkRef.current = onAutoShrink
  const syncing = useRef(false)
  const prevFieldsRef = useRef({})       // tracks previous text values for auto-shrink gating
  const [loading, setLoading] = useState(true)
  const [zoom, setZoom] = useState(100)
  const isMobile = useIsMobile()
  const [dropZoneId, setDropZoneId] = useState(null) // image zone highlighted while a file is dragged over it
  const [dropError, setDropError] = useState(null)   // transient message when a dropped file gets rejected
  const dropErrorTimerRef = useRef(null)
  const [dropBusy, setDropBusy] = useState(false)   // dropped file still being processed (background removal)

  // ── Caps rendering (spec §4.1: "caps = true when the template sets the
  // text in caps") ──────────────────────────────────────────────────────────
  // The Copy Library stores lockups in normal case ("Potsdams neues" /
  // "Dreamteam") and the printed flyer sets them in caps ("POTSDAMS NEUES" /
  // "DREAMTEAM"). Zones whose §4.1 AI settings declare caps: true render
  // uppercased on the canvas — exports (getPng) inherit it automatically,
  // and the stored field value keeps normal case, exactly like the library.
  // Option A/B carry caps on their zones in templateZones.js; imported
  // templates (Option C) get it from the aiFieldSettingsFor name/id map.
  const capsZoneIds = useMemo(() => {
    const ids = new Set()
    const settings = aiFieldSettingsFor(config, undefined, templateId) ?? {}
    for (const [key, s] of Object.entries(settings)) {
      if (s?.caps) ids.add(key)
    }
    return ids
  }, [config, templateId])
  const zoneDisplayText = useCallback((zoneId, text) => {
    const raw = text ?? ''
    return capsZoneIds.has(zoneId) ? raw.toUpperCase() : raw
  }, [capsZoneIds])

  // Clamps a user nudge offset to how far the image can move without breaking
  // its fit contract, so a nudge can never reveal zone background behind it
  // (cover) or push the image outside its own box (contain).
  //
  // Cover-fit images are scaled >= the zone in both dimensions (overflow), so
  // slack = (scaledDim - zoneDim)/2 - how far the oversized image can shift
  // before its edge reaches the zone edge. Contain-fit images (e.g. logos) are
  // scaled <= the zone in the non-binding dimension (letterboxed underflow),
  // so the same formula went negative and Math.max(0, …) floored it to zero -
  // nudge was permanently a no-op for any contain-fit zone. Math.abs() unifies
  // both cases: it's the same "how far can this edge travel" distance either way.
  //
  // A zone with overlapAbove can validly render further up than the base
  // cover-fit slack allows - its clip region already extends that far (see
  // the clipPath below), so nudge needs to be able to reach it too. Without
  // this, the overlap feature existed in the clip mask but was practically
  // unreachable: whichever dimension "cover" binds to for a given photo's own
  // aspect ratio could end up with only a few px of slack (one nudge click,
  // Julia's report 2026-09-10: "can't nudge up or down, left and right works
  // however" - the photo she uploaded happened to bind on height). Only the
  // upward (negative-y) direction gets the extra room - downward stays bound
  // to the zone's own real edge, since there's nothing valid to reveal below it.
  function clampOffset(zone, scaledW, scaledH, rawOffset) {
    const slackX = Math.abs(scaledW  - zone.width)  / 2
    const slackY = Math.abs(scaledH - zone.height) / 2
    const upSlack = slackY + (zone.overlapAbove ?? 0)
    const raw = rawOffset ?? { x: 0, y: 0 }
    return {
      x: Math.max(-slackX, Math.min(slackX, raw.x)),
      y: Math.max(-upSlack, Math.min(slackY, raw.y)),
    }
  }

  // ── Initialise canvas when template config changes ──────────────────────────
  useEffect(() => {
    if (!canvasElRef.current || !config) return
    let destroyed = false

    const { canvasW, canvasH, backgroundUrl, backgroundFill, backgroundScale, backgroundOffset, bleedExtraBottom, zones } = config

    // The fabric canvas normally renders exactly the trim area (canvasW ×
    // canvasH) - this app deliberately doesn't draw real bleed in the
    // editor (see trim-guide comment below). bleedExtraBottom is a narrow,
    // opt-in escape hatch: a few extra pixels of real canvas below the trim
    // line so art that intentionally bleeds past the bottom edge (e.g. a
    // product photo hanging off a card) isn't hard-clipped by the canvas
    // boundary itself. Every zone/guide coordinate below still uses
    // canvasH (the trim height) unchanged - only the fabric canvas's own
    // pixel height grows. getPng() crops back to canvasH before export, so
    // nothing about the print output changes.
    const renderH = canvasH + (bleedExtraBottom || 0)

    // Zoom resets to 100% for every new canvas (see cleanup below), so the
    // backing store starts at plain device resolution - the zoom effect
    // raises it again if the user zooms in.
    fabric.devicePixelRatio = screenPixelRatio()

    const canvas = new fabric.Canvas(canvasElRef.current, {
      width: canvasW,
      height: renderH,
      selection: false,
      backgroundColor: backgroundFill || '#00C2CB',
      enableRetinaScaling: true,
    })
    fabricRef.current = canvas
    zoneObjsRef.current = {}

    // Smart centre guide - show while dragging, hide otherwise (Figma-style). Not needed in non-designer mode.
    if (mode !== 'non-designer') {
      canvas.on('object:moving', () => {
        const g = zoneObjsRef.current['_centre-guide']
        if (g) { g.set('visible', true); canvas.requestRenderAll() }
      })
      canvas.on('mouse:up', () => {
        const g = zoneObjsRef.current['_centre-guide']
        if (g) { g.set('visible', false); canvas.requestRenderAll() }
      })
      // Snapshot the pre-drag position so a text-zone move/resize is undoable -
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
          // Also restore width - a Designer-mode drag-resize changes this
          // independently of position, so a position-only reset left a
          // previously-stretched zone stretched (see applyZonePositions
          // above for the actual bug this let go unnoticed).
          width: zone.textWidth ?? zone.width,
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
          // Hide all guide rects + centre guide, and any zone still showing
          // placeholder content (Notion card "Pre-filled Template
          // Placeholders", 2026-09-22 - placeholder text/images are a
          // display-only stand-in and must never end up baked into an
          // actual exported/saved/sent flyer) - save state to restore after export
          const guideObjs = Object.values(zoneObjsRef.current).filter(o => o._wcGuide || o._wcPlaceholder)
          const prevVis = guideObjs.map(o => o.visible !== false)
          guideObjs.forEach(o => o.set('visible', false))
          const cg = zoneObjsRef.current['_centre-guide']
          if (cg) cg.set('visible', false)
          canvas.renderAll()
          // left/top/width/height crop back to the trim area - bleedExtraBottom
          // (if any) added real canvas pixels below the trim line purely so
          // overflow art isn't hard-clipped on screen; export must still only
          // ever contain the trim-sized image the rest of the pipeline expects.
          const data = canvas.toDataURL({ format: 'png', multiplier: 4, left: 0, top: 0, width: canvasW, height: canvasH })
          guideObjs.forEach((o, i) => o.set('visible', prevVis[i]))
          canvas.renderAll()
          return data
        },
        // Layered print export (api/_lib/layeredPdf.js): what the editor shows,
        // object by object, instead of one flattened PNG. Text zones become
        // their final lines (after auto-fit and wrapping) with each line's
        // baseline position, so the PDF can set them as live text exactly where
        // Fabric drew them. Everything else (photos, logos, stickers, QR) is
        // rendered alone through the canvas - same clip, crop and nudge as on
        // screen - onto a transparent background. Coordinates are canvas
        // units; the trim box is 0..canvasW x 0..canvasH. Guides and
        // placeholder content are skipped, exactly as getPng() hides them.
        getLayoutSnapshot: ({ imageMultiplier = 4.2 } = {}) => {
          const cg = zoneObjsRef.current['_centre-guide']
          const items = []
          const objects = canvas.getObjects()
          const isHidden = o => o.visible === false || o._wcGuide || o._wcPlaceholder || o === cg
          for (const obj of objects) {
            if (isHidden(obj)) continue
            if (obj.type === 'textbox' || obj.type === 'i-text' || obj.type === 'text') {
              const lines = []
              const top = obj._getTopOffset()
              const left = obj._getLeftOffset()
              let acc = 0
              obj._textLines.forEach((chars, i) => {
                const h = obj.getHeightOfLine(i)
                // Fabric's own draw position (_renderTextCommon + _renderChars):
                // line top + h/lineHeight, raised by _fontSizeFraction.
                const baseline = top + acc + (h / obj.lineHeight) * (1 - obj._fontSizeFraction)
                lines.push({ text: chars.join(''), x: left + obj._getLineLeftOffset(i), y: baseline })
                acc += h
              })
              items.push({
                type: 'text', zoneId: obj._wcZoneId ?? null,
                fontFamily: obj.fontFamily, fontWeight: obj.fontWeight, fontSize: obj.fontSize,
                fill: typeof obj.fill === 'string' ? obj.fill : '#000000', charSpacing: obj.charSpacing || 0,
                matrix: obj.calcTransformMatrix(), lines,
              })
              continue
            }
            // Render this object alone, clipped to what is visible inside the trim box.
            const r = obj.getBoundingRect(true, true)
            let x0 = Math.max(0, r.left), y0 = Math.max(0, r.top)
            let x1 = Math.min(canvasW, r.left + r.width), y1 = Math.min(canvasH, r.top + r.height)
            if (obj.clipPath?.absolutePositioned) {
              const c = obj.clipPath.getBoundingRect(true, true)
              x0 = Math.max(x0, c.left); y0 = Math.max(y0, c.top)
              x1 = Math.min(x1, c.left + c.width); y1 = Math.min(y1, c.top + c.height)
            }
            if (x1 - x0 < 0.5 || y1 - y0 < 0.5) continue
            const saved = objects.map(o => o.visible)
            const bg = canvas.backgroundImage, bgColor = canvas.backgroundColor
            objects.forEach(o => { o.visible = o === obj })
            canvas.backgroundImage = null
            canvas.backgroundColor = ''
            const src = canvas.toDataURL({ format: 'png', multiplier: imageMultiplier, left: x0, top: y0, width: x1 - x0, height: y1 - y0 })
            objects.forEach((o, i) => { o.visible = saved[i] })
            canvas.backgroundImage = bg
            canvas.backgroundColor = bgColor
            // Canvas units per source pixel: the server turns this into the
            // upload's real print resolution (the PNG above is always rendered
            // at ~300 ppi, which would hide an enlarged low-res upload).
            const sourceScale = obj.type === 'image' ? Math.max(Math.abs(obj.scaleX || 1), Math.abs(obj.scaleY || 1)) : null
            items.push({ type: 'image', zoneId: obj._wcZoneId ?? null, box: [x0, y0, x1 - x0, y1 - y0], src, sourceScale })
          }
          canvas.renderAll()
          return { canvasW, canvasH, items }
        },
        resetLayout: () => {
          zones.forEach(snapZone)
          canvas.renderAll()
        },
        resetZone: (zoneId) => {
          const zone = zones.find(z => z.id === zoneId)
          if (zone) { snapZone(zone); canvas.renderAll() }
        },
        // Text-zone positions are no longer restorable - see applyZonePositions
        // in the canvas-init effect below. Undo snapshots still carry
        // zonePositions (harmless), but applying them would resurrect legacy
        // Designer-mode drags that text zones must never inherit.
        applyZonePositions: () => {
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
        // drawn at -90°, so it must fit within zone.width, not zone.height - the
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

        // Step number shown on each zone's guide chip, matching FieldEditor's
        // "Edit content" panel step numbers exactly - same shared order (see
        // lib/fieldOrder.js) - Julia's ask, 2026-09-18: a plain "1", "2",
        // "3"... instead of the raw zone id (e.g. "headline"), so the canvas
        // reads together with the numbered panel instead of duplicating its
        // own separate field-name vocabulary.
        const stepNumberOrder = sortIdsByFieldOrder(zones.map(z => z.id))

        // Round numbered chip anchored to a zone's box, in UN-rotated
        // coordinates (zone.x/zone.y) even for a rotated zone's guide -
        // stays upright and readable regardless of which way the box itself
        // is turned, matching how ZoneOverlay on the Import review page
        // keeps its own labels upright too. Centered a radius in from the
        // corner (not flush against it) rather than a rectangular chip
        // anchored exactly at zone.x/zone.y.
        //
        // Clamped into the visible canvas (Julia's report, 2026-09-18: the
        // "1" chip was cut off on multiple templates) - root cause traced to
        // Option B's own `logo` zone declaring y: -8.82 in templateZones.js,
        // a deliberate bleed above the canvas's top edge for that artwork.
        // zone.y + CHIP_RADIUS for a zone like that still centers the chip
        // right on the canvas's very first pixel row, clipping half of it.
        // Every zone gets this same clamp, not just ones known to bleed
        // today, so a future template with its own bleeding zone doesn't
        // reintroduce the same bug.
        const CHIP_RADIUS = 9
        const CHIP_MARGIN = 2
        function addZoneLabel(zone) {
          const cx = Math.min(Math.max(zone.x + CHIP_RADIUS, CHIP_RADIUS + CHIP_MARGIN), canvasW - CHIP_RADIUS - CHIP_MARGIN)
          const cy = Math.min(Math.max(zone.y + CHIP_RADIUS, CHIP_RADIUS + CHIP_MARGIN), canvasH - CHIP_RADIUS - CHIP_MARGIN)
          const chip = new fabric.Circle({
            left: cx, top: cy,
            originX: 'center', originY: 'center',
            radius: CHIP_RADIUS,
            fill: ZONE_LABEL_COLOR,
            selectable: false,
            evented: false,
          })
          const number = new fabric.Text(String(stepNumberOrder.indexOf(zone.id) + 1), {
            left: cx, top: cy,
            originX: 'center', originY: 'center',
            fontSize: 10, fontWeight: '700', fontFamily: 'Arial, sans-serif',
            fill: '#fff',
            selectable: false,
            evented: false,
          })
          const label = new fabric.Group([chip, number], {
            selectable: false,
            evented: false,
            _wcGuide: true,
            _wcChip: true,
          })
          canvas.add(label)
          zoneObjsRef.current[`${zone.id}-guide-label`] = label
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

        // Trim-line guide - the canvas itself IS the trim size (this app never
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
        // width of one that doesn't - reproducible identically whether drawn
        // as a Rect or as separate Lines, so it's Fabric/canvas clipping the
        // edge-touching half of the stroke, not a rect-vs-line rasterization
        // quirk. Staying 1px clear of every boundary avoids the clip
        // entirely; strokeWidth 1 centered on a half-integer coordinate
        // (the classic crisp-line trick) keeps each line itself anti-alias-free.
        const trimX0 = 1.5, trimY0 = 1.5, trimX1 = canvasW - 1.5, trimY1 = canvasH - 1.5
        // trimGapBottom: [x0, x1] skips drawing the bottom trim line across
        // that span - for art that intentionally bleeds past the bottom
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

          // Zone boundary guide for text zones - visible in editor (designer + guided), hidden on export.
          // A rotated zone (e.g. tc) previously got no guide box at all - only
          // the non-rotated case was ever handled - so it was invisible/
          // unlabeled in the editor even though every other zone had a
          // boundary shown. Added the rotated case here too (2026-09-11).
          if (zone.type === 'text') {
            let gr
            if (zone.rotate) {
              const cx = zone.x + zone.width / 2
              const cy = zone.y + zone.height / 2
              // width/height are the zone's UNROTATED visual box (narrow x
              // tall for a -90 sidebar), while the rect is then rotated by
              // zone.rotate - so its own width/height must be swapped or it
              // ends up lying sideways, hanging off the canvas edge, out of
              // line with the text and with the Import page's overlay.
              gr = new fabric.Rect({
                left: cx, top: cy,
                originX: 'center', originY: 'center',
                width: Math.abs(zone.rotate) === 90 ? zone.height : zone.width,
                height: Math.abs(zone.rotate) === 90 ? zone.width : zone.height,
                angle: zone.rotate,
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
            } else {
              const gLeft = snapHalf(zone.x)
              const gTop  = snapHalf(zone.y)
              gr = new fabric.Rect({
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
            }
            canvas.add(gr)
            zoneObjsRef.current[`${zone.id}-guide`] = gr
            addZoneLabel(zone)
          }

          if (zone.type === 'text') {
            const isRotated = !!zone.rotate
            const cx = zone.x + zone.width / 2
            const cy = zone.y + zone.height / 2
            const textW = zone.textWidth ?? zone.width
            const placeholderText = placeholderTextFor(zone, templateId)
            const isPlaceholder = !fields[zone.id] && placeholderText != null

            const tb = new fabric.Textbox(zoneDisplayText(zone.id, isPlaceholder ? placeholderText : (fields[zone.id] || '')), {
              left:    isRotated ? cx : zone.x,
              top:     isRotated ? cy : zone.y + (isPlaceholder ? (zone.placeholderDy ?? 0) : 0),
              originX: isRotated ? 'center' : 'left',
              originY: isRotated ? 'center' : 'top',
              width:   textW,
              // A Figma import zone whose source node had no live text to sample
              // (_needsFontReview, see api/_lib/figma-import.js) saves fontSize/
              // fontFamily as null pending a human filling them in - but Fabric's
              // Textbox crashes hard measuring text with a null fontFamily
              // ("Cannot read properties of null (reading 'toLowerCase')" deep in
              // its text-measurement code), which stops the WHOLE canvas from
              // ever finishing its load. Always fall back to a real value so the
              // canvas can load and the zone stays editable/reviewable at all.
              fontSize:   fontSizes?.[zone.id] ?? zone.fontSize ?? 24,
              fontFamily: zone.fontFamily || 'omnes-cond',
              fontWeight: zone.fontWeight ? String(zone.fontWeight) : 'normal',
              // Fabric's default lineHeight (1.16) adds paragraph-style leading
              // these single-line display zones don't need - several zones'
              // configured heights are tight enough that the default leading
              // alone was triggering shrinkToFit even for normal-length text
              // (Julia's report, 2026-08-20: "headline and subline... always
              // have to size up"). 1.05 keeps a small safety margin over the
              // font's raw metrics (glyph descenders) without the extra leading.
              lineHeight: 1.05,
              fill:    zone.color || '#FFFFFF',
              // Zones with no declared align default to CENTER, not left
              // (Julia's ask, 2026-09-24: display text should come out
              // centred from the get-go - users shouldn't need Position
              // arrows to fix it). Zones that explicitly declare an align
              // (tc: 'left', restaurant_name: 'right') keep it.
              textAlign: modeRef.current === 'non-designer'
                ? (zone.align ?? 'center')
                : (alignmentsRef.current?.[zone.id] ?? zone.align ?? 'center'),
              angle:   zone.rotate || 0,
              opacity: isPlaceholder ? PLACEHOLDER_OPACITY : 1,
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
              _wcPlaceholder: isPlaceholder,
            })
            if (CAP_FIT_ZONE_IDS.has(zone.id) && !isRotated && placeholderText != null) {
              tb._wcGuideBaseline = guideBaselineFor(tb, zone, zoneDisplayText(zone.id, placeholderText))
            }
            // Show only the right-edge handle - dragging it reflows text width (Fabric.js Textbox built-in)
            if (!locked) tb.setControlsVisibility({ tl: false, tr: false, bl: false, br: false, mt: false, mb: false, ml: false, mtr: false })

            // Designer mode allows typing straight on the canvas (guided mode
            // edits via FieldEditor's side panel instead, which has its own
            // select-all-on-focus) - select the placeholder text the instant
            // editing starts so the first keystroke replaces it, matching the
            // side panel's behavior instead of inserting mid-placeholder.
            if (!locked) {
              tb.on('editing:entered', () => {
                if (!prevFieldsRef.current[zone.id] && TEXT_PLACEHOLDERS[zone.id] != null) tb.selectAll()
              })
            }

            tb.on('changed', () => {
              if (syncing.current) return
              syncing.current = true
              onFieldChange?.(zone.id, tb.text)
              syncing.current = false
            })

            canvas.add(tb)
            zoneObjsRef.current[zone.id] = tb

          } else if (zone.type === 'image') {
            // Image zone guide - stays visible as a boundary indicator even after upload, hidden on export
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
            addZoneLabel(zone)
          }
        })

        // Auto-resize text zones on initial load - find the LARGEST fontSize
        // that fits the zone, growing short text to fill the bounding box and
        // shrinking long text that overflows. Runs for every autoShrink zone
        // regardless of mode (headlines and sublines should always fill their
        // box, whether in guided or designer mode).
        // If a saved font size exists, apply it directly - it already represents
        // the exact displayed state from last save (post-resize + any manual adjustments).
        // Only run the resize loop when there is NO saved size (first open of a fresh template).
        zones.forEach(zone => {
          if (zone.type !== 'text' || !zone.autoShrink) return
          const tb = zoneObjsRef.current[zone.id]
          if (!tb || !tb.text) return
          const savedSize = fontSizesRef.current?.[zone.id]
          const fitLimit = zone.rotate ? zone.width : zone.height
          if (savedSize != null) {
            // Saved size is the source of truth - skip auto-resize entirely.
            // Still routed through the shared helper so a saved size that
            // happens to contain an unbreakable word doesn't ratchet the
            // box wider than the zone (see applyFontSizeAndCheckFit).
            applyFontSizeAndCheckFit(tb, savedSize, zone, fitLimit)
          } else if (tb._wcPlaceholder) {
            // Placeholder text shrink-to-fits ONLY, never grows: several
            // placeholders now carry real-flyer-length copy (e.g. Option A's
            // "POTSDAMS NEUES DREAMTEAM") that would overflow the zone at
            // full zone fontSize. Real text typed by the user gets the full
            // grow+shrink auto-resize in the fields-sync effect below.
            let size = zone.fontSize ?? 24
            let overflows = applyFontSizeAndCheckFit(tb, size, zone, fitLimit)
            while (overflows && size > 6) {
              size -= 0.5
              overflows = applyFontSizeAndCheckFit(tb, size, zone, fitLimit)
            }
          } else {
            // First open with no saved state - find the largest fontSize that fits.
            let size = zone.fontSize ?? 24
            // Shrink to fit first (long text may overflow at zone default)
            let overflows = applyFontSizeAndCheckFit(tb, size, zone, fitLimit)
            while (overflows && size > 6) {
              size -= 0.5
              overflows = applyFontSizeAndCheckFit(tb, size, zone, fitLimit)
            }
            // Then grow to fill - short text should be as large as the
            // bounding box allows. Keeps growing until the next step would
            // overflow, then steps back to the last fitting size.
            while (zoneCanGrow(zone) && size + 0.5 <= 120) {
              const next = size + 0.5
              if (applyFontSizeAndCheckFit(tb, next, zone, fitLimit)) {
                applyFontSizeAndCheckFit(tb, size, zone, fitLimit)
                break
              }
              size = next
            }
          }
        })

        // Establishes correct stacking order immediately, even before any
        // image zone has an uploaded URL to trigger the sync effect's own
        // call to this same helper (see its comment for the full reasoning).
        applyZoneStackingOrder(canvas, config, zoneObjsRef.current)

        canvas.renderAll()
        if (!destroyed) {
          setLoading(false)
          onReadyRef.current?.()
        }
      }

      // Saved drag positions for text zones are NO LONGER applied at all
      // (Julia's ask, 2026-09-24: text must always sit exactly at the zone's
      // designed geometry, centred on the page). Designer mode - the only
      // thing that could ever create a legitimate text drag - is removed
      // from the UI, so every saved text position/width in existing projects
      // is legacy from before that (a single bad drag used to persist
      // forever: a stretched headline box re-wrapped long text wider than
      // its own guide rect, spilling past it - exactly the bug this fixes).
      // Text zones therefore always render at their zone defaults; the
      // function stays for structural symmetry with exportRef's undo hook
      // below and applies nothing.
      function applyZonePositions() {
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
          // override left/top explicitly per axis - needed when the art
          // isn't symmetric (e.g. Option B's Wolt bag graphic bleeds all the
          // way to the source PNG's own bottom edge with zero spare pixels,
          // so centering a Y zoom pushes it past the canvas and clips it;
          // an explicit top-anchored offset keeps the top margin precise
          // without dragging the bag down with it).
          // canvasW/canvasH (the trim size), not canvas.getWidth()/getHeight() -
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
      const zone = zoneCfgRef.current[id]
      const placeholderText = placeholderTextFor(zone, templateId)
      const isPlaceholder = !value && placeholderText != null
      // Caps zones render uppercased (see capsZoneIds above); the comparison
      // uses the transformed text so sync stays stable round-trip
      // (toUpperCase is idempotent — canvas edits already store caps).
      const displayText = zoneDisplayText(id, isPlaceholder ? placeholderText : (value || ''))
      if (obj.text !== displayText) {
        obj.set('text', displayText)
        // Non-autoShrink zones (only T&Cs today - confirmed by scanning every
        // built-in template) never run applyFontSizeAndCheckFit, so nothing
        // else re-asserts width after a text change - Fabric's Textbox can
        // then render the new text as one unwrapped line instead of
        // re-wrapping to the zone's configured width (Julia's report,
        // 2026-09-28/29: T&Cs typed via the panel showed as a single long
        // line - confirmed in the live editor, not just the chat). Same fix
        // pattern applyFontSizeAndCheckFit uses for autoShrink zones - pin
        // width back and force a real re-layout. Scoped to non-autoShrink
        // zones only, so it cannot touch headline/sub-headline/offer/
        // restaurant_name/cta - none of which Julia asked to change.
        if (!zone?.autoShrink) {
          const textW = zone?.textWidth ?? zone?.width
          if (textW != null) { obj.set('width', textW); obj.initDimensions() }
        }
        changed = true
      }
      const targetOpacity = isPlaceholder ? PLACEHOLDER_OPACITY : 1
      if (obj.opacity !== targetOpacity) {
        obj.set('opacity', targetOpacity)
        changed = true
      }
      // A placeholder can sit at a nudged guide position (zone.placeholderDy);
      // real typed text always starts from the zone's own position, so undo
      // the nudge the moment the placeholder turns into typed content.
      if (!isPlaceholder && obj._wcPlaceholder && zone?.placeholderDy) {
        obj.set('top', obj.top - zone.placeholderDy)
        obj.setCoords()
        changed = true
      }
      obj._wcPlaceholder = isPlaceholder
      // Placeholder guide text is always STATIC - snap it back to the zone's
      // designed position/size on every sync (Julia's ask, 2026-09-24: guide
      // text must sit exactly where the designer put it, centred on the
      // page, never shifted by a saved drag or a stray override). Real typed
      // content keeps whatever position it legitimately has.
      if (isPlaceholder && zone) {
        const isRotated = !!zone.rotate
        const cx = zone.x + zone.width / 2
        const cy = zone.y + zone.height / 2
        const staticGeo = isRotated
          ? { left: cx, top: cy }
          : { left: zone.x, top: zone.y + (zone.placeholderDy ?? 0), width: zone.textWidth ?? zone.width }
        if (obj.left !== staticGeo.left || obj.top !== staticGeo.top ||
            (staticGeo.width != null && obj.width !== staticGeo.width)) {
          obj.set(staticGeo)
          obj.setCoords()
          changed = true
        }
      }
      // Auto-resize when text changes - find the LARGEST fontSize that fits
      // the zone, growing short text to fill the bounding box and shrinking
      // long text that overflows. Runs for every autoShrink zone regardless
      // of mode. Only triggers on actual text changes, not unrelated field
      // updates (e.g. uploading a photo).
      const textChanged = prevFieldsRef.current[id] !== value
      if (textChanged && zone?.autoShrink) {
        if (isPlaceholder) {
          // Field cleared back to placeholder - reset to the zone default,
          // then shrink-to-fit ONLY (placeholders never grow, and several
          // carry real-flyer-length copy that overflows at full size).
          let size = zone?.fontSize ?? 24
          const fitLimit = zone.rotate ? zone.width : zone.height
          let overflows = applyFontSizeAndCheckFit(obj, size, zone, fitLimit)
          while (overflows && size > 6) {
            size -= 0.5
            overflows = applyFontSizeAndCheckFit(obj, size, zone, fitLimit)
          }
          changed = true
          onAutoShrinkRef.current?.(zone.id, size)
        } else {
          // Always start from the zone default fontSize - this ensures text
          // renders at the LARGEST size that fits the zone, whether that means
          // growing (short text) or shrinking (long text).
          const startSize = zone.fontSize ?? 24
          let size = startSize
          const fitLimit = zone.rotate ? zone.width : zone.height
          // Shrink to fit first
          let overflows = applyFontSizeAndCheckFit(obj, size, zone, fitLimit)
          while (overflows && size > 6) {
            size -= 0.5
            overflows = applyFontSizeAndCheckFit(obj, size, zone, fitLimit)
          }
          // Then grow to fill the bounding box
          while (zoneCanGrow(zone) && size + 0.5 <= 120) {
            const next = size + 0.5
            if (applyFontSizeAndCheckFit(obj, next, zone, fitLimit)) {
              applyFontSizeAndCheckFit(obj, size, zone, fitLimit)
              break
            }
            size = next
          }
          changed = true
          // Report the actual rendered size back so the panel's pt number
          // and the +/- stepper both stay truthful.
          if (size !== startSize) onAutoShrinkRef.current?.(zone.id, size)
        }
      }
      syncing.current = false
    })
    prevFieldsRef.current = { ...fields }
    if (changed) canvas.renderAll()
  }, [fields, templateId, zoneDisplayText])

  // ── Sync font size overrides → canvas ──────────────────────────────────────
  // Real bug found 2026-08-03 (Julia: "sizing the headline also resizes the
  // subline"): this used to fall back to zone.fontSize (the static default)
  // for any zone with no entry in `fontSizes`. `fontSizes` is a brand-new
  // object reference every time ANY zone's size changes, so this whole effect
  // re-ran on every single font-size edit - and for a zone that had been
  // auto-shrunk on load (its real Fabric fontSize applied directly, never
  // written back into this React state), that meant its shrunk size got
  // silently overwritten back to the unfit static default the moment a
  // DIFFERENT zone's size was touched. Only ever apply an explicit entry in
  // `fontSizes` - a zone with no entry keeps whatever size it currently has.
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas || !config) return
    let changed = false
    config.zones.forEach(zone => {
      if (!fontSizes || !(zone.id in fontSizes)) return
      const obj = zoneObjsRef.current[zone.id]
      if (!obj || obj.type !== 'textbox') return
      const size = fontSizes[zone.id]
      if (obj.fontSize !== size) { obj.set('fontSize', size); anchorHeadlineToGuide(obj, zone); changed = true }
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
      // Same center-default as the canvas init above - zones with no
      // declared align render centred, explicit configs (tc/restaurant_name)
      // still win.
      const align = modeRef.current === 'non-designer'
        ? (zone.align ?? 'center')
        : (alignments?.[zone.id] ?? zone.align ?? 'center')
      if (obj.textAlign !== align) obj.set('textAlign', align)
    })
    canvas.renderAll()
  }, [alignments, config])

  // ── Light up the zone whose field is focused/hovered in the side panel ──────
  // Annika's ask via Julia, 2026-09-18: "highlight the zone when we put our
  // cursor in the box to type or add a photo". Toggles the SAME guide rect
  // object every other zone-boundary code already draws (`${id}-guide` for
  // text, `${id}-placeholder` for image) between its normal translucent-white
  // dashed look and a solid coral one - never rebuilds the canvas, just
  // mutates existing objects, so this stays cheap enough to run on every
  // keystroke's focus/blur without the flicker a full re-init would cause.
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas || !config) return
    config.zones.forEach(zone => {
      const key = zone.type === 'image' ? `${zone.id}-placeholder` : `${zone.id}-guide`
      const obj = zoneObjsRef.current[key]
      if (!obj) return
      const active = zone.id === activeZoneId
      obj.set({
        stroke: active ? ZONE_LABEL_COLOR : 'rgba(255,255,255,0.5)',
        strokeWidth: active ? 1.8 : 1.5,
        strokeDashArray: active ? null : [6, 4],
        fill: active ? 'rgba(223,111,109,0.15)' : 'transparent',
      })
    })
    canvas.renderAll()
  }, [activeZoneId, config])

  // ── Sync text-zone nudge offsets → canvas ─────────────────────────────────
  // Mirrors the image nudge pattern below, but for specific text zones (e.g.
  // headline/sub_headline in the restricted review mode - see FieldEditor.jsx)
  // - the only other way to move text is a Designer-mode canvas drag, which
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
      // A placeholder photo keeps the fit it was given on load (see the image
      // load above) until a real Scale is set for the zone.
      const phFit = img._wcPlaceholder && !(zone.id in (imageScales ?? {})) ? img._wcPlaceholderFit : null
      const userPct = phFit ? phFit.pct : (imageScales?.[zone.id] ?? 100)
      const finalScale = img._wcBaseScale * (userPct / 100)
      const scaledW = img.width  * finalScale
      const scaledH = img.height * finalScale
      const offset = clampOffset(zone, scaledW, scaledH, phFit ? phFit.offset : imagePositions?.[zone.id])
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

  // Browser zoom (Cmd/Ctrl +) and dragging the window to another screen
  // change devicePixelRatio without touching our own zoom state, so the
  // canvas kept its old backing-store size and went soft (Julia's report,
  // 2026-10-01). A resolution media query fires exactly when it changes;
  // bumping this re-runs the backing-store effect below.
  const [dprTick, setDprTick] = useState(0)
  useEffect(() => {
    let mq
    const listen = () => {
      mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
      mq.addEventListener('change', onChange, { once: true })
    }
    const onChange = () => { setDprTick(t => t + 1); listen() }
    listen()
    return () => mq?.removeEventListener('change', onChange)
  }, [])

  // ── Zoom controls (button-driven only - no scroll wheel) ───────────────────
  const handleZoomIn  = useCallback(() => setZoom(z => Math.min(400, Math.round(z / 10) * 10 + 10)), [])
  const handleZoomOut = useCallback(() => setZoom(z => Math.max(40,  Math.round(z / 10) * 10 - 10)), [])
  const handleZoomReset = useCallback(() => setZoom(100), [])

  // Zoom is a CSS transform on the canvas element, which on its own just
  // stretches the bitmap - at 200%+ everything went soft. So the backing
  // store is redrawn at devicePixelRatio × zoom (fabric's retina scaling
  // does the rest: pointer math and object caches both read the same
  // ratio). getPng() doesn't pass enableRetinaScaling, so export is
  // unaffected. Then recalculate the offset so pointer events map correctly.
  useEffect(() => {
    const canvas = fabricRef.current
    if (canvas) {
      const w = canvas.getWidth(), h = canvas.getHeight()
      const ratio = editorPixelRatio(zoom, w, h)
      if (ratio !== fabric.devicePixelRatio) {
        fabric.devicePixelRatio = ratio
        canvas.setDimensions({ width: w, height: h }) // re-applies retina scaling to both canvas layers + re-renders
      }
    }
    requestAnimationFrame(() => { fabricRef.current?.calcOffset() })
  }, [zoom, dprTick])

  // ── Drag-and-drop an image file straight onto a photo/logo zone ───────────
  // fabric's own getPointer() already resolves the CSS `transform: scale()`
  // zoom wrapper into real canvas-space coordinates (same mechanism its own
  // mouse handling relies on, via calcOffset() above), so a plain bounding-box
  // check against each image zone's x/y/width/height is enough to tell which
  // zone a drop landed on - no fabric hit-testing needed.
  function zoneIdAtPoint(px, py) {
    const imageZones = config?.zones?.filter(z => z.type === 'image') ?? []
    const hit = imageZones.find(z => px >= z.x && px <= z.x + z.width && py >= z.y && py <= z.y + z.height)
    return hit?.id ?? null
  }

  function zoneIdFromDragEvent(e) {
    const canvas = fabricRef.current
    if (!canvas || restricted || locked) return null
    const pt = canvas.getPointer(e, true)
    return zoneIdAtPoint(pt.x, pt.y)
  }

  function showDropError(message) {
    setDropError(message)
    clearTimeout(dropErrorTimerRef.current)
    dropErrorTimerRef.current = setTimeout(() => setDropError(null), 4000)
  }

  function handleDragOver(e) {
    if (!e.dataTransfer?.types?.includes('Files')) return
    e.preventDefault()
    setDropZoneId(zoneIdFromDragEvent(e.nativeEvent))
  }

  function handleDragLeave(e) {
    // Only clear on actually leaving the canvas area, not just moving between
    // its own children (which also fires dragleave on the outgoing element).
    if (!containerRef.current?.contains(e.relatedTarget)) setDropZoneId(null)
  }

  async function handleDrop(e) {
    e.preventDefault()
    const zoneId = zoneIdFromDragEvent(e.nativeEvent)
    setDropZoneId(null)
    const file = e.dataTransfer?.files?.[0]
    if (!file || !zoneId || !onImageDrop) return
    if (!file.type.startsWith('image/')) {
      showDropError('That file isn’t an image.')
      return
    }
    setDropBusy(true)
    try {
      await onImageDrop(zoneId, file)
    } catch (err) {
      showDropError(err.message)
    } finally {
      setDropBusy(false)
    }
  }

  useEffect(() => () => clearTimeout(dropErrorTimerRef.current), [])

  // ── Sync image uploads → canvas (handles any image zone: photo, logo, etc.) ──
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas || !config) return

    config.zones.filter(z => z.type === 'image').forEach(zone => {
      const urlField = `${zone.id}Url`
      const url = fields[urlField]
      // Pre-filled Template Placeholders (Notion card, 2026-09-22): an empty
      // image zone shows a greyed generic placeholder graphic instead of a
      // blank drop target. effectiveUrl is what actually gets loaded/tracked;
      // `url` itself (and therefore fields state) stays untouched until the
      // manager uploads or picks a real image.
      const placeholderUrl = placeholderImageFor(zone, templateId)
      const isPlaceholder = !url && !!placeholderUrl
      const effectiveUrl = url || placeholderUrl

      const existing = zoneObjsRef.current[`${zone.id}-image`]

      // URL unchanged - image already on canvas, don't touch it (preserves user resize/move)
      if (existing && existing._wcUrl === effectiveUrl) return

      if (existing) {
        canvas.remove(existing)
        delete zoneObjsRef.current[`${zone.id}-image`]
      }

      const ph = zoneObjsRef.current[`${zone.id}-placeholder`]

      if (!effectiveUrl) {
        if (ph) { ph.set('visible', true); canvas.renderAll() }
        return
      }

      fabric.Image.fromURL(effectiveUrl, img => {
        // Must compare against the SPECIFIC canvas instance this effect run
        // captured, not just "some canvas exists" - fabricRef.current can
        // already point at a newer replacement canvas (React StrictMode's
        // dev-only double-invoke recreates it on every mount) by the time an
        // async image load resolves. `!fabricRef.current` alone doesn't
        // catch that case and lets this stale callback mutate/add to an
        // already-disposed `canvas`, which crashes fabric internally
        // ("Cannot read properties of null (reading 'clearRect')"). Exposed
        // by placeholders (2026-09-22): every empty image zone now always
        // has *some* URL to load, where before an unset zone skipped this
        // fromURL call entirely, so the pre-existing race almost never fired.
        if (fabricRef.current !== canvas) return
        // Photos use cover (fill zone, crop center); logos use contain (full logo visible)
        const isCover = zone.fit === 'cover'
        // Always-on overscan so the Position nudge has real crop room in BOTH
        // directions from the start - otherwise whichever dimension "cover"
        // binds to (matches the zone exactly) has near-zero slack until the
        // user also bumps Scale. A flat percentage margin here was tried
        // twice (1.06, then 1.15 - Julia's 2026-09-10 report: Option B's
        // food photo felt "very restricted") and both times still bottomed
        // out at just 2-3 clicks of room for a photo whose aspect ratio
        // happens to closely match the zone's own - confirmed by simulating
        // this exact formula against Option A/B's real dimensions across a
        // range of photo aspect ratios (4:3 through ultra-wide panoramic),
        // not just guessed: the tight (binding) dimension's slack is
        // *entirely* a function of the margin, so a flat percentage on a
        // ~135-161pt zone genuinely can be as little as ~12px total travel,
        // regardless of how much bigger the margin number looks on paper.
        // Guaranteeing an ABSOLUTE minimum instead of a percentage fixes
        // this class of bug structurally - every zone/photo combination now
        // gets real, clickable room, rather than needing another guess at
        // the next magic percentage when a differently-shaped photo hits
        // the same wall again.
        const MIN_NUDGE_SLACK = 24 // canvas units - ~6 clicks of 4px-step room
        const baseScale = isCover
          ? Math.max(zone.width / img.width, zone.height / img.height)
          : Math.min(zone.width / img.width, zone.height / img.height)
        let scale = baseScale
        if (isCover) {
          // Whichever dimension the base (no-margin) scale is exactly tight
          // against is the one margin alone has to open slack in - see
          // clampOffset's comment above for why the other dimension already
          // has natural slack from the aspect mismatch and doesn't need this.
          const bindsOnWidth = (zone.width / img.width) >= (zone.height / img.height)
          const tightDim = bindsOnWidth ? zone.width : zone.height
          const marginForMinSlack = 1 + (2 * MIN_NUDGE_SLACK) / tightDim
          scale = baseScale * Math.max(1.15, marginForMinSlack)
        }
        const scaledW = img.width  * scale
        const scaledH = img.height * scale
        // Placeholder images are display-only - not draggable/resizable like
        // a real upload, since there's nothing underneath to reposition.
        const imgLocked = !fabricRef.current || mode === 'non-designer' || isPlaceholder
        const offset0 = clampOffset(zone, scaledW, scaledH, imagePositionsRef.current?.[zone.id])
        img.set({
          left:    zone.x + (zone.width  - scaledW) / 2 + offset0.x,
          top:     zone.y + (zone.height - scaledH) / 2 + offset0.y,
          scaleX:  scale,
          scaleY:  scale,
          opacity: isPlaceholder ? PLACEHOLDER_OPACITY : 1,
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
        // Corner handles only - no edge or rotation handles
        if (!imgLocked) img.setControlsVisibility({ mt: false, mb: false, ml: false, mr: false, mtr: false })
        img._wcZoneId = zone.id
        img._wcBaseScale = scale
        img._wcUrl = effectiveUrl
        img._wcPlaceholder = isPlaceholder

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

        // The faded placeholder photo of an empty photo zone gets the same
        // fit a real cut-out upload gets (size + centring, App.jsx
        // autoFitImage), otherwise the guide picture fills the whole box and
        // looks bigger than the photo that replaces it (Julia, 2026-09-30).
        if (isPlaceholder && zone.id === 'photo' && userPct === 100) {
          try {
            const fit = contentFitForImage(zone, img.getElement())
            if (fit) {
              img._wcPlaceholderFit = fit // the scale/position sync effect below honours it
              const phScale = scale * (fit.pct / 100)
              const phW = img.width * phScale
              const phH = img.height * phScale
              const phOffset = clampOffset(zone, phW, phH, fit.offset)
              img.set({
                scaleX: phScale,
                scaleY: phScale,
                left: zone.x + (zone.width - phW) / 2 + phOffset.x,
                top:  zone.y + (zone.height - phH) / 2 + phOffset.y,
              })
              img.setCoords()
            }
          } catch {
            // Unreadable placeholder - keep the plain cover fit.
          }
        }

        canvas.add(img)
        zoneObjsRef.current[`${zone.id}-image`] = img
        applyZoneStackingOrder(canvas, config, zoneObjsRef.current)
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
  // content into that space - stacking the decorative BLEED_MARGIN white
  // padding underneath it too would leave a second, contentless white gap
  // between that art and the true outer edge. Drop the bottom padding in
  // that case so the canvas's own bottom edge doubles as the outer edge.
  const bleedPadBottom = config?.bleedExtraBottom ? 0 : BLEED_MARGIN
  const scale = zoom / 100

  // Zoom controls. Desktop: pinned to the bottom of the dark area, outside
  // the scrolling canvas, so zooming in can't push them out of view (they
  // used to hang under the canvas and get clipped - Julia's report,
  // 2026-10-01). Phone: still right under the canvas, where the page scroll
  // reaches them.
  const zoomControls = bottom => (
    <div style={{
      position: 'absolute', bottom, left: '50%', zIndex: 25, transform: 'translateX(-50%)',
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
  )
  const dropZone = dropZoneId ? config?.zones?.find(z => z.id === dropZoneId) : null

  return (
    <div
      ref={containerRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      // Phone width: as tall as the design itself (the page scrolls, not a
      // fixed-height box that clipped the bottom of the flyer), with a strip
      // above the canvas for the Guided-mode badge - there's no dark margin
      // beside the canvas on a phone, so its usual corner sat on the logo.
      // 'safe center' keeps a zoomed-in canvas scrollable back to its left edge.
      style={isMobile ? {
        flex: 'none',
        background: '#2a2a2a',
        overflow: 'auto',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'safe center',
        padding: '52px 12px 12px',
        position: 'relative',
      } : {
        flex: 1,
        minHeight: 0,
        background: '#2a2a2a',
        overflow: 'hidden',
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

      {/* Top-left corner of the dark area, not centred above the canvas.
          Centred, it sat right on top of the design whenever the canvas was
          tall enough to reach the top of this area - covering the logo
          zone, which is almost always at the top of these flyers (Julia's
          report 2026-09-18, again Anang's 2026-09-25; nudging `top` never
          fixed it for every canvas height). The canvas is always centred
          with plenty of dark space either side, so the corner stays clear.
          Same translucent-dark pill style as the zoom controls. */}
      {locked && !loading && (
        <div style={{
          position: 'absolute', top: 16, left: 16,
          background: 'rgba(22,163,74,0.9)', color: '#fff',
          fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
          padding: '6px 12px', borderRadius: 20,
          display: 'flex', alignItems: 'center', gap: 6,
          whiteSpace: 'nowrap', zIndex: 5, pointerEvents: 'none',
        }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          Approved · locked
        </div>
      )}
      {mode === 'non-designer' && !locked && !loading && (
        <div style={{
          position: 'absolute', top: 16, left: 16,
          background: 'rgba(0,0,0,0.55)', color: 'rgba(255,255,255,0.85)',
          fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
          padding: '6px 12px', borderRadius: 20,
          display: 'flex', alignItems: 'center', gap: 6,
          whiteSpace: 'nowrap', zIndex: 5, pointerEvents: 'none',
        }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          Guided mode · canvas locked
        </div>
      )}
      {/* Top-right corner controls (the Comment tool toggle, App.jsx) - same
          corner treatment as the Guided-mode badge opposite it. Stacked as a
          column so anything after the button (the comment-mode hint) sits in
          the margin below it rather than stretching left over the design. */}
      {topRight && !loading && (
        <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 25, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          {topRight}
        </div>
      )}
      {/* Desktop: the canvas scrolls inside this layer while the badges and
          zoom controls above/below stay put on the outer, non-scrolling
          area. It used to be overflow: hidden + centred, so a zoomed-in
          canvas was cut off top and bottom with no way to scroll to it.
          'safe center' centres while it fits and stays scrollable to every
          edge once it doesn't. fabric caches the canvas's page offset for
          pointer math, so it's refreshed on every scroll. Phone: the outer
          container already scrolls, so this layer is layout-neutral. */}
      <div
        onScroll={isMobile ? undefined : () => fabricRef.current?.calcOffset()}
        style={isMobile ? { display: 'contents' } : {
          position: 'absolute', inset: 0, overflow: 'auto',
          display: 'flex', alignItems: 'safe center', justifyContent: 'safe center',
          padding: '40px 40px 64px',
        }}
      >
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
              dashed trim line is drawn just inside the canvas's own edge -
              see the trim-guide fabric.Rect in the effect above). This is
              purely a visual guide outside the actual canvas - canvas
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
          {/* Highlights the zone a dragged file is currently over - lives in
              this same `transform: scale()` wrapper as the canvas so it scales
              and positions identically, using the zone's own unscaled x/y/
              width/height plus the same BLEED_MARGIN offset the canvas itself
              sits at within this wrapper. */}
          {dropZone && (
            <div style={{
              position: 'absolute',
              left: dropZone.x + BLEED_MARGIN,
              top: dropZone.y + BLEED_MARGIN,
              width: dropZone.width,
              height: dropZone.height,
              border: '2.5px dashed var(--primary, #DF6F6D)',
              background: 'rgba(223,111,109,0.18)',
              borderRadius: 4,
              pointerEvents: 'none',
              zIndex: 8,
            }} />
          )}
        </div>
        {/* Pinned comments (CanvasComments.jsx) - laid over exactly the trim
            area, outside the scale() wrapper so pins and their popovers stay
            a readable size at any zoom. Positions inside are fractions of
            this box, so they track zoom on their own. Plain DOM on top of
            the canvas, never part of the fabric scene, so never exported. */}
        {/* Approved designs are locked: swallow every pointer event aimed at
            the design itself so nothing can be selected, dragged, resized or
            typed into. Below the comment overlay (z 20), so pins still open. */}
        {locked && !loading && (
          <div
            data-testid="canvas-lock"
            style={{
              position: 'absolute',
              left: BLEED_MARGIN * scale,
              top: BLEED_MARGIN * scale,
              width: canvasW * scale,
              height: canvasH * scale,
              pointerEvents: 'auto',
              cursor: 'not-allowed',
              zIndex: 15,
            }}
          />
        )}
        {overlay && !loading && (
          <div style={{
            position: 'absolute',
            left: BLEED_MARGIN * scale,
            top: BLEED_MARGIN * scale,
            width: canvasW * scale,
            height: canvasH * scale,
            pointerEvents: 'none',
            zIndex: 20,
          }}>
            {overlay}
          </div>
        )}
        {dropBusy && !dropError && (
          <div style={{
            position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.75)', color: '#fff', fontSize: 12, fontWeight: 600,
            padding: '7px 14px', borderRadius: 20, whiteSpace: 'nowrap',
            zIndex: 9, boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          }}>
            Processing image…
          </div>
        )}
        {dropError && (
          <div style={{
            position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
            background: '#B91C1C', color: '#fff', fontSize: 12, fontWeight: 600,
            padding: '7px 14px', borderRadius: 20, whiteSpace: 'nowrap',
            zIndex: 9, boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          }}>
            {dropError}
          </div>
        )}
        {isMobile && zoomControls(-38)}
      </div>
      </div>
      {!isMobile && !loading && zoomControls(16)}
    </div>
  )
}
