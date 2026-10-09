import { useState, useEffect, useRef } from 'react'
import { showAlert } from '../lib/dialog'

// Figma-style pinned comments (Anang's ask, 2026-09-28): click anywhere on
// the design to drop a numbered pin with its own reply thread. Shared by the
// editor canvas (App.jsx, via TemplateCanvas's `overlay` slot) and the
// review link's preview image (ReviewPage.jsx).
//
// A pin's position is stored as 0-1 fractions of the design's trim area -
// the same area the saved preview image shows - so it sits in the same spot
// at any zoom level, and on both screens. Replies carry `parentId` (see
// api/comments.js). Comments saved before this have neither field and show
// up as plain, unpinned threads, same as before.

const PIN_SIZE = 26
// Amber, like the editor's Review panel - deliberately not the brand pink,
// which the canvas's numbered field markers already use.
const PIN_COLOR = '#D97706'

function formatTime(ts) {
  return new Date(ts).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function PinMarker({ number, resolved, selected, draft, onClick, x, y }) {
  return (
    <button
      type="button"
      data-comment-ui=""
      onClick={onClick}
      title={draft ? 'New comment' : `Comment ${number}`}
      style={{
        position: 'absolute', left: `${x * 100}%`, top: `${y * 100}%`,
        // Tip (the square bottom-left corner) sits exactly on the clicked point.
        transform: 'translate(0, -100%)',
        width: PIN_SIZE, height: PIN_SIZE, padding: 0,
        borderRadius: '50% 50% 50% 0',
        border: '2px solid #fff',
        background: draft ? 'var(--dark, #111)' : resolved ? '#9CA3AF' : PIN_COLOR,
        color: '#fff', fontSize: 11, fontWeight: 800, fontFamily: 'inherit',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: selected ? '0 0 0 3px rgba(17,17,17,0.35), 0 4px 12px rgba(0,0,0,0.35)' : '0 3px 10px rgba(0,0,0,0.3)',
        cursor: 'pointer', pointerEvents: 'auto', zIndex: selected || draft ? 3 : 2,
        opacity: resolved && !selected ? 0.75 : 1,
      }}
    >
      {draft ? '+' : number}
    </button>
  )
}

function Message({ c, resolvedRoot }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
        <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--dark)' }}>
          {c.name}
          {c.from === 'designer' && <span style={{ fontWeight: 600, color: 'var(--primary)' }}> · designer</span>}
          {c.from === 'manager' && <span style={{ fontWeight: 600, color: '#15803D' }}> · manager</span>}
        </span>
        <span style={{ fontSize: 10, color: 'var(--mid)', whiteSpace: 'nowrap' }}>{formatTime(c.createdAt)}</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--dark)', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word', textDecoration: resolvedRoot ? 'line-through' : 'none' }}>{c.text}</div>
    </div>
  )
}

// Text box + send button, shared by the new-comment and reply states. Enter
// sends, Shift+Enter adds a line - same as Figma/Slack.
function Composer({ placeholder, submitLabel, onSubmit, autoFocus, needName, name, onNameChange }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const nameMissing = needName && !name?.trim()
  const disabled = busy || !text.trim() || nameMissing

  async function submit() {
    if (disabled) return
    setBusy(true)
    try {
      await onSubmit(text.trim())
      setText('')
    } catch (err) {
      showAlert(err.message, { title: 'Could not send' })
    } finally {
      setBusy(false)
    }
  }

  const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 8, outline: 'none', fontFamily: 'inherit', color: 'var(--dark)', background: '#fff' }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {needName && (
        <input value={name} onChange={e => onNameChange(e.target.value)} placeholder="Your name" style={inputStyle} />
      )}
      <textarea
        autoFocus={autoFocus}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
        placeholder={placeholder}
        rows={2}
        style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
      />
      <button
        type="button"
        onClick={submit}
        disabled={disabled}
        style={{
          alignSelf: 'flex-end', padding: '6px 14px', fontSize: 12, fontWeight: 700, borderRadius: 8, border: 'none', fontFamily: 'inherit',
          background: disabled ? '#E5E7EB' : 'var(--primary)', color: disabled ? 'var(--mid)' : '#fff',
          cursor: disabled ? 'default' : 'pointer',
        }}
      >
        {busy ? 'Sending…' : submitLabel}
      </button>
    </div>
  )
}

