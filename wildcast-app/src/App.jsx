import { useState, useRef } from 'react'
import Header from './components/Header'
import TemplatePicker from './components/TemplatePicker'
import FieldEditor from './components/FieldEditor'
import TemplateCanvas from './components/TemplateCanvas'
import { TEMPLATE_ZONES } from './data/templateZones'

const DEFAULT_FIELDS = {
  headline:     '',
  offer:        '',
  sub_headline: '',
  tc:           '',
  logoUrl:      null,
  photoUrl:     null,
  qrUrl:        null,
}

export default function App() {
  const [screen, setScreen] = useState('picker')
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [fields, setFields] = useState(DEFAULT_FIELDS)
  const [lang, setLang] = useState('de')
  const [exporting, setExporting] = useState(false)
  const [fontSizes, setFontSizes] = useState({})
  const [alignments, setAlignments] = useState({})
  const exportRef = useRef(null)

  function handleSelectTemplate(template) {
    setSelectedTemplate(template)
    setFields(DEFAULT_FIELDS)
    setFontSizes({})
    setAlignments({})
    setScreen('editor')
  }

  function handleFontSizeChange(key, size) {
    setFontSizes(prev => ({ ...prev, [key]: Math.max(6, Math.min(120, size)) }))
  }

  function handleAlignChange(key, align) {
    setAlignments(prev => ({ ...prev, [key]: align }))
  }

  function handleFieldChange(key, value) {
    setFields(prev => ({ ...prev, [key]: value }))
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

  const templateConfig = TEMPLATE_ZONES[selectedTemplate?.id] ?? null

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header onLogoClick={() => setScreen('picker')} />

      {screen === 'picker' && (
        <TemplatePicker onSelect={handleSelectTemplate} />
      )}

      {screen === 'editor' && (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', height: 'calc(100vh - 58px)' }}>

          {/* Left panel: canvas */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Breadcrumb */}
            <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span onClick={() => setScreen('picker')} style={{ fontSize: 13, color: 'var(--mid)', cursor: 'pointer' }}>Templates</span>
              <span style={{ fontSize: 13, color: 'var(--light)' }}>→</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--dark)' }}>{selectedTemplate?.name}</span>
            </div>

            <TemplateCanvas
              config={templateConfig}
              fields={fields}
              onFieldChange={handleFieldChange}
              exportRef={exportRef}
              fontSizes={fontSizes}
              alignments={alignments}
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
