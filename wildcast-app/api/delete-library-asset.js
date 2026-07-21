import { del } from '@vercel/blob'

export default async function handler(req, res) {
  if (req.method !== 'DELETE') return res.status(405).end()

  const { url } = req.query
  if (!url) return res.status(400).json({ error: 'Missing url' })

  try {
    await del(url, { token: process.env.BLOB_READ_WRITE_TOKEN })
    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('delete-library-asset error:', err)
    return res.status(500).json({ error: err.message })
  }
}
