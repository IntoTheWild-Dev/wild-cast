import { useEffect, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowLeft01Icon, Home01Icon } from '@hugeicons/core-free-icons'

// Mobile-style rounded pill fixed at the bottom centre - replaces the page's
// own "← Back" button (Anang's ask, 2026-10-19, starting with My Tasks).
// Renders its own bottom spacer so the fixed pill never covers the page's
// last row - pages just drop it in at the end of their content.
export default function FloatingNav({ onBack, onHome }) {
  const footerLift = useFooterLift()
  return (
    <>
    <div aria-hidden style={{ height: 76, flexShrink: 0 }} />
    <nav
      aria-label="Page navigation"
      style={{ position: 'fixed', left: '50%', bottom: 20 + footerLift, transform: 'translateX(-50%)', zIndex: 50, display: 'flex', alignItems: 'center', gap: 2, padding: 4, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 999, boxShadow: '0 8px 24px rgba(2,6,24,0.12), 0 2px 6px rgba(2,6,24,0.06)' }}
    >
      {onBack && <NavButton label="Back" icon={ArrowLeft01Icon} onClick={onBack} />}
      {onBack && onHome && <span style={{ width: 1, height: 16, background: 'var(--border)' }} />}
      {onHome && <NavButton label="Home" icon={Home01Icon} onClick={onHome} />}
    </nav>
    </>
  )
}

function NavButton({ label, icon, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', color: 'var(--dark)', background: 'transparent', border: 'none', borderRadius: 999, cursor: 'pointer', transition: 'background 0.15s, color 0.15s' }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--primary-glow)'; e.currentTarget.style.color = 'var(--primary)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--dark)' }}
    >
      <HugeiconsIcon icon={icon} size={15} />
      {label}
    </button>
  )
}

// How much of the app footer is on screen, so the pill rides above it at
// the bottom of the page instead of covering the copyright line. Capture-
// phase scroll catches the inner scrollers (Templates, Import) too.
function useFooterLift() {
  const [lift, setLift] = useState(0)
  useEffect(() => {
    const footer = document.querySelector('footer')
    if (!footer) return
    const update = () => setLift(Math.max(0, window.innerHeight - footer.getBoundingClientRect().top))
    update()
    window.addEventListener('scroll', update, { capture: true, passive: true })
    window.addEventListener('resize', update)
    const ro = new ResizeObserver(update)
    ro.observe(document.body)
    return () => {
      window.removeEventListener('scroll', update, { capture: true })
      window.removeEventListener('resize', update)
      ro.disconnect()
    }
  }, [])
  return lift
}
