import { useState, useRef, useEffect } from 'react'
import Header from './components/Header'
import ActivationGate from './components/ActivationGate'
import HelpModal from './components/HelpModal'
import TemplatePicker from './components/TemplatePicker'
import BriefingForm from './components/BriefingForm'
import FieldEditor from './components/FieldEditor'
import TemplateCanvas from './components/TemplateCanvas'
import DesignsPage from './components/DesignsPage'
import LibraryPage from './components/LibraryPage'
import ReviewPage from './components/ReviewPage'
import TemplateImportPage from './components/TemplateImportPage'
import { TEMPLATE_ZONES } from './data/templateZones'
import { TEMPLATES } from './data/templates'
import { blobUrlToDataUrl } from './lib/image'
import { mergeCustomTemplates } from './lib/customTemplates'

const DEFAULT_FIELDS = {
  headline:        '',
  offer:           '',
  sub_headline:    '',
  restaurant_name: '',
  tc:              '',
  cta:             '',
  logoUrl:         null,
  photoUrl:        null,
  qrUrl:           null,
}

// Generate a medium-res preview image (2× canvas) for the review page
async function makePreview(fullPng) {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const w = 632, h = 882
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', 0.88))
    }
    img.src = fullPng
  })
}

// Resize the full-res canvas PNG to a small JPEG thumbnail for the Designs grid
async function makeThumbnail(fullPng) {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const w = 158, h = 221
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', 0.82))
    }
    img.src = fullPng
  })
}

