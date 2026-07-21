// Lists every asset in the shared library. Folder + display name are derived
// from the blob's own pathname (library/<folder>/<id>__<name>.<ext>) — no
// separate metadata record needed per asset.
import { list } from '@vercel/blob'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const token = process.env.BLOB_READ_WRITE_TOKEN
  try {
    const { blobs } = await list({ prefix: 'library/', token })

    const assets = blobs.map(b => {
      const parts = b.pathname.split('/')
      const folder = parts[1]
      const filename = parts[2] ?? ''
      const idMatch = /^([^_]+)__(.+)\.[a-zA-Z0-9]+$/.exec(filename)
      return {
        id: idMatch ? idMatch[1] : filename,
        folder,
        name: idMatch ? idMatch[2] : filename,
        url: b.url,
        uploadedAt: new Date(b.uploadedAt).getTime(),
      }
    })

    return res.status(200).json({ assets })
  } catch (err) {
    console.error('list-library-assets error:', err)
    return res.status(200).json({ assets: [] })
  }
}
