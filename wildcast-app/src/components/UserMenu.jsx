import { useState, useRef, useEffect } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowDown01Icon, SparklesIcon, UserSwitchIcon, Logout03Icon } from '@hugeicons/core-free-icons'

// One account button + dropdown in the header, replacing three loose items
// that used to sit there side by side (Anang's ask, 2026-09-25): the
// Designer/Manager role dropdown, the AI credits pill (with its own info
// popover) and Sign out. Same behaviour for each, just grouped.

function initialsOf(name) {
  const parts = name.trim().split(/[\s@._-]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

const rowStyle = { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', fontSize: 13, color: 'var(--dark)' }

export default function UserMenu({ activation, roles, workflowRole, onWorkflowRoleChange, onSignOut }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  // Outside-click close - a fixed backdrop doesn't work inside the header
  // (its backdropFilter contains fixed children to the header's own box).
  useEffect(() => {
    if (!open) return
    function handleOutsideClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [open])

  // activation.key is the signed-in email for an account, or the raw
  // activation key otherwise - only ever show it when it's an email; a key
  // is effectively a password.
  const isEmail = activation.key?.includes('@')
  const displayName = activation.clientName || (isEmail ? activation.key.split('@')[0] : 'Wild Stack user')
  const subtitle = isEmail ? activation.key : 'Signed in with an activation key'
  const credits = activation.credits ?? 0
  const lowCredits = credits <= 5

  // Dropdown anchors to the header's right-hand group (Header.jsx), not this
  // wrapper - same anchor as NotificationBell's, so both open in one spot.
  return (
    <div ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px 4px 4px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
          border: `1px solid ${open ? 'var(--primary)' : 'var(--border)'}`, background: '#fff',
        }}
      >
        <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--primary-glow)', color: 'var(--primary)', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {initialsOf(displayName)}
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.15 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--dark)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</span>
          {workflowRole && <span style={{ fontSize: 11, color: 'var(--mid)' }}>{workflowRole}</span>}
        </span>
        <span style={{ color: 'var(--mid)', display: 'flex', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
          <HugeiconsIcon icon={ArrowDown01Icon} size={16} />
        </span>
      </button>

      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 200, width: 290, background: '#fff', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 12px 32px rgba(0,0,0,0.14)', overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px 12px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--dark)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</div>
            <div style={{ fontSize: 12, color: 'var(--mid)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</div>
          </div>

          <div style={{ borderTop: '1px solid var(--border)' }} />

          <div style={{ ...rowStyle, alignItems: 'flex-start' }}>
            <span style={{ color: 'var(--mid)', display: 'flex', marginTop: 1 }}><HugeiconsIcon icon={SparklesIcon} size={18} /></span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontWeight: 600 }}>AI credits</span>
                <span style={{
                  fontSize: 12, fontWeight: 700, padding: '2px 9px', borderRadius: 100,
                  background: lowCredits ? 'rgba(239,68,68,0.1)' : 'rgba(2,6,24,0.06)',
                  color: lowCredits ? '#DC2626' : 'var(--dark)',
                  border: `1px solid ${lowCredits ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`,
                }}>{credits}</span>
              </span>
              <span style={{ display: 'block', fontSize: 11, color: 'var(--mid)', lineHeight: 1.45, marginTop: 4 }}>
                Used for AI Suggest and Improve with AI. PDF export is free and doesn't use them.
              </span>
            </span>
          </div>

          {onWorkflowRoleChange && (
            <div style={{ ...rowStyle, alignItems: 'flex-start' }}>
              <span style={{ color: 'var(--mid)', display: 'flex', marginTop: 1 }}><HugeiconsIcon icon={UserSwitchIcon} size={18} /></span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>View as</span>
                <span style={{ display: 'flex', background: '#F3F4F6', borderRadius: 8, padding: 3 }}>
                  {roles.map(role => {
                    const active = role === workflowRole
                    return (
                      <button
                        key={role}
                        type="button"
                        onClick={() => onWorkflowRoleChange(role)}
                        style={{
                          flex: 1, padding: '6px 8px', fontSize: 12, fontWeight: 700, borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                          background: active ? '#fff' : 'transparent',
                          color: active ? 'var(--dark)' : 'var(--mid)',
                          boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                        }}
                      >
                        {role}
                      </button>
                    )
                  })}
                </span>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--mid)', lineHeight: 1.45, marginTop: 6 }}>
                  Testing toggle - only Managers can export.
                </span>
              </span>
            </div>
          )}

          <div style={{ borderTop: '1px solid var(--border)', marginTop: 4 }} />

          <button
            type="button"
            onClick={() => { setOpen(false); onSignOut() }}
            style={{ ...rowStyle, width: '100%', border: 'none', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', padding: '12px 16px', fontWeight: 600 }}
            onMouseEnter={e => { e.currentTarget.style.background = '#F9FAFB' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}
          >
            <span style={{ color: 'var(--mid)', display: 'flex' }}><HugeiconsIcon icon={Logout03Icon} size={18} /></span>
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
