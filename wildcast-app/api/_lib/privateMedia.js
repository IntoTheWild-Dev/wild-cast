// Caller URLs are locators, never fetch destinations. Resolve a constrained
// pathname through the SDK so credentials only reach the configured store.
import { Buffer } from 'node:buffer'
import { get } from '@vercel/blob'
import { isBlobHost } from './templateAssets.js'

const TYPES = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', pdf: 'application/pdf',
}

export function mediaPath(url, namespace) {
  if (!isBlobHost(url)) return null
  try {
    const u = new URL(url)
    if (u.username || u.password || u.port || u.hash) return null
    const path = decodeURIComponent(u.pathname).slice(1)
    if (/[\\%\x00-\x1f?#]/.test(path)) return null
    const valid = namespace === 'templates'
      ? /^templates\/[a-z0-9-]+\.(?:png|jpe?g|webp|gif|avif|pdf)$/.test(path)
      : namespace === 'library' && /^library\/[a-z-]+\/(?:[^/]+\/)?[^/]+\.(?:png|jpe?g|webp|gif|avif)$/.test(path)
    return valid ? path : null
  } catch {
    return null
  }
}

export async function readMedia(path) {
  const result = await get(path, { access: 'private', useCache: false })
  if (!result) return null
  const expectedType = TYPES[path.split('.').pop().toLowerCase()]
  // Never serve active SVG/HTML or JSON through an image/PDF proxy, even
  // when an older upload has a misleading filename extension.
  if (!expectedType || result.blob.contentType !== expectedType) {
    throw new Error('Unsupported media content type')
  }
  return { contentType: expectedType, bytes: Buffer.from(await new Response(result.stream).arrayBuffer()) }
}

export async function serveMedia(req, res, namespace) {
  const path = mediaPath(req.query.url, namespace)
  if (!path) return res.status(400).end()
  try {
    const media = await readMedia(path)
    if (!media) return res.status(404).end()
    res.setHeader('Content-Type', media.contentType)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'")
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
    return res.status(200).send(media.bytes)
  } catch (err) {
    console.error('Private media read failed:', err.message)
    return res.status(422).end()
  }
}
