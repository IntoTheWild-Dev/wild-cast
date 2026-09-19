import { useState, useEffect } from 'react'
import { getLibraryAssets, uniqueMerchants, FOLDERS, GENERAL_MERCHANT } from '../lib/assetLibrary'
import { hasTransparency } from '../lib/image'

// "Choose from Assets" for the Prompt Brief chat (Julia's ask, 2026-09-19).
// Opens the same shared Assets library the Assets tab and the editor's
// "Choose from library" use, as a popup over the chat - so picking a logo or
// photo never navigates away and loses the conversation. Starts on the
// partner's own assets when they have any (same default rule as the editor's
// picker), and applies the same transparent-PNG check when the zone needs it.
const ALL = '__all__'

export default function PromptBriefAssetPicker({ folder, merchant, requireTransparent, onPick, onClose }) {
  const [assets, setAssets] = useState(null) // null while loading
  const [filter, setFilter] = useState(ALL)
  const [search, setSearch] = useState('')
  const [error, setError] = useState(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    let cancelled = false
    getLibraryAssets().then(all => {
      if (cancelled) return
      const inFolder = all.filter(a => a.folder === folder)
      setAssets(inFolder)
      // Only default to the partner when they really have assets tagged that
      // way - an unmatched value would silently show an empty list.
      if (uniqueMerchants(inFolder).includes(merchant)) setFilter(merchant)
    })
    return () => { cancelled = true }
  }, [folder, merchant])

  const merchants = assets ? uniqueMerchants(assets) : []
  const shown = (assets ?? [])
    .filter(a => filter === ALL || (a.merchant || GENERAL_MERCHANT) === filter)
    .filter(a => !search.trim() || a.name.toLowerCase().includes(search.trim().toLowerCase()))

  async function choose(asset) {
    if (checking) return
    setError(null)
    if (requireTransparent) {
      setChecking(true)
      const ok = await hasTransparency(asset.src)
      setChecking(false)
      if (!ok) { setError('This image has a background - please pick a transparent PNG.'); return }
    }
    onPick(asset)
  }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 260, background: 'rgba(17,17,17,0.25)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 720, maxHeight: '86vh', overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ padding: '22px 24px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--dark)', margin: 0, letterSpacing: '-0.02em' }}>Choose from Assets</h3>
            <div style={{ fontSize: 12, color: 'var(--mid)', marginTop: 2 }}>{FOLDERS[folder] ?? 'Assets'}</div>
          </div>
          <button
            type="button" onClick={onClose} aria-label="Close"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--light)', lineHeight: 1, padding: 4 }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: '0 24px 14px', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <select
            value={filter} onChange={e => setFilter(e.target.value)}
            style={{ padding: '9px 12px', fontSize: 13, fontFamily: 'inherit', border: '1.5px solid var(--border)', borderRadius: 8, background: '#fff', color: 'var(--dark)' }}
          >
            <option value={ALL}>All partners</option>
            {merchants.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <input
            value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name"
            style={{ flex: 1, minWidth: 160, padding: '9px 12px', fontSize: 13, fontFamily: 'inherit', border: '1.5px solid var(--border)', borderRadius: 8, outline: 'none' }}
          />
        </div>

        {error && <div style={{ margin: '0 24px 12px', fontSize: 12, color: '#B91C1C' }}>{error}</div>}

        <div style={{ padding: '0 24px 24px', overflowY: 'auto', minHeight: 120 }}>
          {assets === null && <div style={{ fontSize: 13, color: 'var(--mid)', padding: '24px 0', textAlign: 'center' }}>Loading your assets…</div>}
          {assets !== null && shown.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--mid)', padding: '24px 0', textAlign: 'center', lineHeight: 1.5 }}>
              {assets.length === 0
                ? `Nothing in ${FOLDERS[folder] ?? 'this folder'} yet. Close this and upload one instead, or add it in the Assets tab.`
                : 'No assets match. Try another partner or clear the search.'}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12 }}>
            {shown.map(a => (
              <button
                key={a.url} type="button" onClick={() => choose(a)} disabled={checking}
                style={{ padding: 0, textAlign: 'left', cursor: checking ? 'wait' : 'pointer', border: '1.5px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: '#fff', fontFamily: 'inherit', transition: 'border-color 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
              >
                <div style={{ height: 96, background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <img src={a.src} alt={a.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                </div>
                <div style={{ padding: '8px 10px' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--dark)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--mid)' }}>{a.merchant || GENERAL_MERCHANT}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
