import { useState, useEffect, useRef } from 'react'
import { ApproveIcon, RequestChangesIcon } from './ActionIcons'
import { CommentPinLayer, CommentThreadCard } from './CanvasComments'
import { buildThreads, hasOpenThread } from '../lib/commentThreads'
import useIsMobile from '../lib/useIsMobile'
import { showAlert } from '../lib/dialog'

export default function ReviewPage({ projectId, reviewerName, workflowRole }) {
  const isMobile = useIsMobile()
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
  // Only a Manager approves / requests changes (Anang's ask, 2026-09-25).
  // "View as: Designer" makes that bar read-only. A reviewer who isn't
  // signed in has no role picked, and App.jsx defaults that to Manager - so
  // an outside partner opening the link can still decide, as before.
  const canDecide = workflowRole !== 'Designer'
  // Request changes needs a written reason (an open comment). Instead of a
  // greyed-out button that only explained itself in a hover tooltip - it
  // read as "read-only" (Anang, 2026-09-25) - the button is always
  // clickable; with no comment yet it points at the comment box instead.
  const commentBoxRef = useRef(null)
  const [needsCommentHint, setNeedsCommentHint] = useState(false)
  // Pinned thread whose popover is open on the preview (CanvasComments.jsx).
  const [selectedThreadId, setSelectedThreadId] = useState(null)

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
    if (!canDecide || approving || project?.reviewStatus === 'approved') return
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
      showAlert(err.message, { title: 'Could not approve' })
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
    if (!canDecide || requestingChanges || project?.reviewStatus === 'changes_requested') return
    // A note typed in the box but not yet sent counts as the written reason
    // and goes out with the request - no separate "Send comment" click first
    // (Annika, 2026-10-01: the extra step was pure friction).
    const hasDraft = !!text.trim() && !!name.trim()
    if (!hasOpenFeedback && !hasDraft) {
      setNeedsCommentHint(true)
      commentBoxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      commentBoxRef.current?.focus()
      return
    }
    setRequestingChanges(true)
    try {
      await sendNote()
      setProject(prev => ({ ...prev, reviewStatus: 'changes_requested' }))
      const res = await fetch('/api/save-project', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, status: 'changes_requested', by: name }),
      })
      if (!res.ok) throw new Error('Failed to request changes')
    } catch (err) {
      setProject(prev => ({ ...prev, reviewStatus: 'review' }))
      showAlert(err.message, { title: 'Could not request changes' })
    } finally {
      setRequestingChanges(false)
    }
  }

  // A pinned comment or a thread reply from the preview's pin layer. Same
  // reviewer identity (the name field) as the general comment form below;
  // returns the new id so the layer can open the new pin's thread.
  async function postComment(extra, text) {
    const res = await fetch('/api/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, name: name.trim(), text, ...extra }),
    })
    if (!res.ok) throw new Error('Failed to submit comment')
    const { id } = await res.json()
    await loadComments()
    return id
  }

  // Posts the general-note box as a comment. A no-op (returns false) when the
  // box is empty or there's no name yet, so callers can call it unconditionally.
  async function sendNote() {
    if (!name.trim() || !text.trim()) return false
    const res = await fetch('/api/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, name: name.trim(), text: text.trim() }),
    })
    if (!res.ok) throw new Error('Failed to submit comment')
    setText('')
    await loadComments()
    return true
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      await sendNote()
    } catch (err) {
      showAlert(err.message, { title: 'Could not send' })
    } finally {
      setSubmitting(false)
    }
  }

  const hasOpenFeedback = hasOpenThread(comments)
  const threads = buildThreads(comments)

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
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: isMobile ? 'visible' : 'hidden' }}>

      {/* Approve / Request changes - a full-width bar at the top of the page
          (Julia's ask, 2026-09-23: these used to be small pill buttons
          tucked in the comment panel's corner, easy to miss next to the big
          canvas - now they're the first thing anyone sees on the page). */}
      {project?.reviewStatus === 'approved' ? (
        <div style={{ padding: '14px 20px', textAlign: 'center', background: 'rgba(22,163,74,0.08)', borderBottom: '1px solid rgba(22,163,74,0.25)', flexShrink: 0 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: '#16a34a' }}><ApproveIcon size={18} /> Approved</span>
        </div>
      ) : project?.reviewStatus === 'changes_requested' ? (
        <div style={{ padding: '14px 20px', textAlign: 'center', background: 'rgba(180,83,9,0.08)', borderBottom: '1px solid rgba(180,83,9,0.25)', flexShrink: 0 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: '#B45309' }}><RequestChangesIcon size={18} /> Changes requested - waiting on the creator</span>
        </div>
      ) : !canDecide ? (
        // View as Designer: the decision is the Manager's, so this is
        // read-only here - commenting still works below.
        <div style={{ padding: '14px 20px', textAlign: 'center', background: '#F9FAFB', borderBottom: '1px solid var(--border)', flexShrink: 0, fontSize: 13, color: 'var(--mid)' }}>
          Waiting for a Manager to approve or request changes. You're viewing as <strong style={{ color: 'var(--dark)' }}>Designer</strong> - view only.
        </div>
      ) : (
        <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, background: '#F9FAFB', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <button
            type="button"
            onClick={handleRequestChanges}
            disabled={requestingChanges}
            title={hasOpenFeedback ? 'Sends this back to the creator with your comments' : 'Tell the designer what to change - add a comment first'}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 22px', fontSize: 14, fontWeight: 700, borderRadius: 10, border: '1px solid #D97706',
              background: '#fff', color: requestingChanges ? 'var(--light)' : '#B45309',
              borderColor: requestingChanges ? 'var(--border)' : '#D97706',
              cursor: requestingChanges ? 'default' : 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {!requestingChanges && <RequestChangesIcon size={18} />}
            {requestingChanges ? 'Sending…' : 'Request changes'}
          </button>
          <button
            type="button"
            onClick={handleApprove}
            disabled={approving}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 22px', fontSize: 14, fontWeight: 700, borderRadius: 10, border: 'none',
              background: approving ? '#E5E7EB' : '#16a34a', color: approving ? 'var(--mid)' : '#fff',
              cursor: approving ? 'default' : 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {!approving && <ApproveIcon size={18} />}
            {approving ? 'Approving…' : 'Approve'}
          </button>
        </div>
      )}

    {/* Phone width: design on top, comments underneath (full width) - side
        by side, the 360px comment panel alone overflowed a 390px screen. */}
    <div style={isMobile ? { display: 'flex', flexDirection: 'column' } : { flex: 1, display: 'flex', overflow: 'hidden' }}>

      {/* Canvas / preview area. Clicking anywhere on the design drops a
          pinned comment (Anang's ask, 2026-09-28) - the preview has no
          other click behaviour here, so unlike the editor there's no
          separate comment mode to switch on. The wrapper takes the preview's
          own aspect ratio (632x882, see App.jsx's makePreview) so the pin
          layer covers exactly the image - sized with container query units
          so it's the largest box of that ratio that fits the area. */}
      <div style={{ flex: isMobile ? 'none' : 1, height: isMobile ? '72vh' : undefined, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#1a1a1a', overflow: 'hidden', padding: isMobile ? 16 : 40, gap: 14, minWidth: 0 }}>
        {(project?.previewHd || project?.preview || project?.thumbnail) ? (
          <>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', flexShrink: 0 }}>
              Click anywhere on the design to leave a comment
            </div>
            <div style={{ flex: 1, minHeight: 0, width: '100%', containerType: 'size', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ position: 'relative', width: 'min(100cqw, calc(100cqh * 632 / 882))', aspectRatio: '632 / 882' }}>
              <img
                src={project.previewHd || project.preview || project.thumbnail}
                alt={project.templateName}
                style={{ display: 'block', width: '100%', height: '100%', objectFit: 'fill', borderRadius: 4, boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }}
              />
              <CommentPinLayer
                threads={threads}
                active
                selectedId={selectedThreadId}
                onSelect={setSelectedThreadId}
                onCreate={(pin, text) => postComment({ pin }, text)}
                onReply={(rootId, text) => postComment({ parentId: rootId }, text)}
                onToggleResolved={handleToggleResolved}
                needName
                name={name}
                onNameChange={setName}
              />
            </div>
            </div>
          </>
        ) : (
          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>No preview available</div>
        )}
      </div>

      {/* Comment panel */}
      <div style={{ width: isMobile ? '100%' : 360, borderLeft: isMobile ? 'none' : '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: '#fff', flexShrink: 0 }}>

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
              No comments yet - click the design to pin one, or leave a general comment below.
            </div>
          ) : (
            threads.map(t => (
              <CommentThreadCard
                key={t.root.id}
                thread={t}
                selected={t.root.id === selectedThreadId}
                onSelect={setSelectedThreadId}
                onToggleResolved={handleToggleResolved}
                background="#F9FAFB"
              />
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
          {needsCommentHint && !hasOpenFeedback && (
            <div role="alert" style={{ fontSize: 12, lineHeight: 1.5, color: '#92400E', background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 8, padding: '8px 10px' }}>
              Tell the designer what to change first - pin a comment on the design or type a note here, then click <strong>Request changes</strong> again.
            </div>
          )}
          <textarea
            ref={commentBoxRef}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={needsCommentHint && !hasOpenFeedback ? 'What should the designer change?' : 'Add a general note (optional)…'}
            rows={4}
            style={{ padding: '9px 11px', fontSize: 13, border: `1px solid ${needsCommentHint && !hasOpenFeedback ? '#F59E0B' : 'var(--border)'}`, borderRadius: 8, resize: 'vertical', outline: 'none', fontFamily: 'inherit', color: 'var(--dark)', lineHeight: 1.5 }}
            onFocus={e => e.currentTarget.style.borderColor = 'var(--primary)'}
            onBlur={e => e.currentTarget.style.borderColor = needsCommentHint && !hasOpenFeedback ? '#F59E0B' : 'var(--border)'}
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
