import { HeroColumn, FeatureGrid, WildScaleTip } from './BriefingForm'

// New home screen (Julia's ask, 2026-09-11): the brief form used to be the
// very first thing anyone saw. Now the landing page is just a choice between
// three paths - the actual brief flow (today's picker + form, unchanged)
// only starts once "Start from scratch" is picked. Mirrors BriefingForm.jsx's
// own outer wrapper/grid exactly so the transition between this screen and
// the brief screen it hands off to doesn't visually jump.
const CHOICES = [
  {
    key: 'brief',
    title: 'Create from brief',
    desc: "Brief us like you would a designer - pick a template, tell us what you need, and we'll get it ready to fill in.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5v14M5 12h14" />
      </svg>
    ),
  },
  {
    key: 'catalogue',
    title: 'Choose a template',
    desc: 'Browse every ready-made template and jump straight into editing one yourself.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
      </svg>
    ),
  },
  {
    key: 'designs',
    title: 'See Design library',
    desc: 'Look through designs already made - yours and everyone else on the team.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <rect x="3" y="3" width="18" height="14" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
      </svg>
    ),
  },
]

// Laid out vertically (icon, then title+arrow, then desc) rather than the
// old horizontal icon-left/chevron-right row - that shape worked as a single
// wide list item, but reads cramped once the 3 choices sit side by side as
// columns instead of stacked (Julia's ask, 2026-09-18).
function ChoiceCard({ title, desc, icon, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12, width: '100%',
        textAlign: 'left', padding: '24px', borderRadius: 14, border: '1.5px solid var(--border)',
        background: '#fff', cursor: 'pointer', transition: 'border-color 0.15s, box-shadow 0.15s',
        boxSizing: 'border-box',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(223,111,109,0.12)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }}
    >
      <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--primary-glow)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--dark)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
          {title}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--light)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M9 6l6 6-6 6" />
          </svg>
        </div>
        <div style={{ fontSize: 13, color: 'var(--mid)', lineHeight: 1.5 }}>{desc}</div>
      </div>
    </button>
  )
}

export default function LandingPage({ onNavigate }) {
  return (
    <div style={{ flex: 1, background: 'var(--bg)', overflow: 'auto' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '64px 32px' }}>
        {/* Reworked from the old left-hero/right-cards 2-column split into a
            single stacked column - the 3 choice cards sit side by side below
            the hero copy, the WildScale tip box comes after that (moved out
            of the hero copy per Julia's ask, 2026-09-18), and the feature
            grid runs full-width beneath that in 4 columns of its own. */}
        <HeroColumn showTemplateStep={false} showFeatures={false} showWildScaleTip={false} />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 8 }}>
          {CHOICES.map(c => (
            <ChoiceCard key={c.key} title={c.title} desc={c.desc} icon={c.icon} onClick={() => onNavigate(c.key)} />
          ))}
        </div>

        <div style={{ marginTop: 32 }}>
          <WildScaleTip maxWidth="100%" />
        </div>

        <div style={{ marginTop: 24 }}>
          <FeatureGrid columns={4} />
        </div>
      </div>
    </div>
  )
}
