import { useState, useRef } from 'react'
import Header from './components/Header'
import TemplatePicker from './components/TemplatePicker'
import FieldEditor from './components/FieldEditor'
import PreviewCanvas from './components/PreviewCanvas'

const DEFAULT_FIELDS = {
  headline: '',
  offer: '',
  sub_headline: '',
  tc: '',
  logoUrl: null,
  photoUrl: null,
  qrUrl: null,
}

export default function App() {
  const [screen, setScreen] = useState('picker')
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [fields, setFields] = useState(DEFAULT_FIELDS)
  const [lang, setLang] = useState('de')
  const [pdfUrl, setPdfUrl] = useState(null)
  const fileInputRef = useRef(null)

  function handleSelectTemplate(template) {
    setSelectedTemplate(template)
    setFields(DEFAULT_FIELDS)
    // Auto-load the template's bundled PDF
    setPdfUrl(template.pdfPath ?? null)
    setScreen('editor')
  }

  function handleFieldChange(key, value) {
    setFields(prev => ({ ...prev, [key]: value }))
  }

  function handlePdfImport(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setPdfUrl(URL.createObjectURL(file))
  }

  function handleExport() {
    alert('PDF export coming soon — this will trigger the CMYK pipeline via Ghostscript.')
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header onLogoClick={() => setScreen('picker')} />

      {screen === 'picker' && (
        <TemplatePicker onSelect={handleSelectTemplate} />
      )}

      {screen === 'editor' && (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', height: 'calc(100vh - 58px)' }}>

          {/* Left: breadcrumb + PDF preview */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Breadcrumb */}
            <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span onClick={() => setScreen('picker')} style={{ fontSize: 13, color: 'var(--mid)', cursor: 'pointer' }}>Templates</span>
              <span style={{ fontSize: 13, color: 'var(--light)' }}>→</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--dark)' }}>{selectedTemplate?.name}</span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={{ fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 7, cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--mid)', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                  </svg>
                  Replace PDF
                </button>
                <input ref={fileInputRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={handlePdfImport} />
              </div>
            </div>

            <PreviewCanvas fields={fields} pdfUrl={pdfUrl} />
          </div>

          <FieldEditor
            fields={fields}
            onChange={handleFieldChange}
            lang={lang}
            onLangChange={setLang}
            onExport={handleExport}
            template={selectedTemplate}
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
