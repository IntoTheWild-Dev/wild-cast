import { put } from '@vercel/blob'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  try {
    const project = req.body
    if (!project?.id || !project?.templateId) {
      return res.status(400).json({ error: 'Missing project id or templateId' })
    }

    const blob = await put(`projects/${project.id}.json`, JSON.stringify(project), {
      access: 'public',
      addRandomSuffix: false,
      contentType: 'application/json',
      token: process.env.BLOB_READ_WRITE_TOKEN,
    })

    return res.status(200).json({ id: project.id, url: blob.url })
  } catch (err) {
    console.error('save-project error:', err)
    return res.status(500).json({ error: err.message })
  }
}
