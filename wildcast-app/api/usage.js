// Read-only AI usage report per person, for the Wild Stack team only.
// Open /api/usage while signed in (or call it with the same headers the app
// sends) to see who is using AI Suggest and the Prompt Brief chat, and how much.
import { requireDesignerKey } from './_lib/auth.js'
import { summariseUsage } from './_lib/usage.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  if (!(await requireDesignerKey(req, res))) return
  try {
    return res.status(200).json(await summariseUsage())
  } catch (err) {
    console.error('usage error:', err)
    return res.status(500).json({ error: err.message })
  }
}
