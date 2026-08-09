import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowDown01Icon } from '@hugeicons/core-free-icons'

// Native <select> with the browser's default (inconsistently-spaced) arrow
// replaced by a Hugeicons chevron, positioned with proper breathing room.
export default function Select({ style = {}, ...props }) {
  // Margin is pulled onto the wrapper instead of the <select> itself —
  // left on the select, it leaks into the wrapper's own auto height (an
  // inline-block contains its in-flow children's margins), throwing off
  // the icon's top:50% centering by exactly the margin amount.
  const { width, margin, marginTop, marginRight, marginBottom, marginLeft, ...selectStyle } = style
  return (
    <div style={{ position: 'relative', display: 'inline-block', width: width || 'auto', verticalAlign: 'top', margin, marginTop, marginRight, marginBottom, marginLeft }}>
      <select
        {...props}
        style={{
          ...selectStyle,
          width: '100%',
          appearance: 'none',
          WebkitAppearance: 'none',
          MozAppearance: 'none',
          paddingRight: 34,
          cursor: 'pointer',
        }}
      />
      <HugeiconsIcon
        icon={ArrowDown01Icon}
        size={16}
        style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(calc(-50% - 1px))', pointerEvents: 'none', color: 'var(--mid)' }}
      />
    </div>
  )
}
