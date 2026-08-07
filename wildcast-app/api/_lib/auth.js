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

// role: 'agency' (Wild Stack's own keys) gets everything 'designer' gets,
// plus the Figma import screen — a client-facing key can be handed
// role:'designer' to test template management (archive, publish, zone
// review) without also unlocking the still-in-development import feature
// itself. See api/validate-key.js for the WILDCAST_KEYS format.
const DESIGNER_TIER_ROLES = ['designer', 'agency']

// Call at the top of a designer-tier handler: `if (!requireDesignerKey(req, res)) return`.
// Sends the 403 itself on failure so callers don't need their own error branch.
export function requireDesignerKey(req, res) {
  const key = req.headers['x-activation-key']
  if (!DESIGNER_TIER_ROLES.includes(resolveKeyRole(key))) {
    res.status(403).json({ error: 'A designer activation key is required for this endpoint.' })
    return false
  }
  return true
}

// Stricter than requireDesignerKey — only role:'agency' passes. Use for the
// actual Figma import endpoint, not general template-management ones.
export function requireAgencyKey(req, res) {
  const key = req.headers['x-activation-key']
  if (resolveKeyRole(key) !== 'agency') {
    res.status(403).json({ error: 'An agency activation key is required for this endpoint.' })
    return false
  }
  return true
}
