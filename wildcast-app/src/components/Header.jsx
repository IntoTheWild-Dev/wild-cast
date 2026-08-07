import { useState } from 'react'

// Shown instead of navigating for any nav item passed disabled=true below —
// small and local rather than its own file since it's a single temporary
// message, not a reusable modal.
function ComingSoonModal({ onClose }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={onClose}
    >
      <div
        style={{ background: '#fff', borderRadius: 16, padding: 28, maxWidth: 340, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', textAlign: 'center' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--dark)', marginBottom: 6 }}>Coming Soon</div>
        <div style={{ fontSize: 13, color: 'var(--mid)', lineHeight: 1.6, marginBottom: 20 }}>
          The Import tab is being reworked — check back soon.
        </div>
        <button
          onClick={onClose}
          style={{ width: '100%', padding: '11px', fontSize: 13, fontWeight: 700, background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}
        >
          Got it
        </button>
      </div>
    </div>
  )
}

export default function Header({ onLogoClick, screen, onNavigate, activation, onHelp }) {
  const [showComingSoon, setShowComingSoon] = useState(false)

  const navItem = (label, target, disabled) => {
    const active = !disabled && (screen === target || (target === 'catalogue' && screen === 'editor'))
    return (
      <span
        onClick={() => disabled ? setShowComingSoon(true) : onNavigate?.(target)}
        title={disabled ? 'Coming soon' : undefined}
        style={{
          fontSize: 13, fontWeight: 500, padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
          color: disabled ? 'rgba(255,255,255,0.25)' : (active ? '#fff' : 'rgba(255,255,255,0.5)'),
          background: active ? 'rgba(255,255,255,0.08)' : 'transparent',
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => { if (!active && !disabled) e.currentTarget.style.color = 'rgba(255,255,255,0.8)' }}
        onMouseLeave={e => { if (!active && !disabled) e.currentTarget.style.color = 'rgba(255,255,255,0.5)' }}
      >
        {label}
      </span>
    )
  }

  return (
    <header style={{ background: 'var(--dark)', borderBottom: '1px solid rgba(255,255,255,0.06)', position: 'sticky', top: 0, zIndex: 100 }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 32px', height: 58, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div onClick={onLogoClick} style={{ cursor: 'pointer' }}>
          <img src="/assets/Logo (Only Font) PNG 4.png" alt="Wild Stack" style={{ height: 28 }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <nav style={{ display: 'flex', gap: 4 }}>
            {navItem('+ New Brief', 'new-brief')}
            {navItem('Templates', 'catalogue')}
            {navItem('Library', 'library')}
            {navItem('Designs', 'designs')}
            {/* role:'agency' (Wild Stack's own keys) gets a fully working Import;
                role:'designer' (client-facing test keys) sees it greyed out with
                a Coming Soon popup — everything else designer-tier stays the
                same for both roles. See api/_lib/auth.js. */}
            {activation?.role === 'agency' && navItem('Import', 'import')}
            {activation?.role === 'designer' && navItem('Import', 'import', true)}
            <span
              onClick={onHelp}
              style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.5)', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', transition: 'color 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.8)'}
              onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.5)'}
            >Help</span>
          </nav>
          {showComingSoon && <ComingSoonModal onClose={() => setShowComingSoon(false)} />}
          {activation?.clientName && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 12, borderLeft: '1px solid rgba(255,255,255,0.1)' }}>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', fontWeight: 500 }}>
                {activation.clientName}
              </span>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 100,
                background: activation.credits <= 5 ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.08)',
                color: activation.credits <= 5 ? '#FCA5A5' : 'rgba(255,255,255,0.5)',
                border: `1px solid ${activation.credits <= 5 ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.1)'}`,
              }}>
                {activation.credits} credit{activation.credits !== 1 ? 's' : ''}
              </span>
              <button
                onClick={() => {
                  localStorage.removeItem('wildcast_activation_key')
                  localStorage.removeItem('wildcast_credits')
                  localStorage.removeItem('wildcast_role')
                  window.location.reload()
                }}
                title="Sign out"
                style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 4, transition: 'color 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.7)'}
                onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.3)'}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
