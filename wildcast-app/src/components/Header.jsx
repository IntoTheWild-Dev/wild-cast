export default function Header({ onLogoClick, screen, onNavigate, activation, onHelp }) {
  const navItem = (label, target) => {
    const active = screen === target || (target === 'picker' && screen === 'editor')
    return (
      <span
        onClick={() => onNavigate?.(target)}
        style={{
          fontSize: 13, fontWeight: 500, padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
          color: active ? '#fff' : 'rgba(255,255,255,0.5)',
          background: active ? 'rgba(255,255,255,0.08)' : 'transparent',
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'rgba(255,255,255,0.8)' }}
        onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'rgba(255,255,255,0.5)' }}
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
            {navItem('Templates', 'picker')}
            {navItem('Designs', 'designs')}
            <span
              onClick={onHelp}
              style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.5)', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', transition: 'color 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.8)'}
              onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.5)'}
            >Help</span>
          </nav>
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
