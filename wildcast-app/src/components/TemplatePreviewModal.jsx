import { CANDIDATE_TEMPLATE_IDS } from '../lib/briefToCandidates'

const [OPTION_A_ID, OPTION_B_ID] = CANDIDATE_TEMPLATE_IDS

// Lets a partner browse/pick which design(s) they're interested in before
// filling out the full brief — Julia's ask (2026-08-20): "just so that they
// can see the templates" before committing to the 3-step form. Multi-select
// (they can pick more than one to compare), grouped by format so future
// posters/wild posters slot in as their own group without restructuring.
//
// Picking here pre-fills the "Formats needed"/"Business type" answers AND
// narrows what TemplateCandidatePicker actually generates at the end (see
// brief.preSelectedTemplateIds threading in BriefingForm.jsx and the filter
// in briefToCandidates.js's getMatchingTemplateIds) — Julia's fix request
// (2026-08-20): picking just Option A here shouldn't still generate both.
//
// Option ids are the REAL candidate template ids (not arbitrary strings) so
// this ties directly into that generation step with no extra mapping layer.
// Thumbs match the ones already used on the "Templates" nav page
// (TemplatePicker.jsx's BASE_TEMPLATES) for consistency — same source
// images, not a separate set. Tile aspect ratio matches their real 1191x1679
// px size exactly, so the full flyer shows uncropped.
const GROUPS = [
  {
    format: 'flyer',
    businessType: 'Restaurant',
    label: 'Restaurant Flyers',
    options: [
      { id: OPTION_A_ID, name: 'Option A', thumb: '/templates/preview_opt-a.png' },
      { id: OPTION_B_ID, name: 'Option B', thumb: '/templates/preview_opt-b.png' },
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
        borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)',
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
      <div style={{ aspectRatio: '1191 / 1679', background: '#F3F4F6' }}>
        <img src={option.thumb} alt={option.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
        position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(223,111,109,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 2, borderRadius: 16,
      }}
    >
      {/* overflow:hidden here (not on the scrollable inner div) keeps the
          rounded corner intact where it meets the scrollbar — previously
          the corner was visibly clipped square by the native scrollbar. */}
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 16, width: '100%', maxHeight: '100%', overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ padding: 28, overflowY: 'auto', minHeight: 0 }}>
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
    </div>
  )
}

export { GROUPS as TEMPLATE_PREVIEW_GROUPS }
