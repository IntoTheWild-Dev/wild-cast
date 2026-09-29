// AI Suggest button — pair/queue model (Mark's v1.2 spec, §8.2).
//
// The old dropdown-with-six-options UI is gone: clicking now applies ONE
// line to the field directly ("one field, one click, one line"). The
// matching sub-headline/headline partner line travels with it (stored in
// the session queue in FieldEditor via lib/usePairQueue.js), so the next
// click on the other field shows the matching line with no new API call.
// Clicking again walks the queue; a new batch (empty queue, changed
// context, locked rewrite) is the only thing that costs a credit.
//
// The generation engine lives in FieldEditor.jsx (the queue is shared
// between the Headline and Sub-headline rows), so this component is the
// button + its inline error, plus the shared out-of-credits modal.

export default function AISuggest({ onSuggest, busy, error, onRetry, matchesOtherField }) {
  return (
    <>
      <button
        type="button"
        onClick={onSuggest}
        disabled={busy}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          fontSize: 11, fontWeight: 600, color: 'var(--primary)',
          background: 'var(--primary-glow)', border: '1px solid rgba(223,111,109,0.25)',
          borderRadius: 6, padding: '4px 10px', cursor: busy ? 'default' : 'pointer', whiteSpace: 'nowrap',
          opacity: busy ? 0.7 : 1,
        }}
        title={matchesOtherField
          ? 'Writes lines that match the other field. Uses 1 credit for a new batch.'
          : 'One AI line per click. Uses 1 credit per new batch.'}
      >
        <span>{busy ? '…' : '✦'}</span> {busy ? 'Writing…' : 'AI Suggest'}
      </button>

      {error && (
        <div style={{ width: '100%', fontSize: 12, color: '#B91C1C', textAlign: 'right' }}>
          {error}{' '}
          <button
            type="button"
            onClick={onRetry}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--primary)', padding: 0, textDecoration: 'underline' }}
          >
            Retry
          </button>
        </div>
      )}
    </>
  )
}

// A real notification box instead of a plain alert() - matching WildScale's
// own out-of-credits notice (Julia's ask, 2026-09-16). Rendered once by
// FieldEditor (the queue is shared by both AI fields).
export function AISuggestOutOfCreditsModal({ onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 28, maxWidth: 360, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', textAlign: 'center' }}>
        <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--dark)', marginBottom: 6 }}>Out of AI credits</div>
        <div style={{ fontSize: 13, color: 'var(--mid)', marginBottom: 20, lineHeight: 1.5 }}>
          Contact Wild Stack to top up.
        </div>
        <button
          onClick={onClose}
          style={{ width: '100%', padding: '11px', fontSize: 14, fontWeight: 700, borderRadius: 10, border: 'none', cursor: 'pointer', background: 'var(--primary)', color: '#fff' }}
        >
          Got it
        </button>
      </div>
    </div>
  )
}
