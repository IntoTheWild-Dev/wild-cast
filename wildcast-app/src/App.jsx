import { useState, useRef, useEffect } from 'react'
import Header from './components/Header'
import TemplatePicker from './components/TemplatePicker'
import FieldEditor from './components/FieldEditor'
import TemplateCanvas from './components/TemplateCanvas'
import DesignsPage from './components/DesignsPage'
import ReviewPage from './components/ReviewPage'
import { TEMPLATE_ZONES } from './data/templateZones'
import { TEMPLATES } from './data/templates'

const STORAGE_KEY = 'wildcast_projects'

const DEFAULT_FIELDS = {
  headline:     '',
  offer:        '',
  sub_headline: '',
  tc:           '',
  logoUrl:      null,
  photoUrl:     null,
  qrUrl:        null,
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

// Convert a blob: URL to a compressed data URL for storage.
// Resizes to max 1500px and re-encodes as JPEG (photos) or PNG (logos with transparency).
// Keeps base64 payload well under Vercel's 4.5MB function body limit.
async function blobUrlToDataUrl(blobUrl) {
  const res = await fetch(blobUrl)
  const blob = await res.blob()
  const isPng = blob.type === 'image/png'

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const MAX = 1500
      let w = img.naturalWidth, h = img.naturalHeight
      if (Math.max(w, h) > MAX) {
        const scale = MAX / Math.max(w, h)
        w = Math.round(w * scale)
        h = Math.round(h * scale)
      }
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      // Keep PNG for logos (preserves transparency); JPEG for photos
      resolve(canvas.toDataURL(isPng ? 'image/png' : 'image/jpeg', 0.82))
    }
    img.onerror = reject
    img.src = URL.createObjectURL(blob)
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
  const [showCatalogue, setShowCatalogue]     = useState(false)
  const [fromCatalogue, setFromCatalogue]     = useState(false)
  const [currentProjectId, setCurrentProjectId] = useState(null)
  const [saving, setSaving]                   = useState(false)
  const [saveStatus, setSaveStatus]           = useState(null) // null | 'saved'
  const [reviewUrl, setReviewUrl]             = useState(null) // share modal URL
  const [reviewProjectId, setReviewProjectId] = useState(null) // from ?review= param
  const [comments, setComments]               = useState([])
  const exportRef = useRef(null)

  // Detect ?review=<id> in URL and switch to review screen
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const rid = params.get('review')
    if (rid) { setReviewProjectId(rid); setScreen('review') }
  }, [])

  // Fetch comments whenever the open project changes
  useEffect(() => {
    if (!currentProjectId) { setComments([]); return }
    fetch(`/api/get-comments?id=${currentProjectId}`)
      .then(r => r.json())
      .then(d => setComments(d.comments || []))
      .catch(() => {})
  }, [currentProjectId])

  function handleSelectTemplate(template, source) {
    setSelectedTemplate(template)
    setFields(DEFAULT_FIELDS)
    setFontSizes({})
    setAlignments({})
    setImageScales({})
    setCurrentProjectId(null)
    setFromCatalogue(source === 'catalogue')
    setSaveStatus(null)
    setScreen('editor')
  }

  function handleBack() {
    if (fromCatalogue) setShowCatalogue(true)
    else setShowCatalogue(false)
    setScreen('picker')
  }

  function handleNavigate(target) {
    if (target === 'picker') { setScreen('picker'); setShowCatalogue(false) }
    else if (target === 'designs') setScreen('designs')
  }

  function handleFontSizeChange(key, size) {
    setFontSizes(prev => ({ ...prev, [key]: Math.max(6, Math.min(120, size)) }))
  }

  function handleAlignChange(key, align) {
    setAlignments(prev => ({ ...prev, [key]: align }))
  }

  function handleImageScaleChange(zoneId, pct) {
    setImageScales(prev => ({ ...prev, [zoneId]: Math.max(20, Math.min(300, pct)) }))
  }

  function handleResetZone(zoneId) {
    exportRef.current?.resetZone?.(zoneId)
  }

  function handleFieldChange(key, value) {
    setFields(prev => ({ ...prev, [key]: value }))
    setSaveStatus(null) // unsaved changes
  }

  async function handleExport() {
    if (!exportRef.current?.getPng) {
      alert('Canvas not ready — please wait a moment and try again.')
      return
    }
    setExporting(true)
    try {
      const png = exportRef.current.getPng()
      const a = document.createElement('a')
      a.href = png
      a.download = `wildcast-${selectedTemplate?.id ?? 'export'}.png`
      a.click()
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
    const project = {
      id, templateId: selectedTemplate.id, templateName: selectedTemplate.name,
      fields: savedFields, fontSizes, alignments, imageScales,
      mode: selectedTemplate.mode, savedAt: Date.now(), thumbnail, preview,
    }

    const response = await fetch('/api/save-project', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
    })
    if (!response.ok) throw new Error(await response.text())
    const { url } = await response.json()

    const meta = { id, url, templateName: selectedTemplate.name, savedAt: project.savedAt, thumbnail }
    const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    localStorage.setItem(STORAGE_KEY, JSON.stringify([meta, ...existing.filter(p => p.id !== id)].slice(0, 50)))

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
    const response = await fetch(`/api/load-project?url=${encodeURIComponent(projectMeta.url)}`)
    if (!response.ok) throw new Error('Could not load project')
    const project = await response.json()

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

    setSelectedTemplate(template)
    setFields(project.fields ?? DEFAULT_FIELDS)
    setFontSizes(project.fontSizes ?? {})
    setAlignments(project.alignments ?? {})
    setImageScales(project.imageScales ?? {})
    setCurrentProjectId(project.id)
    setComments(freshComments)
    setSaveStatus(null)
    setFromCatalogue(false)
    setScreen('editor')
  }

  const templateConfig = TEMPLATE_ZONES[selectedTemplate?.id] ?? null

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header
        onLogoClick={() => { setScreen('picker'); setShowCatalogue(false) }}
        screen={screen}
        onNavigate={handleNavigate}
      />

      {screen === 'picker' && (
        <TemplatePicker
          onSelect={(t) => handleSelectTemplate(t, 'picker')}
          onSelectFromCatalogue={(t) => handleSelectTemplate(t, 'catalogue')}
          showCatalogue={showCatalogue}
          onShowCatalogueChange={setShowCatalogue}
        />
      )}

      {screen === 'designs' && (
        <DesignsPage onOpenProject={handleOpenProject} />
      )}

      {screen === 'review' && reviewProjectId && (
        <ReviewPage projectId={reviewProjectId} />
      )}

      {screen === 'editor' && (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', height: 'calc(100vh - 58px)' }}>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Breadcrumb */}
            <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span
                onClick={handleBack}
                style={{ fontSize: 13, color: 'var(--mid)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--primary)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--mid)'}
              >
                ← {fromCatalogue ? 'Catalogue' : 'Templates'}
              </span>
              <span style={{ fontSize: 13, color: 'var(--light)' }}>→</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--dark)' }}>{selectedTemplate?.name}</span>
              {currentProjectId && (
                <span style={{ fontSize: 11, color: 'var(--mid)', background: '#F3F4F6', padding: '2px 8px', borderRadius: 100, marginLeft: 4 }}>
                  Saved
                </span>
              )}
              <div style={{ flex: 1 }} />
              <button
                onClick={() => exportRef.current?.resetLayout?.()}
                title="Reset all text zones to their original positions"
                style={{ fontSize: 12, fontWeight: 600, color: 'var(--mid)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--mid)' }}
              >
                Reset layout
              </button>
            </div>

            <TemplateCanvas
              config={templateConfig}
              fields={fields}
              onFieldChange={handleFieldChange}
              exportRef={exportRef}
              fontSizes={fontSizes}
              alignments={alignments}
              imageScales={imageScales}
              mode={selectedTemplate?.mode ?? 'designer'}
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
            mode={selectedTemplate?.mode ?? 'designer'}
            onSave={handleSave}
            saving={saving}
            saveStatus={saveStatus}
            onSendForReview={handleSendForReview}
            comments={comments}
            currentProjectId={currentProjectId}
          />
        </div>
      )}

      {/* Share / Send for Review modal */}
      {reviewUrl && <ReviewModal url={reviewUrl} onClose={() => setReviewUrl(null)} />}

      <footer style={{ background: 'var(--dark)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>
          <span>WildCast — Print templates for Wolt partners.</span>
          <span>Built by Wild Stack</span>
        </div>
      </footer>
    </div>
  )
}
