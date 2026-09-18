// Files (or un-files) an already-saved design into a personal subfolder -
// the "Move to folder" action on a Designs card. Deliberately a small
// dedicated endpoint rather than round-tripping the whole project through
// the client and back via save-project.js's POST: the Designs list only
// ever holds lightweight summaries (see save-project.js's handleList), not
// the full editing state (fields, positions, etc.), so re-POSTing what the
// client has would silently wipe out everything the summary doesn't carry.
// This loads the real full record server-side, patches only `folder` (and
// optionally ownerEmail/ownerName), and saves it straight back.
//
// ownerEmail/ownerName: also re-homes the design under a different sign-in -
// Julia's ask, 2026-09-18: folders belong to one sign-in each, so moving a
// design into another person's folder has to move the design itself, not
// just tag it with a folder name that person's own "Folders" view would
// never look under. Omit both to just re-file within the current owner.
import { list, put } from '@vercel/blob'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  try {
    const { id, folder, ownerEmail, ownerName } = req.body ?? {}
    if (!id) return res.status(400).json({ error: 'Missing project id' })

    const token = process.env.BLOB_READ_WRITE_TOKEN
    const path = `projects/${id}.json`
    const { blobs } = await list({ prefix: path, token })
    const match = blobs.find(b => b.pathname === path)
    if (!match) return res.status(404).json({ error: 'Project not found' })

    const cacheBustUrl = match.url + (match.url.includes('?') ? '&' : '?') + `_t=${Date.now()}`
    const r = await fetch(cacheBustUrl, { headers: { Authorization: `Bearer ${token}` } })
    if (!r.ok) throw new Error(`Blob fetch failed: ${r.status}`)
    const project = await r.json()

    // folder: a name files it into that subfolder; null/omitted moves it
    // back to the owner's unsorted root.
    project.folder = (folder || '').trim() || null
    if (ownerEmail) {
      project.ownerEmail = ownerEmail
      project.ownerName = ownerName || ownerEmail
    }

    await put(path, JSON.stringify(project), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
      token,
    })

    return res.status(200).json({ id, folder: project.folder, ownerEmail: project.ownerEmail, ownerName: project.ownerName })
  } catch (err) {
    console.error('move-project error:', err)
    return res.status(500).json({ error: err.message })
  }
}
