import { useState, useEffect } from 'react'

// Default AI credits given to a self-signed-up individual account - only AI
// Suggest/Improve usage spends these now, PDF export is free (Julia's ask,
// 2026-09-15: replace the old per-export credit system with an AI-usage-only
// one starting at 100).
const ACCOUNT_DEFAULT_CREDITS = 100

export default function ActivationGate({ onActivated }) {
  // Two parallel sign-in paths, not one replacing the other - existing
  // per-client shared keys (WILDCAST_KEYS, e.g. "Wolt DE") keep working
  // completely unchanged; "Team sign in" is the new per-person path
  // (api/account-auth.js) for individual seats - Wild Stack's own team plus
  // the Wolt test group - Julia's ask, 2026-09-15.
  const [mode, setMode] = useState('key') // 'key' | 'account'
  const [key, setKey] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [needsName, setNeedsName] = useState(false) // first-ever sign-in for this email - ask for a name too
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // Wolt test group's 5-seat cap - fetched fresh whenever the "Team sign in"
  // tab is shown so someone can see availability before trying to sign up.
  // null while loading/unknown; the seat cap itself is enforced server-side
  // (api/account-auth.js) regardless of whether this fetch succeeds.
  const [seats, setSeats] = useState(null)

  useEffect(() => {
    if (mode !== 'account') return
    let cancelled = false
    fetch('/api/account-seats')
      .then(r => r.json())
      .then(data => { if (!cancelled) setSeats(data) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [mode])

  async function handleSubmit(e) {
    e.preventDefault()
    const trimmed = key.trim()
    if (!trimmed) return

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/validate-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: trimmed }),
      })
      const data = await res.json()

      if (!data.valid) {
        setError(data.error || 'Invalid activation key')
        return
      }

      localStorage.setItem('wildcast_activation_key', trimmed)
      localStorage.setItem('wildcast_credits', data.total_credits)
      localStorage.setItem('wildcast_role', data.role || 'partner')
      onActivated({ key: trimmed, clientName: data.client_name, credits: data.total_credits, role: data.role || 'partner' })
    } catch {
      setError('Could not connect. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleAccountSubmit(e) {
    e.preventDefault()
    const trimmedEmail = email.trim()
    if (!trimmedEmail || !password) return

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/account-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail, password, displayName: displayName.trim() || undefined }),
      })
      const data = await res.json()

      if (!res.ok) {
        // First-ever sign-in for this email needs a name before it can
        // actually create the account - reveal that field instead of just
        // showing a generic error, so it reads as "one more step," not a failure.
        if (data.isNewAccount) { setNeedsName(true); setError(''); return }
        setError(data.error || 'Could not sign in')
        return
      }

      localStorage.setItem('wildcast_auth_type', 'account')
      localStorage.setItem('wildcast_account_email', data.email)
      localStorage.setItem('wildcast_account_token', data.sessionToken)
      localStorage.setItem('wildcast_credits', ACCOUNT_DEFAULT_CREDITS)
      localStorage.setItem('wildcast_role', data.role || 'partner')
      onActivated({ key: data.email, clientName: data.displayName, credits: ACCOUNT_DEFAULT_CREDITS, role: data.role || 'partner' })
    } catch {
      setError('Could not connect. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>

      {/* Header - matches the main app header */}
      <header style={{ background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 32px', height: 58, display: 'flex', alignItems: 'center' }}>
          <img src="/assets/Logo (Only Font) Dark.png" alt="Wild Stack" style={{ height: 28 }} />
        </div>
      </header>

      {/* Gate form */}
      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
        <div style={{ width: '100%', maxWidth: 400 }}>

          {/* Icon + title */}
          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <div style={{
              width: 56, height: 56, borderRadius: 16,
              background: 'var(--dark)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px',
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--dark)', letterSpacing: '-0.02em', marginBottom: 8 }}>
              WildCast
            </h1>
            <p style={{ fontSize: 14, color: 'var(--mid)', lineHeight: 1.5 }}>
              Print Templates in Minutes.
            </p>
          </div>

          {/* Mode toggle - client activation keys (unchanged) vs. individual
              team sign-in (new, api/account-auth.js) */}
          <div style={{ display: 'flex', gap: 4, padding: 4, background: '#F3F4F6', borderRadius: 10, marginBottom: 20 }}>
            {[['key', 'Activation key'], ['account', 'Sign in']].map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setError(''); setNeedsName(false) }}
                style={{
                  flex: 1, padding: '9px 0', fontSize: 13, fontWeight: 700, borderRadius: 7, border: 'none', cursor: 'pointer',
                  background: mode === m ? '#fff' : 'transparent',
                  color: mode === m ? 'var(--dark)' : 'var(--mid)',
                  boxShadow: mode === m ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                  fontFamily: 'inherit', transition: 'all 0.15s',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === 'key' ? (
            <>
              {/* Activation key form - unchanged */}
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--dark)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Activation key
                  </label>
                  <input
                    type="text"
                    value={key}
                    onChange={e => setKey(e.target.value)}
                    placeholder="e.g. WOLT-DE-demo-key"
                    autoFocus
                    style={{
                      width: '100%', padding: '12px 14px',
                      fontSize: 14, fontFamily: 'inherit',
                      border: `1.5px solid ${error ? '#EF4444' : 'var(--border)'}`,
                      borderRadius: 10, background: '#fff', color: 'var(--dark)',
                      outline: 'none', transition: 'border-color 0.15s',
                    }}
                    onFocus={e => { if (!error) e.target.style.borderColor = 'var(--primary)' }}
                    onBlur={e => { if (!error) e.target.style.borderColor = 'var(--border)' }}
                  />
                </div>

                {error && (
                  <div style={{ padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, fontSize: 13, color: '#B91C1C' }}>
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !key.trim()}
                  style={{
                    marginTop: 4, padding: '13px', fontSize: 14, fontWeight: 700,
                    background: loading || !key.trim() ? '#E5E7EB' : 'var(--primary)',
                    color: loading || !key.trim() ? 'var(--mid)' : '#fff',
                    border: 'none', borderRadius: 10, cursor: loading || !key.trim() ? 'not-allowed' : 'pointer',
                    transition: 'background 0.15s, transform 0.1s',
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={e => { if (!loading && key.trim()) e.currentTarget.style.background = 'var(--primary-dark)' }}
                  onMouseLeave={e => { if (!loading && key.trim()) e.currentTarget.style.background = 'var(--primary)' }}
                >
                  {loading ? 'Validating…' : 'Activate'}
                </button>
              </form>

              <p style={{ marginTop: 20, textAlign: 'center', fontSize: 12, color: 'var(--light)' }}>
                Don't have a key? Contact Wild Stack to get access.
              </p>
            </>
          ) : (
            <>
              {/* Team sign-in form - email + password. First-ever sign-in for
                  an email creates the account right then (see account-auth.js) -
                  needsName only becomes true once the server's confirmed this
                  email has never signed in before, so the name field doesn't
                  show up front for a returning person logging in normally. */}
              {/* Nothing meaningful to show once SEAT_CAP is uncapped for the
                  pilot (api/_lib/accounts.js) - total/remaining both come
                  back as Infinity, which isn't a number worth printing. */}
              {seats && Number.isFinite(seats.total) && (
                <div style={{
                  marginBottom: 14, padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, textAlign: 'center',
                  background: seats.remaining <= 0 ? '#FEF2F2' : '#F3F4F6',
                  color: seats.remaining <= 0 ? '#B91C1C' : 'var(--mid)',
                  border: `1px solid ${seats.remaining <= 0 ? '#FECACA' : 'var(--border)'}`,
                }}>
                  {seats.remaining <= 0
                    ? `All ${seats.total} team seats are taken`
                    : `${seats.remaining} of ${seats.total} team seats available`}
                </div>
              )}

              <form onSubmit={handleAccountSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--dark)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@wildstack.studio"
                    autoFocus
                    style={{
                      width: '100%', padding: '12px 14px',
                      fontSize: 14, fontFamily: 'inherit',
                      border: `1.5px solid ${error ? '#EF4444' : 'var(--border)'}`,
                      borderRadius: 10, background: '#fff', color: 'var(--dark)',
                      outline: 'none', transition: 'border-color 0.15s',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--dark)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    style={{
                      width: '100%', padding: '12px 14px',
                      fontSize: 14, fontFamily: 'inherit',
                      border: `1.5px solid ${error ? '#EF4444' : 'var(--border)'}`,
                      borderRadius: 10, background: '#fff', color: 'var(--dark)',
                      outline: 'none', transition: 'border-color 0.15s',
                    }}
                  />
                  <p style={{ marginTop: 6, fontSize: 11, color: 'var(--light)' }}>
                    First time signing in with this email? This password becomes your account's password from now on.
                  </p>
                </div>

                {needsName && (
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--dark)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Your name
                    </label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={e => setDisplayName(e.target.value)}
                      placeholder="e.g. Julia Stadler"
                      autoFocus
                      style={{
                        width: '100%', padding: '12px 14px',
                        fontSize: 14, fontFamily: 'inherit',
                        border: '1.5px solid var(--primary)',
                        borderRadius: 10, background: '#fff', color: 'var(--dark)',
                        outline: 'none',
                      }}
                    />
                    <p style={{ marginTop: 6, fontSize: 11, color: 'var(--mid)' }}>
                      New here - this email hasn't signed in before. Your name is used to label your own folder in Designs.
                    </p>
                  </div>
                )}

                {error && (
                  <div style={{ padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, fontSize: 13, color: '#B91C1C' }}>
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !email.trim() || !password || (needsName && !displayName.trim())}
                  style={{
                    marginTop: 4, padding: '13px', fontSize: 14, fontWeight: 700,
                    background: (loading || !email.trim() || !password || (needsName && !displayName.trim())) ? '#E5E7EB' : 'var(--primary)',
                    color: (loading || !email.trim() || !password || (needsName && !displayName.trim())) ? 'var(--mid)' : '#fff',
                    border: 'none', borderRadius: 10,
                    cursor: (loading || !email.trim() || !password || (needsName && !displayName.trim())) ? 'not-allowed' : 'pointer',
                    transition: 'background 0.15s, transform 0.1s',
                    fontFamily: 'inherit',
                  }}
                >
                  {loading ? 'Signing in…' : needsName ? 'Create account' : 'Sign in'}
                </button>
              </form>
            </>
          )}
        </div>
      </main>

      {/* Matches WildScale's own footer exactly (Julia's ask, 2026-09-16) -
          scale.wildstack.studio's footer is a single centered copyright
          line: max-w-6xl (1152px) mx-auto, px-6 py-6 (24px), text-xs
          (12px), text-gray-400 (var(--light), same hex), text-center. */}
      <footer style={{ background: '#FFFFFF', borderTop: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 1152, margin: '0 auto', padding: 24, fontSize: 12, color: 'var(--light)', textAlign: 'center' }}>
          © {new Date().getFullYear()} Wildstack Studio
        </div>
      </footer>
    </div>
  )
}
