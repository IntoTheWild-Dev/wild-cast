import { useState, useEffect, useRef, useMemo } from 'react'
import { PAGE_PADDING_X, APP_HEADER_HEIGHT, stickyPageBar } from '../lib/layout'
import useIsMobile from '../lib/useIsMobile'
import PageSpinner from './PageSpinner'
import Select from './Select'

// "Review queue in the user profile" (Notion card, 2026-09-22): "A simple
// task board under the profile. Each asset shows its state: under design,
// under review, approved. No more than that." Deliberately no search, no
// filters beyond the fixed status columns below - just "my own designs,
// grouped by where they are." A fourth column was added 2026-09-23 (Mark's
// ask via Julia) once "under review" needed to distinguish "still waiting
// on a first look" from "reviewer sent it back." Search, filters and a sort
// were added after all (Anang's ask, 2026-10-08) once the board got long -
// same "Viewing" bar as DesignsPage, newest first by default.
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

const ALL = '__all__'
const FILTER_STYLE = { fontSize: 13, fontWeight: 600, color: 'var(--dark)', padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: '#fff' }

// Jira-style board (Anang's ask, 2026-10-01): each status column is a grey
// lane, its title + count badge sticks below the app header while the page
// scrolls, so a long column never loses which status it is.
const LANE_BG = '#F1F2F4'
const COUNT_BADGE_BG = '#DFE1E6'
// Space between the title band and a lane's top. All of it lives in the
// sticky header's gap strip, so it's the same 28px before and while
// scrolling (Anang's ask, 2026-10-01: the gap shouldn't shrink on scroll).
const LANE_GAP = 28

function formatDate(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function TaskCard({ project, opening, onOpen, hasUpdate, borderColor = 'var(--border)' }) {
  return (
    <div
      onClick={() => onOpen(project)}
      style={{
        position: 'relative',
        background: '#fff', border: `${borderColor === 'var(--border)' ? 1 : 2}px solid ${borderColor}`, borderRadius: 10, overflow: 'hidden',
        boxShadow: '0 1px 2px rgba(9,30,66,0.12)',
        cursor: opening ? 'default' : 'pointer', display: 'flex', gap: 10, padding: 8,
        opacity: opening ? 0.7 : 1, transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => { if (!opening) e.currentTarget.style.borderColor = 'var(--primary)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = borderColor }}
    >
      {/* Unread notification for this design (approved / changes requested
          / a comment) - clears once it's opened. See useNotifications. */}
      {hasUpdate && (
        <span title="New update" role="img" aria-label="New update" style={{ position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: '50%', background: '#DC2626' }} />
      )}
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

export default function MyTasksPage({ onOpenProject, activation, unreadProjectIds, onBack }) {
  const [projects, setProjects] = useState([])
  const [loading, setLoading]   = useState(true)
  const [openingId, setOpeningId] = useState(null)
  const isMobile = useIsMobile()

  // The column headers stick just below the sticky title band, so they need
  // its live height (it grows if the title ever wraps).
  const bandRef = useRef(null)
  const [bandHeight, setBandHeight] = useState(0)
  useEffect(() => {
    const el = bandRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setBandHeight(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const laneHeaderTop = APP_HEADER_HEIGHT + (isMobile ? 0 : bandHeight)

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
  const ownerKey = activation?.key
  const mine = useMemo(() => projects.filter(p => ownerKey && p.ownerEmail === ownerKey), [projects, ownerKey])

  const [statusFilter, setStatusFilter] = useState(ALL)
  const [merchantFilter, setMerchantFilter] = useState(ALL)
  const [sortOrder, setSortOrder] = useState('newest') // 'newest' | 'oldest'
  const [search, setSearch] = useState('')
  const merchantOptions = useMemo(() => [...new Set(mine.map(p => p.merchant).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [mine])
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const dir = sortOrder === 'newest' ? -1 : 1
    return mine
      .filter(p =>
        (merchantFilter === ALL || p.merchant === merchantFilter) &&
        (!q || [p.projectName, p.templateName, p.merchant].some(v => v?.toLowerCase().includes(q)))
      )
      .sort((a, b) => dir * ((a.savedAt ?? 0) - (b.savedAt ?? 0)))
  }, [mine, merchantFilter, sortOrder, search])
  const columns = statusFilter === ALL ? STATUS_COLUMNS : STATUS_COLUMNS.filter(c => c.key === statusFilter)

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
    // No overflow here: the document is what scrolls, and an overflow box
    // would trap the sticky title band and column headers inside it.
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>

      {/* Page header - same shape as LibraryPage/DesignsPage's own */}
      <div ref={bandRef} style={{ borderBottom: '1px solid var(--border)', padding: `28px ${PAGE_PADDING_X} 24px`, background: '#fff', ...stickyPageBar(isMobile) }}>
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
        {activation?.key && !loading && mine.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--mid)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Viewing
            </label>
            <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={FILTER_STYLE}>
              <option value={ALL}>All statuses</option>
              {STATUS_COLUMNS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </Select>
            <Select value={merchantFilter} onChange={e => setMerchantFilter(e.target.value)} style={FILTER_STYLE}>
              <option value={ALL}>All merchants</option>
              {merchantOptions.map(m => <option key={m} value={m}>{m}</option>)}
            </Select>
            <Select value={sortOrder} onChange={e => setSortOrder(e.target.value)} style={FILTER_STYLE}>
              <option value="newest">Latest first</option>
              <option value="oldest">Oldest first</option>
            </Select>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or merchant…"
              style={{ marginLeft: isMobile ? 0 : 'auto', fontSize: 13, padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: '#fff', width: isMobile ? '100%' : 240, boxSizing: 'border-box' }}
            />
          </div>
        )}
      </div>

      {loading ? <PageSpinner label="Loading your tasks…" /> : (
      <div style={{ padding: `0 ${PAGE_PADDING_X} 28px`, flex: 1 }}>
        {!activation?.key ? (
          <div style={{ color: 'var(--mid)', fontSize: 13 }}>Sign in to see your tasks.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))', gap: 12 }}>
            {columns.map(col => {
              const items = visible.filter(p => (p.reviewStatus || 'design') === col.key)
              return (
                <div key={col.key} style={{ background: LANE_BG, borderRadius: 12, padding: '0 8px 8px', minHeight: 160 }}>
                  {/* Sticky header = a page-colored gap strip + the lane's
                      rounded top, like Jira: once stuck, the lane still reads
                      as a card that starts a little below the title band
                      instead of being cut flat against it. Spans the lane's
                      side padding (-8px) so no grey edge shows beside the gap. */}
                  <div style={{ position: 'sticky', top: laneHeaderTop, zIndex: 1, margin: '0 -8px', paddingTop: LANE_GAP, background: 'var(--bg)' }}>
                    <div style={{ background: LANE_BG, borderRadius: '12px 12px 0 0', padding: '14px 14px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--mid)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {col.label}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--dark)', background: COUNT_BADGE_BG, borderRadius: 4, padding: '1px 7px', lineHeight: '18px' }}>
                        {items.length}
                      </span>
                    </div>
                  </div>
                  {items.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--light)', padding: '4px 6px' }}>{search.trim() || merchantFilter !== ALL ? 'No matches' : 'Nothing here'}</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {items.map(p => (
                        <TaskCard
                          key={p.id}
                          project={p}
                          opening={openingId === p.id}
                          onOpen={handleOpen}
                          hasUpdate={unreadProjectIds?.has(p.id)}
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