function Popover({ x, y, children }) {
  // Opens on whichever side of the pin has more room, so it doesn't run off
  // the design's right or bottom edge.
  const flipX = x > 0.55
  const flipY = y > 0.6
  return (
    <div
      data-comment-ui=""
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
      style={{
        position: 'absolute', left: `${x * 100}%`, top: `${y * 100}%`,
        transform: `translate(${flipX ? 'calc(-100% - 10px)' : `${PIN_SIZE + 8}px`}, ${flipY ? '-100%' : `-${PIN_SIZE}px`})`,
        width: 280, maxHeight: 380, display: 'flex', flexDirection: 'column',
        background: '#fff', borderRadius: 12, border: '1px solid var(--border)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.3)', pointerEvents: 'auto', zIndex: 4,
        cursor: 'default', textAlign: 'left',
      }}
    >
      {children}
    </div>
  )
}

const CLOSE_ICON = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
)

// A comment-bubble cursor, so comment mode reads as a different tool.
const COMMENT_CURSOR = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M3 21V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H7z" fill="#D97706" stroke="#fff" stroke-width="1.5"/></svg>')}") 2 22, crosshair`

// The pin layer: sits exactly over the design (the parent positions it) and
// is transparent to clicks unless `active`, so the editor canvas underneath
// keeps working normally outside comment mode. Pins and the open popover are
// always clickable.
export function CommentPinLayer({ threads, active, selectedId, onSelect, onCreate, onReply, onToggleResolved, needName, name, onNameChange }) {
  const [draft, setDraft] = useState(null) // { x, y } of a pin not posted yet
  const layerRef = useRef(null)

  // Clicking anywhere outside the open popover closes it, like Figma - no
  // need to hit the X. Pins, popovers and sidebar thread cards are marked
  // data-comment-ui and handle their own clicks (switching threads). A click
  // on the pin layer itself is handled in handleLayerClick below.
  useEffect(() => {
    if (!draft && !selectedId) return
    function onPointerDown(e) {
      if (e.target.closest?.('[data-comment-ui]')) return
      if (layerRef.current && e.target === layerRef.current) return
      setDraft(null)
      if (selectedId) onSelect(null)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [draft, selectedId, onSelect])

  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape') return
      if (draft) setDraft(null)
      else if (selectedId) onSelect(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [draft, selectedId, onSelect])

  // Leaving comment mode drops a half-written pin. Adjusted during render
  // rather than in an effect - same pattern as App.jsx's reviewSent reset.
  const [prevActive, setPrevActive] = useState(active)
  if (prevActive !== active) {
    setPrevActive(active)
    if (!active) setDraft(null)
  }

  function handleLayerClick(e) {
    if (!active || e.target !== e.currentTarget) return
    // With a popover open, a click on empty design just closes it - it
    // doesn't also drop a new pin in the same click.
    if (draft || selectedId) {
      setDraft(null)
      onSelect(null)
      return
    }
    const rect = layerRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    if (x < 0 || x > 1 || y < 0 || y > 1) return
    onSelect(null)
    setDraft({ x, y })
  }

  const pinned = threads.filter(t => t.root.pin)
  const selected = pinned.find(t => t.root.id === selectedId)

  return (
    <div
      ref={layerRef}
      onClick={handleLayerClick}
      style={{
        position: 'absolute', inset: 0, zIndex: 20,
        pointerEvents: active ? 'auto' : 'none',
        cursor: active ? COMMENT_CURSOR : 'default',
      }}
    >
      {pinned.map(t => (
        <PinMarker
          key={t.root.id}
          x={t.root.pin.x} y={t.root.pin.y}
          number={t.number}
          resolved={t.root.resolved}
          selected={t.root.id === selectedId}
          onClick={e => { e.stopPropagation(); setDraft(null); onSelect(t.root.id === selectedId ? null : t.root.id) }}
        />
      ))}

      {draft && (
        <>
          <PinMarker draft x={draft.x} y={draft.y} onClick={e => e.stopPropagation()} />
          <Popover x={draft.x} y={draft.y}>
            <div style={{ padding: '10px 12px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--dark)' }}>New comment</span>
              <button type="button" onClick={() => setDraft(null)} title="Cancel (Esc)" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--mid)', padding: 2, display: 'flex' }}>{CLOSE_ICON}</button>
            </div>
            <div style={{ padding: 12 }}>
              <Composer
                autoFocus
                placeholder="Add a comment…"
                submitLabel="Post"
                needName={needName}
                name={name}
                onNameChange={onNameChange}
                onSubmit={async text => {
                  const id = await onCreate(draft, text)
                  setDraft(null)
                  if (id) onSelect(id)
                }}
              />
            </div>
          </Popover>
        </>
      )}

      {selected && !draft && (
        <Popover x={selected.root.pin.x} y={selected.root.pin.y}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--dark)', flex: 1 }}>Comment {selected.number}</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--mid)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={!!selected.root.resolved} onChange={e => onToggleResolved(selected.root.id, e.target.checked)} style={{ cursor: 'pointer' }} />
              Done
            </label>
            <button type="button" onClick={() => onSelect(null)} title="Close (Esc)" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--mid)', padding: 2, display: 'flex' }}>{CLOSE_ICON}</button>
          </div>
          <div style={{ padding: '10px 12px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
            <Message c={selected.root} resolvedRoot={selected.root.resolved} />
            {selected.replies.map(r => <Message key={r.id} c={r} />)}
          </div>
          <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)' }}>
            <Composer
              key={selected.root.id}
              placeholder="Reply…"
              submitLabel="Reply"
              needName={needName}
              name={name}
              onNameChange={onNameChange}
              onSubmit={text => onReply(selected.root.id, text)}
            />
          </div>
        </Popover>
      )}
    </div>
  )
}

