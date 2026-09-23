import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import Select from './Select'
import { TEMPLATES } from '../data/templates'
import { isCloseMatch } from '../lib/fuzzyMatch'

const ALL = '__all__'

function formatDate(ts) {
  const d = new Date(ts)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Merges the static template cards with any Figma-imported ones into one
// id -> {cat, format} lookup - both arrays already carry these fields per
// card (see src/data/templates.js and customTemplateCards() in
// src/lib/customTemplates.js), so no extra data needs to be saved onto a
// project itself to know what kind of design it is.
function buildTemplateInfo(customCards) {
  const map = {}
  for (const t of TEMPLATES) map[t.id] = { cat: t.cat, format: t.format }
  for (const t of customCards) map[t.id] = { cat: t.cat, format: t.format }
  return map
}

function groupLabel(info) {
  if (!info?.cat || !info?.format) return 'Other'
  const cap = info.cat.charAt(0).toUpperCase() + info.cat.slice(1)
  return `${cap} ${info.format}`
}

function initials(name) {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('') || '?'
}

function EmptyState({ title, desc }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🎨</div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--dark)', marginBottom: 6 }}>{title}</div>
        <div style={{ fontSize: 13, color: 'var(--mid)', maxWidth: 280 }}>{desc}</div>
      </div>
    </div>
  )
}

// Groups merchant strings that are the same real name typed slightly
// differently - casing ("Wen Cheng"/"WEN CHENG") AND small typos
// ("Wen Chen" missing the "g") - before listing them as filter options.
// Real saved data has both problems (Julia's reports, 2026-09-15): picking
// any ONE spelling only ever showed part of that merchant's designs, reading
// as if most were missing entirely. Uses isCloseMatch() (small edit-distance,
// digit-aware so "Flyer 2"/"Flyer 3" never merge) - see lib/fuzzyMatch.js for
// the exact rule. Doesn't touch the underlying saved `merchant` value on any
// project, only how options are grouped for display/filtering here; fixing
// the actual stored spelling is a separate, deliberate data-cleanup action.
//
// Greedy single-pass clustering, most-frequent spelling processed first so
// it naturally becomes each group's canonical/displayed label (e.g. "Wen
// Cheng" - the common correct spelling - wins over the rarer "WEN CHEN" typo,
// rather than whichever happened to be typed first or sorts first alphabetically).
// Returns { options, canonicalOf } - options is the sorted display list,
// canonicalOf maps every raw merchant string seen to its group's label, so
// filtering a project's raw p.merchant against a selected canonical option
// is a straightforward lookup rather than re-running the fuzzy check per row.
function groupMerchantsFuzzy(merchants) {
  const counts = new Map()
  for (const m of merchants) {
    if (!m) continue
    counts.set(m, (counts.get(m) || 0) + 1)
  }
  // Tiebreaker beyond plain frequency: prefer a non-SHOUTING spelling over an
  // ALL-CAPS one when two variants tie on count - a typo'd "WEN CHEN" and the
  // correct "Wen Cheng" can easily tie (2 saves each is common at this
  // scale), and picking the all-caps typo as the group's displayed label
  // would be a real, visible regression even though the grouping itself is
  // correct. Longer string as the final tiebreaker after that.
  const isShouting = s => s === s.toUpperCase() && s !== s.toLowerCase()
  const byFrequency = [...counts.keys()].sort((a, b) =>
    (counts.get(b) - counts.get(a))
    || (isShouting(a) - isShouting(b))
    || (b.length - a.length)
    || a.localeCompare(b)
  )

  const groups = [] // [{ label, members: string[] }]
  for (const m of byFrequency) {
    const group = groups.find(g => isCloseMatch(m, g.label))
    if (group) group.members.push(m)
    else groups.push({ label: m, members: [m] })
  }

  const canonicalOf = new Map()
  for (const g of groups) for (const m of g.members) canonicalOf.set(m, g.label)

  return {
    options: groups.map(g => g.label).sort((a, b) => a.localeCompare(b)),
    canonicalOf,
  }
}

