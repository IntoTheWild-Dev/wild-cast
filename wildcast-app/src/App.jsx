import { useState, useRef } from 'react'
import Header from './components/Header'
import TemplatePicker from './components/TemplatePicker'
import FieldEditor from './components/FieldEditor'
import TemplateCanvas from './components/TemplateCanvas'
import DesignsPage from './components/DesignsPage'
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
  const exportRef = useRef(null)

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

  async function handleSave() {
    if (!exportRef.current?.getPng) {
      alert('Canvas not ready — please wait a moment and try again.')
      return
    }
    setSaving(true)
    try {
      // Thumbnail from canvas (guides already hidden by getPng)
      const fullPng = exportRef.current.getPng()
      const thumbnail = await makeThumbnail(fullPng)

      // Convert any ephemeral blob: URLs to persistent data URLs
      const savedFields = { ...fields }
      for (const key of ['logoUrl', 'photoUrl', 'qrUrl']) {
        if (savedFields[key]?.startsWith('blob:')) {
          savedFields[key] = await blobUrlToDataUrl(savedFields[key])
        }
      }

      const id = currentProjectId || crypto.randomUUID()
      const project = {
        id,
        templateId:   selectedTemplate.id,
        templateName: selectedTemplate.name,
        fields:       savedFields,
        fontSizes,
        alignments,
        imageScales,
        mode:         selectedTemplate.mode,
        savedAt:      Date.now(),
        thumbnail,
      }

      const response = await fetch('/api/save-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(project),
      })
      if (!response.ok) throw new Error(await response.text())
      const { url } = await response.json()

      // Update localStorage registry (most recent first, cap at 50)
      const meta = { id, url, templateName: selectedTemplate.name, savedAt: project.savedAt, thumbnail }
      const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
      const updated = [meta, ...existing.filter(p => p.id !== id)].slice(0, 50)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))

      setCurrentProjectId(id)
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus(null), 3000)
    } catch (err) {
      console.error('Save error:', err)
      alert('Save failed: ' + err.message)
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

    setSelectedTemplate(template)
    setFields(project.fields ?? DEFAULT_FIELDS)
    setFontSizes(project.fontSizes ?? {})
    setAlignments(project.alignments ?? {})
    setImageScales(project.imageScales ?? {})
    setCurrentProjectId(project.id)
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
          />
        </div>
      )}

      <footer style={{ background: 'var(--dark)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>
          <span>WildCast — Print templates for Wolt partners.</span>
          <span>Built by Wild Stack</span>
        </div>
      </footer>
    </div>
  )
}
