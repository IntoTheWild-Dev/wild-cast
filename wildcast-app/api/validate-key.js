// Validates an activation key against the WILDCAST_KEYS environment variable.
// Set WILDCAST_KEYS in Vercel dashboard as:
//   WOLT-DE-demo-key|Wolt DE|20,WILD-Demo-KEY|Wild Stack|100
// Format: key|Client Name|credits  (comma-separated for multiple keys)
export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { key } = req.body ?? {}
  if (!key || typeof key !== 'string' || !key.trim()) {
    return res.status(400).json({ valid: false, error: 'Activation key is required' })
  }

  const raw = process.env.WILDCAST_KEYS || ''
  const keyMap = {}
  raw.split(',').forEach(entry => {
    const parts = entry.trim().split('|')
    if (parts.length === 3) {
      keyMap[parts[0].trim()] = {
        client_name: parts[1].trim(),
        total_credits: parseInt(parts[2].trim(), 10) || 0,
      }
    }
  })

  const match = keyMap[key.trim()]
  if (!match) {
    return res.status(404).json({ valid: false, error: 'Invalid activation key' })
  }

  return res.status(200).json({
    valid: true,
    client_name: match.client_name,
    total_credits: match.total_credits,
  })
}
