import { useState, useRef, useEffect, useMemo } from 'react'
import { FeatureGrid, WildScaleTip } from './BriefingForm'
import PromptBriefResultModal from './PromptBriefResultModal'
import PromptBriefAssetPicker from './PromptBriefAssetPicker'
import {
  buildSteps, buildPreSteps, buildGenericTextSteps, FORM_STEPS, matchTemplate,
  stepApplies, summarizeAnswers, assembleBrief, partnerNameFrom,
  reuseAskText, CONFIRM_USE, CONFIRM_DIFFERENT, answersOverTemplateLimit,
} from '../lib/promptBriefFlow'
import { askAssistant } from '../lib/promptBriefAI'
import { uploadImageForZone, assetFolderForZone, getLibraryAssets, GENERAL_MERCHANT } from '../lib/assetLibrary'
import { hasTransparency } from '../lib/image'
import { AUTO_REMOVE_BG_NOTE, shouldRemoveBackground } from '../lib/removeBackground'
import { aiFieldSettingsFor } from '../data/templateZones'
import { PAGE_MAX_WIDTH, PAGE_GUTTER } from '../lib/layout'

// "Prompt Brief" screen (Julia's ask, 2026-09-19; chat-first rework 2026-09-28).
// Same page shell as the landing page (hero copy, tip box, feature grid), with
// the chat card in the middle. Since 2026-09-28 the chat opens WITHOUT a
// pre-picked template: it asks the format and sticker/QR needs, matches those
// against the live templates itself (lib/promptBriefFlow.js's matchTemplate),
// and asks the partner to confirm the pick with a preview. The AI assistant
// phrases the conversation, but never decides what is asked - the step list
// is built here from plain data, and every recorded answer is validated
// server-side (api/prompt-brief-chat.js). If the assistant is unreachable the
// chat pauses with "Chat box not available right now." and a Try again chip -
// since 2026-09-28 there is deliberately NO scripted fallback (Julia's call:
// a half-scripted chat reads as broken, not graceful).
const PAUSED_TEXT = 'The design assistant is offline right now — please try again in a moment.'
// Fits inside the viewport under the 58px sticky header, so the answer chips
// are never pushed below the fold on a laptop-height window.
const CHAT_HEIGHT = 'clamp(440px, calc(100vh - 150px), 640px)'

function AssistantAvatar() {
  return (
    <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--primary-glow)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>
      ✦
    </div>
  )
}

function Bubble({ msg, activeStepId, onPickOption }) {
  const isUser = msg.from === 'user'
  return (
    <div style={{ display: 'flex', gap: 10, justifyContent: isUser ? 'flex-end' : 'flex-start', alignItems: 'flex-end' }}>
      {!isUser && <AssistantAvatar />}
      <div style={{
        // Capped in px too now the card is full page width - 78% alone gave
        // ~1000px-wide lines that are hard to read.
        maxWidth: 'min(78%, 680px)', padding: '11px 15px', borderRadius: 16, fontSize: 14, lineHeight: 1.5,
        borderBottomLeftRadius: isUser ? 16 : 4, borderBottomRightRadius: isUser ? 4 : 16,
        background: isUser ? 'var(--primary)' : '#fff', color: isUser ? '#fff' : 'var(--dark)',
        border: isUser ? 'none' : '1px solid var(--border)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>
        {msg.image && (
          <img src={msg.image} alt="" style={{ display: 'block', maxWidth: 200, maxHeight: 140, objectFit: 'contain', borderRadius: 8, background: 'rgba(255,255,255,0.9)', marginBottom: msg.text ? 8 : 0 }} />
        )}
        {msg.text}
        {msg.hint && <div style={{ fontSize: 12, color: 'var(--mid)', marginTop: 4 }}>{msg.hint}</div>}
        {msg.options && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
            {msg.options.map(opt => {
              const live = activeStepId === msg.stepId
              return (
                <button
                  key={opt} type="button" disabled={!live} onClick={() => onPickOption(msg.stepId, opt)}
                  style={{
                    textAlign: 'left', padding: '9px 12px', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', borderRadius: 10,
                    border: '1.5px solid var(--border)', background: '#fff', color: live ? 'var(--dark)' : 'var(--light)',
                    cursor: live ? 'pointer' : 'default', transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { if (live) { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.background = 'var(--primary-glow)' } }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = '#fff' }}
                >
                  {opt}
                </button>
              )
            })}
            <div style={{ fontSize: 11, color: 'var(--light)', fontStyle: 'italic' }}>AI copy - review before publishing</div>
          </div>
        )}
      </div>
    </div>
  )
}

function TypingBubble() {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
      <AssistantAvatar />
      <div style={{ padding: '14px 16px', borderRadius: 16, borderBottomLeftRadius: 4, background: '#fff', border: '1px solid var(--border)', display: 'flex', gap: 5 }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--light)', animation: 'pb-dot 1.1s infinite', animationDelay: `${i * 0.16}s` }} />
        ))}
      </div>
    </div>
  )
}

