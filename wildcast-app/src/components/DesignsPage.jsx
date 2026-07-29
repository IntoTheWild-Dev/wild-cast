import { useState, useEffect, useMemo } from 'react'
import { TEMPLATES } from '../data/templates'

const ALL = '__all__'

function formatDate(ts) {
  const d = new Date(ts)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Merges the static template cards with any Figma-imported ones into one
// id -> {cat, format} lookup — both arrays already carry these fields per
// card (see src/data/templates.js and customTemplateCards() in
// src/lib/customTemplates.js), so no extra data needs to be saved onto a
// project itself to know what kind of design it is.
function buildTemplateInfo(customCards) {
  const map = {}
  for (const t of TEMPLATES) map[t.id] = { cat: t.cat, format: t.format }
  for (const t of customCards) map[t.id] = { cat: t.cat, format: t.format }
  return map
}

function groupLabel(info) {
  if (!info?.cat || !info?.format) return 'Other'
  const cap = info.cat.charAt(0).toUpperCase() + info.cat.slice(1)
  return `${cap} ${info.format}`
}

function EmptyState({ title, desc }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🎨</div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--dark)', marginBottom: 6 }}>{title}</div>
        <div style={{ fontSize: 13, color: 'var(--mid)', maxWidth: 280 }}>{desc}</div>
      </div>
    </div>
  )
}

// Shown before any design renders — Julia's ask: search by format + merchant
// as a popup gate, not just inline filters, now that Designs shows everyone's
// saved work instead of just whoever's browser it's in. Defaults to "All" on
// both, so clicking straight through shows everything, same as skipping.
function FilterPopup({ formatOptions, merchantOptions, onApply }) {
  const [format, setFormat] = useState(ALL)
  const [merchant, setMerchant] = useState(ALL)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 420, maxWidth: '100%', boxShadow: '0 24px 80px rgba(0,0,0,0.2)' }}>
        <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--dark)', margin: '0 0 4px', letterSpacing: '-0.02em' }}>Find a design</h3>
        <p style={{ fontSize: 13, color: 'var(--mid)', margin: '0 0 20px' }}>Narrow it down, or leave both on "All" to see everything.</p>

        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--dark)', marginBottom: 6 }}>Format</label>
        <select
          value={format}
          onChange={e => setFormat(e.target.value)}
          style={{ width: '100%', padding: '10px 12px', fontSize: 13, fontFamily: 'inherit', border: '1.5px solid var(--border)', borderRadius: 8, outline: 'none', background: '#fff', marginBottom: 16 }}
        >
          <option value={ALL}>All formats</option>
          {formatOptions.map(f => <option key={f} value={f}>{f}</option>)}
        </select>

        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--dark)', marginBottom: 6 }}>Merchant</label>
        <select
          value={merchant}
          onChange={e => setMerchant(e.target.value)}
          style={{ width: '100%', padding: '10px 12px', fontSize: 13, fontFamily: 'inherit', border: '1.5px solid var(--border)', borderRadius: 8, outline: 'none', background: '#fff' }}
        >
          <option value={ALL}>All merchants</option>
          {merchantOptions.map(m => <option key={m} value={m}>{m}</option>)}
        </select>

        <button
          onClick={() => onApply({ format, merchant })}
          style={{ marginTop: 22, width: '100%', padding: '13px', fontSize: 14, fontWeight: 700, background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer' }}
        >
          Show designs
        </button>
      </div>
    </div>
  )
}