// items: [{ url, label? }] — label is only shown when reviewing more than one
// design at once (e.g. ticking both candidates on the brief's picker screen).
function ReviewModal({ items, onClose }) {
  const [copiedIdx, setCopiedIdx] = useState(null)
  function copy(url, idx) {
    navigator.clipboard.writeText(url)
    setCopiedIdx(idx)
    setTimeout(() => setCopiedIdx(null), 2000)
  }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 32, maxWidth: 440, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--dark)', marginBottom: 6 }}>Ready to share</div>
        <div style={{ fontSize: 13, color: 'var(--mid)', marginBottom: 20, lineHeight: 1.5 }}>
          Send {items.length > 1 ? 'these links' : 'this link'} to your client or team. They can view the design and leave comments.
        </div>
        {items.map((item, i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            {item.label && <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--mid)', marginBottom: 4 }}>{item.label}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={item.url} readOnly
                style={{ flex: 1, padding: '10px 12px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 8, background: '#F9FAFB', color: 'var(--dark)', fontFamily: 'inherit' }}
                onClick={e => e.target.select()}
              />
              <button
                onClick={() => copy(item.url, i)}
                style={{ padding: '10px 16px', background: copiedIdx === i ? '#16a34a' : 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700, flexShrink: 0, transition: 'background 0.2s', minWidth: 70 }}
              >
                {copiedIdx === i ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>
        ))}
        <button
          onClick={onClose}
          style={{ width: '100%', padding: '10px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: 'var(--mid)', fontFamily: 'inherit', marginTop: 4 }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--dark)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
        >
          Close
        </button>
      </div>
    </div>
  )
}

export default function App() {
  const [screen, setScreen]                   = useState('brief')
  // Lifted out of BriefingForm so it survives a round trip to the editor and
  // back — Julia's ask (2026-08-03): saving a candidate mid-edit should
  // return to the "pick a design" screen (e.g. a merchant wants both A and
  // B), not lose it. BriefingForm no longer owns this — it's just the
  // submitted brief snapshot ({...brief} at Submit), or null before that.
  const [briefSubmission, setBriefSubmission] = useState(null)
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [fields, setFields]                   = useState(DEFAULT_FIELDS)
  const [lang, setLang]                       = useState('de')
  const [exporting, setExporting]             = useState(false)
  const [fontSizes, setFontSizes]             = useState({})
  // The REAL font size each auto-shrink zone actually rendered at on load —
  // captured once via handleCanvasReady, never mutated afterward for that
  // session. Needed because auto-shrink is applied directly to the Fabric
  // object and never written back into `fontSizes`, so without this,
  // `fontSizes[zoneId]` (and the restricted-mode clamp below) would be
  // anchored to the unshrunk static default instead of what's actually on
  // screen — a long headline could show "54pt" while really rendering at
  // 21pt, so clicking + once jumped straight to ~55pt instead of ~22pt.
  const [generatedFontSizes, setGeneratedFontSizes] = useState({})
  const [alignments, setAlignments]           = useState({})
  const [imageScales, setImageScales]         = useState({})
  const [imagePositions, setImagePositions]   = useState({})
  // Nudge offsets for specific text zones (headline/sub_headline) in the
  // restricted review mode — see handleTextNudge and TemplateCanvas.jsx.
  const [textPositions, setTextPositions]     = useState({})
  const [zonePositions, setZonePositions]     = useState({})
  const [projectName, setProjectName]         = useState('')
  const [currentProjectId, setCurrentProjectId] = useState(null)
  const [saving, setSaving]                   = useState(false)
  const [saveStatus, setSaveStatus]           = useState(null) // null | 'saved'
  const [loadKey, setLoadKey]                 = useState(0)    // increments on project load to reset auto-shrink
  const [reviewItems, setReviewItems]         = useState(null) // share modal: [{ url, label? }] | null
  const [reviewProjectId, setReviewProjectId] = useState(null) // from ?review= param
  const [comments, setComments]               = useState([])
  // activation: null = not yet validated, object = { key, clientName, credits, role }
  const [activation, setActivation]           = useState(null)
  const [showHelp, setShowHelp]               = useState(false)
  // true only when the editor was entered via a brief-generated candidate —
  // gates the locked-down FieldEditor mode (Phase 2). Reset to false by every
  // other entry point so the lock never leaks into normal editing.
  const [restrictedReview, setRestrictedReview] = useState(false)
  // Figma-imported templates (draft + live), fetched once and merged with the
  // static TEMPLATE_ZONES/TEMPLATES — see src/lib/customTemplates.js
  const [customTemplates, setCustomTemplates] = useState({ zonesById: {}, cards: [], records: [] })
  const exportRef = useRef(null)

  // ── Undo history ─────────────────────────────────────────────────────────────
  const historyRef         = useRef([])           // snapshots of { fields, fontSizes, alignments, imageScales }
  const [canUndo, setCanUndo] = useState(false)
  const lastTextSnapRef    = useRef({ key: null, time: 0 }) // debounce text-field snaps
  // Live refs so snapshot captures current values regardless of closure age
  const fieldsRef      = useRef(fields);      fieldsRef.current      = fields
  const fontSizesRef2  = useRef(fontSizes);   fontSizesRef2.current  = fontSizes
  const alignmentsRef2 = useRef(alignments);  alignmentsRef2.current = alignments
  const imageScalesRef2= useRef(imageScales); imageScalesRef2.current= imageScales
  const imagePositionsRef2 = useRef(imagePositions); imagePositionsRef2.current = imagePositions

  function pushUndoSnapshot(textKey = null) {
    const now = Date.now()
    if (textKey && textKey === lastTextSnapRef.current.key && now - lastTextSnapRef.current.time < 1000) return
    if (textKey) lastTextSnapRef.current = { key: textKey, time: now }
    historyRef.current = [
      ...historyRef.current.slice(-29),
      {
        fields: { ...fieldsRef.current },
        fontSizes: { ...fontSizesRef2.current },
        alignments: { ...alignmentsRef2.current },
        imageScales: { ...imageScalesRef2.current },
        imagePositions: { ...imagePositionsRef2.current },
        // Text-zone drag/resize positions live only on the canvas, not in React state —
        // read them live so a drag (see onZoneDragStart) is undoable too.
        zonePositions: exportRef.current?.getZonePositions?.() ?? {},
      },
    ]
    setCanUndo(true)
  }

  // Called on mousedown on a text zone, before any drag/resize moves it — captures
  // the pre-drag position as an undo point. Debounced per-zone like text fields so
  // repeated clicks on the same zone within a second don't spam the history.
  function handleZoneDragStart(zoneId) {
    pushUndoSnapshot(`zonedrag-${zoneId}`)
  }

  function handleUndo() {
    const snapshot = historyRef.current.pop()
    if (!snapshot) return
    setFields(snapshot.fields)
    setFontSizes(snapshot.fontSizes)
    setAlignments(snapshot.alignments)
    setImageScales(snapshot.imageScales)
    setImagePositions(snapshot.imagePositions ?? {})
    exportRef.current?.applyZonePositions?.(snapshot.zonePositions)
    setCanUndo(historyRef.current.length > 0)
  }

  // Cmd+Z / Ctrl+Z global shortcut
  useEffect(() => {
    function onKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        handleUndo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }) // no deps — always uses latest handleUndo via closure refresh

  // Detect ?review=<id> in URL and switch to review screen
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const rid = params.get('review')
    if (rid) { setReviewProjectId(rid); setScreen('review') }
  }, [])

  // Fetch Figma-imported templates once on mount. Failure just means the app
  // runs with the static built-in templates only — never blocks/breaks the app.
  useEffect(() => {
    refetchCustomTemplates()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Lock body scroll in editor mode so the canvas never scrolls with the page
  useEffect(() => {
    if (screen === 'editor') {
      window.scrollTo(0, 0)
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [screen])

  // On mount: restore activation from localStorage (so users don't need to re-enter key on refresh)
  useEffect(() => {
    const savedKey = localStorage.getItem('wildcast_activation_key')
    if (!savedKey) return
    fetch('/api/validate-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: savedKey }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.valid) {
          const savedCredits = parseInt(localStorage.getItem('wildcast_credits'), 10)
          const credits = Number.isFinite(savedCredits) ? savedCredits : data.total_credits
          const role = data.role || 'partner'
          localStorage.setItem('wildcast_role', role)
          setActivation({ key: savedKey, clientName: data.client_name, credits, role })
        } else {
          localStorage.removeItem('wildcast_activation_key')
          localStorage.removeItem('wildcast_credits')
          localStorage.removeItem('wildcast_role')
        }
      })
      .catch(() => {
        // Network error on restore — treat as activated using cached credits so the
        // app still works offline/slow connections after a valid prior session.
        const savedCredits = parseInt(localStorage.getItem('wildcast_credits'), 10)
        if (Number.isFinite(savedCredits)) {
          const role = localStorage.getItem('wildcast_role') || 'partner'
          setActivation({ key: savedKey, clientName: '', credits: savedCredits, role })
        }
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleActivated({ key, clientName, credits, role }) {
    setActivation({ key, clientName, credits, role: role || 'partner' })
  }

  // Fetch comments whenever the open project changes
  useEffect(() => {
    if (!currentProjectId) { setComments([]); return }
    fetch(`/api/comments?id=${currentProjectId}`)
      .then(r => r.json())
      .then(d => setComments(d.comments || []))
      .catch(() => {})
  }, [currentProjectId])

  function handleSelectTemplate(template) {
    historyRef.current = []; setCanUndo(false)
    setRestrictedReview(false)
    setSelectedTemplate(template)
    setFields(DEFAULT_FIELDS)
    setFontSizes({})
    setGeneratedFontSizes({})
    setAlignments({})
    setImageScales({})
    setTextPositions({})
    setZonePositions({})
    setProjectName(template.name)
    setCurrentProjectId(null)
    setSaveStatus(null)
    setLoadKey(k => k + 1)
    setScreen('editor')
  }

  // Entry point for a candidate generated from the briefing form
  // (src/components/TemplateCandidatePicker.jsx) — mirrors handleSelectTemplate
  // above but pre-fills the editor with the brief's answers instead of resetting
  // to DEFAULT_FIELDS, and opens into the locked-down review mode (Phase 2).
  function handleSelectGeneratedCandidate(template, prefilledFields) {
    historyRef.current = []; setCanUndo(false)
    setRestrictedReview(true)
    setSelectedTemplate(template)
    setFields({ ...DEFAULT_FIELDS, ...prefilledFields })
    setFontSizes({})
    setGeneratedFontSizes({})
    setAlignments({})
    setImageScales({})
    setTextPositions({})
    setZonePositions({})
    setProjectName(template.name)
    setCurrentProjectId(null)
    setSaveStatus(null)
    setLoadKey(k => k + 1)
    setScreen('editor')
  }

  function handleBack() {
    setScreen('designs')
  }

  function handleNavigate(target) {
    if (target === 'brief') setScreen('brief')
    else if (target === 'catalogue') setScreen('catalogue')
    else if (target === 'designs') setScreen('designs')
    else if (target === 'library') setScreen('library')
    else if (target === 'import' && activation?.role === 'designer') setScreen('import')
  }

  function refetchCustomTemplates() {
    fetch(`/api/list-templates?_t=${Date.now()}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(data => setCustomTemplates(mergeCustomTemplates(data.templates ?? [])))
      .catch(() => {})
  }

  // Applies a publish-template.js response directly to local state instead of
  // waiting on a refetch — Vercel Blob's list() reads can lag up to ~30s behind
  // a write it was just given (see STATUS.md), so a refetch right after an
  // action can silently show the PRE-action status, making Publish/Archive
  // look like it needs several clicks when the first one already worked. The
  // action's own response is the one source that's already known-fresh.
  function patchCustomRecord(slotKey, patch) {
    setCustomTemplates(prev => {
      const exists = prev.records.some(r => r.slotKey === slotKey)
      // Archiving a hardcoded slot (Option A/B) for the first time creates a
      // brand-new override record server-side — nothing to patch locally yet.
      const records = exists
        ? prev.records.map(r => r.slotKey === slotKey ? { ...r, ...patch } : r)
        : [...prev.records, { slotKey, ...patch }]
      return mergeCustomTemplates(records)
    })
  }

  function handleFontSizeChange(key, size) {
    pushUndoSnapshot()
    // Restricted review mode only allows a modest ±20% adjustment around the
    // size the zone actually rendered at on load (generatedFontSizes — see its
    // declaration above for why this can't just be zone.fontSize) — enough to
    // nudge-fit, not enough to grow large enough to wrap/overlap into a
    // neighboring zone. Normal Designer/Guided mode keeps the full 6-120 range.
    let min = 6, max = 120
    if (restrictedReview) {
      const zone = templateConfig?.zones?.find(z => z.id === key)
      const base = generatedFontSizes[key] ?? zone?.fontSize ?? size
      min = Math.max(6, Math.round(base * 0.8))
      max = Math.round(base * 1.2)
    }
    setFontSizes(prev => ({ ...prev, [key]: Math.max(min, Math.min(max, size)) }))
  }

  // Fires once the interactive editor's TemplateCanvas finishes mounting (its
  // own auto-shrink for this template's zones has already run by then — see
  // TemplateCanvas.jsx's onReady). Seeds `fontSizes` with what's REALLY
  // rendered, not the static per-zone default, so the panel's displayed pt
  // number and the +/- stepper's starting point are both accurate from the
  // first render — not just for restricted mode, this was equally wrong
  // (just less visible) in normal Guided mode.
  function handleCanvasReady() {
    const effective = exportRef.current?.getEffectiveFontSizes?.()
    if (!effective) return
    setGeneratedFontSizes(effective)
    setFontSizes(prev => ({ ...effective, ...prev }))
  }

  function handleAlignChange(key, align) {
    pushUndoSnapshot()
    setAlignments(prev => ({ ...prev, [key]: align }))
  }

  function handleImageScaleChange(zoneId, pct) {
    pushUndoSnapshot()
    setImageScales(prev => ({ ...prev, [zoneId]: Math.max(20, Math.min(300, pct)) }))
  }

  // Nudges the photo within its zone (px, in canvas units). TemplateCanvas clamps
  // the applied value to whatever crop slack the current scale allows, so this can't
  // reveal background — over-nudging just has no further visible effect.
  function handleImageOffsetChange(zoneId, axis, delta) {
    pushUndoSnapshot()
    setImagePositions(prev => {
      const cur = prev[zoneId] ?? { x: 0, y: 0 }
      return { ...prev, [zoneId]: { ...cur, [axis]: cur[axis] + delta } }
    })
  }

  // Nudges a text zone within its box (px, in canvas units) — only meaningful
  // in the restricted review mode (see FieldEditor.jsx), where it's the only
  // way to reposition headline/sub_headline since Designer-mode canvas drag
  // is disallowed there. Clamped to a modest range so restricted-mode text
  // can't wander off-canvas with repeated clicks.
  function handleTextNudge(zoneId, axis, delta) {
    pushUndoSnapshot()
    setTextPositions(prev => {
      const cur = prev[zoneId] ?? { x: 0, y: 0 }
      const next = { ...cur, [axis]: Math.max(-40, Math.min(40, cur[axis] + delta)) }
      return { ...prev, [zoneId]: next }
    })
  }

  function handleResetZone(zoneId) {
    exportRef.current?.resetZone?.(zoneId)
    setImageScales(prev => {
      if (!(zoneId in prev)) return prev
      const next = { ...prev }; delete next[zoneId]; return next
    })
    setImagePositions(prev => {
      if (!(zoneId in prev)) return prev
      const next = { ...prev }; delete next[zoneId]; return next
    })
    setTextPositions(prev => {
      if (!(zoneId in prev)) return prev
      const next = { ...prev }; delete next[zoneId]; return next
    })
  }

  // "Reset layout" resets every zone's position on the canvas directly — but image
  // zones' Scale/Position are also driven by imageScales/imagePositions state, which
  // this must clear too. Otherwise the panel keeps showing the old %/offset, and the
  // next unrelated scale/position edit re-syncs the stale values back onto the canvas,
  // silently undoing the reset.
  function handleResetLayout() {
    exportRef.current?.resetLayout?.()
    setImageScales({})
    setImagePositions({})
    setTextPositions({})
  }

  // Guided mode locks the canvas — nothing can be dragged, so a position-only reset
  // has nothing to do. There "Reset" means starting the template over from blank:
  // clears every field/image plus all overrides, and remounts the canvas (loadKey)
  // for a guaranteed-clean slate, same as picking the template fresh.
  function handleResetToBlank() {
    if (!window.confirm('Clear all fields and start over? This cannot be undone.')) return
    historyRef.current = []; setCanUndo(false)
    setFields(DEFAULT_FIELDS)
    setFontSizes({})
    setGeneratedFontSizes({})
    setAlignments({})
    setImageScales({})
    setImagePositions({})
    setTextPositions({})
    setZonePositions({})
    setSaveStatus(null)
    setLoadKey(k => k + 1)
  }

  function handleFieldChange(key, value) {
    pushUndoSnapshot(key)
    setFields(prev => ({ ...prev, [key]: value }))
    setSaveStatus(null) // unsaved changes
  }

  async function handleExport() {
    if (!exportRef.current?.getPng) {
      alert('Canvas not ready — please wait a moment and try again.')
      return
    }
    if (activation && activation.credits <= 0) {
      alert('You have no export credits remaining. Contact Wild Stack to get more.')
      return
    }
    setExporting(true)
    try {
      const png = exportRef.current.getPng()
      const filename = (projectName.trim() || selectedTemplate?.name || 'wildcast-flyer')

      const response = await fetch('/api/export-cmyk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ png, filename }),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: response.statusText }))
        throw new Error(err.error || 'Export failed')
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${filename}.pdf`
      a.click()
      URL.revokeObjectURL(url)

      // Decrement credit after successful export
      if (activation) {
        const newCredits = Math.max(0, activation.credits - 1)
        setActivation(prev => ({ ...prev, credits: newCredits }))
        localStorage.setItem('wildcast_credits', newCredits)
      }
    } catch (err) {
      console.error('Export error:', err)
      alert('Export failed: ' + err.message)
    } finally {
      setExporting(false)
    }
  }

  // Core save — returns the project id. Used by both handleSave and handleSendForReview.
  async function doSave() {
    if (!exportRef.current?.getPng) throw new Error('Canvas not ready — please wait a moment and try again.')

    const fullPng = exportRef.current.getPng()
    const [thumbnail, preview] = await Promise.all([makeThumbnail(fullPng), makePreview(fullPng)])

    const savedFields = { ...fields }
    for (const key of ['logoUrl', 'photoUrl', 'qrUrl']) {
      if (savedFields[key]?.startsWith('blob:')) {
        savedFields[key] = await blobUrlToDataUrl(savedFields[key])
      }
    }

    const id = currentProjectId || crypto.randomUUID()
    const currentZonePositions = exportRef.current?.getZonePositions?.() ?? {}
    // Merge canvas's actual (post-auto-shrink) font sizes with any manual overrides so
    // re-opens restore the exact displayed size regardless of font-loading timing.
    const effectiveFontSizes = exportRef.current?.getEffectiveFontSizes?.() ?? {}
    const fontSizesToSave = { ...fontSizes, ...effectiveFontSizes }
    const name = projectName.trim() || selectedTemplate.name
    const project = {
      id, templateId: selectedTemplate.id, templateName: selectedTemplate.name,
      projectName: name,
      fields: savedFields, fontSizes: fontSizesToSave, alignments, imageScales, imagePositions, zonePositions: currentZonePositions,
      mode: selectedTemplate.mode, savedAt: Date.now(), thumbnail, preview,
    }

    const response = await fetch('/api/save-project', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
    })
    if (!response.ok) throw new Error(await response.text())

    // Write the full project to sessionStorage so re-opens within this session
    // always get the exact saved state — no CDN or browser cache involved.
    try { sessionStorage.setItem(`wildcast_project_${id}`, JSON.stringify(project)) } catch { /* storage full */ }

    setCurrentProjectId(id)
    return id
  }

  async function handleSave() {
    setSaving(true)
    try {
      await doSave()
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus(null), 3000)
    } catch (err) {
      console.error('Save error:', err)
      alert('Save failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // Save from the restricted review editor (a brief-generated candidate) —
  // Julia's ask (2026-08-03): persists via the same doSave()/Designs
  // mechanism as any other save (so an interrupted session isn't lost — it's
  // findable/reopenable/editable from Designs like anything else), but then
  // returns to the "pick a design" screen instead of staying in the editor,
  // since a merchant may want both Option A and B handled, not just one.
  // briefSubmission (App-level, unlike BriefingForm's old local state) is
  // never touched here, so BriefingForm shows the exact same two candidates
  // again rather than a blank form.
  async function handleSaveAndReturnToPicker() {
    setSaving(true)
    try {
      await doSave()
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus(null), 3000)
      setScreen('brief')
    } catch (err) {
      console.error('Save error:', err)
      alert('Save failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleSendForReview() {
    setSaving(true)
    try {
      const id = await doSave()
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus(null), 3000)
      setReviewItems([{ url: `${window.location.origin}/?review=${id}` }])
    } catch (err) {
      console.error('Send for Review error:', err)
      alert('Send for Review failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // Saves + generates a review link directly from a brief-generated candidate,
  // WITHOUT ever opening the interactive editor — Julia's confirmed choice for
  // "Send for Review" on the picker screen (2026-08-03). Deliberately doesn't
  // reuse doSave(): that function depends on exportRef/fields/etc. being the
  // CURRENTLY OPEN editor's live state, which doesn't exist here. Takes the
  // already-captured PNG from TemplateCandidatePicker's off-screen render
  // instead of calling exportRef.current.getPng().
  async function saveCandidateForReview(template, prefilledFields, fullPng) {
    const [thumbnail, preview] = await Promise.all([makeThumbnail(fullPng), makePreview(fullPng)])
    const id = crypto.randomUUID()
    const project = {
      id, templateId: template.id, templateName: template.name,
      projectName: template.name,
      fields: prefilledFields, fontSizes: {}, alignments: {}, imageScales: {}, imagePositions: {}, zonePositions: {},
      mode: template.mode, savedAt: Date.now(), thumbnail, preview,
    }
    const response = await fetch('/api/save-project', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
    })
    if (!response.ok) throw new Error(await response.text())
    try { sessionStorage.setItem(`wildcast_project_${id}`, JSON.stringify(project)) } catch { /* storage full */ }
    return id
  }

  // items: [{ template, fields, png, label }] — one entry per ticked candidate.
  // Ticking both Option A and B produces two independent saved designs and two
  // review links, shown together in the same ReviewModal.
  async function handleSendCandidatesForReview(items) {
    setSaving(true)
    try {
      const ids = await Promise.all(items.map(it => saveCandidateForReview(it.template, it.fields, it.png)))
      setReviewItems(ids.map((id, i) => ({
        url: `${window.location.origin}/?review=${id}`,
        label: items.length > 1 ? items[i].label : undefined,
      })))
    } catch (err) {
      console.error('Send candidates for review error:', err)
      alert('Send for Review failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // Fetches a project's full saved state — sessionStorage first (written on
  // every save, always reflects the exact last-saved state with no CDN or
  // browser cache involved), falling back to a fresh server fetch.
  async function loadFullProject(projectMeta) {
    try {
      const cached = sessionStorage.getItem(`wildcast_project_${projectMeta.id}`)
      if (cached) return JSON.parse(cached)
    } catch { /* corrupted or unavailable — fall through to fetch */ }

    const response = await fetch(`/api/load-project?url=${encodeURIComponent(projectMeta.url)}&_t=${Date.now()}`, { cache: 'no-store' })
    if (!response.ok) throw new Error('Could not load project')
    return response.json()
  }

  // Puts an already-loaded project's full state into the editor. Shared by
  // opening the original and opening a freshly-made duplicate — the only
  // difference between the two is which project object got loaded/created
  // before this runs.
  async function openLoadedProject(project) {
    const template = TEMPLATES.find(t => t.id === project.templateId)
      ?? customTemplates.cards.find(t => t.id === project.templateId)
    if (!template) throw new Error(`Template "${project.templateId}" not found`)

    // Fetch comments directly — can't rely on the useEffect because the
    // project id may not have changed (same project re-opened from Designs)
    let freshComments = []
    try {
      const commRes = await fetch(`/api/comments?id=${project.id}`)
      const commData = await commRes.json()
      freshComments = commData.comments || []
    } catch {}

    historyRef.current = []; setCanUndo(false)
    setRestrictedReview(false)
    setSelectedTemplate(template)
    setFields({ ...DEFAULT_FIELDS, ...(project.fields ?? {}) })
    setFontSizes(project.fontSizes ?? {})
    setAlignments(project.alignments ?? {})
    setImageScales(project.imageScales ?? {})
    setImagePositions(project.imagePositions ?? {})
    setZonePositions(project.zonePositions ?? {})
    setProjectName(project.projectName || template.name)
    setCurrentProjectId(project.id)
    setComments(freshComments)
    setSaveStatus(null)
    setLoadKey(k => k + 1)
    setScreen('editor')
  }

  async function handleOpenProject(projectMeta) {
    const project = await loadFullProject(projectMeta)
    await openLoadedProject(project)
  }

  // Designs are shared across every activation key now — anyone can open
  // anyone else's. Duplicating first (rather than editing in place) is the
  // safety net: it saves a brand-new, independent copy under a fresh id
  // *before* opening it, so continuing to edit can never overwrite someone
  // else's original.
  async function handleDuplicateProject(projectMeta) {
    const original = await loadFullProject(projectMeta)
    const id = crypto.randomUUID()
    const duplicate = {
      ...original,
      id,
      projectName: `${original.projectName || original.templateName} (copy)`,
      savedAt: Date.now(),
    }

    const response = await fetch('/api/save-project', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(duplicate),
    })
    if (!response.ok) throw new Error('Could not save the duplicate')

    try { sessionStorage.setItem(`wildcast_project_${id}`, JSON.stringify(duplicate)) } catch { /* storage full */ }

    await openLoadedProject(duplicate)
  }

  const templateConfig = TEMPLATE_ZONES[selectedTemplate?.id] ?? customTemplates.zonesById[selectedTemplate?.id] ?? null

  // Show activation gate unless already activated or this is a shared review link
  if (!activation && !reviewProjectId) {
    return <ActivationGate onActivated={handleActivated} />
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Header
        onLogoClick={() => setScreen('brief')}
        screen={screen}
        onNavigate={handleNavigate}
        activation={activation}
        onHelp={() => setShowHelp(true)}
      />

      {screen === 'brief' && (
        <BriefingForm
          submitted={briefSubmission}
          onSubmitted={setBriefSubmission}
          onPick={handleSelectGeneratedCandidate}
          onSendForReview={handleSendCandidatesForReview}
        />
      )}

      {screen === 'catalogue' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <TemplatePicker
            mode="catalogue"
            onSelect={handleSelectTemplate}
            customCards={customTemplates.cards}
            customRecords={customTemplates.records}
            canManage={activation?.role === 'designer'}
            onRefetch={refetchCustomTemplates}
            onOptimisticPatch={patchCustomRecord}
          />
        </div>
      )}

      {screen === 'designs' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <DesignsPage onOpenProject={handleOpenProject} onDuplicateProject={handleDuplicateProject} customCards={customTemplates.cards} />
        </div>
      )}

      {screen === 'library' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <LibraryPage />
        </div>
      )}

      {screen === 'import' && activation?.role === 'designer' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <TemplateImportPage customRecords={customTemplates.records} onRefetch={refetchCustomTemplates} onOptimisticPatch={patchCustomRecord} />
        </div>
      )}

      {screen === 'review' && reviewProjectId && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <ReviewPage projectId={reviewProjectId} />
        </div>
      )}

      {screen === 'editor' && (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', height: 'calc(100vh - 58px)' }}>

          {/* Reviewer feedback — left panel, visible when comments exist */}
          {comments.length > 0 && (
            <div style={{ width: 260, flexShrink: 0, borderRight: '1px solid #FDE68A', background: '#FFFBEB', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid #FDE68A', display: 'flex', alignItems: 'center', gap: 7 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#92400E" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Feedback · {comments.length}
                </span>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {comments.map(c => (
                  <div key={c.id} style={{ background: '#fff', borderRadius: 8, padding: '10px 12px', border: '1px solid #FDE68A' }}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--dark)', marginBottom: 3 }}>{c.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--mid)', marginBottom: 6 }}>
                      {new Date(c.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--dark)', lineHeight: 1.6 }}>{c.text}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Breadcrumb */}
            <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span
                onClick={handleBack}
                style={{ fontSize: 13, color: 'var(--mid)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--primary)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--mid)'}
              >
                ← Designs
              </span>
              <span style={{ fontSize: 13, color: 'var(--light)' }}>→</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--dark)' }}>{selectedTemplate?.name}</span>
              {currentProjectId && (
                <span style={{ fontSize: 11, color: 'var(--mid)', background: '#F3F4F6', padding: '2px 8px', borderRadius: 100, marginLeft: 4 }}>
                  Saved
                </span>
              )}
              <div style={{ flex: 1 }} />
              {activation && (
                <span style={{ fontSize: 11, color: 'var(--mid)', background: '#F3F4F6', padding: '3px 10px', borderRadius: 100, border: '1px solid var(--border)' }}>
                  {activation.credits} export{activation.credits !== 1 ? 's' : ''} remaining
                </span>
              )}
              <button
                onClick={handleUndo}
                disabled={!canUndo}
                title="Undo last change (⌘Z)"
                style={{ fontSize: 12, fontWeight: 600, color: canUndo ? 'var(--mid)' : 'var(--light)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', cursor: canUndo ? 'pointer' : 'default', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 4 }}
                onMouseEnter={e => { if (canUndo) { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' } }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = canUndo ? 'var(--mid)' : 'var(--light)' }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
                Undo
              </button>
              {/* Restricted review mode (opened from a brief-generated candidate) has
                  nothing meaningful to reset back to — no blank/start-over concept
                  applies once a finished design was auto-generated, so the whole
                  button is hidden rather than wired to either reset flow. */}
              {!restrictedReview && (
                <button
                  onClick={selectedTemplate?.mode === 'non-designer' ? handleResetToBlank : handleResetLayout}
                  title={selectedTemplate?.mode === 'non-designer' ? 'Clear all fields and start the template over' : 'Reset all text zones to their original positions'}
                  style={{ fontSize: 12, fontWeight: 600, color: 'var(--mid)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', transition: 'all 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--mid)' }}
                >
                  {selectedTemplate?.mode === 'non-designer' ? 'Reset all fields' : 'Reset layout'}
                </button>
              )}
            </div>

            <TemplateCanvas
              key={loadKey}
              config={templateConfig}
              fields={fields}
              onFieldChange={handleFieldChange}
              exportRef={exportRef}
              fontSizes={fontSizes}
              alignments={alignments}
              imageScales={imageScales}
              imagePositions={imagePositions}
              textPositions={textPositions}
              mode={selectedTemplate?.mode ?? 'designer'}
              loadKey={loadKey}
              zonePositions={zonePositions}
              onZoneDragStart={handleZoneDragStart}
              onReady={handleCanvasReady}
            />
          </div>

          <FieldEditor
            fields={fields}
            onChange={handleFieldChange}
            lang={lang}
            onLangChange={setLang}
            onExport={handleExport}
            exporting={exporting}
            template={selectedTemplate}
            templateConfig={templateConfig}
            fontSizes={fontSizes}
            onFontSizeChange={handleFontSizeChange}
            alignments={alignments}
            onAlignChange={handleAlignChange}
            onResetZone={handleResetZone}
            imageScales={imageScales}
            onImageScaleChange={handleImageScaleChange}
            imagePositions={imagePositions}
            onImageOffsetChange={handleImageOffsetChange}
            onTextNudge={handleTextNudge}
            restricted={restrictedReview}
            mode={selectedTemplate?.mode ?? 'designer'}
            onSave={restrictedReview ? handleSaveAndReturnToPicker : handleSave}
            saving={saving}
            saveStatus={saveStatus}
            onSendForReview={handleSendForReview}
            comments={comments}
            currentProjectId={currentProjectId}
            projectName={projectName}
            onProjectNameChange={setProjectName}
          />
        </div>
      )}

      {/* Share / Send for Review modal */}
      {reviewItems && <ReviewModal items={reviewItems} onClose={() => setReviewItems(null)} />}

      {/* Help modal */}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}

      <footer style={{ background: 'var(--dark)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 32px', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '4px 16px', color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>
          <span style={{ whiteSpace: 'nowrap' }}>WildCast — Print templates for Wolt partners.</span>
          <span style={{ whiteSpace: 'nowrap' }}>Built by Wild Stack</span>
        </div>
      </footer>
    </div>
  )
}
