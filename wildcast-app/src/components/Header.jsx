export default function Header({ onLogoClick }) {
  return (
    <header style={{ background: 'var(--dark)', borderBottom: '1px solid rgba(255,255,255,0.06)', position: 'sticky', top: 0, zIndex: 100 }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 32px', height: 58, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div onClick={onLogoClick} style={{ cursor: 'pointer' }}>
          <img src="/assets/Logo (Only Font) PNG 4.png" alt="Wild Stack" style={{ height: 28 }} />
        </div>
        <nav style={{ display: 'flex', gap: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#fff', background: 'rgba(255,255,255,0.08)', padding: '6px 12px', borderRadius: 6 }}>Templates</span>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.5)', padding: '6px 12px', borderRadius: 6, cursor: 'pointer' }}>Help</span>
        </nav>
      </div>
    </header>
  )
}
