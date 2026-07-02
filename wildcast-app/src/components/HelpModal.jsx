export default function HelpModal({ onClose }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={onClose}
    >
      <div
        style={{ background: '#fff', borderRadius: 16, padding: 36, maxWidth: 480, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--dark)' }}>How it works</div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--light)', lineHeight: 1, padding: 4 }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--dark)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--light)'}
          >
            ×
          </button>
        </div>

        {/* Steps */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 28 }}>
          {[
            { n: 1, title: 'Pick a template', desc: 'Choose from our pre-approved Wolt flyer designs, then pick Guided (fill in the blanks) or Designer (move and resize freely). More formats coming soon.' },
            { n: 2, title: 'Fill in your content', desc: 'Add your headline, restaurant name, offer and sub-headline, then upload your logo and food photo. Everything stays on-brand automatically.' },
            { n: 3, title: 'Export & print', desc: 'Click Export PDF to download a print-ready CMYK PDF/X-4 file. Send it straight to your printer — no designer needed.' },
          ].map(({ n, title, desc }) => (
            <div key={n} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--primary)', color: '#fff', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                {n}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--dark)', marginBottom: 3 }}>{title}</div>
                <div style={{ fontSize: 13, color: 'var(--mid)', lineHeight: 1.6 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div style={{ borderTop: '1px solid var(--border)', marginBottom: 20 }} />

        {/* Coming soon */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--dark)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Coming soon</div>
          <div style={{ fontSize: 13, color: 'var(--mid)', lineHeight: 1.7 }}>
            Poster formats · Wild Poster (landscape) · Retail templates · More restaurant designs
          </div>
        </div>

        {/* Support */}
        <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--dark)', marginBottom: 2 }}>Need help?</div>
            <div style={{ fontSize: 12, color: 'var(--mid)' }}>Contact Wild Stack and we'll sort it.</div>
          </div>
          <a
            href="mailto:hello@wildstack.studio"
            style={{ fontSize: 13, fontWeight: 700, color: '#fff', background: 'var(--primary)', padding: '8px 16px', borderRadius: 8, textDecoration: 'none', flexShrink: 0, transition: 'background 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-dark)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--primary)'}
          >
            Email us
          </a>
        </div>
      </div>
    </div>
  )
}
