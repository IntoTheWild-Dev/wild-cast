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
import { folderPath as ownerPath } from './_lib/accounts.js'

async function handleList(req, res) {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  try {
    const { blobs } = await list({ prefix: 'folders/', token })
    const records = await Promise.all(blobs.map(async b => {
      const cacheBustUrl = b.url + (b.url.includes('?') ? '&' : '?') + `_t=${Date.now()}`
      const r = await fetch(cacheBustUrl, { headers: { Authorization: `Bearer ${token}` } })
      if (!r.ok) return null
      return r.json()
    }))
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
    return res.status(200).json({ owners: records.filter(Boolean) })
  } catch (err) {
    console.error('folders list error:', err)
    return res.status(200).json({ owners: [] })
  }
}

export default async function handler(req, res) {
  if (req.method === 'GET') return handleList(req, res)
  if (req.method !== 'POST') return res.status(405).end()

  try {
    const { ownerEmail, ownerName, folderName } = req.body ?? {}
    const trimmedFolder = (folderName || '').trim()
    if (!ownerEmail || !trimmedFolder) {
      return res.status(400).json({ error: 'ownerEmail and folderName are required' })
    }

    const token = process.env.BLOB_READ_WRITE_TOKEN
    const path = ownerPath(ownerEmail)
    const { blobs } = await list({ prefix: path, token })
    const match = blobs.find(b => b.pathname === path)

    let existing = { ownerEmail, ownerName: ownerName || ownerEmail, folders: [] }
    if (match) {
      const cacheBustUrl = match.url + (match.url.includes('?') ? '&' : '?') + `_t=${Date.now()}`
      const r = await fetch(cacheBustUrl, { headers: { Authorization: `Bearer ${token}` } })
      if (r.ok) existing = await r.json()
    }

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
