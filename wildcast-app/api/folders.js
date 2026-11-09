import { ownerId, ownerRecord } from './_lib/ownerIdentity.js'
// Personal-folders-per-seat, stage 2 (Julia's ask, 2026-09-15): each signed-in
// person gets a main folder (named after them, derived from their saved
// designs' ownerName - see save-project.js) plus subfolders they create
// manually. A subfolder is really just a label a design can be filed under
// (see move-project.js), but Julia wants folder CREATION itself to be a real
// action - so an empty, just-created folder needs to persist and show up
// even before anything is filed into it. This registry is that: one blob per
// owner listing the subfolder names they've created, independent of whether
// any design currently uses them.
import { list, put } from '@vercel/blob'
import { requireCaller, callerOwnerId } from './_lib/auth.js'
import { folderPath as ownerPath } from './_lib/accounts.js'

async function sharedFolders(token) {
  const { blobs } = await list({ prefix: 'folders/', token })
  const records = await Promise.all(blobs.map(async b => {
    const url = b.url + (b.url.includes('?') ? '&' : '?') + `_t=${Date.now()}`
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    return r.ok ? ownerRecord(await r.json()) : null
  }))
  const merged = new Map()
  for (const record of records.filter(Boolean)) {
    const previous = merged.get(record.ownerEmail)
    const folders = [...(previous?.folders || []), ...(record.folders || [])]
    const seen = new Set()
    merged.set(record.ownerEmail, { ...record, folders: folders.filter(name => {
      const key = name.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key); return true
    }) })
  }
  return [...merged.values()]
}
async function handleList(req, res) {
  try {
    const owners = await sharedFolders(process.env.BLOB_READ_WRITE_TOKEN)
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
    return res.status(200).json({ owners })
  } catch (err) {
    console.error('folders list error:', err)
    return res.status(200).json({ owners: [] })
  }
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).end()
  const caller = await requireCaller(req, res)
  if (!caller) return
  if (req.method === 'GET') return handleList(req, res)
  if (req.method !== 'POST') return res.status(405).end()

  try {
    const { ownerEmail: requestedOwner, ownerName: requestedName, folderName } = req.body ?? {}
    const ownId = callerOwnerId(req, caller)
    const ownerEmail = ownerId(requestedOwner || ownId)
    if (typeof ownerEmail !== 'string' || ownerEmail.length > 256) return res.status(400).json({ error: 'Invalid folder owner' })
    if (ownerEmail !== ownId && !['agency', 'designer'].includes(caller.role)) return res.status(403).json({ error: 'You may only create your own folders' })
    const ownerName = ownerEmail === ownId ? caller.name : requestedName
    const trimmedFolder = typeof folderName === 'string' ? folderName.trim() : ''
    if (!ownerEmail || !trimmedFolder) {
      return res.status(400).json({ error: 'ownerEmail and folderName are required' })
    }

    const token = process.env.BLOB_READ_WRITE_TOKEN
    const path = ownerPath(ownerEmail)
    // Read/merge both old and new rows, so a first canonical write cannot
    // discard subfolders created before the identity migration.
    const existing = (await sharedFolders(token)).find(r => r.ownerEmail === ownerEmail)
      ?? { ownerEmail, ownerName: ownerName || ownerEmail, folders: [] }

    // Case-insensitive de-dupe so "Campaign A" and "campaign a" don't become
    // two visually-identical folders by accident - keeps whichever casing
    // was already saved rather than the new request's.
    const alreadyHas = existing.folders.some(f => f.toLowerCase() === trimmedFolder.toLowerCase())
    const folders = alreadyHas ? existing.folders : [...existing.folders, trimmedFolder]
    const record = { ownerEmail, ownerName: ownerName || existing.ownerName || ownerEmail, folders }

    await put(path, JSON.stringify(record), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
      token,
    })

    return res.status(200).json(record)
  } catch (err) {
    console.error('folders create error:', err)
    return res.status(500).json({ error: err.message })
  }
}
