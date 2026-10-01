import { useState, useRef, useEffect } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { PlusSignIcon } from '@hugeicons/core-free-icons'
import NotificationBell from './NotificationBell'
import UserMenu from './UserMenu'
import { PAGE_MAX_WIDTH, PAGE_GUTTER } from '../lib/layout'
import useIsMobile from '../lib/useIsMobile'

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

// Designer / Manager - a provisional workflow-role toggle (Julia's ask,
// 2026-09-22, so she can preview each role's view without separate keys).
// 'Reviewer' removed 2026-09-23 (Julia: "let's remove Reviewer for now,
// only keeping designer and manager") - it never drove any distinct
// behavior of its own, only "is this Manager or not" ever mattered.
// Names are explicitly expected to change - kept as one array so
// relabeling later is a one-line change, not a find-and-replace.
// Exported so App.jsx can validate a persisted localStorage value against
// the current list (2026-09-24 fix) - without this, a browser that had
// 'Reviewer' selected before it was removed here silently kept that dead
// value forever (the <select> had no matching <option>, and every
// workflowRole === 'Manager' check just evaluated false with no
// indication why - see App.jsx's own note where this is imported).
export const WORKFLOW_ROLES = ['Designer', 'Manager']

export default function Header({ onLogoClick, screen, onNavigate, activation, onHelp, workflowRole, onWorkflowRoleChange, onOpenNotificationProject, notifications }) {
  const [showComingSoon, setShowComingSoon] = useState(false)
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false)
  const isMobile = useIsMobile()
  // Phone width: the nav lives behind a hamburger button (Anang, 2026-09-30)
  // - a sideways-scrolling row hid half the items off the right edge.
  const [menuOpen, setMenuOpen] = useState(false)
  const headerRef = useRef(null)
  useEffect(() => {
    if (!menuOpen) return
    // Outside tap closes it - same approach as UserMenu (no fixed backdrop
    // layer needed).
    function handleOutside(e) {
      if (headerRef.current && !headerRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [menuOpen])
  const showNav = !isMobile || menuOpen
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

  const navItem = (label, target, disabled, dot) => {
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
        onClick={() => { setMenuOpen(false); if (disabled) setShowComingSoon(true); else onNavigate?.(target) }}
        title={disabled ? 'Coming soon' : undefined}
        style={{
          fontSize: isMobile ? 15 : 13, fontWeight: 500, padding: isMobile ? '12px 14px' : '6px 12px', borderRadius: isMobile ? 8 : 6, cursor: 'pointer',
          whiteSpace: 'nowrap', flexShrink: 0,
          color: disabled ? 'var(--light)' : (active ? 'var(--dark)' : 'var(--mid)'),
          background: active ? 'rgba(2,6,24,0.06)' : 'transparent',
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => { if (!active && !disabled) e.currentTarget.style.color = 'var(--dark)' }}
        onMouseLeave={e => { if (!active && !disabled) e.currentTarget.style.color = 'var(--mid)' }}
      >
        {dot ? (
          <span style={{ position: 'relative', display: 'inline-block' }}>
            {label}
            <span title="New updates" role="img" aria-label="New updates" style={{ position: 'absolute', top: -2, right: -8, width: 7, height: 7, borderRadius: '50%', background: '#DC2626', boxShadow: '0 0 0 2px #fff' }} />
          </span>
        ) : label}
      </span>
    )
  }

  return (
    <>
    {/* Solid white, not frosted glass (Anang's ask, 2026-10-01): with the
        Design library / Assets / My Tasks title bands now sticky, cards
        scrolling under a translucent header showed through as blurry
        smudges next to the logo. */}
    <header style={{ background: '#fff', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 100 }}>
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
      {/* PAGE_MAX_WIDTH (lib/layout.js) - the same width every page's content
          uses, so the header's edges line up with the page below. Widened
          from 1100 when the notification bell was added (2026-09-25). */}
      {/* Phone width: logo on the left, bell + avatar + hamburger on the
          right, all on one row; the nav opens as a list under that row. */}
      <div ref={headerRef} style={{ maxWidth: PAGE_MAX_WIDTH, margin: '0 auto', padding: isMobile ? '10px 16px' : `10px ${PAGE_GUTTER}px`, minHeight: 58, display: 'flex', alignItems: 'center', flexWrap: 'wrap', rowGap: 8, columnGap: isMobile ? 10 : 16 }}>
        <div onClick={onLogoClick} style={{ cursor: 'pointer', flexShrink: 0 }}>
          <img src="/assets/Logo (Only Font) Dark.png" alt="Wild Stack" style={{ height: 28 }} />
        </div>
        {showNav && <nav style={isMobile
          ? { order: 2, flex: '1 0 100%', display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 8, borderTop: '1px solid var(--border)' }
          : { display: 'flex', flexWrap: 'wrap', rowGap: 4, columnGap: 4, flex: '1 1 auto', justifyContent: 'center', minWidth: 0 }}>
          {navItem(
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <HugeiconsIcon icon={PlusSignIcon} size={14} />
              New Brief
            </span>,
            'new-brief'
          )}
          {navItem('Templates', 'catalogue')}
          {navItem('Design library', 'designs')}
          {/* "My Tasks" (Notion card "Review queue in the user profile",
              2026-09-22) - grouped with the other "browse your stuff" pages
              rather than next to New Brief, which is a standalone action
              button, not a content page. The header's already flex-wrap
              (see the comment on the row above), so one more item here
              just wraps instead of crowding anything. */}
          {/* Red dot = an unread Approved / Adjustment-needed notification
              (boss's call, 2026-09-25: a dot here, the number stays on the
              bell). Clears with the notification - see useNotifications. */}
          {navItem('My Tasks', 'tasks', false, notifications?.hasUnreadTasks)}
          {navItem('Assets', 'library')}
          {/* role:'agency' (Wild Stack's own keys) gets a fully working Import;
              role:'designer' (client-facing test keys) sees it greyed out with
              a Coming Soon popup - everything else designer-tier stays the
              same for both roles. See api/_lib/auth.js. */}
          {activation?.role === 'agency' && navItem('Import', 'import')}
          {activation?.role === 'designer' && navItem('Import', 'import', true)}
          <span
            onClick={() => { setMenuOpen(false); onHelp?.() }}
            style={{ fontSize: isMobile ? 15 : 13, fontWeight: 500, color: 'var(--mid)', padding: isMobile ? '12px 14px' : '6px 12px', borderRadius: isMobile ? 8 : 6, cursor: 'pointer', transition: 'color 0.15s', whiteSpace: 'nowrap', flexShrink: 0 }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--dark)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--mid)'}
          >Help</span>
        </nav>}
        {/* position:relative - both the bell's and UserMenu's dropdowns
            anchor to this group's right edge, so they open in exactly the
            same spot. */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, marginLeft: isMobile ? 'auto' : undefined }}>
          {/* Same identity My Tasks uses for "mine" - see NotificationBell. */}
          <NotificationBell notifications={notifications} onOpenProject={onOpenNotificationProject} />
          {/* Role toggle, AI credits and Sign out all live in here now. */}
          {activation && (
            <UserMenu
              activation={activation}
              roles={WORKFLOW_ROLES}
              workflowRole={workflowRole}
              onWorkflowRoleChange={onWorkflowRoleChange}
              onSignOut={() => setShowSignOutConfirm(true)}
              compact={isMobile}
            />
          )}
          {isMobile && (
            <button
              type="button"
              onClick={() => setMenuOpen(v => !v)}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              style={{ position: 'relative', width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${menuOpen ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 10, background: '#fff', color: 'var(--dark)', cursor: 'pointer', padding: 0 }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                {menuOpen
                  ? <><path d="M6 6l12 12" /><path d="M18 6L6 18" /></>
                  : <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>}
              </svg>
              {/* My Tasks' unread dot, surfaced on the button while the list is closed. */}
              {!menuOpen && notifications?.hasUnreadTasks && (
                <span style={{ position: 'absolute', top: 5, right: 5, width: 7, height: 7, borderRadius: '50%', background: '#DC2626', boxShadow: '0 0 0 2px #fff' }} />
              )}
            </button>
          )}
        </div>
      </div>
    </header>
    {showComingSoon && <ComingSoonModal onClose={() => setShowComingSoon(false)} />}
    {showSignOutConfirm && <SignOutConfirmModal onConfirm={handleSignOut} onClose={() => setShowSignOutConfirm(false)} />}
    </>
  )
}
