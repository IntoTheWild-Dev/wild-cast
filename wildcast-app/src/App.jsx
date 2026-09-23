import { useState, useRef, useEffect } from 'react'
import Header, { WORKFLOW_ROLES } from './components/Header'
import ActivationGate from './components/ActivationGate'
import HelpModal from './components/HelpModal'
import TemplatePicker, { BriefTemplatePicker, LayoutModal, entryForGuidedId } from './components/TemplatePicker'
import BriefingForm from './components/BriefingForm'
import PromptBriefChat from './components/PromptBriefChat'
import TemplatePreviewModal from './components/TemplatePreviewModal'
import LandingPage from './components/LandingPage'
import FieldEditor from './components/FieldEditor'
import TemplateCanvas from './components/TemplateCanvas'
import DesignsPage from './components/DesignsPage'
import MyTasksPage from './components/MyTasksPage'
import LibraryPage from './components/LibraryPage'
import ReviewPage from './components/ReviewPage'
import TemplateImportPage from './components/TemplateImportPage'
import { TEMPLATE_ZONES } from './data/templateZones'
import { TEMPLATES } from './data/templates'
import { blobUrlToDataUrl } from './lib/image'
import { uploadImageForZone, assetFolderForZone, merchantForUpload } from './lib/assetLibrary'
import { mergeCustomTemplates } from './lib/customTemplates'
import { resolvePartnerName, FORMATS, FORMAT_TEMPLATE_GROUP } from './lib/briefConstants'
import { fetchMerchantAssets, buildCandidateFields } from './lib/briefToCandidates'
import { sortIdsByFieldOrder } from './lib/fieldOrder'

const DEFAULT_FIELDS = {
  headline:        '',
  offer:           '',
  sub_headline:    '',
  restaurant_name: '',
  tc:              '',
  cta:             '',
  logoUrl:         null,
  photoUrl:        null,
  qrUrl:           null,
}

// Generate a medium-res preview image (2× canvas) for the review page
async function makePreview(fullPng) {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const w = 632, h = 882
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', 0.88))
    }
    img.src = fullPng
  })
}

// Resize the full-res canvas PNG to a small JPEG thumbnail for the Designs grid
async function makeThumbnail(fullPng) {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const w = 158, h = 221
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', 0.82))
    }
    img.src = fullPng
  })
}

