import { useState } from 'react'

export default function ActivationGate({ onActivated }) {
  const [key, setKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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
      onActivated({ key: trimmed, clientName: data.client_name, credits: data.total_credits })
    } catch {
      setError('Could not connect. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>

      {/* Header — matches the main app header */}
      <header style={{ background: 'var(--dark)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 32px', height: 58, display: 'flex', alignItems: 'center' }}>
          <img src="/assets/Logo (Only Font) PNG 4.png" alt="Wild Stack" style={{ height: 28 }} />
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
              Wild Cast
            </h1>
            <p style={{ fontSize: 14, color: 'var(--mid)', lineHeight: 1.5 }}>
              Print templates for Wolt partners.<br />Enter your activation key to get started.
            </p>
          </div>

          {/* Form */}
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
        </div>
      </main>

      {/* Footer */}
      <footer style={{ background: 'var(--dark)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '18px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>
          <span>Wild Cast — Print templates for Wolt partners.</span>
          <span>Built by Wild Stack</span>
        </div>
      </footer>
    </div>
  )
}
