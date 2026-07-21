// Uploads a logo/photo directly into the shared asset library (Vercel Blob),
// replacing the old localStorage-only version — lets the same image be reused
// at full resolution across designs and across Julia's + her colleague's browsers.
import { put } from '@vercel/blob'

const FOLDER_PATTERN = /^[a-z-]+$/

function dataUrlToBuffer(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl)
  if (!match) throw new Error('Invalid data URL')
  return { contentType: match[1], buffer: Buffer.from(match[2], 'base64') }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

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
      access: 'public',
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
