import { useState, useEffect, useCallback } from 'react'

// Shared notification state for the whole app - the header bell (count),
// the red dot on the "My Tasks" nav item and the per-card dots on My Tasks
// all read the same list, so marking something read anywhere clears it
// everywhere at once. Entries are written server-side, see
// api/_lib/notifications.js.
//
// Read rules (boss's call, 2026-09-25): opening the bell dropdown marks
// everything read; opening a design (from My Tasks, a notification, or
// anywhere else) marks that design's notifications read.
//
// No push channel exists (same JSON-in-Blob setup as comments), so it polls:
// every POLL_MS while the tab is visible, plus whenever the tab regains focus.
const POLL_MS = 30000

// Status changes that live on My Tasks (its "Adjustment needed" / "Approved"
// columns) - what the nav dot is about. Comments aren't a My Tasks thing.
const TASK_TYPES = new Set(['approved', 'changes_requested'])

async function fetchNotifications(ownerId) {
  try {
    const res = await fetch('/api/notifications', { headers: { 'x-wildcast-owner': ownerId }, cache: 'no-store' })
    if (!res.ok) return null
    const data = await res.json()
    return data.notifications || []
  } catch {
    return null
  }
}

function patchRead(ownerId, body) {
  fetch('/api/notifications', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-wildcast-owner': ownerId },
    body: JSON.stringify(body),
  }).catch(() => {})
}

export default function useNotifications(ownerId) {
  const [items, setItems] = useState([])

  const refresh = useCallback(() => {
    if (!ownerId) return
    fetchNotifications(ownerId).then(list => { if (list) setItems(list) })
  }, [ownerId])

  useEffect(() => {
    if (!ownerId) return
    fetchNotifications(ownerId).then(list => { if (list) setItems(list) })
    const interval = setInterval(() => { if (document.visibilityState === 'visible') refresh() }, POLL_MS)
    window.addEventListener('focus', refresh)
    return () => { clearInterval(interval); window.removeEventListener('focus', refresh) }
  }, [refresh, ownerId])

  // Optimistic: local state flips straight away, the PATCH follows.
  const markRead = useCallback(ids => {
    if (!ownerId || !ids.length) return
    const wanted = new Set(ids)
    setItems(prev => prev.map(n => (wanted.has(n.id) ? { ...n, read: true } : n)))
    patchRead(ownerId, { ids })
  }, [ownerId])

  const markAllRead = useCallback(() => {
    markRead(items.filter(n => !n.read).map(n => n.id))
  }, [items, markRead])

  const markProjectRead = useCallback(projectId => {
    markRead(items.filter(n => !n.read && n.projectId === projectId).map(n => n.id))
  }, [items, markRead])

  const unreadCount = items.filter(n => !n.read).length
  const hasUnreadTasks = items.some(n => !n.read && TASK_TYPES.has(n.type))
  const unreadProjectIds = new Set(items.filter(n => !n.read).map(n => n.projectId))

  return { enabled: !!ownerId, items, unreadCount, hasUnreadTasks, unreadProjectIds, refresh, markAllRead, markProjectRead }
}
