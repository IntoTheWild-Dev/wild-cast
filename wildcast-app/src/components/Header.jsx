import { useState, useRef, useEffect } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { PlusSignIcon } from '@hugeicons/core-free-icons'
import Select from './Select'

// Shown instead of navigating for any nav item passed disabled=true below -
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
          The Import tab is being reworked - check back soon.
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

// Confirms before signing out - clearing the activation key mid-session
// (e.g. an accidental click) meant re-entering the key to get back in, so a
// one-step-back confirmation is worth the extra click.
function SignOutConfirmModal({ onConfirm, onClose }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={onClose}
    >
      <div
        style={{ background: '#fff', borderRadius: 16, padding: 28, maxWidth: 340, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', textAlign: 'center' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--dark)', marginBottom: 6 }}>Sign out?</div>
        <div style={{ fontSize: 13, color: 'var(--mid)', lineHeight: 1.6, marginBottom: 20 }}>
          You'll need your activation key or account password to sign back in.
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onClose}
            style={{ flex: 1, padding: '11px', fontSize: 13, fontWeight: 700, background: '#fff', color: 'var(--dark)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{ flex: 1, padding: '11px', fontSize: 13, fontWeight: 700, background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}

// Designer / Reviewer / Manager - a provisional workflow-role toggle
// (Julia's ask, 2026-09-22, so she can preview each role's view without
// separate keys). Names are explicitly expected to change - kept as one
// array so relabeling later is a one-line change, not a find-and-replace.
const WORKFLOW_ROLES = ['Designer', 'Reviewer', 'Manager']

export default function Header({ onLogoClick, screen, onNavigate, activation, onHelp, workflowRole, onWorkflowRoleChange }) {
  const [showComingSoon, setShowComingSoon] = useState(false)
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false)
  const [showCreditsInfo, setShowCreditsInfo] = useState(false)
  const creditsInfoRef = useRef(null)

  useEffect(() => {
    if (!showCreditsInfo) return
    // 'fixed' backdrop divs don't work here since the header's backdropFilter
    // makes them contain to the header's own box instead of the viewport, so
    // this closes on any outside click instead.
    function handleOutsideClick(e) {
      if (creditsInfoRef.current && !creditsInfoRef.current.contains(e.target)) setShowCreditsInfo(false)
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [showCreditsInfo])

  function handleSignOut() {
    // Clears both possible sign-in paths unconditionally rather than
    // checking wildcast_auth_type first - removing a key that was never set
    // is a no-op, so this is simpler and can't drift out of sync with
    // App.jsx's two restore branches if a third auth path is ever added.
    localStorage.removeItem('wildcast_activation_key')
    localStorage.removeItem('wildcast_auth_type')
    localStorage.removeItem('wildcast_account_email')
    localStorage.removeItem('wildcast_account_token')
    localStorage.removeItem('wildcast_credits')
    localStorage.removeItem('wildcast_role')
    window.location.reload()
  }

  const navItem = (label, target, disabled) => {
    const active = !disabled && (
      screen === target ||
      (target === 'catalogue' && screen === 'editor') ||
      // Landing ('/') is where "New Brief" itself lands you (see handleNavigate's
      // 'new-brief' case in App.jsx) - without this, loading the home page shows
      // no nav item as active even though New Brief is exactly what's showing.
      (target === 'new-brief' && (screen === 'landing' || screen === 'prompt-brief'))
    )
    return (
      <span
        onClick={() => disabled ? setShowComingSoon(true) : onNavigate?.(target)}
        title={disabled ? 'Coming soon' : undefined}
        style={{
          fontSize: 13, fontWeight: 500, padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
          color: disabled ? 'var(--light)' : (active ? 'var(--dark)' : 'var(--mid)'),
          background: active ? 'rgba(2,6,24,0.06)' : 'transparent',
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => { if (!active && !disabled) e.currentTarget.style.color = 'var(--dark)' }}
        onMouseLeave={e => { if (!active && !disabled) e.currentTarget.style.color = 'var(--mid)' }}
      >
        {label}
      </span>
    )
  }

  return (
    <>
    <header style={{ background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 100 }}>
      {/* Real flex layout, not the old position:absolute-centered nav
          (Julia's report, 2026-09-22: header still overlapping/cramped even
          after moving the role dropdown to its own row). Absolute centering
          ignored how much room the left/right groups actually needed, so it
          could overlap either one depending on viewport width - no amount of
          nudging one element fixes that at every width. Nav is now a normal
          flex child that takes the actual remaining space between logo and
          the right-side group, and wraps onto a second line instead of
          overlapping anything if that space ever gets tight - dynamic at any
          window width, not just the ones actually tested. */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '10px 32px', minHeight: 58, display: 'flex', alignItems: 'center', flexWrap: 'wrap', rowGap: 8, columnGap: 16 }}>
        <div onClick={onLogoClick} style={{ cursor: 'pointer', flexShrink: 0 }}>
          <img src="/assets/Logo (Only Font) Dark.png" alt="Wild Stack" style={{ height: 28 }} />
        </div>
        <nav style={{ display: 'flex', flexWrap: 'wrap', rowGap: 4, columnGap: 4, flex: '1 1 auto', justifyContent: 'center', minWidth: 0 }}>
          {navItem(
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <HugeiconsIcon icon={PlusSignIcon} size={14} />
              New Brief
            </span>,
            'new-brief'
          )}
          {navItem('Templates', 'catalogue')}
          {navItem('Design library', 'designs')}
          {navItem('Assets', 'library')}
          {/* role:'agency' (Wild Stack's own keys) gets a fully working Import;
              role:'designer' (client-facing test keys) sees it greyed out with
              a Coming Soon popup - everything else designer-tier stays the
              same for both roles. See api/_lib/auth.js. */}
          {activation?.role === 'agency' && navItem('Import', 'import')}
          {activation?.role === 'designer' && navItem('Import', 'import', true)}
          <span
            onClick={onHelp}
            style={{ fontSize: 13, fontWeight: 500, color: 'var(--mid)', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', transition: 'color 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--dark)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--mid)'}
          >Help</span>
        </nav>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {onWorkflowRoleChange && (
            <Select
              value={workflowRole}
              onChange={e => onWorkflowRoleChange(e.target.value)}
              title="Testing toggle - which role you're viewing as. Only Managers can export."
              style={{
                width: 108, fontSize: 12, fontWeight: 700, padding: '6px 10px', borderRadius: 8,
                border: '1px solid var(--border)', background: '#F3F4F6', color: 'var(--dark)',
              }}
            >
              {WORKFLOW_ROLES.map(role => <option key={role} value={role}>{role}</option>)}
            </Select>
          )}
          {activation?.clientName && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 12 }}>
              <span style={{ fontSize: 12, color: 'var(--mid)', fontWeight: 500 }}>
                {/* {activation.clientName} */}
              </span>
              <div ref={creditsInfoRef} style={{ position: 'relative' }}>
                <span
                  onClick={() => setShowCreditsInfo(v => !v)}
                  style={{
                    fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 100,
                    background: activation.credits <= 5 ? 'rgba(239,68,68,0.1)' : 'rgba(2,6,24,0.06)',
                    color: activation.credits <= 5 ? '#DC2626' : 'var(--mid)',
                    border: `1px solid ${activation.credits <= 5 ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`,
                    cursor: 'pointer',
                  }}>
                  {activation.credits} AI credit{activation.credits !== 1 ? 's' : ''}
                </span>
                {showCreditsInfo && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 200,
                    width: 220, padding: '10px 12px', borderRadius: 8, background: '#fff',
                    border: '1px solid var(--border)', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                    fontSize: 12, color: 'var(--mid)', lineHeight: 1.5,
                  }}>
                    AI credits are used for AI Suggest and Improve with AI. PDF export is free and doesn't use them.
                  </div>
                )}
              </div>
              <button
                onClick={() => setShowSignOutConfirm(true)}
                title="Sign Out"
                style={{ fontSize: 13, color: 'var(--light)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 4, transition: 'color 0.15s', color: 'var(--mid)' }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--dark)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--light)'}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
    {showComingSoon && <ComingSoonModal onClose={() => setShowComingSoon(false)} />}
    {showSignOutConfirm && <SignOutConfirmModal onConfirm={handleSignOut} onClose={() => setShowSignOutConfirm(false)} />}
    </>
  )
}
