// Thread helpers for pinned comments (see components/CanvasComments.jsx and
// api/comments.js). Kept out of the component file so it only exports
// components (react-refresh).

// Groups the flat comment list into threads, oldest first, numbered in that
// order - the same number shows on the canvas pin and the sidebar card. A
// reply whose root is missing (shouldn't happen) is shown as its own thread
// rather than silently dropped.
export function buildThreads(comments) {
  const byId = new Map(comments.map(c => [c.id, c]))
  const roots = []
  const replies = new Map()
  for (const c of comments) {
    if (c.parentId && byId.has(c.parentId)) {
      if (!replies.has(c.parentId)) replies.set(c.parentId, [])
      replies.get(c.parentId).push(c)
    } else {
      roots.push(c)
    }
  }
  const byTime = (a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0)
  return roots.sort(byTime).map((root, i) => ({
    root,
    replies: (replies.get(root.id) ?? []).sort(byTime),
    number: i + 1,
  }))
}

// "Open feedback" for the Request changes gate - an unresolved thread, not
// an unresolved reply inside a thread that's already been marked done.
export function hasOpenThread(comments) {
  return comments.some(c => !c.resolved && !c.parentId)
}
