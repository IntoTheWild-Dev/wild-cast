// Merged upload/list/delete-library-asset.js into one route (dispatched by
// method) to stay under Vercel's per-deployment serverless function count.
import { put, list, del, copy } from '@vercel/blob'

const FOLDER_PATTERN = /^[a-z-]+$/

function dataUrlToBuffer(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl)
  if (!match) throw new Error('Invalid data URL')
  return { contentType: match[1], buffer: Buffer.from(match[2], 'base64') }
}

// Snaps a requested merchant name to an existing merchant's exact casing when
// they match case-insensitively — "wen cheng" typed after "Wen Cheng" already
// exists reuses "Wen Cheng" instead of silently creating a second, visually
// near-identical folder. First-seen casing across the whole library wins.
async function resolveMerchant(requested, token) {
  const wanted = (requested || 'General').trim() || 'General'
  const { blobs } = await list({ prefix: 'library/', token })
  for (const b of blobs) {
    const parts = b.pathname.split('/')
    if (parts.length < 4) continue
    const existing = decodeURIComponent(parts[2])
    if (existing.toLowerCase() === wanted.toLowerCase()) return existing
  }
  return wanted.replace(/[/\\?%*:|"<>]/g, '_').slice(0, 60) || 'General'
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

    // Pathname is either library/<folder>/<merchant>/<id>__<name>.<ext>
    // (merchant-scoped, post-foldering) or the older library/<folder>/<id>__<name>.<ext>
    // (no merchant segment — predates this feature). Older assets simply show
    // up under "General" rather than needing a one-off migration.
    const assets = blobs.map(b => {
      const parts = b.pathname.split('/')
      const folder = parts[1]
      const hasMerchant = parts.length >= 4
      const merchant = hasMerchant ? decodeURIComponent(parts[2]) : 'General'
      const filename = (hasMerchant ? parts[3] : parts[2]) ?? ''
      const idMatch = /^([^_]+)__(.+)\.[a-zA-Z0-9]+$/.exec(filename)
      return {
        id: idMatch ? idMatch[1] : filename,
        folder,
        merchant,
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
    const { folder, name, dataUrl, merchant } = req.body ?? {}
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
    const safeName = name.replace(/[/\\?%*:|"<>]/g, '_').slice(0, 80)
    const token = process.env.BLOB_READ_WRITE_TOKEN
    // Merchant folder — one Wolt DE key covers many restaurants, so assets are
    // scoped per merchant (not per activation key). Defaults to "General" for
    // shared/non-merchant-specific assets (e.g. a generic Wolt app-store badge).
    const safeMerchant = await resolveMerchant(merchant, token)

    const blob = await put(`library/${folder}/${safeMerchant}/${id}__${safeName}.${ext}`, buffer, {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType,
      token,
    })

    return res.status(200).json({
      id,
      folder,
      merchant: safeMerchant,
      name,
      url: blob.url,
      uploadedAt: Date.now(),
    })
  } catch (err) {
    console.error('upload-library-asset error:', err)
    return res.status(500).json({ error: err.message })
  }
}

// No in-place rename in Blob — copy to a new pathname (same folder/id, new
// name) then delete the old one. Several QR codes look identical, so a
// label is the only way to tell them apart once more than one is saved.
async function handlePatch(req, res) {
  const { url, newName, merchant: newMerchantRaw } = req.body ?? {}
  if (!url || !newName) return res.status(400).json({ error: 'Missing url or newName' })

  try {
    const oldPath = decodeURIComponent(new URL(url).pathname).replace(/^\//, '')
    // Merchant-scoped path (current format) first, falling back to the older
    // no-merchant format — renaming an old asset also migrates it into
    // "General" rather than needing a one-off migration script.
    const merchantMatch = /^library\/([a-z-]+)\/([^/]+)\/([^_]+)__(.+)\.([a-zA-Z0-9]+)$/.exec(oldPath)
    const legacyMatch = !merchantMatch && /^library\/([a-z-]+)\/([^_]+)__(.+)\.([a-zA-Z0-9]+)$/.exec(oldPath)
    if (!merchantMatch && !legacyMatch) return res.status(400).json({ error: 'Could not parse existing asset path' })
    const [folder, oldMerchant, id, ext] = merchantMatch
      ? [merchantMatch[1], merchantMatch[2], merchantMatch[3], merchantMatch[5]]
      : [legacyMatch[1], 'General', legacyMatch[2], legacyMatch[4]]
    const safeName = newName.replace(/[/\\?%*:|"<>]/g, '_').slice(0, 80)
    const token = process.env.BLOB_READ_WRITE_TOKEN
    // Reassigning to a different merchant (the "move" action) goes through the
    // same case-insensitive snap as a fresh upload — moving into "wen cheng"
    // when "Wen Cheng" already exists lands in the existing folder, not a
    // second near-duplicate one.
    const merchant = newMerchantRaw != null ? await resolveMerchant(newMerchantRaw, token) : oldMerchant
    const newPath = `library/${folder}/${merchant}/${id}__${safeName}.${ext}`

    const copied = await copy(url, newPath, {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      token,
    })
    await del(url, { token })

    return res.status(200).json({ id, folder, merchant, name: newName, url: copied.url, uploadedAt: Date.now() })
  } catch (err) {
    console.error('rename-library-asset error:', err)
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
  if (req.method === 'PATCH') return handlePatch(req, res)
  if (req.method === 'DELETE') return handleDelete(req, res)
  return res.status(405).end()
}
