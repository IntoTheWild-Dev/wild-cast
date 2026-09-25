import { useState, useRef, useEffect } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Notification01Icon, CheckmarkCircle02Icon, PencilEdit02Icon, Comment01Icon } from '@hugeicons/core-free-icons'

// Header bell (Notion card "Add notifications to the UI so a user knows when
// an asset has been reviewed, commented, approved by Manager", 2026-09-25).
// Lists what reviewers did to the signed-in user's designs. State (list,
// polling, read/unread) lives in lib/useNotifications.js, shared with the
// My Tasks nav dot and per-card dots.

const TYPES = {
  approved:          { icon: CheckmarkCircle02Icon, color: '#16A34A', verb: 'approved' },
  changes_requested: { icon: PencilEdit02Icon,      color: '#D97706', verb: 'requested changes on' },
  comment:           { icon: Comment01Icon,         color: 'var(--primary)', verb: 'commented on' },
}

function timeAgo(ts) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default function NotificationBell({ notifications, onOpenProject }) {
  const { enabled, items, unreadCount, markAllRead } = notifications
  const [open, setOpen] = useState(false)
  // Which ones were unread at the moment the dropdown opened. Opening it
  // marks everything read straight away (boss's call, 2026-09-25: "badge
  // should clear when a user opens the notification tab"), but these stay
  // highlighted while it's open so it's still clear which ones are new.
  const [newIds, setNewIds] = useState(() => new Set())
  const wrapRef = useRef(null)

  // Same outside-click close as UserMenu - a fixed backdrop doesn't work
  // inside the header (see Header.jsx).
  useEffect(() => {
    if (!open) return
    function handleOutsideClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [open])

  function handleToggle() {
    if (open) { setOpen(false); return }
    setNewIds(new Set(items.filter(n => !n.read).map(n => n.id)))
    // No refetch here - a GET racing the mark-read PATCH could bring the
    // just-cleared ones back as unread. The regular poll picks up new ones.
    markAllRead()
    setOpen(true)
  }

  function handleClick(n) {
    setOpen(false)
    onOpenProject?.(n.projectId)
  }

  if (!enabled) return null
  const unread = unreadCount

  // No position:relative on this wrapper on purpose: the dropdown anchors
  // to the header's right-hand group (Header.jsx) instead of the bell
  // itself, so it lines up with UserMenu's dropdown at the header's right
  // edge rather than hanging off the bell's own edge.
  return (
    <div ref={wrapRef}>
      <button
        type="button"
        onClick={handleToggle}
        title="Notifications"
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        style={{ position: 'relative', width: 34, height: 34, borderRadius: 8, border: '1px solid var(--border)', background: open ? '#F3F4F6' : '#fff', color: 'var(--dark)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <HugeiconsIcon icon={Notification01Icon} size={18} />
        {unread > 0 && (
          <span style={{ position: 'absolute', top: -5, right: -5, minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9, background: '#DC2626', color: '#fff', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', border: '2px solid #fff' }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 200, width: 360, maxWidth: 'calc(100vw - 32px)', background: '#fff', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 12px 32px rgba(0,0,0,0.14)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 12px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--dark)' }}>Notifications</span>
          </div>

          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {items.length === 0 ? (
              <div style={{ padding: '32px 20px', textAlign: 'center', fontSize: 13, color: 'var(--mid)', lineHeight: 1.5 }}>
                No notifications yet.<br />You'll see here when a reviewer comments on, approves or requests changes to one of your designs.
              </div>
            ) : items.map(n => {
              const t = TYPES[n.type] ?? TYPES.comment
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleClick(n)}
                  style={{ display: 'flex', gap: 10, width: '100%', textAlign: 'left', padding: '12px 16px', border: 'none', borderBottom: '1px solid var(--border)', background: newIds.has(n.id) ? 'var(--primary-glow)' : '#fff', cursor: 'pointer', fontFamily: 'inherit' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#F9FAFB' }}
                  onMouseLeave={e => { e.currentTarget.style.background = newIds.has(n.id) ? 'var(--primary-glow)' : '#fff' }}
                >
                  <span style={{ color: t.color, flexShrink: 0, marginTop: 1 }}><HugeiconsIcon icon={t.icon} size={18} /></span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13, color: 'var(--dark)', lineHeight: 1.4 }}>
                      <strong>{n.actor || 'A reviewer'}</strong> {t.verb} <strong>{n.projectName}</strong>
                    </span>
                    {n.text && (
                      <span style={{ display: 'block', fontSize: 12, color: 'var(--mid)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        “{n.text}”
                      </span>
                    )}
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--light)', marginTop: 4 }}>{timeAgo(n.createdAt)}</span>
                  </span>
                  {newIds.has(n.id) && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary)', flexShrink: 0, marginTop: 6 }} />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
