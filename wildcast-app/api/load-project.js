import { ownerRecord } from './_lib/ownerIdentity.js'
import { get } from '@vercel/blob'
import { requireCaller } from './_lib/auth.js'
import { isBlobHost } from './_lib/templateAssets.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  if (!(await requireCaller(req, res))) return
  let { id, url } = req.query
  if (!id && typeof url === 'string' && isBlobHost(url)) {
    const u = new URL(url)
    if (!u.username && !u.password && !u.port) id = /^\/projects\/([A-Za-z0-9_-]+)\.json$/.exec(u.pathname)?.[1]
  }
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(id)) {
    return res.status(400).json({ error: 'A valid project id is required' })
  }
  try {
    const result = await get(`projects/${id}.json`, { access: 'private', useCache: false })
    if (!result) return res.status(404).json({ error: 'Design not found' })
    const project = await new Response(result.stream).json()
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
    return res.status(200).json(ownerRecord(project))
  } catch (err) {
    console.error('load-project error:', err)
    return res.status(500).json({ error: 'Could not load this design' })
  }
}
