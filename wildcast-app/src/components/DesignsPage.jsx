import { useState, useEffect } from 'react'

const STORAGE_KEY = 'wildcast_projects'

function formatDate(ts) {
  const d = new Date(ts)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function EmptyState() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🎨</div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--dark)', marginBottom: 6 }}>No saved designs yet</div>
        <div style={{ fontSize: 13, color: 'var(--mid)', maxWidth: 280 }}>Open a template, fill in your content, and click Save — it will appear here.</div>
      </div>
    </div>
  )
}

export default function DesignsPage({ onOpenProject }) {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(null) // project id being loaded

  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    setProjects(stored)
  }, [])

  async function handleDelete(id, e) {
    e.stopPropagation()
    if (!window.confirm('Delete this design? This cannot be undone.')) return
    // Remove from UI and localStorage immediately
    const updated = projects.filter(p => p.id !== id)
    setProjects(updated)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    // Delete from Vercel Blob in the background (project JSON + comments)
    fetch(`/api/delete-project?id=${id}`, { method: 'DELETE' }).catch(() => {})
  }

  async function handleOpen(project) {
    setLoading(project.id)
    try {
      await onOpenProject(project)
    } finally {
      setLoading(null)
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'auto' }}>

      {/* Page header */}
      <div style={{ borderBottom: '1px solid var(--border)', padding: '28px 40px 24px', background: '#fff' }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--dark)' }}>Designs</h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--mid)' }}>
          {projects.length === 0
            ? 'Saved designs will appear here — pick up where you left off.'
            : `${projects.length} saved design${projects.length === 1 ? '' : 's'}`}
        </p>
      </div>

      {projects.length === 0 ? (
        <EmptyState />
      ) : (
        <div style={{ padding: 40, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 24, alignContent: 'start' }}>
          {projects.map(project => (
            <div
              key={project.id}
              onClick={() => handleOpen(project)}
              style={{
                background: '#fff',
                border: '1px solid var(--border)',
                borderRadius: 12,
                overflow: 'hidden',
                cursor: loading === project.id ? 'default' : 'pointer',
                transition: 'box-shadow 0.15s, transform 0.15s',
                position: 'relative',
                opacity: loading === project.id ? 0.7 : 1,
              }}
              onMouseEnter={e => {
                if (loading !== project.id) {
                  e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.1)'
                  e.currentTarget.style.transform = 'translateY(-2px)'
                }
              }}
              onMouseLeave={e => {
                e.currentTarget.style.boxShadow = 'none'
                e.currentTarget.style.transform = 'none'
              }}
            >
              {/* Thumbnail */}
              <div style={{ background: '#00C2CB', aspectRatio: '316 / 441', overflow: 'hidden', position: 'relative' }}>
                {project.thumbnail ? (
                  <img
                    src={project.thumbnail}
                    alt={project.templateName}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
                    No preview
                  </div>
                )}
                {loading === project.id && (
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ color: '#fff', fontSize: 12 }}>Opening…</span>
                  </div>
                )}
              </div>

              {/* Info */}
              <div style={{ padding: '12px 14px 14px' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--dark)', marginBottom: 3, wordBreak: 'break-word' }}>{project.projectName || project.templateName}</div>
                <div style={{ fontSize: 11, color: 'var(--mid)' }}>Saved {formatDate(project.savedAt)}</div>
                <button
                  style={{
                    marginTop: 12, width: '100%', padding: '8px', fontSize: 12, fontWeight: 700,
                    background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8,
                    cursor: 'pointer', transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-dark)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'var(--primary)'}
                  onClick={e => { e.stopPropagation(); handleOpen(project) }}
                >
                  {loading === project.id ? 'Opening…' : 'Continue editing'}
                </button>
              </div>

              {/* Delete */}
              <button
                onClick={e => handleDelete(project.id, e)}
                title="Remove from Designs"
                style={{
                  position: 'absolute', top: 8, right: 8,
                  width: 24, height: 24, borderRadius: '50%',
                  background: 'rgba(0,0,0,0.45)', color: '#fff', border: 'none',
                  cursor: 'pointer', fontSize: 13, lineHeight: 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: 0, transition: 'opacity 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                onMouseLeave={e => e.currentTarget.style.opacity = '0'}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

    </div>
  )
}