// items: [{ url, label? }] - label is only shown when reviewing more than one
// design at once (e.g. ticking both candidates on the brief's picker screen).
function ReviewModal({ items, onClose }) {
  const [copiedIdx, setCopiedIdx] = useState(null)
  function copy(url, idx) {
    navigator.clipboard.writeText(url)
    setCopiedIdx(idx)
    setTimeout(() => setCopiedIdx(null), 2000)
  }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 32, maxWidth: 440, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--dark)', marginBottom: 6 }}>Ready to share</div>
        <div style={{ fontSize: 13, color: 'var(--mid)', marginBottom: 20, lineHeight: 1.5 }}>
          Send {items.length > 1 ? 'these links' : 'this link'} to your client or team. They can view the design and leave comments.
        </div>
        {items.map((item, i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            {item.label && <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--mid)', marginBottom: 4 }}>{item.label}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={item.url} readOnly
                style={{ flex: 1, padding: '10px 12px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 8, background: '#F9FAFB', color: 'var(--dark)', fontFamily: 'inherit' }}
                onClick={e => e.target.select()}
              />
              <button
                onClick={() => copy(item.url, i)}
                style={{ padding: '10px 16px', background: copiedIdx === i ? '#16a34a' : 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700, flexShrink: 0, transition: 'background 0.2s', minWidth: 70 }}
              >
                {copiedIdx === i ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>
        ))}
        <button
          onClick={onClose}
          style={{ width: '100%', padding: '10px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: 'var(--mid)', fontFamily: 'inherit', marginTop: 4 }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--dark)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
        >
          Done
        </button>
      </div>
    </div>
  )
}

// "Need more layouts?" popup - shown after Save/Export/Send for Review
// succeed, offering any OTHER format the partner checked in their brief
// that hasn't been made yet (Julia's ask, 2026-09-08). formats: brief
// FORMATS values (e.g. ['poster', 'wild_poster']), not display labels.
function MoreFormatsModal({ formats, onPick, onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 32, maxWidth: 420, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--dark)', marginBottom: 6 }}>Need more layouts?</div>
        <div style={{ fontSize: 13, color: 'var(--mid)', marginBottom: 20, lineHeight: 1.5 }}>
          Your brief also asked for {formats.length > 1 ? 'these formats' : 'this format'} — start it now with the same answers, or skip for later.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {formats.map(f => (
            <button
              key={f}
              onClick={() => onPick(f)}
              style={{ width: '100%', padding: '11px', fontSize: 14, fontWeight: 700, borderRadius: 10, border: 'none', cursor: 'pointer', background: 'var(--primary)', color: '#fff' }}
            >
              Yes, start {FORMATS.find(x => x.value === f)?.label ?? f}
            </button>
          ))}
        </div>
        <button
          onClick={onClose}
          style={{ width: '100%', padding: '10px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: 'var(--mid)', fontFamily: 'inherit' }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--dark)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
        >
          Not now
        </button>
      </div>
    </div>
  )
}

// Shown after a plain editor Save succeeds (Julia's ask, 2026-09-15) - lets
// someone immediately act on what they just did instead of the save only
// ever being a quiet 3-second corner badge. Skipped when the "Need more
// layouts?" modal above is about to show instead (see handleSave) so a
// single save never stacks two popups.
function SavedModal({ onContinue, onNewDesign, onExit }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 32, maxWidth: 380, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', textAlign: 'center' }}>
        <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--dark)', marginBottom: 6 }}>Saved</div>
        <div style={{ fontSize: 13, color: 'var(--mid)', marginBottom: 20, lineHeight: 1.5 }}>
          Your design is saved to Designs. What next?
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            onClick={onContinue}
            style={{ width: '100%', padding: '11px', fontSize: 14, fontWeight: 700, borderRadius: 10, border: 'none', cursor: 'pointer', background: 'var(--primary)', color: '#fff' }}
          >
            Continue editing
          </button>
          <button
            onClick={onNewDesign}
            style={{ width: '100%', padding: '11px', fontSize: 14, fontWeight: 700, borderRadius: 10, border: '1.5px solid var(--border)', cursor: 'pointer', background: '#fff', color: 'var(--dark)' }}
          >
            Create a new design
          </button>
          <button
            onClick={onExit}
            style={{ width: '100%', padding: '10px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--mid)', fontFamily: 'inherit' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--dark)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--mid)'}
          >
            Exit
          </button>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  // 'landing' (the new 3-button home screen, Julia's ask 2026-09-11) is the
  // real first thing anyone sees now - 'brief' (the actual picker+form flow)
  // only shows once "Start from scratch" is picked from there.
  const [screen, setScreen]                   = useState('landing')
  // Set synchronously (before the deep-link effect even runs) whenever the
  // URL is already /content/<id> on first paint, so that render shows a
  // loading placeholder instead of flashing the landing page for a frame
  // while that effect resolves the id into a project - see the effect and
  // the early return near the bottom of this component.
  const [resolvingDeepLink, setResolvingDeepLink] = useState(
    () => /^\/content\/[^/]+\/?$/.test(window.location.pathname)
  )
  // Which output ICC profile export-cmyk.js should convert to - see
  // ICC_PROFILES in api/export-cmyk.js. No longer user-choosable (FOGRA39
  // removed, Julia's ask, 2026-09-18) - every export uses FOGRA51 now.
  const iccProfile = 'fogra51'
  // Lifted out of BriefingForm so it survives a round trip to the editor and
  // back - Julia's ask (2026-08-03): saving a candidate mid-edit should
  // return to the "pick a design" screen (e.g. a merchant wants both A and
  // B), not lose it. BriefingForm no longer owns this - it's just the
  // submitted brief snapshot ({...brief} at Submit), or null before that.
  const [briefSubmission, setBriefSubmission] = useState(null)
  // The design's vertical ("Restaurant" / "Retail") - gates which knowledge
  // base examples AI Suggest may retrieve (strict vertical filtering). Set
  // from the brief's Business type when entering via the brief flow, or
  // restored from the saved project itself when re-opening from Designs
  // (older projects saved before this shipped have no vertical, and stay
  // null). Cleared on "New Brief" so a stale vertical can't leak into the
  // next design.
  const [designVertical, setDesignVertical] = useState(null)
  // Set right after a brief submit (template is already picked as Step 1 of
  // the brief now, per Julia's ask 2026-09-10) to open "Choose your mode"
  // directly, overlaid on the still-visible brief screen - skips the old
  // card-grid template-select screen entirely, since there's only ever one
  // template to choose a mode for at this point. Null when not showing.
  const [briefModeEntry, setBriefModeEntry] = useState(null)
  // Prompt Brief (Julia's ask, 2026-09-19): replaces the old brief form as the
  // landing page's third path. promptPickerOpen shows the template-picker
  // popup over whatever screen opened it; once a template is picked,
  // promptTemplateId drives the chat screen. promptChatKey remounts the chat
  // so a new/changed template always starts a fresh conversation.
  const [promptPickerOpen, setPromptPickerOpen] = useState(false)
  const [promptTemplateId, setPromptTemplateId] = useState(null)
  const [promptChatKey, setPromptChatKey] = useState(0)
  // Bumped by the "+ New Brief" nav item to force BriefingForm to remount
  // (resetting its own in-progress field values) even when it's already
  // mounted and showing the brief screen.
  const [briefResetKey, setBriefResetKey] = useState(0)
  // "Need more layouts?" prompt after Save/Export/Send for Review (Julia's
  // ask, 2026-09-08) - offers to jump straight to the template picker for
  // any OTHER format checked in the same brief, reusing briefSubmission
  // instead of re-filling the form. reachedViaBrief gates this off entirely
  // for templates opened straight from the Templates catalogue (no brief
  // context to offer more formats from). completedFormats tracks which
  // brief-format codes have been saved/exported/sent at least once this
  // brief session, so a format already done never gets re-offered.
  // formatPromptShown caps the popup to once per template-editing session
  // (reset whenever a new template is opened) so repeat Save clicks on the
  // same design don't nag every time.
  const [reachedViaBrief, setReachedViaBrief] = useState(false)
  const [completedFormats, setCompletedFormats] = useState(new Set())
  const [formatPromptShown, setFormatPromptShown] = useState(false)
  const [formatPromptOptions, setFormatPromptOptions] = useState([])
  // Post-save "Continue editing / Create a new design / Exit" popup (Julia's
  // ask, 2026-09-15) - only shown when offerMoreFormats() didn't just show
  // its own modal instead, see handleSave.
  const [showSavedModal, setShowSavedModal] = useState(false)
  // Set from the "want more layouts?" popup - scopes BriefTemplatePicker to
  // this ONE format instead of its default of matching whichever checked
  // format it finds first. Reset once you're back editing the brief itself.
  const [templateSelectFormat, setTemplateSelectFormat] = useState(null)
  // { [templateId]: savedProjectId } - recorded when "Save & pick another
  // design" saves a brief-generated candidate. Lets re-clicking Edit on the
  // same option reopen what was actually saved (nudge/scale + the project id
  // to update) instead of regenerating a fresh, un-edited candidate - Julia's
  // "the designs have reset after editing" report (2026-08-03). Cleared on
  // every fresh brief submission so a new brief never inherits a stale save.
  //
  // Both of these currently have no reader — the brief → template → mode →
  // editor workflow change (2026-09-08) stopped wiring TemplateCandidatePicker
  // into the primary flow (its own file is untouched, just not reachable from
  // BriefingForm anymore), so nothing currently renders picker cards that
  // would show this. Left in place, still kept up to date by
  // handleSaveAndReturnToPicker/handleNavigate below, since reconnecting the
  // picker later shouldn't require re-deriving this bookkeeping.
  // eslint-disable-next-line no-unused-vars
  const [savedCandidateIds, setSavedCandidateIds] = useState({})
  // { [templateId]: previewPngDataUrl } - the picker's card thumbnail is
  // captured off-screen from the brief's original (never-edited) fields, so
  // without this it silently shows the pre-edit design after a save. Set
  // alongside savedCandidateIds from the same just-saved project, cleared
  // together on a fresh brief submission.
  // eslint-disable-next-line no-unused-vars
  const [savedCandidatePreviews, setSavedCandidatePreviews] = useState({})
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  // Guided/Advanced toggle (Julia's editor redesign, 2026-09-18, per
  // Annika's mockup): replaces the old fixed-per-template guided-vs-designer
  // split with a live in-session toggle. Guided hides font-size/position
  // controls and locks the canvas (nudge-only); Advanced shows full manual
  // controls and unlocks free dragging - exactly today's non-designer vs
  // designer behavior, just now user-switchable instead of fixed by which
  // template id was picked. Safe to do this way because a template's
  // "-simple" (guided) and non-suffixed (designer) ids always point at the
  // IDENTICAL zone layout (see templateZones.js's own comments on this) -
  // toggling only ever changes controls visibility/lock state, never which
  // zones exist or where they sit. Resets to the template's own starting
  // mode every time a different template loads.
  const [advancedModeTemplateId, setAdvancedModeTemplateId] = useState(selectedTemplate?.id)
  const [advancedMode, setAdvancedMode] = useState(selectedTemplate?.mode === 'designer')
  // Adjusts state during render (not an effect) when the selected template
  // changes - same pattern FieldEditor.jsx's useOrderedKeys uses for the
  // same reason: resets in the same render instead of flashing the stale
  // mode for one frame first.
  if (advancedModeTemplateId !== selectedTemplate?.id) {
    setAdvancedModeTemplateId(selectedTemplate?.id)
    setAdvancedMode(selectedTemplate?.mode === 'designer')
  }
  // Which zone's field is currently focused/hovered in the side panel - lights
  // up that zone's boundary on the canvas (Annika's ask via Julia, 2026-09-18).
  // Lifted here since FieldEditor and TemplateCanvas are siblings.
  const [activeZoneId, setActiveZoneId]        = useState(null)
  const [fields, setFields]                   = useState(DEFAULT_FIELDS)
  const [lang]                                = useState('de') // DE/EN switcher removed (Julia's ask, 2026-09-18: never used) - fixed to German
  const [exporting, setExporting]             = useState(false)
  const [fontSizes, setFontSizes]             = useState({})
  // The REAL font size each auto-shrink zone actually rendered at on load -
  // captured once via handleCanvasReady, never mutated afterward for that
  // session. Needed because auto-shrink is applied directly to the Fabric
  // object and never written back into `fontSizes`, so without this,
  // `fontSizes[zoneId]` (and the restricted-mode clamp below) would be
  // anchored to the unshrunk static default instead of what's actually on
  // screen - a long headline could show "54pt" while really rendering at
  // 21pt, so clicking + once jumped straight to ~55pt instead of ~22pt.
  const [generatedFontSizes, setGeneratedFontSizes] = useState({})
  const [alignments, setAlignments]           = useState({})
  const [imageScales, setImageScales]         = useState({})
  const [imagePositions, setImagePositions]   = useState({})
  // Nudge offsets for specific text zones (headline/sub_headline) in the
  // restricted review mode - see handleTextNudge and TemplateCanvas.jsx.
  const [textPositions, setTextPositions]     = useState({})
  const [zonePositions, setZonePositions]     = useState({})
  const [projectName, setProjectName]         = useState('')
  const [currentProjectId, setCurrentProjectId] = useState(null)
  // Personal-folders feature (Julia's ask, 2026-09-15): who a project
  // belongs to and which of their subfolders it sits in. null/null for a
  // brand-new, never-saved project - doSave() then stamps the CURRENT
  // signed-in user as owner. Loaded from the project itself when opening an
  // existing one (openLoadedProject) so re-saving never silently reassigns
  // ownership or drops it out of its folder, even if someone else opens and
  // edits it in place (Designs has no privacy boundary, anyone can do this).
  const [projectOwner, setProjectOwner]       = useState(null) // { email, name } | null
  const [projectFolder, setProjectFolder]     = useState(null) // subfolder name string | null
  const [saving, setSaving]                   = useState(false)
  const [saveStatus, setSaveStatus]           = useState(null) // null | 'saved' - purely cosmetic, auto-clears after 3s (see handleSave etc.)
  // Separate from saveStatus, which is a 3-second flash badge and NOT a
  // reliable "is there anything to lose" signal - the nav-guard below was
  // using saveStatus for exactly that, so leaving the editor more than 3s
  // after a successful save still warned "leave without saving?" even
  // though nothing had changed since (Julia's report, 2026-09-10). This
  // flag only flips true on a real edit and false on a real save/fresh
  // load, with no timer.
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [loadKey, setLoadKey]                 = useState(0)    // increments on project load to reset auto-shrink
  // Gates Export PDF behind Send for Review (Julia's ask, 2026-09-18, per
  // Annika's mockup - "assuming there's an approval step"; confirmed: yes,
  // gate it). Session-local, not a persisted project field - resets
  // whenever a fresh editing session starts (loadKey increments on every
  // project load), so reopening a design later requires sending it for
  // review again rather than remembering it forever.
  const [reviewSentLoadKey, setReviewSentLoadKey] = useState(loadKey)
  const [reviewSent, setReviewSent] = useState(false)
  if (reviewSentLoadKey !== loadKey) {
    setReviewSentLoadKey(loadKey)
    setReviewSent(false)
  }
  // Persisted review status for "My Tasks" (Notion card "Review queue in the
  // user profile", 2026-09-22) - 'design' | 'review' | 'changes_requested' |
  // 'approved'. Distinct from reviewSent just above (a session-local
  // Export-PDF gate that resets every reopen): this is saved on the project
  // record itself (doSave()). handleSendForReview sets 'review' on every
  // send, first or resubmit; 'changes_requested'/'approved' are set by
  // handleRequestChangesInEditor/handleApproveInEditor here (Manager role)
  // or the matching buttons on ReviewPage.jsx (via api/save-project.js's
  // PATCH handler) - never by anything else on the creator's side.
  const [reviewStatus, setReviewStatus]       = useState('design')
  // everRequestedChanges (My Tasks' "second round" color-coding flag) is
  // deliberately NOT mirrored into component state here, after a first
  // attempt at exactly that (2026-09-24) turned out to just move the bug
  // rather than fix it: any ordinary save from a tab holding a stale local
  // copy could still silently revert a status change someone else made
  // via PATCH elsewhere. Root fix instead lives server-side, in this
  // file's doSave() (only ever sends reviewStatus for an explicit
  // transition, never a bare value that might be stale) and
  // api/save-project.js's POST handler (never trusts a client-sent
  // everRequestedChanges at all - handlePatch is its only writer). My
  // Tasks reads the field straight from the server, which is now always
  // authoritative for it.
  const [reviewItems, setReviewItems]         = useState(null) // share modal: [{ url, label? }] | null
  const [reviewProjectId, setReviewProjectId] = useState(null) // from ?review= param
  const [comments, setComments]               = useState([])
  // Approve/Request changes from inside the editor (2026-09-23, Manager
  // role only) - see handleApproveInEditor/handleRequestChangesInEditor.
  const [editorApproving, setEditorApproving]                 = useState(false)
  const [editorRequestingChanges, setEditorRequestingChanges] = useState(false)
  // Editor-side reply box state (Julia's ask, 2026-09-16: the Feedback
  // sidebar was read-only - designer could see reviewer comments but never
  // reply from inside the app).
  const [replyText, setReplyText]             = useState('')
  const [postingReply, setPostingReply]       = useState(false)
  // activation: null = not logged in, object = { key, clientName, credits, role }.
  // Seeded synchronously from localStorage (not just in the useEffect below) so
  // an already-logged-in user's refresh renders straight into the app instead
  // of flashing the ActivationGate for the second or so the /api/validate-key
  // round trip takes - the effect still runs after mount to re-validate the
  // key server-side and fill in clientName, but the optimistic value here is
  // what the very first paint uses.
  const [activation, setActivation]           = useState(() => {
    // Two parallel identities can be saved here - a shared activation key
    // (existing) or an individual account email (new, api/account-auth.js) -
    // wildcast_auth_type says which one to trust. Both produce the exact
    // same { key, clientName, credits, role } shape downstream, so nothing
    // else in the app needs to know or care which path logged someone in.
    const authType = localStorage.getItem('wildcast_auth_type') || 'key'
    const savedCredits = parseInt(localStorage.getItem('wildcast_credits'), 10)
    if (!Number.isFinite(savedCredits)) return null
    if (authType === 'account') {
      const savedEmail = localStorage.getItem('wildcast_account_email')
      if (!savedEmail || !localStorage.getItem('wildcast_account_token')) return null
      return { key: savedEmail, clientName: '', credits: savedCredits, role: localStorage.getItem('wildcast_role') || 'partner' }
    }
    const savedKey = localStorage.getItem('wildcast_activation_key')
    if (!savedKey) return null
    return { key: savedKey, clientName: '', credits: savedCredits, role: localStorage.getItem('wildcast_role') || 'partner' }
  })

  // Workflow role toggle (Julia's ask, 2026-09-22): Designer / Reviewer /
  // Manager - deliberately separate from activation.role (agency/designer/
  // partner above, which comes from the real activation key/account and
  // gates Import - stays untouched). This is a provisional, purely
  // client-side toggle so Julia can preview each role's view without
  // separate keys - names and what each role can/can't do are explicitly
  // expected to change. For now the only rule it drives: only Manager can
  // Export PDF (see handleExport below and FieldEditor's footer).
  // Validated against the current WORKFLOW_ROLES list (2026-09-24 fix) -
  // 'Reviewer' used to be a real, selectable, persisted option here until
  // it was removed from Header.jsx. Without this check, any browser that
  // had it stored kept that dead value forever: the <select> silently
  // showed no matching option and every workflowRole === 'Manager' gate
  // (Export PDF, the in-editor Approve/Request-changes panel) evaluated
  // false with nothing telling the user why they'd lost Manager access.
  const [workflowRole, setWorkflowRoleState] = useState(() => {
    const stored = localStorage.getItem('wildcast_workflow_role')
    return WORKFLOW_ROLES.includes(stored) ? stored : 'Manager'
  })
  function setWorkflowRole(role) {
    setWorkflowRoleState(role)
    localStorage.setItem('wildcast_workflow_role', role)
  }
  const [showHelp, setShowHelp]               = useState(false)
  const [showCreditsInfo, setShowCreditsInfo] = useState(false)
  const creditsInfoRef = useRef(null)

  useEffect(() => {
    if (!showCreditsInfo) return
    function handleOutsideClick(e) {
      if (creditsInfoRef.current && !creditsInfoRef.current.contains(e.target)) setShowCreditsInfo(false)
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [showCreditsInfo])
  // true only when the editor was entered via a brief-generated candidate -
  // gates the locked-down FieldEditor mode (Phase 2). Reset to false by every
  // other entry point so the lock never leaks into normal editing.
  const [restrictedReview, setRestrictedReview] = useState(false)
  // Figma-imported templates (draft + live), fetched once and merged with the
  // static TEMPLATE_ZONES/TEMPLATES - see src/lib/customTemplates.js
  const [customTemplates, setCustomTemplates] = useState({ zonesById: {}, cards: [], records: [] })
  // Mirrors hasUnsavedChanges below, but for TemplateImportPage's staged
  // zone-setting edits instead of the editor's fields - lets handleNavigate
  // warn before leaving the Import page with unsaved zone edits the same
  // way it already warns leaving the editor. Julia's ask, 2026-09-11.
  const [importDirty, setImportDirty] = useState(false)
  const exportRef = useRef(null)

  // ── Undo history ─────────────────────────────────────────────────────────────
  const historyRef         = useRef([])           // snapshots of { fields, fontSizes, alignments, imageScales }
  const [canUndo, setCanUndo] = useState(false)
  const lastTextSnapRef    = useRef({ key: null, time: 0 }) // debounce text-field snaps
  // Live refs so snapshot captures current values regardless of closure age
  const fieldsRef      = useRef(fields);      fieldsRef.current      = fields
  const fontSizesRef2  = useRef(fontSizes);   fontSizesRef2.current  = fontSizes
  const alignmentsRef2 = useRef(alignments);  alignmentsRef2.current = alignments
  const imageScalesRef2= useRef(imageScales); imageScalesRef2.current= imageScales
  const imagePositionsRef2 = useRef(imagePositions); imagePositionsRef2.current = imagePositions

  function pushUndoSnapshot(textKey = null) {
    const now = Date.now()
    if (textKey && textKey === lastTextSnapRef.current.key && now - lastTextSnapRef.current.time < 1000) return
    if (textKey) lastTextSnapRef.current = { key: textKey, time: now }
    historyRef.current = [
      ...historyRef.current.slice(-29),
      {
        fields: { ...fieldsRef.current },
        fontSizes: { ...fontSizesRef2.current },
        alignments: { ...alignmentsRef2.current },
        imageScales: { ...imageScalesRef2.current },
        imagePositions: { ...imagePositionsRef2.current },
        // Text-zone drag/resize positions live only on the canvas, not in React state -
        // read them live so a drag (see onZoneDragStart) is undoable too.
        zonePositions: exportRef.current?.getZonePositions?.() ?? {},
      },
    ]
    setCanUndo(true)
  }

  // Called on mousedown on a text zone, before any drag/resize moves it - captures
  // the pre-drag position as an undo point. Debounced per-zone like text fields so
  // repeated clicks on the same zone within a second don't spam the history.
  function handleZoneDragStart(zoneId) {
    pushUndoSnapshot(`zonedrag-${zoneId}`)
  }

  function handleUndo() {
    const snapshot = historyRef.current.pop()
    if (!snapshot) return
    setFields(snapshot.fields)
    setFontSizes(snapshot.fontSizes)
    setAlignments(snapshot.alignments)
    setImageScales(snapshot.imageScales)
    setImagePositions(snapshot.imagePositions ?? {})
    exportRef.current?.applyZonePositions?.(snapshot.zonePositions)
    setCanUndo(historyRef.current.length > 0)
  }

  // Cmd+Z / Ctrl+Z global shortcut
  useEffect(() => {
    function onKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        handleUndo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }) // no deps - always uses latest handleUndo via closure refresh

  // Warn before an actual browser refresh/close/tab-nav discards unsaved
  // work - the confirm() in handleNavigate below only catches in-app
  // navigation (Home/Designs buttons etc.), which can't intercept the
  // browser's own reload. Same dirty conditions as that guard. Browsers
  // ignore any custom message here and show their own fixed wording, so
  // there's no UI to design - just the standard preventDefault/returnValue
  // incantation that triggers it.
  useEffect(() => {
    const dirty = (screen === 'editor' && hasUnsavedChanges) || (screen === 'import' && importDirty)
    if (!dirty) return
    function onBeforeUnload(e) {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [screen, hasUnsavedChanges, importDirty])

  // Detect ?review=<id> in URL and switch to review screen
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const rid = params.get('review')
    if (rid) { setReviewProjectId(rid); setScreen('review') }
  }, [])

  // Detect /content/<id> in the URL (written by the sync effect below) and
  // reopen straight into that design - without this, refreshing or
  // reopening a tab mid-edit always landed back on the landing/home screen,
  // since 'screen' is plain useState with nothing tying it to the URL
  // (Julia's ask, 2026-09-18). sessionStorage is tried first since it
  // already holds the exact last-saved state for anything autosaved/saved
  // this session with no extra round trip; api/load-project.js's ?id= path
  // (a Blob list() lookup) is the fallback for a brand-new tab/session that
  // never wrote it. vercel.json rewrites this path to index.html so a
  // real, server-side refresh reaches this same app shell instead of 404ing.
  useEffect(() => {
    const contentMatch = window.location.pathname.match(/^\/content\/([^/]+)\/?$/)
    const editId = contentMatch?.[1]
    if (!editId) return
    ;(async () => {
      try {
        let project = null
        try {
          const cached = sessionStorage.getItem(`wildcast_project_${editId}`)
          if (cached) project = JSON.parse(cached)
        } catch { /* corrupted or unavailable - fall through to fetch */ }
        if (!project) {
          const res = await fetch(`/api/load-project?id=${editId}&_t=${Date.now()}`, { cache: 'no-store' })
          if (!res.ok) throw new Error('Design not found')
          project = await res.json()
        }
        // Custom (Figma-imported) templates load asynchronously on mount
        // too (see the refetchCustomTemplates() effect above) - can't just
        // read the customTemplates state here since this closure predates
        // whichever mount effect runs second, so this fetches its own copy
        // and hands it to openLoadedProject directly instead of racing it.
        const customTemplatesNow = await refetchCustomTemplates()
        await openLoadedProject(project, { customTemplatesOverride: customTemplatesNow ?? customTemplates })
      } catch (err) {
        console.error('Deep-link load error:', err)
        alert('Could not open that design - it may have been deleted.')
      } finally {
        setResolvingDeepLink(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keeps /content/<id> in the address bar in sync with what's actually
  // open, so a later refresh/reopen (the effect above) lands back here
  // instead of the home screen - and leaves it again once the editor is
  // left, so it doesn't linger on the landing/Designs screens. Only ever
  // touches the path when entering/leaving THIS specific path shape,
  // leaving ?review= or anything else on '/' completely untouched. Nothing
  // to sync for a brand-new, not-yet-saved project (no currentProjectId
  // yet) - it picks this up automatically the moment the first
  // autosave/save assigns one.
  useEffect(() => {
    if (screen === 'editor' && currentProjectId) {
      const targetPath = `/content/${currentProjectId}`
      if (window.location.pathname === targetPath) return
      window.history.replaceState(null, '', targetPath + window.location.search)
    } else if (/^\/content\/[^/]+\/?$/.test(window.location.pathname)) {
      window.history.replaceState(null, '', '/' + window.location.search)
    }
  }, [screen, currentProjectId])

  // Fetch Figma-imported templates once on mount. Failure just means the app
  // runs with the static built-in templates only - never blocks/breaks the app.
  useEffect(() => {
    refetchCustomTemplates()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Lock body scroll in editor mode so the canvas never scrolls with the page
  useEffect(() => {
    if (screen === 'editor') {
      window.scrollTo(0, 0)
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [screen])

  // On mount: restore activation from localStorage (so users don't need to
  // re-enter their key/password on refresh) - branches on wildcast_auth_type,
  // see the useState initializer above for why both paths exist.
  useEffect(() => {
    const authType = localStorage.getItem('wildcast_auth_type') || 'key'

    if (authType === 'account') {
      const savedEmail = localStorage.getItem('wildcast_account_email')
      const savedToken = localStorage.getItem('wildcast_account_token')
      if (!savedEmail || !savedToken) return
      fetch('/api/account-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: savedEmail, sessionToken: savedToken }),
      })
        .then(r => r.json())
        .then(data => {
          if (data.valid) {
            const savedCredits = parseInt(localStorage.getItem('wildcast_credits'), 10)
            const role = data.role || 'partner'
            localStorage.setItem('wildcast_role', role)
            setActivation({ key: data.email, clientName: data.displayName, credits: Number.isFinite(savedCredits) ? savedCredits : 100, role })
          } else {
            // Session token no longer matches (e.g. signed in elsewhere,
            // which overwrites the single stored token - see
            // account-auth.js) - the optimistic state seeded above was
            // wrong, drop back to the sign-in gate.
            localStorage.removeItem('wildcast_auth_type')
            localStorage.removeItem('wildcast_account_email')
            localStorage.removeItem('wildcast_account_token')
            localStorage.removeItem('wildcast_credits')
            localStorage.removeItem('wildcast_role')
            setActivation(null)
          }
        })
        .catch(() => {
          // Network error on restore - optimistic state already running on
          // cached credits (set synchronously in useState above), nothing to do.
        })
      return
    }

    const savedKey = localStorage.getItem('wildcast_activation_key')
    if (!savedKey) return
    fetch('/api/validate-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: savedKey }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.valid) {
          const savedCredits = parseInt(localStorage.getItem('wildcast_credits'), 10)
          const credits = Number.isFinite(savedCredits) ? savedCredits : data.total_credits
          const role = data.role || 'partner'
          localStorage.setItem('wildcast_role', role)
          setActivation({ key: savedKey, clientName: data.client_name, credits, role })
        } else {
          // Key was revoked/invalid server-side - the optimistic state seeded
          // from localStorage above was wrong, so undo it and drop back to
          // the activation gate.
          localStorage.removeItem('wildcast_activation_key')
          localStorage.removeItem('wildcast_credits')
          localStorage.removeItem('wildcast_role')
          setActivation(null)
        }
      })
      .catch(() => {
        // Network error on restore - the optimistic state from localStorage
        // (set synchronously in useState above) already has the app running
        // on cached credits, so there's nothing to do here.
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // key here is either a shared activation key OR an account email - both
  // ActivationGate.jsx paths already write the correct wildcast_* localStorage
  // keys themselves before calling this, this just mirrors that into state.
  function handleActivated({ key, clientName, credits, role }) {
    setActivation({ key, clientName, credits, role: role || 'partner' })
  }

  // Fetch comments whenever the open project changes, then poll so a reply
  // the reviewer posts on their own link shows up here without a manual
  // reload (Mark's ask, 2026-09-23: "refresh in real-time so you can see it
  // in the thread") - same fix as ReviewPage.jsx's own polling effect.
  useEffect(() => {
    if (!currentProjectId) { setComments([]); return }
    const load = () => fetch(`/api/comments?id=${currentProjectId}`)
      .then(r => r.json())
      .then(d => setComments(d.comments || []))
      .catch(() => {})
    load()
    const interval = setInterval(load, 5000)
    return () => clearInterval(interval)
  }, [currentProjectId])

  // Lets the signed-in designer reply right from the editor's Feedback
  // sidebar instead of that panel being read-only (Julia's ask, 2026-09-16:
  // "back and forth communication"). Posts as from:'designer' with whatever
  // name the current activation carries - no separate name field needed,
  // unlike the external reviewer's own form on ReviewPage.jsx.
  async function handlePostReply() {
    const text = replyText.trim()
    if (!text || !currentProjectId || postingReply) return
    setPostingReply(true)
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: currentProjectId, name: activation?.clientName || 'Wild Stack', text, from: 'designer' }),
      })
      if (!res.ok) throw new Error('Failed to post reply')
      setReplyText('')
      const data = await fetch(`/api/comments?id=${currentProjectId}`).then(r => r.json())
      setComments(data.comments || [])
    } catch (err) {
      alert('Could not send reply: ' + err.message)
    } finally {
      setPostingReply(false)
    }
  }

  // Optimistic - flips the checkbox immediately, same pattern used
  // throughout Designs (handleDelete etc.), then fires the real PATCH.
  function handleToggleResolved(commentId, resolved) {
    setComments(prev => prev.map(c => c.id === commentId ? { ...c, resolved } : c))
    fetch('/api/comments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: currentProjectId, commentId, resolved }),
    }).catch(() => {})
  }

  // Bug fix, 2026-09-24: Approve/Request changes both leave the editor
  // ~900ms after succeeding (see setTimeout below), and the debounced
  // autosave effect has `screen` in its dependency array - so that
  // navigation was cancelling any pending autosave in its cleanup before
  // it ever fired, silently discarding a field edit made moments earlier
  // with none of the "Leave without saving?" warning every other way of
  // leaving the editor gives. Since these actions only ever intend to
  // change the review status, not the design content, the fix is to save
  // that pending content ourselves before leaving, rather than either
  // losing it or blocking the status change on it.
  async function flushUnsavedEditBeforeLeaving() {
    if (!hasUnsavedChanges) return
    try {
      await doSave()
      setHasUnsavedChanges(false)
    } catch (err) {
      alert('Status updated, but your last edit could not be saved: ' + err.message)
    }
  }

  // Approve / Request changes, right from the editor's Feedback sidebar
  // (Julia's ask, 2026-09-23: a Manager shouldn't have to leave the editor
  // and hunt down the separate external review link just to approve their
  // own team's work - that link is for external partners without an
  // account). Same handlers/endpoint ReviewPage.jsx's own Approve/Request
  // changes use, just updating this editor's local reviewStatus instead of
  // ReviewPage's local `project` state. Gated to workflowRole === 'Manager'
  // in the JSX below - Designer/Reviewer roles don't get these buttons.
  async function handleApproveInEditor() {
    if (editorApproving || !currentProjectId || reviewStatus === 'approved') return
    setEditorApproving(true)
    setReviewStatus('approved')
    try {
      const res = await fetch('/api/save-project', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: currentProjectId, status: 'approved' }),
      })
      if (!res.ok) throw new Error('Failed to approve')
      await flushUnsavedEditBeforeLeaving()
      // Every status change lands on My Tasks (Julia, 2026-09-23: "auto
      // reload to My Tasks on all tiers") - same fix as handleSendForReview's
      // resubmit path, applied to this decision too, not just resending.
      setTimeout(() => setScreen('tasks'), 900)
    } catch (err) {
      setReviewStatus('review')
      alert('Could not approve: ' + err.message)
    } finally {
      setEditorApproving(false)
    }
  }

  async function handleRequestChangesInEditor() {
    const hasOpenFeedback = comments.some(c => !c.resolved)
    if (editorRequestingChanges || !currentProjectId || !hasOpenFeedback || reviewStatus === 'changes_requested') return
    setEditorRequestingChanges(true)
    setReviewStatus('changes_requested')
    try {
      const res = await fetch('/api/save-project', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: currentProjectId, status: 'changes_requested' }),
      })
      if (!res.ok) throw new Error('Failed to request changes')
      await flushUnsavedEditBeforeLeaving()
      setTimeout(() => setScreen('tasks'), 900)
    } catch (err) {
      setReviewStatus('review')
      alert('Could not request changes: ' + err.message)
    } finally {
      setEditorRequestingChanges(false)
    }
  }


  function handleSelectTemplate(template) {
    historyRef.current = []; setCanUndo(false)
    setRestrictedReview(false)
    setReachedViaBrief(false) // opened straight from Templates - no brief to offer more formats from
    setSelectedTemplate(template)
    setFields(DEFAULT_FIELDS)
    setFontSizes({})
    setGeneratedFontSizes({})
    setAlignments({})
    setImageScales({})
    setTextPositions({})
    setZonePositions({})
    setProjectName(template.name)
    setCurrentProjectId(null)
    setProjectOwner(null)
    setProjectFolder(null)
    setReviewStatus('design')
    setSaveStatus(null)
    setHasUnsavedChanges(false)
    setLoadKey(k => k + 1)
    setScreen('editor')
  }

  // Opens a Figma import (draft or live) straight in the real Designer-mode
  // editor, exactly as a partner/designer would see it - not a separate
  // preview renderer. Julia's ask, 2026-09-11: "Save zone settings" and
  // "Publish" were the only two actions on the Import review page, with no
  // way to actually click around a draft before deciding it's ready.
  // customTemplates.zonesById already carries every draft's real zone
  // geometry (mergeCustomTemplates includes drafts, not just live records -
  // see src/lib/customTemplates.js), so this is just handleSelectTemplate
  // with a record's slotKey as the id - the exact same lookup the real
  // catalogue uses for a published template, no separate code path.
  // Reset layout/exit both behave normally; nothing here is published or
  // saved back to the draft record just by opening/testing it.
  function handleTestDraft(record) {
    if (importDirty && !window.confirm("Leave without saving? Any zone setting changes you've made will be lost.")) return
    setImportDirty(false)
    handleSelectTemplate({ id: record.slotKey, mode: 'designer', name: record.label })
  }

  // Entry point for a candidate generated from the briefing form
  // (src/components/TemplateCandidatePicker.jsx) - mirrors handleSelectTemplate
  // above but pre-fills the editor with the brief's answers instead of resetting
  // to DEFAULT_FIELDS, and opens into the locked-down review mode (Phase 2).
  //
  // savedId: if this exact candidate was already saved once this brief session
  // (via "Save & pick another design" - see savedCandidateIds above), reopen
  // that saved state instead of regenerating a fresh, un-edited one. Falls
  // through to the fresh path if the sessionStorage cache is missing/corrupt.
  //
  // No current caller — see savedCandidateIds above for why this is kept
  // rather than deleted (2026-09-08 workflow change).
  // eslint-disable-next-line no-unused-vars
  async function handleSelectGeneratedCandidate(template, prefilledFields, savedId) {
    if (savedId) {
      try {
        const cached = sessionStorage.getItem(`wildcast_project_${savedId}`)
        if (cached) {
          await openLoadedProject(JSON.parse(cached), { restricted: true })
          return
        }
      } catch { /* corrupted cache - fall through to fresh generation */ }
    }

    historyRef.current = []; setCanUndo(false)
    setRestrictedReview(true)
    setSelectedTemplate(template)
    setFields({ ...DEFAULT_FIELDS, ...prefilledFields })
    setFontSizes({})
    setGeneratedFontSizes({})
    setAlignments({})
    setImageScales({})
    setTextPositions({})
    setZonePositions({})
    // Auto-tag the project name with merchant + offer from the brief
    // (Julia's ask, 2026-08-07) instead of the generic template name, so
    // she doesn't have to retype the merchant every time she edits a
    // brief-generated candidate. Falls back to the plain template name if
    // the brief left both blank.
    const nameTag = [prefilledFields?.restaurant_name, prefilledFields?.offer].filter(Boolean).join(' – ')
    setProjectName(nameTag ? `${nameTag} – ${template.name}` : template.name)
    setCurrentProjectId(null)
    setProjectOwner(null)
    setProjectFolder(null)
    setReviewStatus('design')
    setSaveStatus(null)
    setHasUnsavedChanges(false)
    setLoadKey(k => k + 1)
    setScreen('editor')
  }

  // Entry point for the new brief → template → mode → editor flow (Julia's
  // workflow change, 2026-09-08). Mirrors handleSelectTemplate, but pre-fills
  // what the brief actually collected — partner/restaurant name, plus the
  // merchant's logo auto-pulled from the Library — instead of resetting to
  // blank DEFAULT_FIELDS. Headline/subline/sticker/QR are left for the live
  // editor, same as buildCandidateFields already does when the brief never
  // collected them.
  //
  // Food photo deliberately NOT auto-pulled (Julia's ask, 2026-09-09) - it
  // always starts blank here, even when the Library has a real photo for
  // this merchant, so a partner explicitly picks the dish for THIS design
  // rather than silently inheriting whatever was uploaded last. Logo stays
  // auto-pulled since it's one fixed brand asset per merchant, not something
  // that varies per design the way a food photo does.
  // briefOverride: Prompt Brief hands over its own freshly-assembled brief -
  // setBriefSubmission hasn't flushed by the time this runs, so reading the
  // state here would still see the previous (or null) brief.
  async function handleSelectTemplateFromBrief(template, briefOverride) {
    const brief = briefOverride ?? briefSubmission
    const partnerName = resolvePartnerName(brief)
    const { logoUrl } = await fetchMerchantAssets(partnerName)
    // Prompt Brief carries its own uploaded images on the brief; the classic
    // brief never sets these, so it keeps the Library-logo-only behavior.
    const prefilledFields = buildCandidateFields(brief, { logoUrl: brief.logoUrl ?? logoUrl, photoUrl: brief.photoUrl ?? null })

    historyRef.current = []; setCanUndo(false)
    setRestrictedReview(false)
    setReachedViaBrief(true)
    setFormatPromptShown(false)
    setSelectedTemplate(template)
    setFields({ ...DEFAULT_FIELDS, ...prefilledFields })
    setFontSizes({})
    setGeneratedFontSizes({})
    setAlignments({})
    setImageScales({})
    setTextPositions({})
    setZonePositions({})
    // A name typed into the brief's own "Project name" field (Julia's ask,
    // 2026-09-15) wins outright over the auto-tag - it's an explicit label,
    // not something to second-guess by appending merchant/offer/template
    // name onto it too.
    const nameTag = [prefilledFields.restaurant_name, prefilledFields.offer].filter(Boolean).join(' – ')
    setProjectName(brief.projectName?.trim() || (nameTag ? `${nameTag} – ${template.name}` : template.name))
    setCurrentProjectId(null)
    setProjectOwner(null)
    setProjectFolder(null)
    setReviewStatus('design')
    setSaveStatus(null)
    setHasUnsavedChanges(false)
    setLoadKey(k => k + 1)
    setScreen('editor')
  }

  function handleBack() {
    setScreen('designs')
  }

  // Julia's ask (2026-08-07): the top nav (Templates/Library/Designs/etc.)
  // used to jump straight away from an open editor with no warning, silently
  // dropping any unsaved edits. Guard every nav target here - but not the
  // logo click (onLogoClick, wired separately in the JSX below), which is
  // meant to just resume whatever brief/picker was already in progress.
  function handleNavigate(target) {
    if (screen === 'editor' && hasUnsavedChanges && !window.confirm("Leave without saving? Any changes you've made to this design will be lost.")) return
    if (screen === 'import' && importDirty && !window.confirm("Leave without saving? Any zone setting changes you've made will be lost.")) return
    // Confirmed leaving (or wasn't dirty) - clear so a later return trip to
    // Import doesn't inherit a stale flag from before this component remounts.
    if (screen === 'import') setImportDirty(false)
    // The "Choose your mode" popup overlays the still-mounted 'brief' screen
    // (screen itself never changes while it's open) - dismiss it on any nav
    // away so it can't end up floating over whatever screen comes next.
    setBriefModeEntry(null)
    setPromptPickerOpen(false)
    if (target === 'prompt-brief') setPromptPickerOpen(true)
    else if (target === 'brief') setScreen('brief')
    else if (target === 'landing') setScreen('landing')
    // Distinct from plain 'brief' (the logo, which resumes whatever brief/
    // picker was already in progress) - this always starts a genuinely fresh
    // brief, per Julia's ask for "another offer form again." Clearing
    // briefSubmission alone isn't enough if BriefingForm is already mounted
    // (its own in-progress field values are local state that a prop change
    // won't reset), so briefResetKey forces a full remount too. Lands on
    // 'landing' (the 3-button home screen), not straight into the form -
    // Julia's ask, 2026-09-11: "New Brief" goes home now, not directly to
    // the brief form the way it used to.
    else if (target === 'new-brief') {
      setBriefSubmission(null)
      setDesignVertical(null)
      setSavedCandidateIds({})
      setCompletedFormats(new Set())
      setTemplateSelectFormat(null)
      setBriefResetKey(k => k + 1)
      setScreen('landing')
    }
    else if (target === 'catalogue') setScreen('catalogue')
    else if (target === 'designs') setScreen('designs')
    else if (target === 'tasks') setScreen('tasks')
    else if (target === 'library') setScreen('library')
    else if (target === 'import' && activation?.role === 'agency') setScreen('import')
  }

  // Returns the fetch's own promise (not just fire-and-forget) so a caller
  // that wants to know when a refetch actually finished - e.g. a manual
  // "Refresh" button's own loading state - can await it instead of guessing.
  function refetchCustomTemplates() {
    return fetch(`/api/list-templates?_t=${Date.now()}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        const merged = mergeCustomTemplates(data.templates ?? [])
        setCustomTemplates(merged)
        // Also returned directly (not just set as state) so a caller that
        // needs the fresh value in the SAME async flow - e.g. the ?edit=
        // deep-link effect below, which can't wait for a re-render to see
        // it via the customTemplates closure - doesn't have to guess
        // whether the setState above has actually flushed yet.
        return merged
      })
      .catch(() => null)
  }

  // Applies a publish-template.js response directly to local state instead of
  // waiting on a refetch - Vercel Blob's list() reads can lag up to ~30s behind
  // a write it was just given (see STATUS.md), so a refetch right after an
  // action can silently show the PRE-action status, making Publish/Archive
  // look like it needs several clicks when the first one already worked. The
  // action's own response is the one source that's already known-fresh.
  function patchCustomRecord(slotKey, patch) {
    setCustomTemplates(prev => {
      const exists = prev.records.some(r => r.slotKey === slotKey)
      // Archiving a hardcoded slot (Option A/B) for the first time creates a
      // brand-new override record server-side - nothing to patch locally yet.
      const records = exists
        ? prev.records.map(r => r.slotKey === slotKey ? { ...r, ...patch } : r)
        : [...prev.records, { slotKey, ...patch }]
      return mergeCustomTemplates(records)
    })
  }

  // Same immediate-local-update reasoning as patchCustomRecord above, but for
  // a real DELETE (api/delete-template.js) - the record needs to disappear
  // entirely, not get a field merged in, so this filters it out instead.
  function removeCustomRecord(slotKey) {
    setCustomTemplates(prev => mergeCustomTemplates(prev.records.filter(r => r.slotKey !== slotKey)))
  }

  function handleFontSizeChange(key, size) {
    pushUndoSnapshot()
    // Restricted review mode only allows a modest ±20% adjustment around the
    // size the zone actually rendered at on load (generatedFontSizes - see its
    // declaration above for why this can't just be zone.fontSize) - enough to
    // nudge-fit, not enough to grow large enough to wrap/overlap into a
    // neighboring zone. Normal Designer/Guided mode keeps the full 6-120 range.
    let min = 6, max = 120
    if (restrictedReview) {
      const zone = templateConfig?.zones?.find(z => z.id === key)
      const base = generatedFontSizes[key] ?? zone?.fontSize ?? size
      min = Math.max(6, Math.round(base * 0.8))
      max = Math.round(base * 1.2)
    }
    setFontSizes(prev => ({ ...prev, [key]: Math.max(min, Math.min(max, size)) }))
    setHasUnsavedChanges(true)
  }

  // Fires once the interactive editor's TemplateCanvas finishes mounting (its
  // own auto-shrink for this template's zones has already run by then - see
  // TemplateCanvas.jsx's onReady). Seeds `fontSizes` with what's REALLY
  // rendered, not the static per-zone default, so the panel's displayed pt
  // number and the +/- stepper's starting point are both accurate from the
  // first render - not just for restricted mode, this was equally wrong
  // (just less visible) in normal Guided mode.
  function handleCanvasReady() {
    const effective = exportRef.current?.getEffectiveFontSizes?.()
    if (!effective) return
    setGeneratedFontSizes(effective)
    setFontSizes(prev => ({ ...effective, ...prev }))
  }

  // Fires whenever TemplateCanvas's own auto-shrink kicks in while typing
  // (not just on mount) - keeps `fontSizes` truthful to what's actually
  // rendered so the panel's pt number, and the next +/- click, aren't based
  // on a stale pre-shrink value (Julia's report, 2026-09-08 - see
  // TemplateCanvas.jsx's fields-sync effect for the full story). Deliberately
  // no pushUndoSnapshot here - it's a side effect of the text edit that
  // already snapshotted itself in handleFieldChange, not a separate action.
  function handleAutoShrink(zoneId, size) {
    setFontSizes(prev => ({ ...prev, [zoneId]: size }))
  }

  function handleAlignChange(key, align) {
    pushUndoSnapshot()
    setAlignments(prev => ({ ...prev, [key]: align }))
    setHasUnsavedChanges(true)
  }

  function handleImageScaleChange(zoneId, pct) {
    pushUndoSnapshot()
    setImageScales(prev => ({ ...prev, [zoneId]: Math.max(20, Math.min(300, pct)) }))
    setHasUnsavedChanges(true)
  }

  // Nudges the photo within its zone (px, in canvas units). TemplateCanvas clamps
  // the applied value to whatever crop slack the current scale allows, so this can't
  // reveal background - over-nudging just has no further visible effect.
  function handleImageOffsetChange(zoneId, axis, delta) {
    pushUndoSnapshot()
    setImagePositions(prev => {
      const cur = prev[zoneId] ?? { x: 0, y: 0 }
      return { ...prev, [zoneId]: { ...cur, [axis]: cur[axis] + delta } }
    })
    setHasUnsavedChanges(true)
  }

  // Nudges a text zone within its box (px, in canvas units) - only meaningful
  // in the restricted review mode (see FieldEditor.jsx), where it's the only
  // way to reposition headline/sub_headline since Designer-mode canvas drag
  // is disallowed there. Clamped to a modest range so restricted-mode text
  // can't wander off-canvas with repeated clicks.
  function handleTextNudge(zoneId, axis, delta) {
    pushUndoSnapshot()
    setTextPositions(prev => {
      const cur = prev[zoneId] ?? { x: 0, y: 0 }
      const next = { ...cur, [axis]: Math.max(-40, Math.min(40, cur[axis] + delta)) }
      return { ...prev, [zoneId]: next }
    })
    setHasUnsavedChanges(true)
  }

  function handleResetZone(zoneId) {
    exportRef.current?.resetZone?.(zoneId)
    setImageScales(prev => {
      if (!(zoneId in prev)) return prev
      const next = { ...prev }; delete next[zoneId]; return next
    })
    setImagePositions(prev => {
      if (!(zoneId in prev)) return prev
      const next = { ...prev }; delete next[zoneId]; return next
    })
    setTextPositions(prev => {
      if (!(zoneId in prev)) return prev
      const next = { ...prev }; delete next[zoneId]; return next
    })
    setHasUnsavedChanges(true)
  }

  // "Reset layout" resets every zone's position on the canvas directly - but image
  // zones' Scale/Position are also driven by imageScales/imagePositions state, which
  // this must clear too. Otherwise the panel keeps showing the old %/offset, and the
  // next unrelated scale/position edit re-syncs the stale values back onto the canvas,
  // silently undoing the reset.
  function handleResetLayout() {
    exportRef.current?.resetLayout?.()
    setImageScales({})
    setImagePositions({})
    setTextPositions({})
    setHasUnsavedChanges(true)
  }

  // Guided mode locks the canvas - nothing can be dragged, so a position-only reset
  // has nothing to do. There "Reset" means starting the template over from blank:
  // clears every field/image plus all overrides, and remounts the canvas (loadKey)
  // for a guaranteed-clean slate, same as picking the template fresh.
  function handleResetToBlank() {
    if (!window.confirm('Clear all fields and start over? This cannot be undone.')) return
    historyRef.current = []; setCanUndo(false)
    setFields(DEFAULT_FIELDS)
    setFontSizes({})
    setGeneratedFontSizes({})
    setAlignments({})
    setImageScales({})
    setImagePositions({})
    setTextPositions({})
    setZonePositions({})
    setSaveStatus(null)
    setHasUnsavedChanges(true)
    setLoadKey(k => k + 1)
  }

  function handleFieldChange(key, value) {
    pushUndoSnapshot(key)
    // Wolt's Omnes Cond treatment (headline/sub_headline/offer/restaurant_name
    // today) is always uppercase on the real print artwork - briefToCandidates.js
    // already enforced this for brief-mapped text, but typing directly into a
    // live-editor field bypassed it (Julia's ask, 2026-09-09). Driven off the
    // zone's actual fontFamily rather than a hardcoded field-id list, so any
    // future Omnes Cond zone picks this up with no separate edit needed.
    const zone = templateConfig?.zones?.find(z => z.id === key)
    const nextValue = zone?.fontFamily === 'omnes-cond' && typeof value === 'string' ? value.toUpperCase() : value
    setFields(prev => ({ ...prev, [key]: nextValue }))
    setSaveStatus(null) // unsaved changes
    setHasUnsavedChanges(true)
  }

  // Drag-and-drop straight onto a photo/logo zone on the canvas itself
  // (Julia's ask, 2026-09-18) - mirrors exactly what FieldEditor.jsx's
  // ImageUpload does for the same zone on a click-upload (same
  // uploadImageForZone pipeline: transparent-PNG check, QR autocrop, saving
  // into the Library), just triggered from TemplateCanvas.jsx's own drop
  // handler instead. Left to throw on a validation failure (e.g. a
  // non-transparent logo) - TemplateCanvas.jsx catches it and shows its own
  // transient message near the drop point.
  async function handleCanvasImageDrop(zoneId, file) {
    const zone = templateConfig?.zones?.find(z => z.id === zoneId)
    if (!zone) return
    const { url } = await uploadImageForZone(file, {
      requireTransparent: zone.hint?.toLowerCase().includes('transparent'),
      autoCropContent: zoneId === 'qr',
      folder: assetFolderForZone(zoneId),
      merchant: merchantForUpload(fields, projectName, selectedTemplate?.name),
    })
    handleFieldChange(`${zoneId}Url`, url)
  }

  async function handleExport() {
    // Belt-and-suspenders alongside FieldEditor's own Export PDF button being
    // disabled/hidden for non-Managers - shouldn't normally be reachable, but
    // keeps this correct even if the button state is ever stale.
    if (workflowRole !== 'Manager') {
      alert('Only Managers can export.')
      return
    }
    if (!exportRef.current?.getPng) {
      alert('Canvas not ready - please wait a moment and try again.')
      return
    }
    setExporting(true)
    try {
      const png = exportRef.current.getPng()
      const filename = (projectName.trim() || selectedTemplate?.name || 'wildcast-flyer')

      const response = await fetch('/api/export-cmyk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ png, filename, profile: iccProfile }),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: response.statusText }))
        throw new Error(err.error || 'Export failed')
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${filename}.pdf`
      a.click()
      URL.revokeObjectURL(url)

      // PDF export is free - only AI feature usage costs credits now, see
      // handleAiCreditUsed (Julia's ask, 2026-09-15: replace the old
      // per-export credit system with an AI-usage-only one).
      offerMoreFormats()
    } catch (err) {
      console.error('Export error:', err)
      alert('Export failed: ' + err.message)
    } finally {
      setExporting(false)
    }
  }

  // AI credits - the only thing that costs a credit now (PDF export is
  // free, see handleExport). Each AI Suggest/Improve generation is a real
  // Claude API call we pay for. AISuggest.jsx gates the actual
  // confirmation/blocking.
  function handleAiCreditUsed() {
    if (!activation) return
    const newCredits = Math.max(0, activation.credits - 1)
    setActivation(prev => ({ ...prev, credits: newCredits }))
    localStorage.setItem('wildcast_credits', newCredits)
  }

  // Core save - returns the project id. Used by both handleSave and handleSendForReview.
  // nextReviewStatus: only passed by handleSendForReview (both its first-send
  // and resubmit paths), to bump the persisted status back to 'review' -
  // every other caller (Save, autosave, Save & pick another) omits it and
  // this simply re-saves whatever reviewStatus already is, unchanged.
  async function doSave({ nextReviewStatus } = {}) {
    if (!exportRef.current?.getPng) throw new Error('Canvas not ready - please wait a moment and try again.')

    const fullPng = exportRef.current.getPng()
    const [thumbnail, preview] = await Promise.all([makeThumbnail(fullPng), makePreview(fullPng)])

    const savedFields = { ...fields }
    // Every image field, not a fixed list - a sticker (or any other image
    // zone) uploaded from this tab is a blob: URL too, and would save dead.
    for (const key of Object.keys(savedFields)) {
      if (key.endsWith('Url') && typeof savedFields[key] === 'string' && savedFields[key].startsWith('blob:')) {
        savedFields[key] = await blobUrlToDataUrl(savedFields[key])
      }
    }

    const id = currentProjectId || crypto.randomUUID()
    const currentZonePositions = exportRef.current?.getZonePositions?.() ?? {}
    // Merge canvas's actual (post-auto-shrink) font sizes with any manual overrides so
    // re-opens restore the exact displayed size regardless of font-loading timing.
    const effectiveFontSizes = exportRef.current?.getEffectiveFontSizes?.() ?? {}
    const fontSizesToSave = { ...fontSizes, ...effectiveFontSizes }
    const name = projectName.trim() || selectedTemplate.name
    // Owner is whoever originally saved this project (preserved across
    // re-saves, even by someone else editing it in place - see
    // projectOwner's own comment); falls back to whoever's signed in now
    // only the first time a brand-new project is saved. Folder likewise
    // stays whatever it was last set to via Designs' "Move to folder" -
    // saving in the editor never touches it.
    const ownerEmail = projectOwner?.email ?? activation?.key ?? null
    const ownerName = projectOwner?.name ?? activation?.clientName ?? null
    const project = {
      id, templateId: selectedTemplate.id, templateName: selectedTemplate.name,
      projectName: name,
      fields: savedFields, fontSizes: fontSizesToSave, alignments, imageScales, imagePositions, zonePositions: currentZonePositions,
      mode: selectedTemplate.mode, savedAt: Date.now(), thumbnail, preview,
      ownerEmail, ownerName, folder: projectFolder,
      // Persisted so re-opening this design (from any device/account) keeps
      // AI Suggest strictly scoped to the brief's vertical.
      vertical: designVertical,
      // "My Tasks" status (Notion card "Review queue in the user profile",
      // 2026-09-22) - see reviewStatus's own declaration above for the full
      // state machine. Bug fix, 2026-09-24: only included when this save is
      // an explicit transition (nextReviewStatus passed - the first send or
      // a resubmit). An ordinary autosave/manual Save omits it entirely, so
      // it can never carry a stale local copy back to the server and
      // silently revert a status change someone else made via PATCH while
      // this tab sat open - api/save-project.js's POST handler preserves
      // whatever's already stored when this field is absent. everRequestedChanges
      // is deliberately never sent at all - see its own note above.
      ...(nextReviewStatus ? { reviewStatus: nextReviewStatus } : {}),
    }

    const response = await fetch('/api/save-project', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
    })
    if (!response.ok) throw new Error(await response.text())

    // Write the full project to sessionStorage so re-opens within this session
    // always get the exact saved state - no CDN or browser cache involved.
    try { sessionStorage.setItem(`wildcast_project_${id}`, JSON.stringify(project)) } catch { /* storage full */ }

    setCurrentProjectId(id)
    if (nextReviewStatus) setReviewStatus(nextReviewStatus)
    return { id, preview }
  }

  // "Need more layouts?" popup (Julia's ask, 2026-09-08) - called after
  // Save/Export/Send for Review all succeed. Only for templates reached via
  // the brief (reachedViaBrief), and capped to once per template-editing
  // session (formatPromptShown) so repeat Saves on the same design don't
  // nag every time. Marks the just-finished format as done first, then only
  // offers whatever's left of what was actually checked in the brief.
  // Returns true when it actually showed its modal, so callers (handleSave)
  // can skip showing a second, competing popup of their own on top of it.
  function offerMoreFormats() {
    if (!reachedViaBrief || !briefSubmission || formatPromptShown) return false
    const doneCode = Object.entries(FORMAT_TEMPLATE_GROUP).find(([, group]) => group === selectedTemplate?.format)?.[0]
    const newCompleted = new Set(completedFormats)
    if (doneCode) newCompleted.add(doneCode)
    setCompletedFormats(newCompleted)
    const remaining = (briefSubmission.formats || []).filter(f => !newCompleted.has(f))
    if (remaining.length > 0) {
      setFormatPromptOptions(remaining)
      setFormatPromptShown(true)
      return true
    }
    return false
  }

  function handlePickAnotherFormat(formatCode) {
    setFormatPromptOptions([])
    setTemplateSelectFormat(formatCode)
    setScreen('template-select')
  }

  async function handleSave() {
    setSaving(true)
    try {
      await doSave()
      setSaveStatus('saved')
      setHasUnsavedChanges(false)
      setTimeout(() => setSaveStatus(null), 3000)
      const showedMoreFormats = offerMoreFormats()
      if (!showedMoreFormats) setShowSavedModal(true)
    } catch (err) {
      console.error('Save error:', err)
      alert('Save failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // Silent background save, distinct from handleSave() above: no "Saved"
  // modal, no offerMoreFormats prompt - those are for an explicit "I'm
  // done" click, not a routine autosave the user didn't ask for. Reuses
  // saving/saveStatus so the Save button's own "Saving…" / "✓ Saved" text
  // still reflects it, which is the only feedback autosave gets. A failure
  // (e.g. offline) is left dirty and silently retried on the next edit -
  // the beforeunload guard above is still the backstop if it keeps failing.
  async function autoSave() {
    setSaving(true)
    try {
      await doSave()
      setSaveStatus('saved')
      setHasUnsavedChanges(false)
      setTimeout(() => setSaveStatus(null), 3000)
    } catch (err) {
      console.error('Autosave error:', err)
    } finally {
      setSaving(false)
    }
  }

  // Debounced autosave: (re)starts a 2.5s timer on every relevant edit
  // (mirrors exactly what doSave() persists) and fires once things go
  // quiet, rather than on every keystroke. Gated on hasUnsavedChanges so a
  // freshly loaded/already-saved project never triggers a redundant save,
  // and on !saving so a manual Save in flight isn't raced by this timer
  // landing at the same time.
  useEffect(() => {
    if (screen !== 'editor' || !hasUnsavedChanges || saving) return
    const t = setTimeout(() => { autoSave() }, 2500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields, fontSizes, alignments, imageScales, imagePositions, projectName, screen, hasUnsavedChanges, saving])

  // Save from the restricted review editor (a brief-generated candidate) -
  // Julia's ask (2026-08-03): persists via the same doSave()/Designs
  // mechanism as any other save (so an interrupted session isn't lost - it's
  // findable/reopenable/editable from Designs like anything else), but then
  // returns to the "pick a design" screen instead of staying in the editor,
  // since a merchant may want both Option A and B handled, not just one.
  // briefSubmission (App-level, unlike BriefingForm's old local state) is
  // never touched here, so BriefingForm shows the exact same two candidates
  // again rather than a blank form.
  async function handleSaveAndReturnToPicker() {
    setSaving(true)
    try {
      const { id, preview } = await doSave()
      // Record which project this candidate saved to, so re-clicking Edit on
      // the same option in the picker reopens this saved state instead of a
      // fresh, un-edited one (see savedCandidateIds above).
      setSavedCandidateIds(prev => ({ ...prev, [selectedTemplate.id]: id }))
      // ...and record the freshly-edited preview PNG so the picker's card
      // thumbnail for this option updates too, instead of still showing the
      // pre-edit design captured from the original brief fields.
      setSavedCandidatePreviews(prev => ({ ...prev, [selectedTemplate.id]: preview }))
      setSaveStatus('saved')
      setHasUnsavedChanges(false)
      setTimeout(() => setSaveStatus(null), 3000)
      setScreen('brief')
    } catch (err) {
      console.error('Save error:', err)
      alert('Save failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // Confirmed before doing anything (checklist i7, 2026-09-08): this skips
  // straight to a shareable link instead of exporting/continuing to edit
  // here, and used to be explained only in small gray footer text - easy to
  // click without realizing it's the one-way option.
  //
  // Also doubles as the resubmit action (2026-09-23, Julia: "why is Resolve
  // and resubmit still there? I don't think we need it hey" - this button
  // already re-sends for review every time it's clicked, a second button
  // doing the same thing was redundant). Branches only on whether anything's
  // been sent before (reviewStatus still 'design' means never): first time
  // keeps the exact same confirm-then-show-the-link behavior; any later
  // click resolves the open feedback first (what the old Resolve and
  // resubmit did) and leaves for My Tasks instead of reopening a popup for
  // a link that hasn't changed - no confirm dialog either, since resending
  // isn't a new decision the way the very first send is.
  async function handleSendForReview() {
    const isResubmit = reviewStatus !== 'design'
    // Wording updated for the Export-behind-review gate (Julia's editor
    // redesign, 2026-09-18) - this used to be framed as an alternative to
    // exporting ("skips exporting... first"), which is now backwards: this
    // IS what unlocks Export PDF, not something instead of it.
    if (!isResubmit && !window.confirm('Send this design for review? This creates a shareable review link and unlocks PDF export.')) return
    // Bug fix, 2026-09-24: isResubmit alone treated an already-approved
    // design the same as a plain in-progress resubmit, so clicking this
    // button again silently reverted an approval back to 'review' with no
    // warning at all. A normal resubmit (from 'review'/'changes_requested')
    // stays confirmation-free on purpose - only the "this undoes an
    // approval" case needs its own explicit heads-up.
    if (isResubmit && reviewStatus === 'approved' && !window.confirm('This design has already been approved. Sending it again will undo the approval and put it back under review. Continue?')) return
    setSaving(true)
    try {
      if (isResubmit) {
        const unresolved = comments.filter(c => !c.resolved)
        if (unresolved.length > 0) {
          await Promise.all(unresolved.map(c => fetch('/api/comments', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId: currentProjectId, commentId: c.id, resolved: true }),
          })))
          setComments(prev => prev.map(c => ({ ...c, resolved: true })))
        }
      }
      const { id } = await doSave({ nextReviewStatus: 'review' })
      setSaveStatus('saved')
      setHasUnsavedChanges(false)
      setTimeout(() => setSaveStatus(null), 3000)
      // Unlocks Export PDF for this session either way - reviewSent resets
      // on every reopen by design (see its own declaration), so a resubmit
      // needs to set it too, same as the old Resolve and resubmit did.
      // Missed on the first pass of merging these two functions together.
      setReviewSent(true)
      if (isResubmit) {
        // Same "don't get stuck on the canvas" fix as the old Resolve and
        // resubmit had, and the same My Tasks destination (not Designs) -
        // see its own note on the status board being what both the
        // designer and the manager need to see right after this.
        setTimeout(() => setScreen('tasks'), 900)
      } else {
        setReviewItems([{ url: `${window.location.origin}/?review=${id}` }])
        offerMoreFormats()
      }
    } catch (err) {
      console.error('Send for Review error:', err)
      alert('Send for Review failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // Saves + generates a review link directly from a brief-generated candidate,
  // WITHOUT ever opening the interactive editor - Julia's confirmed choice for
  // "Send for Review" on the picker screen (2026-08-03). Deliberately doesn't
  // reuse doSave(): that function depends on exportRef/fields/etc. being the
  // CURRENTLY OPEN editor's live state, which doesn't exist here. Takes the
  // already-captured PNG from TemplateCandidatePicker's off-screen render
  // instead of calling exportRef.current.getPng().
  //
  // opts.name / opts.vertical (2026-09-19): Prompt Brief supplies its own project
  // name and business type; the old candidate flow passes neither and keeps
  // its template-name / briefSubmission fallbacks.
  async function saveCandidateForReview(template, prefilledFields, fullPng, opts = {}) {
    const [thumbnail, preview] = await Promise.all([makeThumbnail(fullPng), makePreview(fullPng)])
    const id = crypto.randomUUID()
    const project = {
      id, templateId: template.id, templateName: template.name,
      projectName: opts.name ?? template.name,
      fields: prefilledFields, fontSizes: {}, alignments: {}, imageScales: {}, imagePositions: {}, zonePositions: {},
      mode: template.mode, savedAt: Date.now(), thumbnail, preview,
      ownerEmail: activation?.key ?? null, ownerName: activation?.clientName ?? null, folder: null,
      // Candidate saves only happen via the brief flow, so the brief's
      // business type is the design's vertical.
      vertical: opts.vertical ?? briefSubmission?.businessType ?? null,
    }
    const response = await fetch('/api/save-project', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
    })
    if (!response.ok) throw new Error(await response.text())
    try { sessionStorage.setItem(`wildcast_project_${id}`, JSON.stringify(project)) } catch { /* storage full */ }
    return id
  }

  // Prompt Brief's "Send for review" (2026-09-19): saves the finished design to
  // the Design library and returns its shareable review link, without ever
  // opening the editor. Uploaded images are blob: URLs, which die with the tab
  // - converted to data URLs first, exactly as doSave() does for the editor.
  // Returns { url } or throws (the popup shows the message and offers a retry).
  async function handleSendPromptBriefForReview({ brief, fields: briefFields, png }) {
    const template = TEMPLATES.find(t => t.id === promptTemplateId) ?? customTemplates.cards.find(t => t.id === promptTemplateId)
    if (!template) throw new Error('Template not found.')
    if (!png) throw new Error('The preview is not ready yet.')
    const savedFields = { ...DEFAULT_FIELDS, ...briefFields }
    for (const key of Object.keys(savedFields)) {
      if (key.endsWith('Url') && typeof savedFields[key] === 'string' && savedFields[key].startsWith('blob:')) {
        savedFields[key] = await blobUrlToDataUrl(savedFields[key])
      }
    }
    // Same naming rule as the Edit design hand-off (handleSelectTemplateFromBrief).
    const nameTag = [savedFields.restaurant_name, savedFields.offer].filter(Boolean).join(' – ')
    const name = brief.projectName?.trim() || (nameTag ? `${nameTag} – ${template.name}` : template.name)
    const id = await saveCandidateForReview(template, savedFields, png, { name, vertical: brief.businessType || null })
    return { url: `${window.location.origin}/?review=${id}` }
  }

  // items: [{ template, fields, png, label }] - one entry per ticked candidate.
  // Ticking both Option A and B produces two independent saved designs and two
  // review links, shown together in the same ReviewModal.
  //
  // No current caller — see savedCandidateIds above for why this is kept
  // rather than deleted (2026-09-08 workflow change).
  // eslint-disable-next-line no-unused-vars
  async function handleSendCandidatesForReview(items) {
    setSaving(true)
    try {
      const ids = await Promise.all(items.map(it => saveCandidateForReview(it.template, it.fields, it.png)))
      setReviewItems(ids.map((id, i) => ({
        url: `${window.location.origin}/?review=${id}`,
        label: items.length > 1 ? items[i].label : undefined,
      })))
    } catch (err) {
      console.error('Send candidates for review error:', err)
      alert('Send for Review failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // Fetches a project's full saved state - sessionStorage first (written on
  // every save, always reflects the exact last-saved state with no CDN or
  // browser cache involved), falling back to a fresh server fetch.
  async function loadFullProject(projectMeta) {
    try {
      const cached = sessionStorage.getItem(`wildcast_project_${projectMeta.id}`)
      if (cached) return JSON.parse(cached)
    } catch { /* corrupted or unavailable - fall through to fetch */ }

    const response = await fetch(`/api/load-project?url=${encodeURIComponent(projectMeta.url)}&_t=${Date.now()}`, { cache: 'no-store' })
    if (!response.ok) throw new Error('Could not load project')
    return response.json()
  }

  // Puts an already-loaded project's full state into the editor. Shared by
  // opening the original and opening a freshly-made duplicate - the only
  // difference between the two is which project object got loaded/created
  // before this runs. customTemplatesOverride lets the ?edit= deep-link
  // effect below pass its own just-fetched value in - it can't rely on the
  // customTemplates *state* being fresh yet, since it may run before that
  // separate on-mount fetch's setState has flowed through to a re-render.
  async function openLoadedProject(project, { restricted = false, customTemplatesOverride } = {}) {
    const templatesSource = customTemplatesOverride ?? customTemplates
    const template = TEMPLATES.find(t => t.id === project.templateId)
      ?? templatesSource.cards.find(t => t.id === project.templateId)
    if (!template) throw new Error(`Template "${project.templateId}" not found`)

    // Fetch comments directly - can't rely on the useEffect because the
    // project id may not have changed (same project re-opened from Designs)
    let freshComments = []
    try {
      const commRes = await fetch(`/api/comments?id=${project.id}`)
      const commData = await commRes.json()
      freshComments = commData.comments || []
    } catch {}

    historyRef.current = []; setCanUndo(false)
    setRestrictedReview(restricted)
    setSelectedTemplate(template)
    setFields({ ...DEFAULT_FIELDS, ...(project.fields ?? {}) })
    setFontSizes(project.fontSizes ?? {})
    setAlignments(project.alignments ?? {})
    setImageScales(project.imageScales ?? {})
    setImagePositions(project.imagePositions ?? {})
    setZonePositions(project.zonePositions ?? {})
    setProjectName(project.projectName || template.name)
    setCurrentProjectId(project.id)
    setProjectOwner(project.ownerEmail ? { email: project.ownerEmail, name: project.ownerName } : null)
    setProjectFolder(project.folder ?? null)
    // Absent on any design saved before this shipped, same fallback pattern
    // as folder/owner above.
    setReviewStatus(project.reviewStatus ?? 'design')
    // Restore the design's vertical from the saved project (null on projects
    // saved before verticals shipped) so AI Suggest re-scopes to it.
    setDesignVertical(project.vertical ?? null)
    setComments(freshComments)
    setSaveStatus(null)
    setHasUnsavedChanges(false)
    setLoadKey(k => k + 1)
    setScreen('editor')
  }

  async function handleOpenProject(projectMeta) {
    const project = await loadFullProject(projectMeta)
    await openLoadedProject(project)
  }

  // Designs are shared across every activation key now - anyone can open
  // anyone else's. Duplicating first (rather than editing in place) is the
  // safety net: it saves a brand-new, independent copy under a fresh id
  // *before* opening it, so continuing to edit can never overwrite someone
  // else's original.
  async function handleDuplicateProject(projectMeta) {
    const original = await loadFullProject(projectMeta)
    const id = crypto.randomUUID()
    const duplicate = {
      ...original,
      id,
      projectName: `${original.projectName || original.templateName} (copy)`,
      savedAt: Date.now(),
      // A duplicate is a fresh personal copy for whoever's duplicating it,
      // not a continuation of the original's owner/folder - lands unsorted
      // in the current user's own space regardless of who made the original.
      ownerEmail: activation?.key ?? null,
      ownerName: activation?.clientName ?? null,
      folder: null,
      // A duplicate is also a fresh, never-submitted design, not a
      // continuation of the original's review history (Julia, 2026-09-24:
      // "when duplicate and edit is chosen it should be handled as a new
      // design"). Without this, `...original` above carried over e.g.
      // reviewStatus:'review', so handleSendForReview saw the copy as
      // already-sent and treated the very first click as a resubmit - no
      // confirm dialog, no share-link popup, straight to My Tasks. Comments
      // don't need a matching reset: they're keyed by this new `id`, which
      // has no comment thread of its own yet. everRequestedChanges needs no
      // explicit reset here either (unlike this comment's earlier version) -
      // the server never trusts a client-sent value for it at all now, and
      // this brand-new id has no existing blob to inherit one from anyway.
      reviewStatus: 'design',
    }

    const response = await fetch('/api/save-project', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(duplicate),
    })
    if (!response.ok) throw new Error('Could not save the duplicate')

    try { sessionStorage.setItem(`wildcast_project_${id}`, JSON.stringify(duplicate)) } catch { /* storage full */ }

    await openLoadedProject(duplicate)
  }

  const promptEntry = entryForGuidedId(promptTemplateId, customTemplates.cards, customTemplates.records)
  const templateConfig = TEMPLATE_ZONES[selectedTemplate?.id] ?? customTemplates.zonesById[selectedTemplate?.id] ?? null
  // Restricted review keeps its own fixed lock behavior regardless of the
  // Guided/Advanced toggle (that flow has no "Advanced" concept - nothing
  // meaningful to unlock on an already-generated candidate).
  const effectiveMode = restrictedReview ? (selectedTemplate?.mode ?? 'designer') : (advancedMode ? 'designer' : 'non-designer')
  // "X of Y ready" progress bar (Julia's editor redesign, 2026-09-18, per
  // Annika's mockup) - mirrors FieldEditor.jsx's own fieldOrder/isFieldReady
  // logic (same shared lib/fieldOrder.js order) since the bar renders up
  // here in the breadcrumb stack, not inside that side panel.
  const progressFieldOrder = templateConfig ? sortIdsByFieldOrder([
    ...['headline', 'sub_headline', 'restaurant_name', 'offer', 'tc', 'cta']
      .filter(k => k === 'headline' || templateConfig.zones?.some(z => z.id === k)),
    ...(templateConfig.zones?.filter(z => z.type === 'image').map(z => z.id) ?? []),
  ]) : []
  const progressReadyCount = progressFieldOrder.filter(key => {
    const isImage = templateConfig?.zones?.find(z => z.id === key)?.type === 'image'
    return isImage ? !!fields[`${key}Url`] : !!(fields[key] || '').trim()
  }).length

  // Show activation gate unless already activated or this is a shared review link
  if (!activation && !reviewProjectId) {
    return <ActivationGate onActivated={handleActivated} />
  }

  // Placeholder while the ?edit=<id> deep-link effect above resolves -
  // otherwise this frame would render the plain landing screen (screen's
  // initial value) for a moment before flipping to 'editor', which looks
  // like a refresh briefly bounced home before "recovering".
  if (resolvingDeepLink) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 13, color: 'var(--mid)' }}>Loading your design…</div>
      </div>
    )
  }

  return (
    <div style={screen === 'editor' || screen === 'import'
      // Bounded viewport height + overflow:hidden here is what lets a
      // screen have its OWN internal scroll region(s) instead of the whole
      // page/body scrolling - 'editor' already needed this for its
      // canvas+panels layout; 'import' needs the same thing for the same
      // reason (a sticky preview column that needs a real bounded scroll
      // container to stick within - see TemplateImportPage.jsx's own root
      // div for the other half of this fix, found live 2026-09-11: without
      // both halves, content tall enough overflowed to the BODY instead of
      // the intended inner div, and position:sticky doesn't work relative
      // to a scroll that never actually happens on its real container).
      ? { height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }
      : { minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header
        // Used to resume whatever brief/picker was in progress - now just
        // goes to the new landing home screen instead, same destination as
        // "+ New Brief" (Julia's ask, 2026-09-11: logo should go home like
        // New Brief does). Doesn't reset any in-progress brief state the way
        // New Brief does - just navigates, since clicking the logo isn't an
        // explicit "start over" the way New Brief is.
        onLogoClick={() => { setBriefModeEntry(null); setScreen('landing') }}
        screen={screen}
        onNavigate={handleNavigate}
        activation={activation}
        onHelp={() => setShowHelp(true)}
        workflowRole={workflowRole}
        onWorkflowRoleChange={setWorkflowRole}
      />

      {screen === 'landing' && (
        <LandingPage onNavigate={handleNavigate} />
      )}

      {screen === 'prompt-brief' && promptEntry && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <PromptBriefChat
            key={promptChatKey}
            entry={promptEntry}
            config={TEMPLATE_ZONES[promptTemplateId] ?? customTemplates.zonesById[promptTemplateId] ?? null}
            onBack={() => setScreen('landing')}
            onChangeTemplate={() => setPromptPickerOpen(true)}
            onSendForReview={handleSendPromptBriefForReview}
            onOpenLibrary={() => handleNavigate('designs')}
            onNewBrief={() => handleNavigate('new-brief')}
            onEdit={brief => {
              // Same bookkeeping BriefingForm's onSubmitted does, then straight
              // into the editor (the chat already picked the template + mode).
              setBriefSubmission(brief)
              setDesignVertical(brief.businessType || null)
              setCompletedFormats(new Set())
              setTemplateSelectFormat(null)
              setSavedCandidateIds({})
              const template = TEMPLATES.find(t => t.id === promptTemplateId) ?? customTemplates.cards.find(t => t.id === promptTemplateId)
              if (template) handleSelectTemplateFromBrief(template, brief)
            }}
          />
        </div>
      )}

      {promptPickerOpen && (
        <TemplatePreviewModal
          selectedId={promptTemplateId}
          customCards={customTemplates.cards}
          customRecords={customTemplates.records}
          onClose={() => setPromptPickerOpen(false)}
          onPick={id => {
            // Re-picking the same template keeps the chat going; a different
            // one restarts it, since the questions come from the template's zones.
            if (id !== promptTemplateId || screen !== 'prompt-brief') {
              setPromptTemplateId(id)
              setPromptChatKey(k => k + 1)
            }
            setPromptPickerOpen(false)
            setScreen('prompt-brief')
          }}
        />
      )}

      {screen === 'brief' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <BriefingForm
            key={briefResetKey}
            submitted={briefSubmission}
            customCards={customTemplates.cards}
            customRecords={customTemplates.records}
            onBack={() => setScreen('landing')}
            onSubmitted={brief => {
              setBriefSubmission(brief)
              setDesignVertical(brief.businessType || null)
              setCompletedFormats(new Set())
              setTemplateSelectFormat(null)
              // Template is already picked (Step 1 of the brief, per Julia's
              // ask 2026-09-10) - open "Choose your mode" directly instead of
              // routing to the old card-grid template-select screen.
              const entry = entryForGuidedId(brief.preSelectedTemplateIds?.[0], customTemplates.cards, customTemplates.records)
              if (entry) setBriefModeEntry(entry)
              // Shouldn't happen - BriefingForm now requires a pick before it
              // submits - but fall back rather than a dead end if the picked
              // id somehow doesn't resolve to a real entry.
              else setScreen('template-select')
            }}
          />
        </div>
      )}

      {briefModeEntry && (
        <LayoutModal
          entry={briefModeEntry}
          onPick={templateId => {
            const template = TEMPLATES.find(t => t.id === templateId) ?? customTemplates.cards.find(t => t.id === templateId)
            setBriefModeEntry(null)
            if (template) handleSelectTemplateFromBrief(template)
          }}
          onClose={() => setBriefModeEntry(null)}
        />
      )}

      {screen === 'template-select' && briefSubmission && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <BriefTemplatePicker
            brief={briefSubmission}
            formatOverride={templateSelectFormat}
            onSelect={handleSelectTemplateFromBrief}
            onBack={() => { setTemplateSelectFormat(null); setScreen('brief') }}
            customCards={customTemplates.cards}
            customRecords={customTemplates.records}
            canManage={activation?.role === 'designer' || activation?.role === 'agency'}
            onOptimisticPatch={patchCustomRecord}
            onRecordDeleted={removeCustomRecord}
          />
        </div>
      )}

      {screen === 'catalogue' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <TemplatePicker
            mode="catalogue"
            onSelect={handleSelectTemplate}
            customCards={customTemplates.cards}
            customRecords={customTemplates.records}
            canManage={activation?.role === 'designer' || activation?.role === 'agency'}
            onOptimisticPatch={patchCustomRecord}
            onRecordDeleted={removeCustomRecord}
            onBack={() => setScreen('landing')}
          />
        </div>
      )}

      {screen === 'designs' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <DesignsPage onOpenProject={handleOpenProject} onDuplicateProject={handleDuplicateProject} customCards={customTemplates.cards} activation={activation} onBack={() => setScreen('landing')} />
        </div>
      )}

      {screen === 'library' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <LibraryPage onBack={() => setScreen('landing')} />
        </div>
      )}

      {screen === 'tasks' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <MyTasksPage onOpenProject={handleOpenProject} activation={activation} onBack={() => setScreen('landing')} />
        </div>
      )}

      {screen === 'import' && activation?.role === 'agency' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', height: 'calc(100vh - 58px)' }}>
          <TemplateImportPage
            customRecords={customTemplates.records}
            onRefetch={refetchCustomTemplates}
            onOptimisticPatch={patchCustomRecord}
            onTestDraft={handleTestDraft}
            onDirtyChange={setImportDirty}
          />
        </div>
      )}

      {screen === 'review' && reviewProjectId && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* Prefills the "Your name" field for a signed-in visitor (Notion
              card "Partner review link", 2026-09-22) - a review link is
              reachable without any activation at all (see the gate above),
              so activation may genuinely be null here; ReviewPage.jsx falls
              back to its normal blank/manual-entry field in that case. */}
          <ReviewPage projectId={reviewProjectId} reviewerName={activation?.clientName} />
        </div>
      )}

      {screen === 'editor' && (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', height: 'calc(100vh - 58px)' }}>

          {/* Review panel - left, shown once this design has actually been
              sent for review at least once (reviewStatus !== 'design').
              Was comments.length > 0, which is why Approve/Request changes
              "went missing" for a Manager on a submitted design nobody had
              commented on yet. Was briefly "always shown regardless of
              status," which broke the opposite way - Julia, 2026-09-23:
              "comments and approved button shouldn't show" on a design
              that's never been sent at all. reviewStatus is the right
              signal either way: it only leaves 'design' once Send review
              link has actually been clicked once. Restricted review
              (brief-generated candidates) keeps its own simpler footer in
              FieldEditor.jsx untouched - this is the normal editor only. */}
          {!restrictedReview && reviewStatus !== 'design' && (
            <div style={{ width: 260, flexShrink: 0, borderRight: '1px solid #FDE68A', background: '#FFFBEB', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid #FDE68A', display: 'flex', alignItems: 'center', gap: 7 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#92400E" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Review · {comments.length} comment{comments.length !== 1 ? 's' : ''}
                </span>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {comments.length === 0 && (
                  <div style={{ color: '#92400E', fontSize: 12, textAlign: 'center', paddingTop: 16, opacity: 0.7 }}>
                    No comments yet
                  </div>
                )}
                {comments.map(c => (
                  <div key={c.id} style={{ background: c.from === 'designer' ? 'var(--primary-glow)' : '#fff', borderRadius: 8, padding: '10px 12px', border: `1px solid ${c.from === 'designer' ? 'rgba(223,111,109,0.3)' : '#FDE68A'}`, opacity: c.resolved ? 0.6 : 1 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6, marginBottom: 3 }}>
                      <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--dark)' }}>{c.name}</div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--mid)', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}>
                        <input type="checkbox" checked={!!c.resolved} onChange={e => handleToggleResolved(c.id, e.target.checked)} style={{ cursor: 'pointer' }} />
                        Done
                      </label>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--mid)', marginBottom: 6 }}>
                      {new Date(c.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--dark)', lineHeight: 1.6, textDecoration: c.resolved ? 'line-through' : 'none' }}>{c.text}</div>
                  </div>
                ))}
              </div>

              {/* Reply box - the panel used to be read-only; Julia's ask,
                  2026-09-16, was real back-and-forth from inside the editor. */}
              <div style={{ padding: '12px 14px', borderTop: '1px solid #FDE68A', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <textarea
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  placeholder="Reply to feedback…"
                  rows={2}
                  style={{ padding: '8px 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 8, resize: 'vertical', outline: 'none', fontFamily: 'inherit', color: 'var(--dark)', lineHeight: 1.5, background: '#fff' }}
                />
                <button
                  type="button"
                  onClick={handlePostReply}
                  disabled={postingReply || !replyText.trim()}
                  style={{
                    padding: '8px', fontSize: 12, fontWeight: 700, borderRadius: 8, border: 'none',
                    background: (postingReply || !replyText.trim()) ? '#E5E7EB' : 'var(--primary)',
                    color: (postingReply || !replyText.trim()) ? 'var(--mid)' : '#fff',
                    cursor: (postingReply || !replyText.trim()) ? 'default' : 'pointer',
                  }}
                >
                  {postingReply ? 'Sending…' : 'Send reply'}
                </button>
              </div>

              {/* Approve / Request changes, Manager role only, and only once
                  something's actually been sent (approving a design that
                  was never submitted doesn't mean anything). Below Send
                  reply per Julia's ask: "so when manager comes in she can
                  either request more changes or just press approve" - reads
                  top to bottom as comments, then reply, then the decision.
                  Designer doesn't see this; these actions still also exist
                  on the external review link for partners without an
                  account. */}
              {workflowRole === 'Manager' && reviewStatus !== 'design' && (
                reviewStatus === 'approved' ? (
                  <div style={{ padding: '10px 14px', textAlign: 'center', background: 'rgba(22,163,74,0.1)', borderTop: '1px solid #FDE68A' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#16a34a' }}>✓ Approved</span>
                  </div>
                ) : reviewStatus === 'changes_requested' ? (
                  <div style={{ padding: '10px 14px', textAlign: 'center', background: 'rgba(180,83,9,0.1)', borderTop: '1px solid #FDE68A' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#B45309' }}>↺ Changes requested</span>
                  </div>
                ) : (
                  <div style={{ padding: '10px 14px', display: 'flex', gap: 6, borderTop: '1px solid #FDE68A' }}>
                    <button
                      type="button"
                      onClick={handleRequestChangesInEditor}
                      disabled={editorRequestingChanges || !comments.some(c => !c.resolved)}
                      title={comments.some(c => !c.resolved) ? 'Sends this back with the open feedback above' : 'Leave an open comment first, so the creator knows what to change'}
                      style={{
                        flex: 1, padding: '7px 6px', fontSize: 11, fontWeight: 700, borderRadius: 8, border: '1px solid #D97706',
                        background: '#fff', color: (editorRequestingChanges || !comments.some(c => !c.resolved)) ? 'var(--light)' : '#B45309',
                        borderColor: (editorRequestingChanges || !comments.some(c => !c.resolved)) ? 'var(--border)' : '#D97706',
                        cursor: (editorRequestingChanges || !comments.some(c => !c.resolved)) ? 'default' : 'pointer',
                      }}
                    >
                      {editorRequestingChanges ? 'Sending…' : '↺ Request changes'}
                    </button>
                    <button
                      type="button"
                      onClick={handleApproveInEditor}
                      disabled={editorApproving}
                      style={{
                        flex: 1, padding: '7px 6px', fontSize: 11, fontWeight: 700, borderRadius: 8, border: 'none',
                        background: editorApproving ? '#E5E7EB' : '#16a34a', color: editorApproving ? 'var(--mid)' : '#fff',
                        cursor: editorApproving ? 'default' : 'pointer',
                      }}
                    >
                      {editorApproving ? 'Approving…' : '✓ Approve'}
                    </button>
                  </div>
                )
              )}

            </div>
          )}

          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Breadcrumb - a grid (not flex) so the project name can sit
                truly centered in its own column regardless of how wide the
                left (breadcrumb) or right (credits/undo/reset) groups are.
                Moved the editable project name here from FieldEditor's right
                panel (Julia's ask, 2026-09-18) - same projectName/
                onProjectNameChange state, just rendered above the canvas
                instead of buried in the scrollable field list. */}
            <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '12px 24px', display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span
                  onClick={handleBack}
                  style={{ fontSize: 13, color: 'var(--mid)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
                  onMouseEnter={e => e.currentTarget.style.color = 'var(--primary)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--mid)'}
                >
                  ← Designs
                </span>
                <span style={{ fontSize: 13, color: 'var(--light)', flexShrink: 0 }}>→</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--dark)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedTemplate?.name}</span>
                {/* Reflects real save state now that autosave replaced the
                    manual Save button (Julia's editor redesign, 2026-09-18)
                    - this is the only save feedback left for the normal
                    (non-restricted) flow. */}
                {(saving || saveStatus === 'saved' || currentProjectId) && (
                  <span style={{ fontSize: 11, color: saveStatus === 'saved' ? '#16a34a' : 'var(--mid)', background: saveStatus === 'saved' ? '#F0FDF4' : '#F3F4F6', padding: '2px 8px', borderRadius: 100, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                    {saving && (
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--mid)', flexShrink: 0 }} />
                    )}
                    {saving ? 'Saving…' : saveStatus === 'saved' ? 'Saved just now' : 'Saved'}
                  </span>
                )}
              </div>

              <input
                type="text"
                value={projectName ?? ''}
                onChange={e => { setProjectName(e.target.value); setHasUnsavedChanges(true) }}
                placeholder="e.g. Wen Cheng – Wolt Promo June"
                title="Project name - used as the PDF filename and label in your Designs tab"
                style={{
                  width: 320, maxWidth: '40vw', boxSizing: 'border-box', textAlign: 'center',
                  padding: '7px 12px', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                  border: '1px solid transparent', borderRadius: 8,
                  background: 'transparent', color: 'var(--dark)', outline: 'none',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
                onFocus={e => { e.target.style.borderColor = 'var(--primary)'; e.target.style.background = '#fff' }}
                onBlur={e => { e.target.style.borderColor = 'transparent'; e.target.style.background = 'transparent' }}
              />

              {/* minWidth: 0 - a grid item's default min-width is "auto" (its
                  content's own intrinsic width), which stopped this column
                  from ever actually shrinking below that on a narrow window
                  and squashed everything together instead of wrapping
                  (Julia's report, 2026-09-18). flexWrap lets whole
                  pills/buttons drop to a second line as intact units instead
                  - paired with whiteSpace:'nowrap' on each one below, so a
                  single pill's own text never breaks mid-word first. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap', rowGap: 6, minWidth: 0 }}>
              {activation && (
                <div ref={creditsInfoRef} style={{ position: 'relative' }}>
                  <span
                    onClick={() => setShowCreditsInfo(v => !v)}
                    style={{ fontSize: 11, color: 'var(--mid)', background: '#F3F4F6', padding: '3px 10px', borderRadius: 100, border: '1px solid var(--border)', cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    {activation.credits} AI credit{activation.credits !== 1 ? 's' : ''} remaining
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
              )}
              <button
                onClick={handleUndo}
                disabled={!canUndo}
                title="Undo last change (⌘Z)"
                style={{ fontSize: 12, fontWeight: 600, color: canUndo ? 'var(--mid)' : 'var(--light)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', cursor: canUndo ? 'pointer' : 'default', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', flexShrink: 0 }}
                onMouseEnter={e => { if (canUndo) { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' } }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = canUndo ? 'var(--mid)' : 'var(--light)' }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
                Undo
              </button>
              {/* Restricted review mode (opened from a brief-generated candidate) has
                  nothing meaningful to reset back to - no blank/start-over concept
                  applies once a finished design was auto-generated, so the whole
                  button is hidden rather than wired to either reset flow. */}
              {!restrictedReview && (
                <button
                  onClick={effectiveMode === 'non-designer' ? handleResetToBlank : handleResetLayout}
                  title={effectiveMode === 'non-designer' ? 'Clear all fields and start the template over' : 'Reset all text zones to their original positions'}
                  style={{ fontSize: 12, fontWeight: 600, color: 'var(--mid)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap', flexShrink: 0 }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--mid)' }}
                >
                  {effectiveMode === 'non-designer' ? 'Reset all fields' : 'Reset layout'}
                </button>
              )}
              </div>
            </div>

            {/* Guided/Advanced toggle (Julia's editor redesign, 2026-09-18,
                per Annika's mockup) - not shown in restricted review, which
                has no "Advanced" concept (see effectiveMode above). */}
            {!restrictedReview && (
              <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <div style={{ display: 'flex', background: '#F3F4F6', borderRadius: 8, padding: 3, gap: 2 }}>
                  {[['non-designer', 'Guided'], ['designer', 'Advanced']].map(([m, label]) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setAdvancedMode(m === 'designer')}
                      style={{
                        padding: '5px 14px', fontSize: 12, fontWeight: 700, borderRadius: 6, border: 'none', cursor: 'pointer',
                        background: effectiveMode === m ? 'var(--primary)' : 'transparent',
                        color: effectiveMode === m ? '#fff' : 'var(--mid)',
                        fontFamily: 'inherit', transition: 'all 0.15s',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <span style={{ fontSize: 12, color: 'var(--mid)' }}>
                  {effectiveMode === 'non-designer' ? 'Keeps text inside safe print margins' : 'Full manual control over position and size'}
                </span>
              </div>
            )}

            {/* Progress bar (Julia's editor redesign, 2026-09-18, per
                Annika's mockup) - hidden in restricted review, which has no
                open-ended "keep filling fields" flow. */}
            {!restrictedReview && progressFieldOrder.length > 0 && (
              <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--mid)', flexShrink: 0, whiteSpace: 'nowrap' }}>
                  {progressReadyCount} of {progressFieldOrder.length} ready
                </span>
                <div style={{ flex: 1, height: 6, background: '#F3F4F6', borderRadius: 100, overflow: 'hidden' }}>
                  <div style={{
                    width: `${(progressReadyCount / progressFieldOrder.length) * 100}%`, height: '100%',
                    background: progressReadyCount === progressFieldOrder.length ? '#16a34a' : 'var(--primary)',
                    borderRadius: 100, transition: 'width 0.2s ease, background 0.2s ease',
                  }} />
                </div>
              </div>
            )}

            <TemplateCanvas
              key={loadKey}
              config={templateConfig}
              fields={fields}
              onFieldChange={handleFieldChange}
              exportRef={exportRef}
              fontSizes={fontSizes}
              alignments={alignments}
              imageScales={imageScales}
              imagePositions={imagePositions}
              textPositions={textPositions}
              mode={effectiveMode}
              loadKey={loadKey}
              zonePositions={zonePositions}
              onZoneDragStart={handleZoneDragStart}
              onReady={handleCanvasReady}
              onAutoShrink={handleAutoShrink}
              restricted={restrictedReview}
              onImageDrop={handleCanvasImageDrop}
              activeZoneId={activeZoneId}
            />
          </div>

          <FieldEditor
            fields={fields}
            onChange={handleFieldChange}
            onFocusField={setActiveZoneId}
            credits={activation?.credits}
            onCreditUsed={handleAiCreditUsed}
            lang={lang}
            onExport={handleExport}
            exporting={exporting}
            workflowRole={workflowRole}
            template={selectedTemplate}
            templateConfig={templateConfig}
            fontSizes={fontSizes}
            onFontSizeChange={handleFontSizeChange}
            alignments={alignments}
            onAlignChange={handleAlignChange}
            onResetZone={handleResetZone}
            imageScales={imageScales}
            onImageScaleChange={handleImageScaleChange}
            imagePositions={imagePositions}
            onImageOffsetChange={handleImageOffsetChange}
            onTextNudge={handleTextNudge}
            restricted={restrictedReview}
            mode={effectiveMode}
            onSave={restrictedReview ? handleSaveAndReturnToPicker : handleSave}
            saving={saving}
            saveStatus={saveStatus}
            onSendForReview={handleSendForReview}
            comments={comments}
            currentProjectId={currentProjectId}
            projectName={projectName}
            vertical={designVertical}
            reviewSent={reviewSent}
          />
        </div>
      )}

      {/* Share / Send for Review modal */}
      {/* Julia's ask, 2026-09-23: the first send should only leave for My
          Tasks once the link's been copied and "Done" is pressed - unlike a
          resubmit (handleSendForReview's own setTimeout), which has no new
          link to show and so can leave right away. */}
      {reviewItems && <ReviewModal items={reviewItems} onClose={() => { setReviewItems(null); setScreen('tasks') }} />}
      {formatPromptOptions.length > 0 && (
        <MoreFormatsModal
          formats={formatPromptOptions}
          onPick={handlePickAnotherFormat}
          onClose={() => setFormatPromptOptions([])}
        />
      )}
      {showSavedModal && (
        <SavedModal
          onContinue={() => setShowSavedModal(false)}
          onNewDesign={() => { setShowSavedModal(false); handleNavigate('new-brief') }}
          onExit={() => { setShowSavedModal(false); setScreen('landing') }}
        />
      )}

      {/* Help modal */}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}

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
