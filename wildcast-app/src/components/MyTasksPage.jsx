import { useState, useEffect } from 'react'
import { PAGE_PADDING_X } from '../lib/layout'
import PageSpinner from './PageSpinner'

// "Review queue in the user profile" (Notion card, 2026-09-22): "A simple
// task board under the profile. Each asset shows its state: under design,
// under review, approved. No more than that." Deliberately no search, no
// filters beyond the fixed status columns below - just "my own designs,
// grouped by where they are." A fourth column was added 2026-09-23 (Mark's
// ask via Julia) once "under review" needed to distinguish "still waiting
// on a first look" from "reviewer sent it back."
const STATUS_COLUMNS = [
  { key: 'design',             label: 'Under design' },
  // Relabeled 2026-09-23 (Julia) for plainer, more encouraging language -
  // same 'review'/'changes_requested' keys underneath, just clearer wording.
  { key: 'review',             label: 'Ready for review' },
  // "Request changes" (Mark's ask via Julia, 2026-09-23) - its own column so
  // a design sent back by a reviewer doesn't blend into "Ready for review",
  // where it would look identical to one still just waiting on a first look.
  { key: 'changes_requested',  label: 'Adjustment needed' },
  { key: 'approved',           label: 'Approved' },
]

// "First round vs second round" color-coding on the review column (Julia's
// ask, 2026-09-23): a card whose design has already been sent back for
// changes at least once reads differently from one still on its first pass
// - both grey by default, the review column's cards go amber/yellow once
// project.everRequestedChanges is true (set server-side, sticky - see
// api/save-project.js). Scoped to the 'review' column only, matching her
// wording ("first/second round review").
const REVIEW_ROUND_COLOR = '#D97706'

function formatDate(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function TaskCard({ project, opening, onOpen, borderColor = 'var(--border)' }) {
  return (
    <div
      onClick={() => onOpen(project)}
      style={{
        background: '#fff', border: `${borderColor === 'var(--border)' ? 1 : 2}px solid ${borderColor}`, borderRadius: 10, overflow: 'hidden',
        cursor: opening ? 'default' : 'pointer', display: 'flex', gap: 10, padding: 8,
        opacity: opening ? 0.7 : 1, transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => { if (!opening) e.currentTarget.style.borderColor = 'var(--primary)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = borderColor }}
    >
      <div style={{ width: 44, height: 62, flexShrink: 0, background: '#00C2CB', borderRadius: 6, overflow: 'hidden' }}>
        {project.thumbnail && (
          <img src={project.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        )}
      </div>
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div
          title={project.projectName || project.templateName}
          style={{ fontWeight: 700, fontSize: 13, color: 'var(--dark)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {opening ? 'Opening…' : (project.projectName || project.templateName)}
        </div>
        <div style={{ fontSize: 11, color: 'var(--mid)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {project.merchant} · {formatDate(project.savedAt)}
        </div>
      </div>
    </div>
  )
}

export default function MyTasksPage({ onOpenProject, activation, onBack }) {
  const [projects, setProjects] = useState([])
  const [loading, setLoading]   = useState(true)
  const [openingId, setOpeningId] = useState(null)

  useEffect(() => {
    fetch('/api/save-project')
      .then(r => r.json())
      .then(d => setProjects(d.projects || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Same ownership identity DesignsPage/Folders already use - activation.key
  // is the shared activation key string or, for an individual account, the
  // signed-in email (see App.jsx's own activation shape).
  const mine = projects.filter(p => activation?.key && p.ownerEmail === activation.key)

  async function handleOpen(project) {
    if (openingId) return
    setOpeningId(project.id)
    try {
      await onOpenProject(project)
    } catch (err) {
      alert('Could not open this design: ' + err.message)
    } finally {
      setOpeningId(null)
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'auto' }}>

      {/* Page header - same shape as LibraryPage/DesignsPage's own */}
      <div style={{ borderBottom: '1px solid var(--border)', padding: `28px ${PAGE_PADDING_X} 24px`, background: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--dark)' }}>My Tasks</h1>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--mid)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit', flexShrink: 0 }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--mid)' }}
            >
              ← Back
            </button>
          )}
        </div>
      </div>

      {loading ? <PageSpinner label="Loading your tasks…" /> : (
      <div style={{ padding: `28px ${PAGE_PADDING_X}`, flex: 1 }}>
        {!activation?.key ? (
          <div style={{ color: 'var(--mid)', fontSize: 13 }}>Sign in to see your tasks.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 28 }}>
            {STATUS_COLUMNS.map(col => {
              const items = mine.filter(p => (p.reviewStatus || 'design') === col.key)
              return (
                <div key={col.key}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--mid)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
                    {col.label} · {items.length}
                  </div>
                  {items.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--light)' }}>Nothing here</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {items.map(p => (
                        <TaskCard
                          key={p.id}
                          project={p}
                          opening={openingId === p.id}
                          onOpen={handleOpen}
                          borderColor={col.key === 'review' && p.everRequestedChanges ? REVIEW_ROUND_COLOR : undefined}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
      )}
    </div>
  )
}
