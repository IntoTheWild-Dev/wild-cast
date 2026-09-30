import { verifySession } from './accounts.js'

// Server-side gate for designer-only API routes. The app's own role check
// (activation?.role === 'designer' in Header.jsx/App.jsx) only hides the UI —
// it was never enforced by the routes themselves, so anyone with the URL
// could call them directly with no key at all. Mirrors validate-key.js's
// WILDCAST_KEYS parsing so activation keys/roles stay the single source of
// truth instead of a second, divergent list.
// Shared activation keys are being phased out in favour of personal accounts.
// Set ACTIVATION_KEYS_END in Vercel to a date-time with an offset, e.g.
// 2026-10-05T00:00:00+02:00 (Monday 5 Oct, Hamburg), and from that moment
// every key stops working everywhere (sign-in, template management, AI).
// Unset = keys keep working. An unreadable value is ignored (with a warning)
// rather than locking everyone out on a typo.
export function activationKeysEnabled() {
  const end = process.env.ACTIVATION_KEYS_END
  if (!end) return true
  const t = Date.parse(end)
  if (Number.isNaN(t)) {
    console.warn('ACTIVATION_KEYS_END is not a valid date, keys stay enabled:', end)
    return true
  }
  return Date.now() < t
}

function lookupKey(key) {
  if (!activationKeysEnabled()) return undefined
  const raw = process.env.WILDCAST_KEYS || ''
  const keyMap = {}
  raw.split(',').forEach(entry => {
    const parts = entry.trim().split('|')
    if (parts.length === 3 || parts.length === 4) {
      keyMap[parts[0].trim()] = { name: parts[1].trim(), role: (parts[3]?.trim()) || 'partner' }
    }
  })
  return keyMap[(key || '').trim()]
}

function resolveKeyRole(key) {
  return lookupKey(key)?.role
}

// Who is calling? Returns { kind: 'account' | 'key', id, name, role } or null.
// A personal account (X-Account-Email + X-Account-Token) is checked first,
// then a shared activation key (X-Activation-Key) while keys are still on.
export async function resolveCaller(req) {
  const email = req.headers['x-account-email']
  const sessionToken = req.headers['x-account-token']
  if (email && sessionToken) {
    try {
      const account = await verifySession(email, sessionToken)
      if (account) return { kind: 'account', id: account.email, name: account.displayName || account.email, role: account.role }
    } catch (err) {
      console.error('resolveCaller session check failed:', err)
    }
  }
  const match = lookupKey(req.headers['x-activation-key'])
  if (match) return { kind: 'key', id: `key:${match.name}`, name: match.name, role: match.role }
  return null
}

// Gate for any route that spends money or writes data: refuses (401) anyone
// who is neither a signed-in account nor a live activation key. Returns the
// caller, or null after sending the error itself.
export async function requireCaller(req, res) {
  const caller = await resolveCaller(req)
  if (!caller) {
    res.status(401).json({ error: 'Please sign in to use this feature.' })
    return null
  }
  return caller
}

// role: 'agency' (Wild Stack's own keys) gets everything 'designer' gets,
// plus the Figma import screen — a client-facing key can be handed
// role:'designer' to test template management (archive, publish, zone
// review) without also unlocking the still-in-development import feature
// itself. See api/validate-key.js for the WILDCAST_KEYS format.
const DESIGNER_TIER_ROLES = ['designer', 'agency']

// Call at the top of a designer-tier handler:
// `if (!(await requireDesignerKey(req, res))) return`.
// Sends the 403 itself on failure so callers don't need their own error branch.
// Two ways in: a shared activation key with a designer-tier role (old path,
// until keys are switched off), or a personal account whose role is
// designer-tier - i.e. the Wild Stack team (@wildstack.studio,
// @intothewild.hamburg). Clients ('partner') are refused either way.
export async function requireDesignerKey(req, res) {
  const key = req.headers['x-activation-key']
  if (DESIGNER_TIER_ROLES.includes(resolveKeyRole(key))) return true

  const email = req.headers['x-account-email']
  const sessionToken = req.headers['x-account-token']
  if (email && sessionToken) {
    try {
      const account = await verifySession(email, sessionToken)
      if (account && DESIGNER_TIER_ROLES.includes(account.role)) return true
    } catch (err) {
      console.error('requireDesignerKey session check failed:', err)
    }
  }

  res.status(403).json({ error: 'A Wild Stack team account or designer key is required for this endpoint.' })
  return false
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
