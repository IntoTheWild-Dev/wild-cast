// Per-person usage counts for AI features (Julia's ask, 2026-09-30: no credit
// cap for now, but record real numbers so a cap can be decided later).
// One small JSON blob per person per day: usage/<person>/<YYYY-MM-DD>.json.
// Best-effort: a failed write never blocks the feature. Two calls landing in
// the same instant can lose one count - fine for rough usage numbers.
import { list, put } from '@vercel/blob'

function safe(s) {
  return String(s).trim().toLowerCase().replace(/[^a-z0-9]/g, '-')
}

export async function recordUsage(caller, feature) {
  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN
    const day = new Date().toISOString().slice(0, 10)
    const path = `usage/${safe(caller.id)}/${day}.json`
    let record = { id: caller.id, name: caller.name, role: caller.role, day, counts: {} }
    const { blobs } = await list({ prefix: path, token })
    const match = blobs.find(b => b.pathname === path)
    if (match) {
      const r = await fetch(match.url + (match.url.includes('?') ? '&' : '?') + `_t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (r.ok) record = await r.json()
    }
    record.counts[feature] = (record.counts[feature] || 0) + 1
    await put(path, JSON.stringify(record), {
      access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json', token,
    })
  } catch (err) {
    console.error('recordUsage failed (ignored):', err)
  }
}

// Everyone's usage, summed per person. Used by api/usage.js.
export async function summariseUsage() {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  const { blobs } = await list({ prefix: 'usage/', token })
  const records = (await Promise.all(blobs.map(async b => {
    const r = await fetch(b.url + (b.url.includes('?') ? '&' : '?') + `_t=${Date.now()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    return r.ok ? r.json() : null
  }))).filter(Boolean)

  const people = {}
  for (const rec of records) {
    const p = people[rec.id] ||= { id: rec.id, name: rec.name, role: rec.role, total: 0, byFeature: {}, days: {} }
    for (const [feature, n] of Object.entries(rec.counts || {})) {
      p.total += n
      p.byFeature[feature] = (p.byFeature[feature] || 0) + n
      p.days[rec.day] = (p.days[rec.day] || 0) + n
    }
  }
  const list_ = Object.values(people).sort((a, b) => b.total - a.total)
  return { totalCalls: list_.reduce((n, p) => n + p.total, 0), people: list_ }
}