// Every signed-in person (account or shared activation key) with any saved
// design or any created-but-still-empty folder gets a "person" entry - the
// unit personal folders are organized around (Julia's ask, 2026-09-15:
// "a main folder called Julia Stadler but then also subfolders"). The
// currently signed-in person always gets an entry even with zero designs and
// zero folders yet, so they can always find their own (empty) space to
// create their first folder in.
function buildPeople(enriched, folderRegistry, activation) {
  const map = new Map() // ownerEmail -> { ownerEmail, ownerName, count, folderSet }
  function ensure(email, name) {
    if (!map.has(email)) map.set(email, { ownerEmail: email, ownerName: name || email, count: 0, folderSet: new Set() })
    const entry = map.get(email)
    if (name && entry.ownerName === entry.ownerEmail) entry.ownerName = name
    return entry
  }
  for (const p of enriched) {
    if (!p.ownerEmail) continue
    const entry = ensure(p.ownerEmail, p.ownerName)
    entry.count++
    if (p.folder) entry.folderSet.add(p.folder)
  }
  for (const rec of folderRegistry) {
    if (!rec.ownerEmail) continue
    const entry = ensure(rec.ownerEmail, rec.ownerName)
    for (const f of rec.folders || []) entry.folderSet.add(f)
  }
  if (activation?.key) ensure(activation.key, activation.clientName)
  return [...map.values()].sort((a, b) => a.ownerName.localeCompare(b.ownerName))
}

