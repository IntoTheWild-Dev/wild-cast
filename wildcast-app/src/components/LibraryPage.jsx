import { useState, useEffect } from 'react'
import { FOLDERS, getLibraryAssets, deleteLibraryAsset } from '../lib/assetLibrary'

function formatDate(ts) {
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function EmptyState() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🖼️</div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--dark)', marginBottom: 6 }}>No assets yet</div>
        <div style={{ fontSize: 13, color: 'var(--mid)', maxWidth: 320 }}>
          Logos and photos you upload in the editor are saved here automatically, sorted into folders, so you can reuse them across designs.
        </div>
      </div>
    </div>
  )
}

function AssetCard({ asset, onDelete }) {
  return (
    <div
      style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', position: 'relative' }}
    >
      <div style={{
        aspectRatio: '1 / 1', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        background: asset.folder === 'logos' || asset.folder === 'stickers'
          ? 'repeating-conic-gradient(#f3f4f6 0% 25%, #fff 0% 50%) 50% / 16px 16px'
          : '#F3F4F6',
      }}>
        <img src={asset.dataUrl} alt={asset.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      </div>
      <div style={{ padding: '8px 10px' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--dark)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={asset.name}>
          {asset.name}
        </div>
        <div style={{ fontSize: 10, color: 'var(--mid)', marginTop: 2 }}>{formatDate(asset.uploadedAt)}</div>
      </div>
      <button
        onClick={() => onDelete(asset.id)}
        title="Remove from library"
        style={{
          position: 'absolute', top: 6, right: 6,
          width: 22, height: 22, borderRadius: '50%',
          background: 'rgba(0,0,0,0.45)', color: '#fff', border: 'none',
          cursor: 'pointer', fontSize: 12, lineHeight: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: 0, transition: 'opacity 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.opacity = '1'}
        onMouseLeave={e => e.currentTarget.style.opacity = '0'}
      >
        ×
      </button>
    </div>
  )
}

export default function LibraryPage() {
  const [assets, setAssets] = useState([])

  useEffect(() => {
    setAssets(getLibraryAssets())
  }, [])

  function handleDelete(id) {
    setAssets(deleteLibraryAsset(id))
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'auto' }}>

      {/* Page header */}
      <div style={{ borderBottom: '1px solid var(--border)', padding: '28px 40px 24px', background: '#fff' }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--dark)' }}>Library</h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--mid)' }}>
          {assets.length === 0
            ? 'Your uploaded logos and photos, ready to reuse across designs.'
            : `${assets.length} saved asset${assets.length === 1 ? '' : 's'}`}
        </p>
      </div>

      {assets.length === 0 ? (
        <EmptyState />
      ) : (
        <div style={{ padding: '32px 40px' }}>
          {Object.entries(FOLDERS).map(([folderKey, folderLabel]) => {
            const folderAssets = assets.filter(a => a.folder === folderKey)
            if (folderAssets.length === 0) return null
            return (
              <div key={folderKey} style={{ marginBottom: 36 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--mid)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
                  {folderLabel} · {folderAssets.length}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 16 }}>
                  {folderAssets.map(asset => (
                    <AssetCard key={asset.id} asset={asset} onDelete={handleDelete} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

    </div>
  )
}
