import { useState, useRef, useEffect } from 'react'
import Header from './components/Header'
import ActivationGate from './components/ActivationGate'
import HelpModal from './components/HelpModal'
import TemplatePicker from './components/TemplatePicker'
import FieldEditor from './components/FieldEditor'
import TemplateCanvas from './components/TemplateCanvas'
import DesignsPage from './components/DesignsPage'
import LibraryPage from './components/LibraryPage'
import ReviewPage from './components/ReviewPage'
import { TEMPLATE_ZONES } from './data/templateZones'
import { TEMPLATES } from './data/templates'
import { blobUrlToDataUrl } from './lib/image'

const STORAGE_KEY = 'wildcast_projects'

const DEFAULT_FIELDS = {
  headline:        '',
  offer:           '',
  sub_headline:    '',
  restaurant_name: '',
  tc:              '',
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

function ReviewModal({ url, onClose }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 32, maxWidth: 440, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--dark)', marginBottom: 6 }}>Ready to share</div>
        <div style={{ fontSize: 13, color: 'var(--mid)', marginBottom: 20, lineHeight: 1.5 }}>
          Send this link to your client or team. They can view the design and leave comments.
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            value={url} readOnly
            style={{ flex: 1, padding: '10px 12px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 8, background: '#F9FAFB', color: 'var(--dark)', fontFamily: 'inherit' }}
            onClick={e => e.target.select()}
          />
          <button
            onClick={copy}
            style={{ padding: '10px 16px', background: copied ? '#16a34a' : 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700, flexShrink: 0, transition: 'background 0.2s', minWidth: 70 }}
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
        <button
          onClick={onClose}
          style={{ width: '100%', padding: '10px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: 'var(--mid)', fontFamily: 'inherit' }}
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
  const [screen, setScreen]                   = useState('picker')
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [fields, setFields]                   = useState(DEFAULT_FIELDS)
  const [lang, setLang]                       = useState('de')
  const [exporting, setExporting]             = useState(false)
  const [fontSizes, setFontSizes]             = useState({})
  const [alignments, setAlignments]           = useState({})
  const [imageScales, setImageScales]         = useState({})
  const [imagePositions, setImagePositions]   = useState({})
  const [zonePositions, setZonePositions]     = useState({})
  const [projectName, setProjectName]         = useState('')
  const [currentProjectId, setCurrentProjectId] = useState(null)
  const [saving, setSaving]                   = useState(false)
  const [saveStatus, setSaveStatus]           = useState(null) // null | 'saved'
  const [loadKey, setLoadKey]                 = useState(0)    // increments on project load to reset auto-shrink
  const [reviewUrl, setReviewUrl]             = useState(null) // share modal URL
  const [reviewProjectId, setReviewProjectId] = useState(null) // from ?review= param
  const [comments, setComments]               = useState([])
  // activation: null = not yet validated, object = { key, clientName, credits }
  const [activation, setActivation]           = useState(null)
  const [showHelp, setShowHelp]               = useState(false)
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
      { fields: { ...fieldsRef.current }, fontSizes: { ...fontSizesRef2.current }, alignments: { ...alignmentsRef2.current }, imageScales: { ...imageScalesRef2.current }, imagePositions: { ...imagePositionsRef2.current } },
    ]
    setCanUndo(true)
  }

  function handleUndo() {
    const snapshot = historyRef.current.pop()
    if (!snapshot) return
    setFields(snapshot.fields)
    setFontSizes(snapshot.fontSizes)
    setAlignments(snapshot.alignments)
    setImageScales(snapshot.imageScales)
    setImagePositions(snapshot.imagePositions ?? {})
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
          setActivation({ key: savedKey, clientName: data.client_name, credits })
        } else {
          localStorage.removeItem('wildcast_activation_key')
          localStorage.removeItem('wildcast_credits')
        }
      })
      .catch(() => {
        // Network error on restore — treat as activated using cached credits so the
        // app still works offline/slow connections after a valid prior session.
        const savedCredits = parseInt(localStorage.getItem('wildcast_credits'), 10)
        if (Number.isFinite(savedCredits)) {
          setActivation({ key: savedKey, clientName: '', credits: savedCredits })
        }
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleActivated({ key, clientName, credits }) {
    setActivation({ key, clientName, credits })
  }

  // Fetch comments whenever the open project changes
  useEffect(() => {
    if (!currentProjectId) { setComments([]); return }
    fetch(`/api/get-comments?id=${currentProjectId}`)
      .then(r => r.json())
      .then(d => setComments(d.comments || []))
      .catch(() => {})
  }, [currentProjectId])

  function handleSelectTemplate(template) {
    historyRef.current = []; setCanUndo(false)
    setSelectedTemplate(template)
    setFields(DEFAULT_FIELDS)
    setFontSizes({})
    setAlignments({})
    setImageScales({})
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
    if (target === 'picker') setScreen('picker')
    else if (target === 'catalogue') setScreen('catalogue')
    else if (target === 'designs') setScreen('designs')
    else if (target === 'library') setScreen('library')
  }

  function handleFontSizeChange(key, size) {
    pushUndoSnapshot()
    setFontSizes(prev => ({ ...prev, [key]: Math.max(6, Math.min(120, size)) }))
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
    const { url } = await response.json()

    const meta = { id, url, templateName: selectedTemplate.name, projectName: name, savedAt: project.savedAt, thumbnail }
    const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    localStorage.setItem(STORAGE_KEY, JSON.stringify([meta, ...existing.filter(p => p.id !== id)].slice(0, 50)))

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

  async function handleSendForReview() {
    setSaving(true)
    try {
      const id = await doSave()
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus(null), 3000)
      setReviewUrl(`${window.location.origin}/?review=${id}`)
    } catch (err) {
      console.error('Send for Review error:', err)
      alert('Send for Review failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleOpenProject(projectMeta) {
    // Check sessionStorage first — written directly on every save, so it always
    // reflects the exact last saved state with no CDN or browser cache involved.
    let project = null
    try {
      const cached = sessionStorage.getItem(`wildcast_project_${projectMeta.id}`)
      if (cached) project = JSON.parse(cached)
    } catch { /* corrupted or unavailable — fall through to fetch */ }

    if (!project) {
      const response = await fetch(`/api/load-project?url=${encodeURIComponent(projectMeta.url)}&_t=${Date.now()}`, { cache: 'no-store' })
      if (!response.ok) throw new Error('Could not load project')
      project = await response.json()
    }

    const template = TEMPLATES.find(t => t.id === project.templateId)
    if (!template) throw new Error(`Template "${project.templateId}" not found`)

    // Fetch comments directly — can't rely on the useEffect because the
    // project id may not have changed (same project re-opened from Designs)
    let freshComments = []
    try {
      const commRes = await fetch(`/api/get-comments?id=${project.id}`)
      const commData = await commRes.json()
      freshComments = commData.comments || []
    } catch {}

    historyRef.current = []; setCanUndo(false)
    setSelectedTemplate(template)
    setFields(project.fields ?? DEFAULT_FIELDS)
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

  const templateConfig = TEMPLATE_ZONES[selectedTemplate?.id] ?? null

  // Show activation gate unless already activated or this is a shared review link
  if (!activation && !reviewProjectId) {
    return <ActivationGate onActivated={handleActivated} />
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Header
        onLogoClick={() => setScreen('picker')}
        screen={screen}
        onNavigate={handleNavigate}
        activation={activation}
        onHelp={() => setShowHelp(true)}
      />

      {screen === 'picker' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <TemplatePicker mode="hero" onSelect={handleSelectTemplate} />
        </div>
      )}

      {screen === 'catalogue' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <TemplatePicker mode="catalogue" onSelect={handleSelectTemplate} />
        </div>
      )}

      {screen === 'designs' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <DesignsPage onOpenProject={handleOpenProject} />
        </div>
      )}

      {screen === 'library' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <LibraryPage />
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
              <button
                onClick={handleResetLayout}
                title="Reset all text zones to their original positions"
                style={{ fontSize: 12, fontWeight: 600, color: 'var(--mid)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--mid)' }}
              >
                Reset layout
              </button>
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
              mode={selectedTemplate?.mode ?? 'designer'}
              loadKey={loadKey}
              zonePositions={zonePositions}
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
            mode={selectedTemplate?.mode ?? 'designer'}
            onSave={handleSave}
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
      {reviewUrl && <ReviewModal url={reviewUrl} onClose={() => setReviewUrl(null)} />}

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