// Designs are shared across every activation key now, with no ownership
// boundary - so opening one always asks first rather than editing the
// original in place, since anyone might be picking up someone else's saved
// work. Duplicating creates an independent copy up front; only "Edit
// original" touches the source record.
function ConfirmOpenModal({ project, busy, onEditOriginal, onDuplicate, onCancel }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 420, maxWidth: '100%', boxShadow: '0 24px 80px rgba(0,0,0,0.2)' }}>
        <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--dark)', margin: '0 0 4px', letterSpacing: '-0.02em' }}>
          {project.projectName || project.templateName}
        </h3>
        <p style={{ fontSize: 13, color: 'var(--mid)', margin: '0 0 20px' }}>
          This design is shared - anyone can open it. Edit the original in place, or duplicate it and keep the original untouched.
        </p>

        <button
          disabled={busy}
          onClick={onDuplicate}
          style={{ width: '100%', padding: '13px', fontSize: 14, fontWeight: 700, background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 10, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}
        >
          {busy ? 'Working…' : 'Duplicate & edit a copy'}
        </button>
        <button
          disabled={busy}
          onClick={onEditOriginal}
          style={{ marginTop: 10, width: '100%', padding: '13px', fontSize: 14, fontWeight: 700, background: '#fff', color: 'var(--dark)', border: '1.5px solid var(--border)', borderRadius: 10, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}
        >
          Edit original
        </button>
        <button
          disabled={busy}
          onClick={onCancel}
          style={{ marginTop: 10, width: '100%', padding: '10px', fontSize: 13, fontWeight: 600, background: 'none', color: 'var(--mid)', border: 'none', cursor: busy ? 'default' : 'pointer' }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// canOrganize (true only when the signed-in person owns this design - see
// DesignsPage's canOrganize call site) adds a small "file into folder"
// dropdown under the card, right in place - no need to open a separate
// Folders view just to move something. Picking "+ New folder…" prompts for
// a name and immediately moves this card into it. Rename (the pencil icon)
// is NOT owner-gated - designs are already fully shared/editable by anyone
// (see ConfirmOpenModal below), so renaming follows that same existing
// model rather than the newer, deliberately-personal folder-organizing one.
// Every save writes the full project into sessionStorage (App.jsx's doSave)
// and re-opening a design reads that copy FIRST. Move/rename only patch the
// server record, so without patching this copy too, re-opening a design you
// just moved loaded the OLD folder/owner/name into the editor, and its next
// autosave wrote them straight back over the move (Julia's report,
// 2026-09-21: "the buttons work but it doesn't move it").
function patchCachedProject(id, patch) {
  try {
    const key = `wildcast_project_${id}`
    const cached = sessionStorage.getItem(key)
    if (cached) sessionStorage.setItem(key, JSON.stringify({ ...JSON.parse(cached), ...patch }))
  } catch { /* storage unavailable or corrupt - the server copy is still right */ }
}

function DesignCard({ project, loading, onOpen, onDelete, onRename, canOrganize, people, onMove, showOwner }) {
  const [moving, setMoving] = useState(false)
  return (
    <div
      onClick={() => onOpen(project)}
      style={{
        background: '#fff', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden',
        cursor: loading ? 'default' : 'pointer', transition: 'box-shadow 0.15s, transform 0.15s',
        position: 'relative', opacity: loading ? 0.7 : 1,
        // Fills the grid row's full height (CSS Grid stretches items by
        // default) and lays out as a column so the button block below can
        // be pinned to the bottom - otherwise a short one-line title left
        // "Continue editing" sitting higher than on a card with a two-line
        // title/owner-name next to it in the same row (Julia's ask,
        // 2026-09-15: keep every row's buttons on the same line).
        display: 'flex', flexDirection: 'column', height: '100%',
      }}
      onMouseEnter={e => {
        if (!loading) {
          e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.1)'
          e.currentTarget.style.transform = 'translateY(-2px)'
        }
      }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none' }}
    >
      <div style={{ background: '#00C2CB', aspectRatio: '316 / 441', overflow: 'hidden', position: 'relative' }}>
        {project.thumbnail ? (
          <img src={project.thumbnail} alt={project.templateName} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
            No preview
          </div>
        )}
        {loading && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#fff', fontSize: 12 }}>Opening…</span>
          </div>
        )}
      </div>

      <div style={{ padding: '12px 14px 14px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Single line + ellipsis, not wrap - a long design name used to push
            everything below it further down than a short one, throwing off
            row alignment. title="" gives the "hover to see the full name"
            behavior on desktop for free - but hover doesn't exist on
            phone/tablet, so a truncated name had no way to be read there at
            all (Julia's report, 2026-09-15, on what turned out to be a
            phone-width screenshot again). onClick + stopPropagation adds a
            tap-to-reveal fallback that works identically on touch or desktop,
            without also triggering the card's own "open this design" click. */}
        <div
          title={project.projectName || project.templateName}
          onClick={e => {
            e.stopPropagation()
            window.alert(project.projectName || project.templateName)
          }}
          style={{ fontWeight: 700, fontSize: 14, color: 'var(--dark)', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'default' }}
        >
          {project.projectName || project.templateName}
        </div>
        <div style={{ fontSize: 11, color: 'var(--mid)' }}>{project.merchant} · Saved {formatDate(project.savedAt)}</div>
        {showOwner && project.ownerName && (
          <div style={{ fontSize: 10, color: 'var(--light)', marginTop: 2 }}>by {project.ownerName}</div>
        )}

        {/* Pinned to the card's bottom (marginTop: auto, inside the flex
            column above) regardless of how many lines the content above
            took - this is what actually keeps every "Continue editing"
            button on the same line across a row. */}
        <div style={{ marginTop: 'auto', paddingTop: 12 }}>
          <button
            style={{ width: '100%', padding: '8px', fontSize: 12, fontWeight: 700, background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', transition: 'background 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-dark)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--primary)'}
            onClick={e => { e.stopPropagation(); onOpen(project) }}
          >
            {loading ? 'Opening…' : 'Continue editing'}
          </button>

          {canOrganize && (
            <div style={{ marginTop: 8 }} onClick={e => e.stopPropagation()}>
              {/* A native <select> couldn't move a design into a DIFFERENT
                  sign-in's folder (it only ever listed this project's own
                  owner's folders) and its inline popup was easy to miss -
                  Julia's report, 2026-09-18. This opens a proper centered
                  modal instead, listing every person's folders so a design
                  can be re-homed across sign-ins, not just re-filed within
                  its current one. */}
              <button
                type="button"
                onClick={() => setMoving(true)}
                style={{ width: '100%', fontSize: 11, fontWeight: 600, color: 'var(--dark)', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer' }}
              >
                Move to folder
              </button>
            </div>
          )}
          {moving && (
            <MoveModal
              project={project}
              people={people}
              onClose={() => setMoving(false)}
              onMove={(folder, ownerEmail, ownerName) => { onMove(project, folder, ownerEmail, ownerName); setMoving(false) }}
            />
          )}
        </div>
      </div>

      {/* Always visible, not hover-revealed - hover has no touch-device
          equivalent, so a hover-only reveal made these two actions
          impossible to find on phone/tablet (Julia's report, 2026-09-15:
          "i dont see a flyer editing function"). */}
      <button
        onClick={e => { e.stopPropagation(); onRename(project) }}
        title="Rename this design"
        style={{
          position: 'absolute', top: 8, right: 36, width: 24, height: 24, borderRadius: '50%',
          background: 'rgba(0,0,0,0.55)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, lineHeight: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.75)'}
        onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,0.55)'}
      >
        ✎
      </button>

      <button
        onClick={e => { e.stopPropagation(); onDelete(project.id) }}
        title="Remove from Designs"
        style={{
          position: 'absolute', top: 8, right: 8, width: 24, height: 24, borderRadius: '50%',
          background: 'rgba(0,0,0,0.55)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, lineHeight: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.75)'}
        onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,0.55)'}
      >
        ×
      </button>
    </div>
  )
}

// Centered popup listing every person's folders (Julia's ask, 2026-09-18) -
// picking any row moves this design there, including a folder that belongs
// to a DIFFERENT sign-in than the design's current owner, which re-homes
// the design under that person too (see handleMove in the parent). Every
// click inside stops propagation so it never bubbles up into the card's
// own onOpen underneath it.
function MoveModal({ project, people, onClose, onMove }) {
  function createAndMove(ownerEmail, ownerName) {
    const name = window.prompt('New folder name')?.trim()
    if (name) onMove(name, ownerEmail, ownerName)
  }

  // Portaled straight to document.body - Julia's report, 2026-09-18: the
  // popup flickered between properly centered and clipped/small "inside the
  // tile". Root cause: DesignCard sets an inline `transform` on hover (its
  // lift-up effect), and CSS makes any transformed ancestor the containing
  // block for a `position: fixed` descendant instead of the viewport - so
  // while nested inside the card, this modal centered on the CARD, not the
  // screen, and jumped every time hover state changed underneath it. A
  // portal renders this outside that DOM subtree entirely, so no ancestor
  // transform can ever affect it again.
  return createPortal(
    <div
      onClick={e => { e.stopPropagation(); onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 16, padding: 24, width: 440, maxWidth: '100%', maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.2)' }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 2 }}>
          <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--dark)', margin: 0, flex: 1 }}>Move to folder</h3>
          <button
            onClick={onClose}
            style={{ width: 26, height: 26, border: 'none', background: '#F3F4F6', borderRadius: '50%', cursor: 'pointer', fontSize: 14, color: 'var(--mid)', lineHeight: 1, flexShrink: 0 }}
          >×</button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--mid)', margin: '0 0 18px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {project.projectName || project.templateName}
        </p>

        {people.map(person => (
          <div key={person.ownerEmail} style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--mid)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
              {person.ownerName}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {!(project.ownerEmail === person.ownerEmail && !project.folder) && (
                <FolderRow label="Unsorted" onClick={() => onMove(null, person.ownerEmail, person.ownerName)} />
              )}
              {[...person.folderSet].sort((a, b) => a.localeCompare(b))
                .filter(f => !(project.ownerEmail === person.ownerEmail && project.folder === f))
                .map(f => (
                  <FolderRow key={f} label={f} onClick={() => onMove(f, person.ownerEmail, person.ownerName)} />
                ))}
              <FolderRow label="+ New folder…" accent onClick={() => createAndMove(person.ownerEmail, person.ownerName)} />
            </div>
          </div>
        ))}
      </div>
    </div>,
    document.body
  )
}

function FolderRow({ label, onClick, accent }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ textAlign: 'left', padding: '9px 12px', fontSize: 13, fontWeight: 600, color: accent ? 'var(--primary)' : 'var(--dark)', background: '#FAFAF8', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer' }}
    >
      {accent ? label : `📁 ${label}`}
    </button>
  )
}

function PersonCard({ person, onOpen }) {
  return (
    <div
      onClick={onOpen}
      style={{
        background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 18,
        cursor: 'pointer', transition: 'box-shadow 0.15s, transform 0.15s',
        display: 'flex', alignItems: 'center', gap: 12,
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.1)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none' }}
    >
      <div style={{
        width: 44, height: 44, borderRadius: '50%', background: 'var(--primary-glow)', color: 'var(--primary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15, flexShrink: 0,
      }}>
        {initials(person.ownerName)}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--dark)', wordBreak: 'break-word' }}>{person.ownerName}</div>
        <div style={{ fontSize: 11, color: 'var(--mid)' }}>
          {person.count} design{person.count !== 1 ? 's' : ''} · {person.folderSet.size} folder{person.folderSet.size !== 1 ? 's' : ''}
        </div>
      </div>
    </div>
  )
}

function FolderCard({ name, count, onOpen }) {
  return (
    <div
      onClick={onOpen}
      style={{
        background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 18,
        cursor: 'pointer', transition: 'box-shadow 0.15s, transform 0.15s',
        display: 'flex', alignItems: 'center', gap: 12,
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.1)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none' }}
    >
      <div style={{ fontSize: 24 }}>📁</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--dark)', wordBreak: 'break-word' }}>{name}</div>
        <div style={{ fontSize: 11, color: 'var(--mid)' }}>{count} design{count !== 1 ? 's' : ''}</div>
      </div>
    </div>
  )
}

// Designs used to only ever be discoverable via a per-browser localStorage
// registry - nobody but whoever saved a design, on that exact browser, could
// ever see it existed. Now backed by a real server-side listing
// (GET /api/save-project), so every activation key sees every saved design.
//
// activation is used for two things here: which person's own design/folder
// gets the "organize" controls (Move to folder / + New folder - Julia's
// call, 2026-09-15: everyone can BROWSE every folder, but a folder is still
// personal to whoever's filing things into it), and stamping who's creating
// a new folder.
export default function DesignsPage({ onOpenProject, onDuplicateProject, customCards = [], activation, onBack }) {
  const [projects, setProjects] = useState([])
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [loadingId, setLoadingId] = useState(null)
  // Inline filters, always visible - same "Viewing" bar pattern as
  // LibraryPage.jsx, replacing the old "Find a design" popup gate that used
  // to block the whole list until submitted (Julia's ask, 2026-09-15).
  const [formatFilter, setFormatFilter] = useState(ALL)
  const [merchantFilter, setMerchantFilter] = useState(ALL)
  const [personFilter, setPersonFilter] = useState(ALL)
  const [nameSearch, setNameSearch] = useState('')
  const [pendingProject, setPendingProject] = useState(null)
  const [pendingBusy, setPendingBusy] = useState(false)

  // "All designs" (existing flat/grouped-by-format view) vs "Folders"
  // (browse by person -> their subfolders - Julia's ask, 2026-09-15: "create
  // a folder in the design tab" with a main folder per person + subfolders).
  const [viewMode, setViewMode] = useState('all') // 'all' | 'folders'
  const [activePerson, setActivePerson] = useState(null) // ownerEmail | null
  const [activeFolder, setActiveFolder] = useState(null) // folder name | null
  const [folderRegistry, setFolderRegistry] = useState([]) // [{ ownerEmail, ownerName, folders }]

  useEffect(() => {
    fetch('/api/save-project', { cache: 'no-store' })
      .then(r => r.json())
      .then(data => { setProjects(data.projects ?? []); setStatus('ready') })
      .catch(() => setStatus('error'))
    fetch('/api/folders', { cache: 'no-store' })
      .then(r => r.json())
      .then(data => setFolderRegistry(data.owners ?? []))
      .catch(() => {})
  }, [])

  const templateInfo = useMemo(() => buildTemplateInfo(customCards), [customCards])

  const enriched = useMemo(
    () => projects.map(p => ({ ...p, group: groupLabel(templateInfo[p.templateId]) })),
    [projects, templateInfo]
  )

  const people = useMemo(() => buildPeople(enriched, folderRegistry, activation), [enriched, folderRegistry, activation])

  const formatOptions = useMemo(() => [...new Set(enriched.map(p => p.group))].sort(), [enriched])
  const merchantGroups = useMemo(() => groupMerchantsFuzzy(enriched.map(p => p.merchant)), [enriched])
  const merchantOptions = merchantGroups.options

  const filtered = useMemo(() => {
    const q = nameSearch.trim().toLowerCase()
    return enriched
      .filter(p =>
        (formatFilter === ALL || p.group === formatFilter) &&
        // Compares each project's CANONICAL group (from groupMerchantsFuzzy()
        // above), not a raw string match - the selected option is one
        // specific spelling, but real saved projects for the "same" merchant
        // can be typed with different casing or a small typo.
        (merchantFilter === ALL || merchantGroups.canonicalOf.get(p.merchant) === merchantFilter) &&
        (personFilter === ALL || p.ownerEmail === personFilter) &&
        (!q || (p.projectName || p.templateName || '').toLowerCase().includes(q))
      )
      // Newest first - the blob listing this comes from has no inherent
      // order, which read as random once designs from many merchants mixed.
      .sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0))
  }, [enriched, formatFilter, merchantFilter, merchantGroups, personFilter, nameSearch])

  const grouped = useMemo(() => {
    const byGroup = {}
    for (const p of filtered) (byGroup[p.group] ??= []).push(p)
    return Object.entries(byGroup).sort(([a], [b]) => a.localeCompare(b))
  }, [filtered])

  function handleDelete(id) {
    if (!window.confirm('Delete this design? This cannot be undone.')) return
    setProjects(prev => prev.filter(p => p.id !== id))
    fetch(`/api/delete-project?id=${id}`, { method: 'DELETE' }).catch(() => {})
  }

  // Renames right from the card, no need to open the editor - Julia's ask,
  // 2026-09-15. Not owner-gated (see DesignCard's own comment on this).
  function handleRename(project) {
    const current = project.projectName || project.templateName || ''
    const next = window.prompt('Rename this design', current)?.trim()
    if (!next || next === current) return
    setProjects(prev => prev.map(p => p.id === project.id ? { ...p, projectName: next } : p))
    patchCachedProject(project.id, { projectName: next })
    fetch('/api/rename-project', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: project.id, projectName: next }),
    }).catch(() => {})
  }

  function handleRequestOpen(project) {
    setPendingProject(project)
  }

  async function handleEditOriginal() {
    const project = pendingProject
    setPendingBusy(true)
    setLoadingId(project.id)
    try {
      await onOpenProject(project)
      setPendingProject(null)
    } finally {
      setPendingBusy(false)
      setLoadingId(null)
    }
  }

  async function handleDuplicate() {
    const project = pendingProject
    setPendingBusy(true)
    setLoadingId(project.id)
    try {
      await onDuplicateProject(project)
      setPendingProject(null)
    } catch (err) {
      // Bug fix, 2026-09-24: this had no catch at all, so a failed
      // duplicate (e.g. api/save-project.js's POST now surfaces a real
      // 500 instead of silently swallowing a transient read error) just
      // reset the busy state with zero explanation - an unhandled promise
      // rejection visible only in the console, not to the person waiting
      // on the popup.
      alert('Could not duplicate this design: ' + err.message)
    } finally {
      setPendingBusy(false)
      setLoadingId(null)
    }
  }

  // Optimistic - reflects the move immediately (folders/lists using
  // `projects` update right away) and fires the real write in the
  // background; matches handleDelete's existing pattern above.
  //
  // ownerEmail/ownerName: passed whenever the target folder belongs to a
  // DIFFERENT person than the design's current owner (Julia's ask,
  // 2026-09-18 - moving across the two "Wild Stack"/"Wild Stack Team"
  // sign-ins) - re-homes the design itself, not just its folder tag, so it
  // actually shows up under the new owner's Folders view.
  function handleMove(project, folder, ownerEmail, ownerName) {
    const targetEmail = ownerEmail || project.ownerEmail
    const targetName = ownerEmail ? (ownerName || ownerEmail) : project.ownerName
    const before = { folder: project.folder ?? null, ownerEmail: project.ownerEmail ?? null, ownerName: project.ownerName ?? null }
    const after = { folder: folder || null, ownerEmail: targetEmail, ownerName: targetName }
    setProjects(prev => prev.map(p => p.id === project.id ? { ...p, ...after } : p))
    patchCachedProject(project.id, after)
    // Put it back and say so if the server did not accept the move - it was
    // previously ignored, so a failed move looked like it had worked.
    fetch('/api/move-project', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: project.id, folder, ownerEmail, ownerName }),
    }).then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    }).catch(err => {
      setProjects(prev => prev.map(p => p.id === project.id ? { ...p, ...before } : p))
      patchCachedProject(project.id, before)
      alert(`Could not move this design (${err.message}). It is still in its original folder.`)
    })
    if (folder) {
      setFolderRegistry(prev => {
        const mine = prev.find(r => r.ownerEmail === targetEmail)
        if (mine?.folders?.includes(folder)) return prev
        const others = prev.filter(r => r.ownerEmail !== targetEmail)
        return [...others, { ownerEmail: targetEmail, ownerName: targetName, folders: [...(mine?.folders ?? []), folder] }]
      })
    }
  }

  async function handleCreateFolder() {
    const name = window.prompt('New folder name')?.trim()
    if (!name || !activation?.key) return
    try {
      const res = await fetch('/api/folders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerEmail: activation.key, ownerName: activation.clientName, folderName: name }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not create folder')
      setFolderRegistry(prev => [...prev.filter(r => r.ownerEmail !== activation.key), data])
      setActiveFolder(name)
    } catch (err) {
      alert('Could not create folder: ' + err.message)
    }
  }


  const activeFilterCount = [formatFilter !== ALL, merchantFilter !== ALL, personFilter !== ALL, !!nameSearch.trim()].filter(Boolean).length
  const activeFilterSummary = activeFilterCount > 0
    ? [
        formatFilter !== ALL ? formatFilter : null,
        merchantFilter !== ALL ? merchantFilter : null,
        personFilter !== ALL ? people.find(p => p.ownerEmail === personFilter)?.ownerName : null,
        nameSearch.trim() ? `"${nameSearch.trim()}"` : null,
      ].filter(Boolean).join(' · ')
    : null

  const activePersonData = people.find(p => p.ownerEmail === activePerson)
  const personDesigns = useMemo(() => enriched.filter(p => p.ownerEmail === activePerson), [enriched, activePerson])
  const unsortedDesigns = useMemo(() => personDesigns.filter(p => !p.folder), [personDesigns])
  const activeFolderDesigns = useMemo(() => personDesigns.filter(p => p.folder === activeFolder), [personDesigns, activeFolder])
  const isOwnSpace = !!activation?.key && activation.key === activePerson

  // Bigger + a coral (var(--primary)) outline so this doesn't get lost next
  // to the Viewing filter bar it sits above - Julia's report, 2026-09-15:
  // "its a bit hidden now".
  const viewToggle = (
    // width: 'fit-content' - a flex div is block-level by default, so
    // without this it stretched to the full width of its container (Julia's
    // report, 2026-09-16: "shorten this box to bound the buttons").
    <div style={{ display: 'flex', gap: 4, padding: 4, background: '#F3F4F6', borderRadius: 10, border: '1.5px solid var(--primary)', width: 'fit-content' }}>
      {[['all', 'All designs'], ['folders', 'Folders']].map(([m, label]) => (
        <button
          key={m}
          type="button"
          onClick={() => { setViewMode(m); setActivePerson(null); setActiveFolder(null) }}
          style={{
            padding: '9px 18px', fontSize: 14, fontWeight: 700, borderRadius: 7, border: 'none', cursor: 'pointer',
            background: viewMode === m ? 'var(--primary)' : 'transparent',
            color: viewMode === m ? '#fff' : 'var(--mid)',
            boxShadow: viewMode === m ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
            fontFamily: 'inherit', transition: 'all 0.15s',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  )

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'auto' }}>
      {pendingProject && (
        <ConfirmOpenModal
          project={pendingProject}
          busy={pendingBusy}
          onEditOriginal={handleEditOriginal}
          onDuplicate={handleDuplicate}
          onCancel={() => setPendingProject(null)}
        />
      )}

      {/* Inline "Viewing" filter bar, same placement/style as LibraryPage.jsx -
          replaces the old "Find a design" popup that gated the whole list
          until submitted (Julia's ask, 2026-09-15). */}
      <div style={{ borderBottom: '1px solid var(--border)', padding: '28px 40px 24px', background: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--dark)' }}>Design library</h1>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--mid)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit', flexShrink: 0 }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--mid)' }}
            >
              ← Back
            </button>
          )}
        </div>
        <div>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--mid)' }}>
            {status === 'loading' && 'Loading designs…'}
            {status === 'error' && 'Could not load designs - try refreshing the page.'}
            {status === 'ready' && projects.length === 0 && 'Saved designs will appear here - pick up where anyone left off.'}
            {status === 'ready' && projects.length > 0 && viewMode === 'all' && (
              activeFilterSummary
                ? `${filtered.length} of ${projects.length} design${projects.length === 1 ? '' : 's'} · ${activeFilterSummary}`
                : `${projects.length} saved design${projects.length === 1 ? '' : 's'}`
            )}
            {status === 'ready' && viewMode === 'folders' && 'Browse by person - everyone can see everyone’s folders.'}
          </p>
        </div>

        {/* View toggle sits directly above the Viewing bar (Julia's ask,
            2026-09-15) - it used to sit up next to the title. */}
        {status === 'ready' && projects.length > 0 && (
          <div style={{ marginTop: 16 }}>{viewToggle}</div>
        )}

        {status === 'ready' && projects.length > 0 && viewMode === 'all' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--mid)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Viewing
            </label>
            <Select
              value={formatFilter}
              onChange={e => setFormatFilter(e.target.value)}
              style={{ fontSize: 13, fontWeight: 600, color: 'var(--dark)', padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: '#fff' }}
            >
              <option value={ALL}>All formats</option>
              {formatOptions.map(f => <option key={f} value={f}>{f}</option>)}
            </Select>
            <Select
              value={merchantFilter}
              onChange={e => setMerchantFilter(e.target.value)}
              style={{ fontSize: 13, fontWeight: 600, color: 'var(--dark)', padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: '#fff' }}
            >
              <option value={ALL}>All merchants</option>
              {merchantOptions.map(m => <option key={m} value={m}>{m}</option>)}
            </Select>
            <Select
              value={personFilter}
              onChange={e => setPersonFilter(e.target.value)}
              style={{ fontSize: 13, fontWeight: 600, color: 'var(--dark)', padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: '#fff' }}
            >
              <option value={ALL}>Everyone</option>
              {people.map(p => <option key={p.ownerEmail} value={p.ownerEmail}>{p.ownerName}</option>)}
            </Select>
            <input
              type="text"
              value={nameSearch}
              onChange={e => setNameSearch(e.target.value)}
              placeholder="Search by name…"
              style={{ marginLeft: 'auto', fontSize: 13, padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: '#fff', width: 200 }}
            />
          </div>
        )}

        {viewMode === 'folders' && activePerson && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 16, fontSize: 13 }}>
            <span
              onClick={() => { setActivePerson(null); setActiveFolder(null) }}
              style={{ color: 'var(--mid)', cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--primary)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--mid)'}
            >
              ← All people
            </span>
            <span style={{ color: 'var(--light)' }}>/</span>
            {activeFolder ? (
              <>
                <span
                  onClick={() => setActiveFolder(null)}
                  style={{ color: 'var(--mid)', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.color = 'var(--primary)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--mid)'}
                >
                  {activePersonData?.ownerName}
                </span>
                <span style={{ color: 'var(--light)' }}>/</span>
                <span style={{ fontWeight: 700, color: 'var(--dark)' }}>{activeFolder}</span>
              </>
            ) : (
              <span style={{ fontWeight: 700, color: 'var(--dark)' }}>{activePersonData?.ownerName}</span>
            )}
          </div>
        )}
      </div>

      {status === 'ready' && projects.length === 0 && (
        <EmptyState title="No saved designs yet" desc="Open a template, fill in your content, and click Save - it will appear here." />
      )}

      {status === 'ready' && projects.length > 0 && viewMode === 'all' && filtered.length === 0 && (
        <EmptyState title="No designs match" desc="Try widening your filters, or clearing the name search." />
      )}

      {status === 'ready' && projects.length > 0 && viewMode === 'all' && filtered.length > 0 && (
        <div style={{ padding: '32px 40px 40px' }}>
          {grouped.map(([group, items]) => (
            <div key={group} style={{ marginBottom: 36 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--dark)', margin: '0 0 16px' }}>
                {group} <span style={{ fontWeight: 500, color: 'var(--mid)' }}>({items.length})</span>
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 24 }}>
                {items.map(project => (
                  <DesignCard
                    key={project.id}
                    project={project}
                    loading={loadingId === project.id}
                    onOpen={handleRequestOpen}
                    onDelete={handleDelete}
                    onRename={handleRename}
                    showOwner={personFilter === ALL}
                    canOrganize={!!activation?.key}
                    people={people}
                    onMove={handleMove}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {status === 'ready' && projects.length > 0 && viewMode === 'folders' && !activePerson && (
        <div style={{ padding: '32px 40px 40px' }}>
          {/* Each card here is a TEAM MEMBER (a distinct sign-in - activation
              key or account), not a folder - folders live one level in, per
              person. Without this heading the grid alone reads as if each
              card itself were a "folder", which is exactly what confused
              Julia, 2026-09-16: two cards ("Wild Stack" / "Wild Stack Team")
              for what she expected to be one identity. */}
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--dark)', margin: '0 0 4px' }}>Team members</h2>
          <div style={{ fontSize: 12, color: 'var(--mid)', margin: '0 0 16px' }}>
            Each card is a separate sign-in - their designs and folders are private to them. Open one to see (and organize) their folders.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
            {people.map(p => (
              <PersonCard key={p.ownerEmail} person={p} onOpen={() => setActivePerson(p.ownerEmail)} />
            ))}
          </div>
        </div>
      )}

      {status === 'ready' && viewMode === 'folders' && activePerson && !activeFolder && (
        <div style={{ padding: '32px 40px 40px' }}>
          {isOwnSpace && (
            <button
              type="button"
              onClick={handleCreateFolder}
              style={{ marginBottom: 24, padding: '10px 16px', fontSize: 13, fontWeight: 700, color: 'var(--dark)', background: '#fff', border: '1.5px solid var(--border)', borderRadius: 8, cursor: 'pointer' }}
            >
              + New folder
            </button>
          )}

          {activePersonData?.folderSet.size > 0 && (
            <div style={{ marginBottom: 36 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--dark)', margin: '0 0 16px' }}>Folders</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
                {[...activePersonData.folderSet].sort((a, b) => a.localeCompare(b)).map(f => (
                  <FolderCard
                    key={f}
                    name={f}
                    count={personDesigns.filter(p => p.folder === f).length}
                    onOpen={() => setActiveFolder(f)}
                  />
                ))}
              </div>
            </div>
          )}

          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--dark)', margin: '0 0 16px' }}>
              Unsorted <span style={{ fontWeight: 500, color: 'var(--mid)' }}>({unsortedDesigns.length})</span>
            </h2>
            {unsortedDesigns.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--mid)' }}>No designs outside a folder.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 24 }}>
                {unsortedDesigns.map(project => (
                  <DesignCard
                    key={project.id}
                    project={project}
                    loading={loadingId === project.id}
                    onOpen={handleRequestOpen}
                    onDelete={handleDelete}
                    onRename={handleRename}
                    canOrganize={!!activation?.key}
                    people={people}
                    onMove={handleMove}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {status === 'ready' && viewMode === 'folders' && activePerson && activeFolder && (
        <div style={{ padding: '32px 40px 40px' }}>
          {activeFolderDesigns.length === 0 ? (
            <EmptyState title="This folder is empty" desc="Move a design here from its card, or from the Unsorted list in this person's folder." />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 24 }}>
              {activeFolderDesigns.map(project => (
                <DesignCard
                  key={project.id}
                  project={project}
                  loading={loadingId === project.id}
                  onOpen={handleRequestOpen}
                  onDelete={handleDelete}
                  onRename={handleRename}
                  canOrganize={!!activation?.key}
                  people={people}
                  onMove={handleMove}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
