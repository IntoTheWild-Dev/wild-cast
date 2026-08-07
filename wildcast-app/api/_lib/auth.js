// Server-side gate for designer-only API routes. The app's own role check
// (activation?.role === 'designer' in Header.jsx/App.jsx) only hides the UI —
// it was never enforced by the routes themselves, so anyone with the URL
// could call them directly with no key at all. Mirrors validate-key.js's
// WILDCAST_KEYS parsing so activation keys/roles stay the single source of
// truth instead of a second, divergent list.
function resolveKeyRole(key) {
  const raw = process.env.WILDCAST_KEYS || ''
  const keyMap = {}
  raw.split(',').forEach(entry => {
    const parts = entry.trim().split('|')
    if (parts.length === 3 || parts.length === 4) {
      keyMap[parts[0].trim()] = (parts[3]?.trim()) || 'partner'
    }
  })
  return keyMap[(key || '').trim()]
}

// Call at the top of a designer-only handler: `if (!requireDesignerKey(req, res)) return`.
// Sends the 403 itself on failure so callers don't need their own error branch.
export function requireDesignerKey(req, res) {
  const key = req.headers['x-activation-key']
  if (resolveKeyRole(key) !== 'designer') {
    res.status(403).json({ error: 'A designer activation key is required for this endpoint.' })
    return false
  }
  return true
}
