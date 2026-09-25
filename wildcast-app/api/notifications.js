// The header bell's feed - see api/_lib/notifications.js for how entries get
// written. The owner id (activation.key) comes in a header rather than the
// query string so a raw activation key doesn't land in URL/access logs.
//
// GET                       -> { notifications: [...] } newest first
// PATCH { ids: [...] }      -> marks those read
// PATCH { all: true }       -> marks everything read
import { loadNotifications, saveNotifications } from './_lib/notifications.js'

export default async function handler(req, res) {
  const ownerId = req.headers['x-wildcast-owner']
  if (!ownerId) return res.status(400).json({ error: 'Missing owner' })
  const token = process.env.BLOB_READ_WRITE_TOKEN

  if (req.method === 'GET') {
    try {
      const notifications = await loadNotifications(ownerId, token)
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
      return res.status(200).json({ notifications })
    } catch (err) {
      console.error('notifications get error:', err)
      return res.status(200).json({ notifications: [] })
    }
  }

  if (req.method === 'PATCH') {
    const { ids, all } = req.body ?? {}
    if (!all && !Array.isArray(ids)) return res.status(400).json({ error: 'Missing ids' })
    try {
      const list = await loadNotifications(ownerId, token)
      const wanted = new Set(ids ?? [])
      let changed = false
      for (const n of list) {
        if (!n.read && (all || wanted.has(n.id))) { n.read = true; changed = true }
      }
      if (changed) await saveNotifications(ownerId, list, token)
      return res.status(200).json({ ok: true })
    } catch (err) {
      console.error('notifications patch error:', err)
      return res.status(500).json({ error: err.message })
    }
  }

  return res.status(405).end()
}
