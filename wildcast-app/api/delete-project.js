import { list, del } from '@vercel/blob'

export default async function handler(req, res) {
  if (req.method !== 'DELETE') return res.status(405).end()

  const { id } = req.query
  if (!id) return res.status(400).json({ error: 'Missing project id' })

  const token = process.env.BLOB_READ_WRITE_TOKEN

  try {
    // Find and delete the project blob + any associated comments blob
    const [projectBlobs, commentBlobs] = await Promise.all([
      list({ prefix: `projects/${id}`, token }),
      list({ prefix: `comments/${id}`, token }),
    ])

    const urlsToDelete = [
      ...projectBlobs.blobs.map(b => b.url),
      ...commentBlobs.blobs.map(b => b.url),
    ]

    if (urlsToDelete.length > 0) {
      await del(urlsToDelete, { token })
    }

    return res.status(200).json({ ok: true, deleted: urlsToDelete.length })
  } catch (err) {
    console.error('delete-project error:', err)
    return res.status(500).json({ error: err.message })
  }
}
