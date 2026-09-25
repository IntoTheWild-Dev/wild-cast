// Centred loading spinner for a page's content area while its data loads
// (My Tasks, Assets, Design library, Templates - Anang's ask, 2026-09-25,
// replacing a small grey "Loading…" line in the top-left corner). Fills the
// remaining height of a flex-column page so it sits in the middle of the
// empty space, not just under the title strip. Icon only, no visible text
// (Anang's ask) - `label` is still read out to screen readers.
const KEYFRAMES = '@keyframes page-spin { to { transform: rotate(360deg) } }'

export default function PageSpinner({ label = 'Loading…' }) {
  return (
    <div role="status" aria-live="polite" aria-label={label} style={{ flex: 1, minHeight: '50vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 }}>
      <style>{KEYFRAMES}</style>
      <span style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid var(--border)', borderTopColor: 'var(--primary)', animation: 'page-spin 0.8s linear infinite' }} />
    </div>
  )
}
