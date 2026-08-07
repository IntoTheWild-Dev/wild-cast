// Self-serve Figma → WildCast import. Pulls zone geometry + a real bleed
// background from a Figma master (see api/_lib/figma-import.js) and stores
// the result in Vercel Blob as a draft template — nothing is deployed live
// until a designer reviews it and calls /api/publish-template.
import { put, head } from '@vercel/blob'
import { importFigmaTemplate } from './_lib/figma-import.js'
import { requireDesignerKey } from './_lib/auth.js'

const TOKEN_PATH = 'config/figma-token.json'

// Figma personal access tokens expire (~every few months) and updating the
// Vercel env var means a dashboard visit + redeploy every time — not
// something Julia wants to need a developer for. The token can instead be
// stored in Blob and updated from inside the app (see the PUT handler
// below); this checks Blob first and falls back to the original env var
// only if nothing has been saved there yet.
async function resolveFigmaToken(blobToken) {
  try {
    const meta = await head(TOKEN_PATH, { token: blobToken })
    // The blob URL is stable (addRandomSuffix:false) — Cloudflare's CDN can
    // and does serve a stale cached response for it, which meant a token
    // saved seconds ago via PUT could still read back the OLD (possibly
    // actually-expired) value on the very next import. Same class of bug
    // already hit and fixed in list-templates.js/publish-template.js.
    const cacheBustUrl = meta.url + (meta.url.includes('?') ? '&' : '?') + `_t=${Date.now()}`
    const res = await fetch(cacheBustUrl, { headers: { Authorization: `Bearer ${blobToken}` }, cache: 'no-store' })
    if (res.ok) {
      const { token, updatedAt } = await res.json()
      if (token) return { token, source: 'blob', updatedAt }
    }
  } catch {
    // No stored token yet (first-ever run, or head() 404s) — fall through to env var.
  }
  return { token: process.env.FIGMA_TOKEN || null, source: 'env', updatedAt: null }
}

async function handleGet(req, res) {
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN
  const { token, source, updatedAt } = await resolveFigmaToken(blobToken)
  // Never return the token value itself — just enough for the UI to show
  // "configured, last updated on X" or "not configured".
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  return res.status(200).json({ configured: !!token, source, updatedAt })
}

async function handlePut(req, res) {
  const { token } = req.body ?? {}
  if (!token || typeof token !== 'string' || !token.trim()) {
    return res.status(400).json({ error: 'Missing token' })
  }
  try {
    const updatedAt = new Date().toISOString()
    await put(TOKEN_PATH, JSON.stringify({ token: token.trim(), updatedAt }), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
      token: process.env.BLOB_READ_WRITE_TOKEN,
    })
    return res.status(200).json({ ok: true, updatedAt })
  } catch (err) {
    console.error('update-figma-token error:', err)
    return res.status(500).json({ error: err.message })
  }
}

async function handlePost(req, res) {
  try {
    const { figmaUrl, slotKey, label, cat, format } = req.body ?? {}
    if (!figmaUrl || !slotKey || !label || !cat || !format) {
      return res.status(400).json({ error: 'Missing figmaUrl, slotKey, label, cat, or format' })
    }
    if (!/^[a-z0-9-]+$/.test(slotKey)) {
      return res.status(400).json({ error: 'slotKey must be lowercase letters/numbers/hyphens only' })
    }

    const { token } = await resolveFigmaToken(process.env.BLOB_READ_WRITE_TOKEN)
    if (!token) {
      return res.status(500).json({ error: 'Figma token is not configured — set it from the Import screen' })
    }

    const result = await importFigmaTemplate({ figmaUrl, token })

    const bgBlob = await put(`templates/${slotKey}-bg.png`, result.imageBuffer, {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'image/png',
      token: process.env.BLOB_READ_WRITE_TOKEN,
    })

    const record = {
      slotKey,
      label,
      cat,
      format,
      canvasW: 316,
      canvasH: 441,
      backgroundFill: '#00C2CB',
      backgroundUrl: bgBlob.url,
      zones: result.zones,
      needsReview: result.needsReview,
      live: false, // draft — never auto-publish over a real partner-facing slot
      figmaUrl,
      sourceFrameName: result.frameName,
      createdAt: new Date().toISOString(),
    }

    const recordBlob = await put(`templates/${slotKey}.json`, JSON.stringify(record), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
      token: process.env.BLOB_READ_WRITE_TOKEN,
    })

    return res.status(200).json({ ...record, recordUrl: recordBlob.url })
  } catch (err) {
    console.error('import-figma-template error:', err)
    return res.status(500).json({ error: err.message })
  }
}

export default async function handler(req, res) {
  if (!requireDesignerKey(req, res)) return
  if (req.method === 'GET') return handleGet(req, res)
  if (req.method === 'PUT') return handlePut(req, res)
  if (req.method === 'POST') return handlePost(req, res)
  return res.status(405).end()
}
