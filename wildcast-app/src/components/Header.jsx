export default function Header({ onLogoClick, screen, onNavigate }) {
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
        <nav style={{ display: 'flex', gap: 4 }}>
          {navItem('Templates', 'picker')}
          {navItem('Designs', 'designs')}
          <span style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.5)', padding: '6px 12px', borderRadius: 6, cursor: 'pointer' }}>Help</span>
        </nav>
      </div>
    </header>
  )
}
