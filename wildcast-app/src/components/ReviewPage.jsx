import { useState, useEffect } from 'react'

function formatDateTime(ts) {
  return new Date(ts).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function ReviewPage({ projectId, reviewerName }) {
  const [project, setProject]       = useState(null)
  const [comments, setComments]     = useState([])
  // Prefilled for a signed-in visitor (Notion card "Partner review link",
  // 2026-09-22: "Account holders get their name prefilled") - still a plain
  // editable field either way, the user can always type over it.
  const [name, setName]             = useState(reviewerName || '')
  const [text, setText]             = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [copied, setCopied]         = useState(false)
  const [approving, setApproving]   = useState(false)
  const [requestingChanges, setRequestingChanges] = useState(false)

  // App.jsx's own activation state resolves asynchronously (a re-validation
  // fetch, not something available on the very first paint - see its own
  // useState initializer), so reviewerName is reliably still empty at the
  // moment this component first mounts and the useState above runs. This
  // fills the field in once it actually arrives, but only while the visitor
  // hasn't started typing their own name yet (prev || reviewerName) - it
  // must never clobber a name someone's already entered.
  useEffect(() => {
    if (reviewerName) setName(prev => prev || reviewerName)
  }, [reviewerName])

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

  // Bug fix, 2026-09-24: this page fetched reviewStatus once on mount and
  // never again, unlike comments (polled below). A reviewer whose tab
  // loaded while status was 'changes_requested' would see that banner
  // (which hides both action buttons) forever, even after the creator
  // resubmitted elsewhere and the real status moved back to 'review' -
  // stuck until a full manual page reload. Only reviewStatus is merged in
  // (not the whole project) so this can't clobber the optimistic local
  // update handleApprove/handleRequestChanges make the instant either
  // button is clicked, and doesn't re-fetch the preview/thumbnail images
  // every 5s for no reason.
  async function refreshReviewStatus() {
    const res = await fetch(`/api/get-review?id=${projectId}`)
    if (!res.ok) return
    const data = await res.json()
    setProject(prev => prev ? { ...prev, reviewStatus: data.reviewStatus } : prev)
  }

  // Poll so a reply the designer posts while this reviewer has the page open
  // shows up without a manual reload (Mark's ask, 2026-09-23: "refresh in
  // real-time so you can see it in the thread"). This is a JSON-blob-backed
  // API with no websocket/SSE channel, so polling is the pragmatic fix
  // rather than a push-based one. Skipped while `loading`/`error` so it
  // never fires before projectId has a real thread to read.
  useEffect(() => {
    if (loading || error) return
    const interval = setInterval(() => { loadComments(); refreshReviewStatus() }, 5000)
    return () => clearInterval(interval)
  }, [projectId, loading, error]) // eslint-disable-line react-hooks/exhaustive-deps

  // Optimistic - matches the same pattern used on the designer's side
  // (App.jsx's Feedback sidebar) so the checkbox feels instant either way.
  function handleToggleResolved(commentId, resolved) {
    setComments(prev => prev.map(c => c.id === commentId ? { ...c, resolved } : c))
    fetch('/api/comments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, commentId, resolved }),
    }).catch(() => {})
  }

  // "Approve" (Notion card "Review queue in the user profile", 2026-09-22):
  // the only place reviewStatus ever becomes 'approved' - the creator's own
  // side (App.jsx's doSave) only ever sets 'design'/'review'. Optimistic,
  // same pattern as handleToggleResolved above.
  async function handleApprove() {
    if (approving || project?.reviewStatus === 'approved') return
    setApproving(true)
    setProject(prev => ({ ...prev, reviewStatus: 'approved' }))
    try {
      const res = await fetch('/api/save-project', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, status: 'approved', by: name }),
      })
      if (!res.ok) throw new Error('Failed to approve')
    } catch (err) {
      setProject(prev => ({ ...prev, reviewStatus: 'review' }))
      alert('Could not approve: ' + err.message)
    } finally {
      setApproving(false)
    }
  }

  // "Request changes" (Mark's ask via Julia, 2026-09-23: a design should
  // either get approved first-shot or go back to the creator's task list
  // with the necessary changes, not just sit under "review" indefinitely
  // with no distinct signal). Gated on an open comment so the request
  // always carries a written reason - the same "Send comment" box above
  // this panel is how a reviewer leaves that reason before clicking this.
  // Same optimistic/rollback pattern as handleApprove.
  async function handleRequestChanges() {
    if (requestingChanges || !hasOpenFeedback || project?.reviewStatus === 'changes_requested') return
    setRequestingChanges(true)
    setProject(prev => ({ ...prev, reviewStatus: 'changes_requested' }))
    try {
      const res = await fetch('/api/save-project', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, status: 'changes_requested', by: name }),
      })
      if (!res.ok) throw new Error('Failed to request changes')
    } catch (err) {
      setProject(prev => ({ ...prev, reviewStatus: 'review' }))
      alert('Could not request changes: ' + err.message)
    } finally {
      setRequestingChanges(false)
    }
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

  const hasOpenFeedback = comments.some(c => !c.resolved)

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
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Approve / Request changes - a full-width bar at the top of the page
          (Julia's ask, 2026-09-23: these used to be small pill buttons
          tucked in the comment panel's corner, easy to miss next to the big
          canvas - now they're the first thing anyone sees on the page). */}
      {project?.reviewStatus === 'approved' ? (
        <div style={{ padding: '14px 20px', textAlign: 'center', background: 'rgba(22,163,74,0.08)', borderBottom: '1px solid rgba(22,163,74,0.25)', flexShrink: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#16a34a' }}>✓ Approved</span>
        </div>
      ) : project?.reviewStatus === 'changes_requested' ? (
        <div style={{ padding: '14px 20px', textAlign: 'center', background: 'rgba(180,83,9,0.08)', borderBottom: '1px solid rgba(180,83,9,0.25)', flexShrink: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#B45309' }}>↺ Changes requested - waiting on the creator</span>
        </div>
      ) : (
        <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, background: '#F9FAFB', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <button
            type="button"
            onClick={handleRequestChanges}
            disabled={requestingChanges || !hasOpenFeedback}
            title={hasOpenFeedback ? 'Sends this back to the creator with your comments below' : 'Leave a comment below first, so the creator knows what to change'}
            style={{
              padding: '10px 20px', fontSize: 13, fontWeight: 700, borderRadius: 8, border: '1px solid #D97706',
              background: '#fff', color: (requestingChanges || !hasOpenFeedback) ? 'var(--light)' : '#B45309',
              borderColor: (requestingChanges || !hasOpenFeedback) ? 'var(--border)' : '#D97706',
              cursor: (requestingChanges || !hasOpenFeedback) ? 'default' : 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {requestingChanges ? 'Sending…' : '↺ Request changes'}
          </button>
          <button
            type="button"
            onClick={handleApprove}
            disabled={approving}
            style={{
              padding: '10px 20px', fontSize: 13, fontWeight: 700, borderRadius: 8, border: 'none',
              background: approving ? '#E5E7EB' : '#16a34a', color: approving ? 'var(--mid)' : '#fff',
              cursor: approving ? 'default' : 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {approving ? 'Approving…' : '✓ Approve'}
          </button>
        </div>
      )}

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

        {/* Panel header - just the title now; Approve/Request changes moved
            to the prominent bar at the top of the page (see above). */}
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
              No comments yet - leave the first one below.
            </div>
          ) : (
            comments.map(c => (
              <div key={c.id} style={{ background: c.from === 'designer' ? 'var(--primary-glow)' : '#F9FAFB', borderRadius: 10, padding: '10px 14px', border: `1px solid ${c.from === 'designer' ? 'rgba(223,111,109,0.3)' : 'var(--border)'}`, opacity: c.resolved ? 0.6 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5, gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--dark)' }}>
                    {c.name}{c.from === 'designer' && <span style={{ fontWeight: 600, color: 'var(--primary)' }}> · designer</span>}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--mid)', whiteSpace: 'nowrap' }}>{formatDateTime(c.createdAt)}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--dark)', lineHeight: 1.55, textDecoration: c.resolved ? 'line-through' : 'none', marginBottom: 8 }}>{c.text}</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--mid)', cursor: 'pointer', width: 'fit-content' }}>
                  <input type="checkbox" checked={!!c.resolved} onChange={e => handleToggleResolved(c.id, e.target.checked)} style={{ cursor: 'pointer' }} />
                  Done
                </label>
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
    </div>
  )
}