// Designs are shared across every activation key now, with no ownership
// boundary — so opening one always asks first rather than editing the
// original in place, since anyone might be picking up someone else's saved
// work. Duplicating creates an independent copy up front; only "Edit
// original" touches the source record.
function ConfirmOpenModal({ project, busy, onEditOriginal, onDuplicate, onCancel }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 420, maxWidth: '100%', boxShadow: '0 24px 80px rgba(0,0,0,0.2)' }}>
        <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--dark)', margin: '0 0 4px', letterSpacing: '-0.02em' }}>
          {project.projectName || project.templateName}
        </h3>
        <p style={{ fontSize: 13, color: 'var(--mid)', margin: '0 0 20px' }}>
          This design is shared — anyone can open it. Edit the original in place, or duplicate it and keep the original untouched.
        </p>

        <button
          disabled={busy}
          onClick={onDuplicate}
          style={{ width: '100%', padding: '13px', fontSize: 14, fontWeight: 700, background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 10, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}
        >
          {busy ? 'Working…' : 'Duplicate & edit a copy'}
        </button>
        <button
          disabled={busy}
          onClick={onEditOriginal}
          style={{ marginTop: 10, width: '100%', padding: '13px', fontSize: 14, fontWeight: 700, background: '#fff', color: 'var(--dark)', border: '1.5px solid var(--border)', borderRadius: 10, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}
        >
          Edit original
        </button>
        <button
          disabled={busy}
          onClick={onCancel}
          style={{ marginTop: 10, width: '100%', padding: '10px', fontSize: 13, fontWeight: 600, background: 'none', color: 'var(--mid)', border: 'none', cursor: busy ? 'default' : 'pointer' }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function DesignCard({ project, loading, onOpen, onDelete }) {
  return (
    <div
      onClick={() => onOpen(project)}
      style={{
        background: '#fff', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden',
        cursor: loading ? 'default' : 'pointer', transition: 'box-shadow 0.15s, transform 0.15s',
        position: 'relative', opacity: loading ? 0.7 : 1,
      }}
      onMouseEnter={e => {
        if (!loading) {
          e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.1)'
          e.currentTarget.style.transform = 'translateY(-2px)'
        }
      }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none' }}
    >
      <div style={{ background: '#00C2CB', aspectRatio: '316 / 441', overflow: 'hidden', position: 'relative' }}>
        {project.thumbnail ? (
          <img src={project.thumbnail} alt={project.templateName} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
            No preview
          </div>
        )}
        {loading && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#fff', fontSize: 12 }}>Opening…</span>
          </div>
        )}
      </div>

      <div style={{ padding: '12px 14px 14px' }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--dark)', marginBottom: 3, wordBreak: 'break-word' }}>{project.projectName || project.templateName}</div>
        <div style={{ fontSize: 11, color: 'var(--mid)' }}>{project.merchant} · Saved {formatDate(project.savedAt)}</div>
        <button
          style={{ marginTop: 12, width: '100%', padding: '8px', fontSize: 12, fontWeight: 700, background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', transition: 'background 0.15s' }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-dark)'}
          onMouseLeave={e => e.currentTarget.style.background = 'var(--primary)'}
          onClick={e => { e.stopPropagation(); onOpen(project) }}
        >
          {loading ? 'Opening…' : 'Continue editing'}
        </button>
      </div>

      <button
        onClick={e => { e.stopPropagation(); onDelete(project.id) }}
        title="Remove from Designs"
        style={{
          position: 'absolute', top: 8, right: 8, width: 24, height: 24, borderRadius: '50%',
          background: 'rgba(0,0,0,0.45)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, lineHeight: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.opacity = '1'}
        onMouseLeave={e => e.currentTarget.style.opacity = '0'}
      >
        ×
      </button>
    </div>
  )
}

// Designs used to only ever be discoverable via a per-browser localStorage
// registry — nobody but whoever saved a design, on that exact browser, could
// ever see it existed. Now backed by a real server-side listing
// (GET /api/save-project), so every activation key sees every saved design.
export default function DesignsPage({ onOpenProject, onDuplicateProject, customCards = [] }) {
  const [projects, setProjects] = useState([])
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [loadingId, setLoadingId] = useState(null)
  const [filters, setFilters] = useState(null) // null = filter popup still showing
  const [pendingProject, setPendingProject] = useState(null)
  const [pendingBusy, setPendingBusy] = useState(false)

  useEffect(() => {
    fetch('/api/save-project', { cache: 'no-store' })
      .then(r => r.json())
      .then(data => { setProjects(data.projects ?? []); setStatus('ready') })
      .catch(() => setStatus('error'))
  }, [])

  const templateInfo = useMemo(() => buildTemplateInfo(customCards), [customCards])

  const enriched = useMemo(
    () => projects.map(p => ({ ...p, group: groupLabel(templateInfo[p.templateId]) })),
    [projects, templateInfo]
  )

  const formatOptions = useMemo(() => [...new Set(enriched.map(p => p.group))].sort(), [enriched])
  const merchantOptions = useMemo(() => [...new Set(enriched.map(p => p.merchant))].sort(), [enriched])

  const filtered = useMemo(() => {
    if (!filters) return []
    return enriched.filter(p =>
      (filters.format === ALL || p.group === filters.format) &&
      (filters.merchant === ALL || p.merchant === filters.merchant)
    )
  }, [enriched, filters])

  const grouped = useMemo(() => {
    const byGroup = {}
    for (const p of filtered) (byGroup[p.group] ??= []).push(p)
    return Object.entries(byGroup).sort(([a], [b]) => a.localeCompare(b))
  }, [filtered])

  function handleDelete(id) {
    if (!window.confirm('Delete this design? This cannot be undone.')) return
    setProjects(prev => prev.filter(p => p.id !== id))
    fetch(`/api/delete-project?id=${id}`, { method: 'DELETE' }).catch(() => {})
  }

  function handleRequestOpen(project) {
    setPendingProject(project)
  }

  async function handleEditOriginal() {
    const project = pendingProject
    setPendingBusy(true)
    setLoadingId(project.id)
    try {
      await onOpenProject(project)
      setPendingProject(null)
    } finally {
      setPendingBusy(false)
      setLoadingId(null)
    }
  }

  async function handleDuplicate() {
    const project = pendingProject
    setPendingBusy(true)
    setLoadingId(project.id)
    try {
      await onDuplicateProject(project)
      setPendingProject(null)
    } finally {
      setPendingBusy(false)
      setLoadingId(null)
    }
  }

  const activeFilterSummary = filters && (filters.format !== ALL || filters.merchant !== ALL)
    ? [filters.format !== ALL ? filters.format : null, filters.merchant !== ALL ? filters.merchant : null].filter(Boolean).join(' · ')
    : null

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'auto' }}>
      {status === 'ready' && projects.length > 0 && filters === null && (
        <FilterPopup formatOptions={formatOptions} merchantOptions={merchantOptions} onApply={setFilters} />
      )}

      {pendingProject && (
        <ConfirmOpenModal
          project={pendingProject}
          busy={pendingBusy}
          onEditOriginal={handleEditOriginal}
          onDuplicate={handleDuplicate}
          onCancel={() => setPendingProject(null)}
        />
      )}

      <div style={{ borderBottom: '1px solid var(--border)', padding: '28px 40px 24px', background: '#fff', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--dark)' }}>Designs</h1>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--mid)' }}>
            {status === 'loading' && 'Loading designs…'}
            {status === 'error' && 'Could not load designs — try refreshing the page.'}
            {status === 'ready' && projects.length === 0 && 'Saved designs will appear here — pick up where anyone left off.'}
            {status === 'ready' && projects.length > 0 && filters && (
              activeFilterSummary
                ? `${filtered.length} of ${projects.length} design${projects.length === 1 ? '' : 's'} · ${activeFilterSummary}`
                : `${projects.length} saved design${projects.length === 1 ? '' : 's'}`
            )}
          </p>
        </div>
        {status === 'ready' && projects.length > 0 && filters && (
          <button
            onClick={() => setFilters(null)}
            style={{ padding: '8px 14px', fontSize: 12, fontWeight: 700, borderRadius: 8, border: '1px solid var(--border)', background: '#fff', color: 'var(--dark)', cursor: 'pointer', flexShrink: 0 }}
          >
            Filters{activeFilterSummary ? ` (${[filters.format !== ALL, filters.merchant !== ALL].filter(Boolean).length})` : ''}
          </button>
        )}
      </div>

      {status === 'ready' && projects.length === 0 && (
        <EmptyState title="No saved designs yet" desc="Open a template, fill in your content, and click Save — it will appear here." />
      )}

      {status === 'ready' && projects.length > 0 && filters && filtered.length === 0 && (
        <EmptyState title="No designs match" desc="Try widening your format or merchant filter." />
      )}

      {status === 'ready' && filters && filtered.length > 0 && (
        <div style={{ padding: '32px 40px 40px' }}>
          {grouped.map(([group, items]) => (
            <div key={group} style={{ marginBottom: 36 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--dark)', margin: '0 0 16px' }}>
                {group} <span style={{ fontWeight: 500, color: 'var(--mid)' }}>({items.length})</span>
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 24 }}>
                {items.map(project => (
                  <DesignCard
                    key={project.id}
                    project={project}
                    loading={loadingId === project.id}
                    onOpen={handleRequestOpen}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
