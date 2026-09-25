// Photoroom Remove Background proxy - same approach as wild-scale's
// functions/api/premium-remove-bg.js, ported to a Vercel function. Keeps
// PHOTOROOM_API_KEY server-side. The browser sends the raw image bytes as
// the request body (see src/lib/removeBackground.js, which downscales it
// first), and gets the cut-out back as WebP.
//
// WebP rather than PNG only because of Vercel's 4.5MB cap on a serverless
// function's request AND response body - a full-res PNG cut-out of a photo
// can blow past it. The client converts the WebP back to PNG straight away,
// so everything downstream (library save, PDF export) still sees a PNG.
export const config = { api: { bodyParser: false } }

// The body is sent as application/octet-stream, which Vercel's request
// helpers hand over as a raw Buffer on req.body. Reading the stream directly
// is only a fallback: under `vercel dev` the stream has already been
// consumed by then (req.body getter or not), so a stream-only read came back
// empty - "No image provided" on every upload (found 2026-09-25).
async function readBody(req) {
  try {
    if (Buffer.isBuffer(req.body)) return req.body
  } catch {
    // req.body's lazy parser can throw - fall through to the raw stream
  }
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  if (!process.env.PHOTOROOM_API_KEY) {
    return res.status(500).json({ error: 'Background removal is not configured on this deployment' })
  }

  const buffer = await readBody(req)
  if (!buffer.length) return res.status(400).json({ error: 'No image provided' })

  const form = new FormData()
  // Always a JPEG - the client flattens and re-encodes before sending (see
  // src/lib/removeBackground.js); the request itself is octet-stream.
  form.append('image_file', new Blob([buffer], { type: 'image/jpeg' }), 'upload.jpg')
  form.append('format', 'webp')

  let response
  try {
    response = await fetch('https://sdk.photoroom.com/v1/segment', {
      method: 'POST',
      headers: { 'x-api-key': process.env.PHOTOROOM_API_KEY },
      body: form,
    })
  } catch {
    return res.status(502).json({ error: 'Could not reach the background removal service - check your connection' })
  }

  if (!response.ok) {
    if (response.status === 402 || response.status === 429) {
      return res.status(response.status).json({ error: 'Background removal quota reached' })
    }
    return res.status(response.status).json({ error: `Background removal error (${response.status})` })
  }

  res.setHeader('Content-Type', response.headers.get('content-type') || 'image/webp')
  res.send(Buffer.from(await response.arrayBuffer()))
}
