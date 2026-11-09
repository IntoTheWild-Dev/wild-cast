import { list, get, del } from '@vercel/blob'
import { requireCaller } from './_lib/auth.js'

export default async function handler(req, res) {
  if (req.method !== 'DELETE') return res.status(405).end()
  const caller = await requireCaller(req, res)
  if (!caller) return
  const { id } = req.query
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(id)) return res.status(400).json({ error: 'Invalid project id' })
  try {
    const result = await get(`projects/${id}.json`, { access: 'private', useCache: false })
    if (!result) return res.status(200).json({ ok: true, deleted: 0 })
    const project = await new Response(result.stream).json()
    const owner = caller.kind === 'account' ? caller.id : req.headers['x-activation-key'].trim()
    if (!['designer', 'agency'].includes(caller.role) && project.ownerEmail !== owner) {
      return res.status(403).json({ error: 'You may only delete your own designs' })
    }
    const paths = [`projects/${id}.json`, `comments/${id}.json`]
    const matches = await Promise.all(paths.map(async path => {
      const { blobs } = await list({ prefix: path })
      return blobs.some(b => b.pathname === path) ? path : null
    }))
    const exactPaths = matches.filter(Boolean)
    if (exactPaths.length) await del(exactPaths)
    return res.status(200).json({ ok: true, deleted: exactPaths.length })
  } catch (err) {
    console.error('delete-project error:', err)
    return res.status(500).json({ error: 'Could not delete this design' })
  }
}
