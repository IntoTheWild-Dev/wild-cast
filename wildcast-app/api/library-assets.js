// Merged upload/list/delete-library-asset.js into one route (dispatched by
// method) to stay under Vercel's per-deployment serverless function count.
import { put, list, del } from '@vercel/blob'

const FOLDER_PATTERN = /^[a-z-]+$/

function dataUrlToBuffer(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl)
  if (!match) throw new Error('Invalid data URL')
  return { contentType: match[1], buffer: Buffer.from(match[2], 'base64') }
}

async function handleGet(req, res) {
  const token = process.env.BLOB_READ_WRITE_TOKEN

  // ?url=<blobUrl> — proxy a single private blob's bytes through to the
  // browser (used as the <img src>, since the store only allows private
  // access and a plain <img> can't attach the Authorization header itself).
  if (req.query.url) {
    try {
      const upstream = await fetch(req.query.url, { headers: { Authorization: `Bearer ${token}` } })
      if (!upstream.ok) return res.status(upstream.status).end()
      const contentType = upstream.headers.get('content-type') || 'application/octet-stream'
      const buffer = Buffer.from(await upstream.arrayBuffer())
      res.setHeader('Content-Type', contentType)
      res.setHeader('Cache-Control', 'private, max-age=86400')
      return res.status(200).send(buffer)
    } catch (err) {
      console.error('library-asset image proxy error:', err)
      return res.status(500).end()
    }
  }

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

async function handlePost(req, res) {
  try {
    const { folder, name, dataUrl } = req.body ?? {}
    if (!folder || !name || !dataUrl) {
      return res.status(400).json({ error: 'Missing folder, name, or dataUrl' })
    }
    if (!FOLDER_PATTERN.test(folder)) {
      return res.status(400).json({ error: 'Invalid folder' })
    }

    const { contentType, buffer } = dataUrlToBuffer(dataUrl)
    if (!contentType.startsWith('image/')) {
      return res.status(400).json({ error: 'File is not an image' })
    }
    const ext = contentType === 'image/png' ? 'png' : 'jpg'
    const id = crypto.randomUUID()
    const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)

    const blob = await put(`library/${folder}/${id}__${safeName}.${ext}`, buffer, {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    })

    return res.status(200).json({
      id,
      folder,
      name,
      url: blob.url,
      uploadedAt: Date.now(),
    })
  } catch (err) {
    console.error('upload-library-asset error:', err)
    return res.status(500).json({ error: err.message })
  }
}

async function handleDelete(req, res) {
  const { url } = req.query
  if (!url) return res.status(400).json({ error: 'Missing url' })

  try {
    await del(url, { token: process.env.BLOB_READ_WRITE_TOKEN })
    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('delete-library-asset error:', err)
    return res.status(500).json({ error: err.message })
  }
}

export default async function handler(req, res) {
  if (req.method === 'GET') return handleGet(req, res)
  if (req.method === 'POST') return handlePost(req, res)
  if (req.method === 'DELETE') return handleDelete(req, res)
  return res.status(405).end()
}
