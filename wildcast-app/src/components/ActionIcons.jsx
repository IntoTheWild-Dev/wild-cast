import { HugeiconsIcon } from '@hugeicons/react'
import { CheckmarkCircle02Icon, PencilEdit02Icon, RefreshIcon as HugeRefreshIcon, RotateLeft01Icon } from '@hugeicons/core-free-icons'

// One place for the review/reset icons so every Approve / Request changes /
// reset button in the app uses the same proper icon (Anang's ask,
// 2026-09-25) - they used to be text glyphs (✓ ↺) that rendered small and
// looked different per font. Request changes is a pencil ("edit this"),
// not the old ↺, which read as "undo".
export function ApproveIcon({ size = 16 }) {
  return <HugeiconsIcon icon={CheckmarkCircle02Icon} size={size} />
}

export function RequestChangesIcon({ size = 16 }) {
  return <HugeiconsIcon icon={PencilEdit02Icon} size={size} />
}

export function ResetIcon({ size = 14 }) {
  return <HugeiconsIcon icon={RotateLeft01Icon} size={size} />
}

// Spins while `spinning` - used by "Refresh" buttons in place of the old ↻ glyph.
const REFRESH_SPIN_KEYFRAMES = '@keyframes refresh-icon-spin { to { transform: rotate(360deg) } }'

export function RefreshIcon({ size = 14, spinning = false }) {
  return (
    <>
      {spinning && <style>{REFRESH_SPIN_KEYFRAMES}</style>}
      <span style={{ display: 'inline-flex', animation: spinning ? 'refresh-icon-spin 0.8s linear infinite' : 'none' }}>
        <HugeiconsIcon icon={HugeRefreshIcon} size={size} />
      </span>
    </>
  )
}
