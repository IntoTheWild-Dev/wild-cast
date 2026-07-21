import { useState, useEffect } from 'react'

function formatDateTime(ts) {
  return new Date(ts).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function ReviewPage({ projectId }) {
  const [project, setProject]       = useState(null)
  const [comments, setComments]     = useState([])
  const [name, setName]             = useState('')
  const [text, setText]             = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [copied, setCopied]         = useState(false)

  useEffect(() => {
    Promise.all([
      fetch(`/api/get-review?id=${projectId}`).then(r => r.json()),
      fetch(`/api/comments?id=${projectId}`).then(r => r.json()),
    ])
      .then(([proj, comm]) => {
        if (proj.error) throw new Error(proj.error)
        setProject(proj)
        setComments(comm.comments || [])
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [projectId])

  async function loadComments() {
    const res = await fetch(`/api/comments?id=${projectId}`)
    const data = await res.json()
    setComments(data.comments || [])
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim() || !text.trim() || submitting) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, name: name.trim(), text: text.trim() }),
      })
      if (!res.ok) throw new Error('Failed to submit comment')
      setText('')
      await loadComments()
    } catch (err) {
      alert(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mid)', fontSize: 14 }}>
      Loading design…
    </div>
  )

  if (error) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--dark)', marginBottom: 8 }}>Design not found</div>
        <div style={{ fontSize: 13, color: 'var(--mid)' }}>This link may have expired or the design was deleted.</div>
      </div>
    </div>
  )

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

      {/* Canvas / preview area */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a1a1a', overflow: 'auto', padding: 40 }}>
        {project?.preview ? (
          <img
            src={project.preview}
            alt={project.templateName}
            style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain', borderRadius: 4, boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }}
          />
        ) : project?.thumbnail ? (
          <img
            src={project.thumbnail}
            alt={project.templateName}
            style={{ height: 441, width: 316, objectFit: 'contain', borderRadius: 4, imageRendering: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }}
          />
        ) : (
          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>No preview available</div>
        )}
      </div>

      {/* Comment panel */}
      <div style={{ width: 360, borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: '#fff', flexShrink: 0 }}>

        {/* Panel header */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--dark)', marginBottom: 2 }}>Review</div>
          <div style={{ fontSize: 12, color: 'var(--mid)' }}>
            {project?.templateName} · {comments.length} comment{comments.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Comments list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {comments.length === 0 ? (
            <div style={{ color: 'var(--mid)', fontSize: 13, textAlign: 'center', paddingTop: 24 }}>
              No comments yet — leave the first one below.
            </div>
          ) : (
            comments.map(c => (
              <div key={c.id} style={{ background: '#F9FAFB', borderRadius: 10, padding: '10px 14px', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--dark)' }}>{c.name}</span>
                  <span style={{ fontSize: 10, color: 'var(--mid)', whiteSpace: 'nowrap', marginLeft: 8 }}>{formatDateTime(c.createdAt)}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--dark)', lineHeight: 1.55 }}>{c.text}</div>
              </div>
            ))
          )}
        </div>

        {/* Add comment form */}
        <form onSubmit={handleSubmit} style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Your name"
            required
            style={{ padding: '9px 11px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 8, outline: 'none', fontFamily: 'inherit', color: 'var(--dark)' }}
            onFocus={e => e.currentTarget.style.borderColor = 'var(--primary)'}
            onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
          />
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Leave your feedback…"
            required
            rows={4}
            style={{ padding: '9px 11px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 8, resize: 'vertical', outline: 'none', fontFamily: 'inherit', color: 'var(--dark)', lineHeight: 1.5 }}
            onFocus={e => e.currentTarget.style.borderColor = 'var(--primary)'}
            onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
          />
          <button
            type="submit"
            disabled={submitting || !name.trim() || !text.trim()}
            style={{
              padding: '10px', fontSize: 13, fontWeight: 700,
              background: (submitting || !name.trim() || !text.trim()) ? '#E5E7EB' : 'var(--primary)',
              color: (submitting || !name.trim() || !text.trim()) ? 'var(--mid)' : '#fff',
              border: 'none', borderRadius: 8,
              cursor: (submitting || !name.trim() || !text.trim()) ? 'default' : 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {submitting ? 'Sending…' : 'Send comment'}
          </button>
        </form>

      </div>
    </div>
  )
}
