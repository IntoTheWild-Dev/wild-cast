// Lets a partner browse/pick which design(s) they're interested in before
// filling out the full brief — Julia's ask (2026-08-20): "just so that they
// can see the templates" before committing to the 3-step form. Multi-select
// (they can pick more than one to compare), grouped by format so future
// posters/wild posters slot in as their own group without restructuring.
// Picking here doesn't skip the brief or the later candidate-generation step
// — it just previews designs and pre-fills the "Formats needed"/"Business
// type" answers so the partner isn't asked something they've effectively
// already decided.
const GROUPS = [
  {
    format: 'flyer',
    businessType: 'Restaurant',
    label: 'Restaurant Flyers',
    options: [
      { id: 'option-a', name: 'Option A', thumb: '/templates/Preview&Catalogue_A6 _ 105x148 mm Example.png' },
      { id: 'option-b', name: 'Option B', thumb: '/templates/opt-b-designer-v3.png' },
    ],
  },
]

function OptionCard({ option, selected, onToggle }) {
  return (
    <button
      type="button"
      onClick={() => onToggle(option.id)}
      style={{
        position: 'relative', textAlign: 'left', cursor: 'pointer', padding: 0,
        borderRadius: 14, overflow: 'hidden', border: selected ? '1.5px solid var(--border)' : '1.5px solid var(--border)',
        background: '#fff', opacity: selected ? 0.55 : 1, transition: 'all 0.15s',
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.borderColor = 'var(--primary)' }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.borderColor = 'var(--border)' }}
    >
      {selected && (
        <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 2, width: 22, height: 22, borderRadius: '50%', background: 'var(--primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
      )}
      <div style={{ height: 160, background: '#F3F4F6' }}>
        <img src={option.thumb} alt={option.name} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
      </div>
      <div style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700, color: 'var(--dark)' }}>{option.name}</div>
    </button>
  )
}

// Renders as position:absolute — the parent (the form's wrapper div) must be
// position:relative so this covers only the form column, not the hero copy.
export default function TemplatePreviewModal({ selectedIds, onToggle, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(2,6,24,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, borderRadius: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxHeight: '100%', overflowY: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.25)' }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
          <h3 style={{ fontSize: 20, fontWeight: 800, color: 'var(--dark)', margin: 0, letterSpacing: '-0.02em' }}>Pick your template</h3>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--mid)', padding: 0 }}
          >
            Close
          </button>
        </div>
        <p style={{ fontSize: 13, color: 'var(--mid)', margin: '0 0 20px' }}>
          Browse what's available — pick as many as you like to compare. You can change this later.
        </p>

        {GROUPS.map(group => (
          <div key={group.format} style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--dark)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {group.label}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
              {group.options.map(opt => (
                <OptionCard key={opt.id} option={opt} selected={selectedIds.includes(opt.id)} onToggle={onToggle} />
              ))}
            </div>
          </div>
        ))}

        {/* Coming soon groups — visible so partners know more is on the way,
            matching the same "coming soon" pattern used in TemplatePicker.jsx's
            catalogue view. */}
        {['Posters', 'Wild Posters'].map(label => (
          <div key={label} style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--light)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {label} — coming soon
            </div>
            <div style={{ height: 100, borderRadius: 12, border: '1px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--light)', fontSize: 12, fontWeight: 700 }}>
              Coming soon
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={onClose}
          style={{ width: '100%', padding: '13px', fontSize: 14, fontWeight: 700, borderRadius: 10, border: 'none', cursor: 'pointer', background: 'var(--primary)', color: '#fff' }}
        >
          Done{selectedIds.length > 0 ? ` — ${selectedIds.length} selected` : ''}
        </button>
      </div>
    </div>
  )
}

export { GROUPS as TEMPLATE_PREVIEW_GROUPS }