function Chip({ children, onClick, primary }) {
  return (
    <button
      type="button" onClick={onClick}
      style={{
        padding: '8px 14px', fontSize: 13, fontWeight: 600, borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
        border: `1.5px solid ${primary ? 'var(--primary)' : 'var(--border)'}`, background: '#fff',
        color: primary ? 'var(--primary)' : 'var(--dark)', transition: 'all 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.background = 'var(--primary-glow)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = primary ? 'var(--primary)' : 'var(--border)'; e.currentTarget.style.background = '#fff' }}
    >
      {children}
    </button>
  )
}

function UploadDrop({ label, onFile, busyLabel }) {
  const [over, setOver] = useState(false)
  if (busyLabel) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', border: '1.5px dashed var(--primary)', borderRadius: 12, background: 'var(--primary-glow)', color: 'var(--primary)', fontSize: 13, fontWeight: 600 }}>
        {busyLabel}
      </div>
    )
  }
  return (
    <label
      onDragOver={e => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f) }}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '16px', cursor: 'pointer',
        border: `1.5px dashed ${over ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 12,
        background: over ? 'var(--primary-glow)' : '#FAFAFA', color: 'var(--mid)', fontSize: 13, fontWeight: 600, transition: 'all 0.15s',
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
      <span>{label} <span style={{ color: 'var(--primary)' }}>Drop a file or browse</span></span>
      <input
        type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }}
      />
    </label>
  )
}

export default function PromptBriefChat({ entry, config, templateChoices = [], onConfirmTemplate, onChangeTemplate, onBack, onEdit, onSendForReview, onOpenLibrary, onNewBrief }) {
  const [messages, setMessages] = useState([])
  const [answers, setAnswers] = useState({})
  const [currentId, setCurrentId] = useState(null)
  // Starts true: the greeting is already "being typed" on first paint, and
  // the mount effect below then only has to schedule timers.
  const [typing, setTyping] = useState(true)
  const [finished, setFinished] = useState(false)
  const [showResult, setShowResult] = useState(false)
  // The confirm card's thumbnail is only 52x74 - too small to actually judge
  // the template by (Julia's report, 2026-09-28). Tapping it opens this
  // full-size lightbox instead of making the card itself huge.
  const [showTemplatePreview, setShowTemplatePreview] = useState(false)
  const [draft, setDraft] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  // Step id whose "Choose from Assets" popup is open (upload steps only).
  const [pickerId, setPickerId] = useState(null)
  // Step id whose upload is still being processed (background removal can
  // take a few seconds) - blocks a second file and shows progress meanwhile.
  const [uploadingId, setUploadingId] = useState(null)
  // Suggestions already shown per step, sent back as `exclude` on "Suggest more".
  const [aiShown, setAiShown] = useState({})
  // The turn the assistant could not process (service down) - kept so
  // "Try again" replays exactly what the partner did, without double-posting
  // their message bubble.
  const [pausedTurn, setPausedTurn] = useState(null)
  // Paste mode: the composer is always a growing textarea, this just opens it
  // up tall enough for a whole pasted brief to be comfortable to review.
  const [pasteMode, setPasteMode] = useState(false)
  // The shared asset library, fetched once the partner is known - powers the
  // "we have the logo on file" reuse offer on upload steps.
  const [libraryAssets, setLibraryAssets] = useState([])
  const [checkingReuse, setCheckingReuse] = useState(null)
  const timers = useRef([])
  const blobUrls = useRef([])
  const msgId = useRef(0)
  // Mirror of `messages` for async code (chat history sent to the assistant), and a
  // run counter so a reply that arrives after "Start over" is dropped, not shown.
  const msgsRef = useRef([])
  const runRef = useRef(0)
  const scrollRef = useRef(null)
  const cardRef = useRef(null)
  const inputRef = useRef(null)
  // The template id the confirm card last showed, so picking a different one
  // from the picker popup re-asks the question with the new pick instead of
  // leaving a stale bubble over a changed preview.
  const shownConfirmRef = useRef(null)
  // Set when the assistant has nothing left to ask but the confirmed
  // template hasn't arrived in this component yet (see the mega-paste effect).
  const pendingFinishRef = useRef(false)
  // Free text typed/pasted before a template existed. Template-specific
  // fields (offer, T&Cs, restaurant name, CTA) aren't askable yet then, so
  // the brief is re-read once the template is known instead of those facts
  // being asked for again.
  const preConfirmTextRef = useRef([])
  // Set by the turn that confirms the template: its next question has to
  // come from the confirmed template's steps, which only exist once App
  // passes the new config down - so that turn hands off to a follow-up turn
  // (see the post-confirm effect) instead of asking from the old list.
  const pendingPostConfirmRef = useRef(false)

  const later = (fn, ms) => { timers.current.push(setTimeout(fn, ms)) }
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = [] }
  const push = msg => {
    msgsRef.current = [...msgsRef.current, { id: ++msgId.current, ...msg }]
    setMessages(msgsRef.current)
  }

  // Live formats only - the template list arrives pre-filtered from App.jsx.
  const formats = useMemo(
    () => [...new Set(templateChoices.map(c => c.format).filter(Boolean))],
    [templateChoices]
  )
  const matched = useMemo(() => matchTemplate(templateChoices, answers), [templateChoices, answers])
  // After the template is confirmed, its own step list takes over (the
  // template-independent questions re-appear as already-answered). Before
  // that, the pre steps run alongside the template-independent questions so
  // a first-turn paste can fill them without a template existing yet.
  const steps = useMemo(
    () => (config
      ? buildSteps(config.zones, aiFieldSettingsFor(config, entry?.label, entry?.templateIdGuided))
      : [...buildPreSteps(matched, formats), ...FORM_STEPS, ...buildGenericTextSteps()]),
    [config, entry, matched, formats]
  )

  const partnerName = partnerNameFrom(answers)

  // Exactly one asset on file for this partner in the step's folder -> the
  // reuse offer. Zero or several -> no offer (the normal picker handles both;
  // never guess between multiple logos). "General" (shared, non-partner)
  // assets never count as a partner's own.
  function findReuseAsset(step, partner) {
    if (!step || !partner) return null
    const folder = assetFolderForZone(step.id)
    const p = partner.trim().toLowerCase()
    if (!p || p === GENERAL_MERCHANT.toLowerCase()) return null
    const matches = libraryAssets.filter(a =>
      a.folder === folder &&
      (a.merchant || '').trim().toLowerCase() === p
    )
    return matches.length === 1 ? matches[0] : null
  }

  function ask(step, ack) {
    setCurrentId(null)
    setTyping(true)
    later(() => {
      setTyping(false)
      push({ from: 'ai', text: ack ? `${ack} ${step.ask}` : step.ask, hint: step.hint })
      setCurrentId(step.id)
    }, 650)
  }

  // Schedules the greeting + first question. Timers only - no synchronous
  // setState - so it is safe to call from the mount effect as well as from start().
  function runScript() {
    later(() => {
      setTyping(false)
      push({ from: 'ai', text: "Hi! I'm your Wild Stack design assistant. Tell me what you need - answer as we go, or paste your whole brief in one go and I'll fill in everything I can." })
      ask(steps[0])
    }, 800)
  }

  function start() {
    clearTimers()
    runRef.current += 1
    msgsRef.current = []
    blobUrls.current.forEach(u => URL.revokeObjectURL(u)); blobUrls.current = []
    setMessages([]); setAnswers({}); setCurrentId(null); setFinished(false); setShowResult(false); setDraft(''); setAiShown({}); setAiBusy(false)
    setPausedTurn(null); setPasteMode(false); setCheckingReuse(null); setShowTemplatePreview(false)
    shownConfirmRef.current = null
    pendingFinishRef.current = false
    preConfirmTextRef.current = []
    pendingPostConfirmRef.current = false
    setTyping(true)
    runScript()
  }

  useEffect(() => {
    runScript()
    // Uploaded blob URLs are deliberately NOT revoked on unmount: Edit design
    // hands them to the editor, which owns them from there (start() revokes
    // them when the chat is reset instead).
    return () => { clearTimers() }
    // Runs once per mount; App remounts this component (key) on a fresh brief.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, typing, currentId, finished])

  // Each new question brings the whole card (composer included) into view.
  useEffect(() => {
    if (currentId) cardRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [currentId])

  // The partner is known -> pull the shared library once, for the reuse offer.
  // (Cleared on reset only implicitly: findReuseAsset gates on the partner
  // name, so a stale list is unreachable while no partner is set.)
  useEffect(() => {
    if (!partnerName) return
    let cancelled = false
    getLibraryAssets().then(all => { if (!cancelled) setLibraryAssets(all) })
    return () => { cancelled = true }
  }, [partnerName])

  // A template swap mid-chat (confirm card's "Choose a different one", or the
  // header's Change template) can remove the step that was just being asked -
  // pick up from the new template's first open question instead of stalling.
  // Answers carry over: a zone that exists in both templates stays answered.
  // The state updates run on a timer so the effect body itself stays free of
  // synchronous setState (same pattern as ask()).
  useEffect(() => {
    if (!currentId) return
    if (steps.some(s => s.id === currentId)) return
    const nextStep = steps.find(s => stepApplies(s, answers) && !answers[s.id])
    later(() => {
      // Template picked from the popup instead of the confirm card: same
      // re-read of a pre-template brief as the post-confirm turn does.
      if (config && preConfirmTextRef.current.length) {
        const typed = preConfirmTextRef.current.join('\n')
        preConfirmTextRef.current = []
        respond({ answersNow: answers, fromStep: null, typed })
        return
      }
      if (nextStep) {
        push({ from: 'ai', text: `The new template changes the questions a little. ${nextStep.ask}`, hint: nextStep.hint })
        setCurrentId(nextStep.id)
      } else if (config) {
        finish()
      }
    }, 50)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps])

  // Partner swapped the template while the confirm card is open - re-ask it
  // with the new pick's name and preview.
  useEffect(() => {
    if (currentId !== 'templateConfirm' || answers.templateConfirm || !matched) return
    if (shownConfirmRef.current === matched.id) return
    shownConfirmRef.current = matched.id
    const confirmStep = steps.find(s => s.id === 'templateConfirm')
    if (confirmStep) later(() => ask(confirmStep, 'How about this one?'), 50)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matched?.id, currentId])

  // A single pasted brief can answer everything - including the template
  // confirm - in one turn. The confirmed template's steps (and entry) only
  // exist after App processes onConfirmTemplate, so hold the finish until
  // they land instead of showing the result modal for a null template.
  useEffect(() => {
    if (!pendingFinishRef.current || !config || !entry) return
    pendingFinishRef.current = false
    later(() => finish(), 100)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, entry])

  // Post-confirm turn (see pendingPostConfirmRef): once App has passed the
  // confirmed template down, run one turn against ITS steps - re-reading
  // anything typed before it existed, so a pasted brief's offer / T&Cs /
  // CTA land now rather than being asked for again. Keyed on answers too:
  // the confirm turn's answers usually land after the config does.
  useEffect(() => {
    if (!pendingPostConfirmRef.current || !config || !entry) return
    pendingPostConfirmRef.current = false
    const typed = preConfirmTextRef.current.join('\n')
    preConfirmTextRef.current = []
    later(() => respond({ answersNow: answers, fromStep: null, typed }), 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, entry, answers])

  // Auto-grow the composer: one line until content (or paste mode) needs more.
  // Keyed on the step too, so switching questions resets the height.
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    const min = pasteMode ? 120 : 46
    el.style.height = `${Math.min(Math.max(el.scrollHeight, min), 160)}px`
  }, [draft, pasteMode, currentId])

  function finish() {
    setTyping(true)
    later(() => {
      setTyping(false)
      push({ from: 'ai', text: "That's everything I need. I've filled in your template. Here's how it looks:" })
      setFinished(true)
      later(() => setShowResult(true), 700)
    }, 750)
  }

  // Everything that happens after the partner's turn. `typed` is free text
  // they wrote (already shown as a chat bubble): the assistant reads it and may
  // record answers for this and other steps, or answer a side question. With no
  // `typed` (a button, an upload, a skip) the answer is already in `answersNow`
  // and the assistant only phrases the next question. If the assistant is
  // unreachable the turn is parked in `pausedTurn` and nothing advances.
  async function respond({ answersNow, fromStep, typed = '', skipped = false }) {
    const run = runRef.current
    setCurrentId(null)
    setTyping(true)
    // The request runs alongside a short minimum "typing" pause, so a fast
    // reply still feels like a person answering rather than an instant flash.
    const [ai] = await Promise.all([
      askAssistant({ entry, steps, answers: answersNow, currentStepId: fromStep?.id ?? null, userMessage: typed, messages: msgsRef.current }),
      new Promise(r => setTimeout(r, 650)),
    ])
    if (runRef.current !== run) return

    if (!ai) {
      setTyping(false)
      setPausedTurn({ answersNow, fromStep, typed, skipped })
      push({ from: 'ai', text: PAUSED_TEXT })
      return
    }

    let nextAnswers = answersNow
    let nextId
    let text
    let showHint
    for (const r of ai.recorded) {
      // "Choose a different one" must never settle the confirm step (the
      // button path doesn't either) - it opens the picker and the step stays
      // open to be re-asked with whatever gets picked.
      if (r.stepId === 'templateConfirm' && r.value === CONFIRM_DIFFERENT) { onChangeTemplate(); continue }
      nextAnswers = { ...nextAnswers, [r.stepId]: { value: r.value, display: r.display } }
      // The confirm step can also be recorded from typed text ("yes, use it")
      // - resolve the template exactly like the button path does.
      if (r.stepId === 'templateConfirm' && r.value === CONFIRM_USE && matched) onConfirmTemplate(matched.id)
    }
    for (const id of ai.skipped) nextAnswers = { ...nextAnswers, [id]: { skipped: true, display: 'Skipped' } }
    // This turn confirmed the template: the server picked "next" from the
    // pre-template list, which knows nothing of logo/photo/CTA/offer - and
    // with every pre-template question answered it returned none, which
    // used to jump straight to the result. Hand off to the post-confirm turn
    // (typing indicator stays on) so the next question, the brief re-read
    // and the box-limit check all run against the confirmed template.
    if (!config && matched && nextAnswers.templateConfirm?.value === CONFIRM_USE) {
      setAnswers(nextAnswers)
      pendingPostConfirmRef.current = true
      return
    }
    nextId = ai.nextStepId
    text = ai.reply
    // Once the template is known, hold pasted headline/sub-headline to its
    // copy-database box - the same limit the canvas uses - and re-ask any
    // that don't fit, instead of letting auto-resize shrink them to
    // unreadable (Julia, 2026-09-28: "smaller headlines and shorter
    // sub-lines, like the copy database").
    if (config) {
      const settings = aiFieldSettingsFor(config, entry?.label, entry?.templateIdGuided)
      const tooLong = answersOverTemplateLimit(nextAnswers, settings)
      if (tooLong.length) {
        const order = buildSteps(config.zones, settings).map(s => s.id)
        tooLong.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
        const kept = { ...nextAnswers }
        for (const t of tooLong) delete kept[t.id]
        nextAnswers = kept
        const first = tooLong[0]
        const label = (steps.find(s => s.id === first.id)?.summaryLabel ?? first.id).toLowerCase()
        nextId = first.id
        text = `"${first.text}" is too long for this template's ${label} - it fits up to ${first.limit} characters. Try a shorter one, or tap Suggest with AI.`
      }
    }
    const nextStep = steps.find(s => s.id === nextId)
    showHint = nextStep?.kind === 'upload'
    // Upload step and this partner has exactly one asset on file for it: lead
    // with the plain-words reuse offer. The model never sees library data, so
    // this line is always scripted (Julia's wording, 2026-09-28).
    const nextPartner = partnerNameFrom(nextAnswers)
    const reuse = nextStep?.kind === 'upload' ? findReuseAsset(nextStep, nextPartner) : null
    if (reuse) text = reuseAskText(nextStep, nextPartner)

    setAnswers(nextAnswers)
    setTyping(false)
    if (!nextId) {
      if (config) { finish(); return }
      pendingFinishRef.current = true
      return
    }
    if (nextId === 'templateConfirm') shownConfirmRef.current = matched?.id ?? null
    push({ from: 'ai', text, hint: showHint ? nextStep?.hint : undefined })
    setCurrentId(nextId)
  }

  function submit(step, answer) {
    if (currentId !== step.id) return
    push({
      from: 'user',
      text: answer.imageUrl ? answer.display : (answer.skipped ? 'Skip for now' : answer.display),
      image: answer.imageUrl ?? null,
    })
    setDraft('')
    respond({ answersNow: { ...answers, [step.id]: answer }, fromStep: step, skipped: answer.skipped })
  }

  // Suggest / Improve with AI (Julia's ask, 2026-09-19) - reuses the editor's
  // existing /api/ai-suggest route, since the v1.2 rebuild (Mark's spec) in
  // the pair/queue contract: one call returns sub-headline + headline PAIRS
  // (the flyer lockup), and the chat shows the asked field's line from each
  // pair. The other field's answer so far (if any) is sent as its current
  // text, so pairs already fit around it. Empty draft = fresh lines from the
  // brief; typed draft = a rewrite of that line (kind user_draft, the API
  // derives the mode). Credits are deliberately not deducted here yet (to be
  // decided).
  // `entry` is null until a template is confirmed (chat-first rework) - today
  // headline/sub_headline (the only pre-confirm aiField steps) always come
  // after templateConfirm in the step order, so this is unreachable, but that
  // ordering is an invariant spread across three files, not enforced here -
  // every `entry` read below is optional-chained so a future reorder fails
  // safe (empty template_id/name sent) instead of throwing into the catch
  // block below and showing a misleading "couldn't reach the AI copywriter".
  async function suggest(step, { more = false } = {}) {
    if (currentId !== step.id || aiBusy) return
    const seed = draft.trim()
    const shown = aiShown[step.id] ?? []
    push({ from: 'user', text: seed ? `Improve "${seed}" with AI` : (more ? 'Suggest more' : 'Suggest something with AI') })
    setAiBusy(true)
    setTyping(true)
    try {
      const category = entry?.category ?? 'restaurant'
      const businessType = category.charAt(0).toUpperCase() + category.slice(1)
      const settings = aiFieldSettingsFor(config, entry?.label, entry?.templateIdGuided)
      const fieldKey = step.aiField
      const res = await fetch('/api/ai-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field: step.aiField,
          lang: 'de',
          brief: {
            design_id: 'prompt-brief',
            template_id: entry?.templateIdGuided,
            template_name: entry?.label,
            vertical: businessType,
            partner: { name: partnerNameFrom(answers) ?? '' },
            logo_picked: !!answers.logo?.imageUrl,
            static_text: settings?.[fieldKey]?.static_text ?? [],
            other_fields: settings?.[fieldKey]?.other_fields ?? [],
            offer: { text: answers.offer?.display ?? '', shown_in_badge: false },
            user_note: '',
            fields: {
              headline: { current: answers.headline?.display ?? '', kind: answers.headline?.display ? 'user_draft' : 'placeholder' },
              sub_headline: {
                current: answers.sub_headline?.display ?? '',
                kind: answers.sub_headline?.display ? 'user_draft' : 'placeholder',
                role: settings?.sub_headline?.role ?? 'setup',
                position: settings?.sub_headline?.position ?? 'above',
              },
            },
            box: settings ?? {},
            exclude: more ? shown : [],
          },
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.pairs?.length) throw new Error(data.error || 'No suggestions')
      // The chat fills one field at a time - surface each pair's line for
      // the field being asked (the partner line concept belongs to the
      // editor's queue, not this Q&A flow).
      const lines = data.pairs.map(p => (step.aiField === 'headline' ? p.headline : p.subheadline)).filter(Boolean)
      setAiShown(prev => ({ ...prev, [step.id]: [...(more ? shown : []), ...lines] }))
      push({
        from: 'ai', stepId: step.id, options: lines,
        text: seed ? 'Here are some sharper versions, in German. Tap one to use it:' : 'Here are a few ideas, in German. Tap one to use it, or type your own:',
      })
    } catch {
      push({ from: 'ai', text: "I couldn't reach the AI copywriter just now. You can type your own line, or try again in a moment." })
    } finally {
      setTyping(false)
      setAiBusy(false)
    }
  }

  function pickOption(step, opt) {
    // The template-confirm chips are flow control, not answers: "use" commits
    // the matched template (App then loads its zones) and records the pick
    // for the transcript; "different" opens the picker popup and keeps the
    // step open so the card re-asks with whichever template gets picked.
    if (step.id === 'templateConfirm') {
      if (opt.value === CONFIRM_USE && matched) {
        onConfirmTemplate(matched.id)
        submit(step, { value: CONFIRM_USE, display: `Use ${matched.label.split(' · ').pop()}` })
      } else if (opt.value === CONFIRM_DIFFERENT || (opt.value === CONFIRM_USE && !matched)) {
        // matched can only be null here if something upstream changed the
        // candidate list between the card rendering and this click (e.g. a
        // template going un-live) - same recovery as "Choose a different
        // one" rather than a silent no-op with no way forward.
        if (!matched) push({ from: 'ai', text: "That template isn't available anymore - pick another one:" })
        onChangeTemplate()
      }
      return
    }
    const display = opt.value === '__partner__' ? (partnerNameFrom(answers) || opt.label) : opt.label
    submit(step, { value: opt.value, display })
  }

  function pickSuggestion(stepId, text) {
    const step = steps.find(s => s.id === stepId)
    if (step) submit(step, { value: text, display: text })
  }

  function sendText(step) {
    const t = draft.trim()
    if (!t || currentId !== step.id) return
    push({ from: 'user', text: t })
    setDraft('')
    setPasteMode(false)
    if (!config) preConfirmTextRef.current.push(t)
    respond({ answersNow: answers, fromStep: step, typed: t })
  }

  // Same pipeline as the editor's own upload (FieldEditor's ImageUpload):
  // automatic background removal, then a copy saved into the partner's
  // Library. A failed upload is explained in the chat and the step stays open.
  async function pickFile(step, file) {
    if (currentId !== step.id || uploadingId) return
    const zone = config?.zones?.find(z => z.id === step.id)
    setUploadingId(step.id)
    try {
      const { url, name } = await uploadImageForZone(file, {
        requireTransparent: zone?.hint?.toLowerCase().includes('transparent'),
        folder: assetFolderForZone(step.id),
        merchant: partnerNameFrom(answers) || GENERAL_MERCHANT,
      })
      blobUrls.current.push(url)
      submit(step, { value: name, display: name, imageUrl: url })
    } catch (err) {
      push({ from: 'ai', text: `${err.message} Please try another file, or skip it for now.` })
    } finally {
      setUploadingId(null)
    }
  }

  // A pick from the Assets library is an image answer like an upload, minus the
  // validation upload needs - the picker already applied the transparent-PNG check.
  function pickAsset(step, asset) {
    setPickerId(null)
    submit(step, { value: asset.name, display: asset.name, imageUrl: asset.src })
  }

  // Reusing the partner's own asset behaves exactly like a pick from the
  // Assets picker (same submit shape), plus the same transparent-PNG check
  // the picker applies when the zone needs it.
  async function pickReuse(step, asset) {
    if (checkingReuse) return
    const requireTransparent = config?.zones?.find(z => z.id === step.id)?.hint?.toLowerCase().includes('transparent')
    if (requireTransparent) {
      setCheckingReuse(step.id)
      const ok = await hasTransparency(asset.src)
      setCheckingReuse(null)
      if (!ok) {
        push({ from: 'ai', text: "That one has a background, so it can't go in this spot. Please upload a transparent PNG instead." })
        return
      }
    }
    submit(step, { value: asset.name, display: asset.name, imageUrl: asset.src })
  }

  const step = steps.find(s => s.id === currentId) ?? null
  const pickerStep = steps.find(s => s.id === pickerId) ?? null
  const activeSteps = steps.filter(s => stepApplies(s, answers))
  const answered = activeSteps.filter(s => answers[s.id]).length
  const rows = summarizeAnswers(steps, answers)
  const confirmReuse = step?.kind === 'upload' ? findReuseAsset(step, partnerName) : null

  const composerShell = { borderTop: '1px solid var(--border)', padding: '14px 18px 16px', background: '#fff' }
  const inputBlock = (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea
          ref={inputRef}
          value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && step) { e.preventDefault(); sendText(step) } }}
          placeholder={pasteMode
            ? "Paste your whole brief here - I'll pull out what I need…"
            : (step?.kind === 'chips'
              ? 'Or type your own answer…'
              : (step?.placeholder ?? (step?.kind === 'upload' ? 'Or paste your full brief here…' : 'Type your answer…')))}
          disabled={!step} rows={1}
          style={{ flex: 1, resize: 'none', padding: '12px 14px', fontSize: 14, fontFamily: 'inherit', border: '1.5px solid var(--border)', borderRadius: 10, outline: 'none', background: step ? '#fff' : '#F9FAFB', lineHeight: 1.45, overflowY: 'auto' }}
          onFocus={e => { e.currentTarget.style.borderColor = 'var(--primary)' }}
          onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
        />
        <button
          type="button" onClick={() => step && sendText(step)} disabled={!step || !draft.trim()} aria-label="Send"
          style={{ width: 46, height: 46, flexShrink: 0, borderRadius: 10, border: 'none', cursor: step && draft.trim() ? 'pointer' : 'not-allowed', background: step && draft.trim() ? 'var(--primary)' : '#E5E7EB', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ flex: 1, background: 'var(--bg)', overflow: 'auto' }}>
      <style>{'@keyframes pb-dot { 0%, 80%, 100% { opacity: 0.25; transform: translateY(0) } 40% { opacity: 1; transform: translateY(-3px) } }'}</style>
      <div style={{ maxWidth: PAGE_MAX_WIDTH, margin: '0 auto', padding: `64px ${PAGE_GUTTER}px` }}>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 36 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>
              Prompt Brief
            </div>
            <h1 style={{ fontSize: 42, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--dark)', margin: '0 0 16px', lineHeight: 1.08 }}>
              Brief your design <span style={{ color: 'var(--primary)' }}>in a chat</span>
            </h1>
            <p style={{ fontSize: 15, color: 'var(--mid)', lineHeight: 1.6, maxWidth: 460 }}>
              Answer a few questions - or paste the whole brief at once. We'll pick the right template, fill it in, and get it ready to edit or send for review.
            </p>
          </div>

          {entry ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '12px 16px' }}>
              <img src={entry.thumb} alt={entry.label} style={{ width: 44, height: 62, objectFit: 'cover', borderRadius: 6, border: '1.5px solid var(--primary)', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--dark)' }}>{entry.label.split(' · ').pop()} selected</div>
                <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                  <button type="button" onClick={onChangeTemplate} style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline', fontFamily: 'inherit' }}>
                    Change template
                  </button>
                  <button type="button" onClick={onBack} style={{ fontSize: 12, fontWeight: 600, color: 'var(--mid)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                    ← Back
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button type="button" onClick={onBack} style={{ fontSize: 12, fontWeight: 600, color: 'var(--mid)', background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '12px 16px', cursor: 'pointer', fontFamily: 'inherit' }}>
              ← Back
            </button>
          )}
        </div>

        {/* Full page width (was 760), so the card lines up with the page's
            edges like everything else - see lib/layout.js. */}
        <div ref={cardRef} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 18, scrollMarginTop: 74, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: CHAT_HEIGHT, boxShadow: '0 8px 32px rgba(2,6,24,0.06)' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <AssistantAvatar />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--dark)' }}>Wild Stack assistant</div>
              <div style={{ fontSize: 12, color: 'var(--mid)' }}>
                {finished ? 'All questions answered' : `Question ${Math.min(answered + 1, activeSteps.length)} of ${activeSteps.length}`}
              </div>
            </div>
            <button
              type="button" onClick={() => { if (!answered || window.confirm('Start the chat over? Your answers so far will be cleared.')) start() }}
              style={{ fontSize: 12, fontWeight: 600, color: 'var(--mid)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontFamily: 'inherit' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--mid)' }}
            >
              Start over
            </button>
          </div>
          <div style={{ height: 3, background: '#F3F4F6' }}>
            <div style={{ height: '100%', width: `${activeSteps.length ? (finished ? 100 : (answered / activeSteps.length) * 100) : 0}%`, background: 'var(--primary)', transition: 'width 0.3s' }} />
          </div>

          <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 12, background: '#FAFAFA' }}>
            {messages.map(m => <Bubble key={m.id} msg={m} activeStepId={currentId} onPickOption={pickSuggestion} />)}
            {typing && <TypingBubble />}
          </div>

          <div style={composerShell}>
            {finished ? (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button" onClick={() => setShowResult(true)}
                  style={{ flex: 1, minWidth: 200, padding: '13px', fontSize: 14, fontWeight: 700, background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  View your finished design
                </button>
              </div>
            ) : (
              <>
                {step?.id === 'templateConfirm' && matched && (
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', border: '1.5px solid var(--primary)', borderRadius: 12, padding: 10, marginBottom: 12, background: 'var(--primary-glow)' }}>
                    <button
                      type="button" onClick={() => setShowTemplatePreview(true)} aria-label="View template full-size"
                      style={{ padding: 0, border: '1.5px solid var(--primary)', borderRadius: 6, cursor: 'zoom-in', flexShrink: 0, background: 'none' }}
                    >
                      <img src={matched.thumb} alt={matched.label} style={{ display: 'block', width: 52, height: 74, objectFit: 'cover', borderRadius: 4, background: '#fff' }} />
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--dark)' }}>{matched.label}</div>
                      <div style={{ fontSize: 12, color: 'var(--mid)', marginTop: 2 }}>
                        {matched.category ? matched.category.charAt(0).toUpperCase() + matched.category.slice(1) + ' · ' : ''}{matched.format}
                      </div>
                      <button
                        type="button" onClick={() => setShowTemplatePreview(true)}
                        style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, marginTop: 4, textDecoration: 'underline', fontFamily: 'inherit' }}
                      >
                        View full size
                      </button>
                    </div>
                  </div>
                )}
                {step && !pasteMode && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                    {/* Left-most and its own visual weight, not a small corner
                        link (Julia's report, 2026-09-28: "shouldn't be in the
                        right corner, it's too small... before you ask about
                        everything else") - available on every step, same as
                        before, just given the prominence the brief asked for. */}
                    <button
                      type="button" onClick={() => setPasteMode(true)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 13, fontWeight: 700, borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', border: '1.5px solid var(--primary)', background: '#fff', color: 'var(--primary)' }}
                    >
                      📋 Paste your whole brief instead
                    </button>
                    {step.aiField && !aiBusy && (
                      <Chip primary onClick={() => suggest(step)}>{draft.trim() ? '✨ Improve with AI' : '✦ Suggest with AI'}</Chip>
                    )}
                    {step.aiField && !aiBusy && aiShown[step.id]?.length > 0 && !draft.trim() && (
                      <Chip onClick={() => suggest(step, { more: true })}>Suggest more</Chip>
                    )}
                    {step.options?.map(o => <Chip key={o.value} onClick={() => pickOption(step, o)}>{o.label}</Chip>)}
                    {step.optional && <Chip onClick={() => submit(step, { skipped: true, display: 'Skipped' })}>Skip for now</Chip>}
                  </div>
                )}
                {step?.kind === 'upload' && (
                  <>
                    {shouldRemoveBackground(assetFolderForZone(step.id)) && (
                      <div style={{ fontSize: 12, color: 'var(--mid)', marginBottom: 8 }}>{AUTO_REMOVE_BG_NOTE}</div>
                    )}
                    {confirmReuse && (
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center', border: '1.5px solid var(--primary)', borderRadius: 12, padding: 10, marginBottom: 12, background: 'var(--primary-glow)' }}>
                        <img src={confirmReuse.src} alt={confirmReuse.name} style={{ width: 52, height: 52, objectFit: 'contain', borderRadius: 6, border: '1px solid var(--border)', background: '#fff', flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--dark)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{confirmReuse.name}</div>
                          <div style={{ fontSize: 12, color: 'var(--mid)' }}>On file for this partner</div>
                        </div>
                        <button
                          type="button" onClick={() => pickReuse(step, confirmReuse)} disabled={checkingReuse === step.id}
                          style={{ flexShrink: 0, padding: '9px 16px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', borderRadius: 10, border: 'none', cursor: 'pointer', background: 'var(--primary)', color: '#fff', opacity: checkingReuse === step.id ? 0.7 : 1 }}
                        >
                          {checkingReuse === step.id ? 'Checking…' : 'Use it'}
                        </button>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 10, alignItems: 'stretch', flexWrap: 'wrap' }}>
                      <div style={{ flex: '1 1 260px', display: 'flex' }}>
                        <UploadDrop
                          label={step.summaryLabel === 'Logo' ? 'Upload your logo.' : `Upload the ${step.summaryLabel.toLowerCase()}.`}
                          onFile={f => pickFile(step, f)}
                          busyLabel={uploadingId === step.id ? (shouldRemoveBackground(assetFolderForZone(step.id)) ? 'Removing background…' : 'Uploading…') : null}
                        />
                      </div>
                      <button
                        type="button" onClick={() => setPickerId(step.id)}
                        style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '16px 20px', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', borderRadius: 12, cursor: 'pointer', border: '1.5px solid var(--border)', background: '#fff', color: 'var(--dark)', transition: 'all 0.15s' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.background = 'var(--primary-glow)' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = '#fff' }}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="14" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                        Choose from Assets
                      </button>
                    </div>
                  </>
                )}
                {pausedTurn && !typing && (
                  <div style={{ marginBottom: 10 }}>
                    <Chip primary onClick={() => { const t = pausedTurn; setPausedTurn(null); respond(t) }}>Try again</Chip>
                  </div>
                )}
                {inputBlock}
              </>
            )}
          </div>
        </div>

        <div style={{ marginTop: 32 }}>
          <WildScaleTip maxWidth="100%" />
        </div>

        <div style={{ marginTop: 24 }}>
          <FeatureGrid columns={4} />
        </div>
      </div>

      {pickerStep && (
        <PromptBriefAssetPicker
          folder={assetFolderForZone(pickerStep.id)}
          merchant={partnerNameFrom(answers) || GENERAL_MERCHANT}
          requireTransparent={config?.zones?.find(z => z.id === pickerStep.id)?.hint?.toLowerCase().includes('transparent')}
          onPick={asset => pickAsset(pickerStep, asset)}
          onClose={() => setPickerId(null)}
        />
      )}

      {showTemplatePreview && matched && (
        <div
          onClick={() => setShowTemplatePreview(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 270, background: 'rgba(17,17,17,0.55)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, maxHeight: '90vh' }}>
            <img src={matched.thumb} alt={matched.label} style={{ maxWidth: '100%', maxHeight: '78vh', width: 'auto', borderRadius: 12, boxShadow: '0 24px 80px rgba(0,0,0,0.4)', background: '#fff' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>
                {matched.label} · {matched.category ? matched.category.charAt(0).toUpperCase() + matched.category.slice(1) + ' · ' : ''}{matched.format}
              </div>
              <button
                type="button" onClick={() => setShowTemplatePreview(false)}
                style={{ padding: '8px 16px', fontSize: 13, fontWeight: 700, background: '#fff', color: 'var(--dark)', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showResult && (
        <PromptBriefResultModal
          entry={entry}
          config={config}
          answers={answers}
          rows={rows}
          onEdit={() => onEdit(assembleBrief(answers, entry))}
          onSendForReview={onSendForReview}
          onOpenLibrary={onOpenLibrary}
          onNewBrief={onNewBrief}
          onClose={() => setShowResult(false)}
        />
      )}
    </div>
  )
}
