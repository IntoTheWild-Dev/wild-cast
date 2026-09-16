import { BASE_TEMPLATES, overlayCustomCards, deriveGroups } from './TemplatePicker'

// Lets a partner pick which design they want BEFORE filling out the brief -
// this is now the mandatory first step of the whole flow (Julia's ask,
// 2026-09-10: template choice moves from after the brief to before it, and
// picking here is a single decisive choice, not a "browse to compare" step).
// Clicking a card commits it and closes the popup immediately - no separate
// "Done" step. Grouped by format so future posters/wild posters slot in as
// their own group without restructuring.
//
// Picking here pre-fills the "Formats needed"/"Business type" answers (see
// BriefingForm.jsx's pickTemplate) and IS what the rest of the flow uses to
// skip straight to the "Choose your mode" popup after the brief is
// submitted (App.jsx's onSubmitted, via entryForGuidedId) - so every option
// offered here must carry a real templateIdGuided that resolves there.
//
// Groups/options used to be a hardcoded list of just Option A/B - Julia's
// report, 2026-09-16: Option C (already live and shown correctly on the
// Templates catalogue page) never appeared here, and any future Figma
// import would need this file manually updated too. Now built the same way
// TemplatePicker.jsx's own catalogue is: overlayCustomCards() +
// deriveGroups() over BASE_TEMPLATES, filtered to live members only - a new
// import shows up here automatically the moment it goes live, no code
// change needed.
function groupLabel(category, format) {
  const cap = category.charAt(0).toUpperCase() + category.slice(1)
  // "Flyer" -> "Flyers" etc. - plural section heading, matching the
  // original hand-written "Restaurant Flyers" label.
  return `${cap} ${format}${format.endsWith('s') ? '' : 's'}`
}

function OptionCard({ option, selected, onPick }) {
  return (
    <button
      type="button"
      onClick={() => onPick(option.templateIdGuided)}
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
        <img src={option.thumb} alt={option.label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
      <div style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700, color: 'var(--dark)' }}>{option.label.split(' · ').pop()}</div>
    </button>
  )
}

// Renders as position:fixed against the viewport so it's centered on the
// whole page (and can be wide enough to avoid the grid scrolling), not just
// the form column it's triggered from.
export default function TemplatePreviewModal({ selectedId, onPick, onClose, customCards = [], customRecords = [] }) {
  const allTemplates = overlayCustomCards(BASE_TEMPLATES, customCards, customRecords)
  const groups = deriveGroups(allTemplates).filter(g => g.liveCount > 0)

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(17,17,17,0.25)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
    >
      {/* overflow:hidden here (not on the scrollable inner div) keeps the
          rounded corner intact where it meets the scrollbar - previously
          the corner was visibly clipped square by the native scrollbar. */}
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 900, maxHeight: '90vh', overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ padding: 28, overflowY: 'auto', minHeight: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
            <h3 style={{ fontSize: 20, fontWeight: 800, color: 'var(--dark)', margin: 0, letterSpacing: '-0.02em' }}>Pick your template</h3>
            <button
              type="button"
              onClick={onClose}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--light)', lineHeight: 1, padding: 4 }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--dark)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--light)'}
            >
              ×
            </button>
          </div>
          <p style={{ fontSize: 13, color: 'var(--mid)', margin: '0 0 20px' }}>
            Pick the design you'd like to start with.
          </p>

          {groups.map(group => (
            <div key={group.key} style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--dark)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {groupLabel(group.category, group.format)}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
                {group.members.filter(m => m.live).map(member => (
                  <OptionCard key={member.templateIdGuided} option={member} selected={selectedId === member.templateIdGuided} onPick={onPick} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
