// In-app notifications for a design's owner (Notion card "Add notifications
// to the UI so a user knows when an asset has been reviewed, commented,
// approved by Manager", 2026-09-25). One small JSON list per owner in Blob,
// written by the server-side actions that matter (save-project.js PATCH for
// Approve / Request changes, comments.js POST for a reviewer's comment) and
// read by the header bell (api/notifications.js).
//
// "Owner" is the same identity My Tasks uses: the project's ownerEmail,
// which is activation.key - a signed-in account's email or a shared
// activation key string. It's hashed for the Blob path so a raw key never
// ends up in a pathname. A shared activation key means everyone on that key
// shares one notification list - same as they already share one My Tasks.
import { put, get } from '@vercel/blob'
import { createHash } from 'crypto'

// Oldest are dropped past this - it's a recent-activity feed, not a log.
const MAX_NOTIFICATIONS = 50

export function notificationsPath(ownerId) {
  const hash = createHash('sha256').update(String(ownerId)).digest('hex')
  return `notifications/${hash}.json`
}

// get() + useCache:false for the same reason as comments.js's
// loadComments(): a read right after a write must see that write, or the
// next read-modify-write silently drops it.
export async function loadNotifications(ownerId, token) {
  const result = await get(notificationsPath(ownerId), { access: 'private', useCache: false, token })
  if (!result) return []
  return new Response(result.stream).json()
}

export async function saveNotifications(ownerId, list, token) {
  await put(notificationsPath(ownerId), JSON.stringify(list.slice(0, MAX_NOTIFICATIONS)), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    token,
  })
}

// event: { type: 'approved' | 'changes_requested' | 'comment', projectId,
// projectName, actor, text? }. Never throws - a notification failing must
// not fail the approve/comment that triggered it. No-op for a project with
// no owner (saved before ownership existed).
export async function notifyOwner(ownerId, event, token) {
  if (!ownerId) return
  try {
    const list = await loadNotifications(ownerId, token)
    list.unshift({ id: crypto.randomUUID(), ...event, read: false, createdAt: Date.now() })
    await saveNotifications(ownerId, list, token)
  } catch (err) {
    console.error('notifyOwner error:', err)
  }
}
