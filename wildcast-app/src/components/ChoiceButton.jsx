import { HugeiconsIcon } from '@hugeicons/react'
import { CheckmarkSquare01Icon, SquareIcon } from '@hugeicons/core-free-icons'

// Shared button-style option control, used in place of a native <select>
// wherever the option list is short and fixed - a native dropdown's click
// target and affordance are worse than just showing every option as a
// button (moved out of BriefingForm.jsx so other pages can reuse it).
//
// disabled: can't be picked at all - used for formats with no live template
// yet (checklist i10, 2026-09-08), rather than letting a partner select
// something the tool can't actually produce.
export default function ChoiceButton({ active, onClick, children, checkbox, disabled }) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={disabled ? "Coming soon - not available to pick yet" : undefined}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '8px 14px', fontSize: 13, fontWeight: 600, borderRadius: 8,
        cursor: disabled ? 'not-allowed' : 'pointer',
        border: `1.5px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
        background: active ? 'var(--primary-glow)' : '#fff',
        color: disabled ? 'var(--light)' : (active ? 'var(--primary-dark)' : 'var(--dark)'),
        opacity: disabled ? 0.6 : 1,
        transition: 'all 0.15s',
      }}
    >
      {checkbox ? <HugeiconsIcon icon={active ? CheckmarkSquare01Icon : SquareIcon} size={15} /> : null}{children}
      {disabled && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--light)' }}>· Coming soon</span>}
    </button>
  )
}
