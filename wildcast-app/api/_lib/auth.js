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

// Gate for the Figma plugin's own upload endpoint (api/import-figma-plugin.js)
// — a private/internal Figma plugin has no logged-in WildCast user at all,
// so the activation-key/role system above doesn't fit it. This is a single
// static shared secret instead (same pattern the existing Wild CMYK plugin
// already uses against its own backend), set once as the FIGMA_PLUGIN_KEY
// Vercel env var and baked into figma-plugin/code.js.
export function requirePluginKey(req, res) {
  const key = req.headers['x-plugin-key']
  if (!process.env.FIGMA_PLUGIN_KEY || key !== process.env.FIGMA_PLUGIN_KEY) {
    res.status(403).json({ error: 'A valid plugin key is required for this endpoint.' })
    return false
  }
  return true
}