// One thread in a sidebar list: the root comment, its replies indented
// underneath, a number matching its canvas pin, and a Done checkbox that
// resolves the whole thread. Clicking a pinned thread opens it on the design.
export function CommentThreadCard({ thread, selected, onSelect, onToggleResolved, background = '#fff', borderColor = 'var(--border)' }) {
  const { root, replies, number } = thread
  const isDesigner = root.from === 'designer'
  const clickable = !!root.pin
  return (
    <div
      data-comment-ui=""
      onClick={clickable ? () => onSelect(selected ? null : root.id) : undefined}
      style={{
        background: isDesigner ? 'var(--primary-glow)' : background,
        borderRadius: 10, padding: '10px 12px',
        border: `1px solid ${selected ? PIN_COLOR : isDesigner ? 'rgba(223,111,109,0.3)' : borderColor}`,
        boxShadow: selected ? '0 0 0 2px rgba(217,119,6,0.25)' : 'none',
        opacity: root.resolved ? 0.6 : 1,
        cursor: clickable ? 'pointer' : 'default',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span
          title={root.pin ? 'Pinned on the design - click to show it' : 'General comment'}
          style={{
            minWidth: 18, height: 18, padding: '0 5px', boxSizing: 'border-box',
            borderRadius: root.pin ? '50% 50% 50% 0' : 9,
            background: root.pin ? (root.resolved ? '#9CA3AF' : PIN_COLOR) : '#E5E7EB',
            color: root.pin ? '#fff' : 'var(--mid)',
            fontSize: 10, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          {number}
        </span>
        <span style={{ fontSize: 10, color: 'var(--mid)', flex: 1 }}>{root.pin ? 'On the design' : 'General'}</span>
        <label onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--mid)', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={!!root.resolved} onChange={e => onToggleResolved(root.id, e.target.checked)} style={{ cursor: 'pointer' }} />
          Done
        </label>
      </div>
      <Message c={root} resolvedRoot={root.resolved} />
      {replies.length > 0 && (
        <div style={{ marginTop: 8, paddingLeft: 10, borderLeft: '2px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {replies.map(r => <Message key={r.id} c={r} />)}
        </div>
      )}
    </div>
  )
}
