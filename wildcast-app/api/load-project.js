export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const { url } = req.query
  if (!url) return res.status(400).json({ error: 'Missing url' })

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
    })
    if (!response.ok) throw new Error(`Blob fetch failed: ${response.status}`)
    const project = await response.json()
    return res.status(200).json(project)
  } catch (err) {
    console.error('load-project error:', err)
    return res.status(500).json({ error: err.message })
  }
}
