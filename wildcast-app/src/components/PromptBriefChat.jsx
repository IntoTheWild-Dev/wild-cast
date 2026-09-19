import { useState, useRef, useEffect, useMemo } from 'react'
import { FeatureGrid, WildScaleTip } from './BriefingForm'
import PromptBriefResultModal from './PromptBriefResultModal'
import PromptBriefAssetPicker from './PromptBriefAssetPicker'
import { buildSteps, stepApplies, summarizeAnswers, assembleBrief, partnerNameFrom } from '../lib/promptBriefFlow'
import { askAssistant } from '../lib/promptBriefAI'
import { uploadImageForZone, assetFolderForZone, GENERAL_MERCHANT } from '../lib/assetLibrary'

// "Prompt Brief" screen (Julia's ask, 2026-09-19): replaces the old brief form
// with a chat. Same page shell as the landing page (hero copy, tip box,
// feature grid), with the chat card in the middle. UI-first pass: the
// assistant's turns are scripted from the template's own questions
// (lib/promptBriefFlow.js) - no AI backend yet. The chat side is deliberately
// the only part that changes when the backend arrives: it produces the same
// `answers` shape either way.
const ACKS = ['Got it.', 'Thanks.', 'Perfect.', 'Noted.']
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
        maxWidth: '78%', padding: '11px 15px', borderRadius: 16, fontSize: 14, lineHeight: 1.5,
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

function UploadDrop({ label, onFile }) {
  const [over, setOver] = useState(false)
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

export default function PromptBriefChat({ entry, config, onBack, onChangeTemplate, onEdit, onSendForReview, onOpenLibrary, onNewBrief }) {
  const steps = useMemo(() => buildSteps(config?.zones ?? []), [config])
  const [messages, setMessages] = useState([])
  const [answers, setAnswers] = useState({})
  const [currentId, setCurrentId] = useState(null)
  // Starts true: the greeting is already "being typed" on first paint, and
  // the mount effect below then only has to schedule timers.
  const [typing, setTyping] = useState(true)
  const [finished, setFinished] = useState(false)
  const [showResult, setShowResult] = useState(false)
  const [draft, setDraft] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  // Step id whose "Choose from Assets" popup is open (upload steps only).
  const [pickerId, setPickerId] = useState(null)
  // Suggestions already shown per step, sent back as `exclude` on "Suggest more".
  const [aiShown, setAiShown] = useState({})
  const timers = useRef([])
  const blobUrls = useRef([])
  const msgId = useRef(0)
  // Mirror of `messages` for async code (chat history sent to the assistant), and a
  // run counter so a reply that arrives after "Start over" is dropped, not shown.
  const msgsRef = useRef([])
  const runRef = useRef(0)
  const scrollRef = useRef(null)
  const cardRef = useRef(null)

  const later = (fn, ms) => { timers.current.push(setTimeout(fn, ms)) }
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = [] }
  const push = msg => {
    msgsRef.current = [...msgsRef.current, { id: ++msgId.current, ...msg }]
    setMessages(msgsRef.current)
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
      push({ from: 'ai', text: `Hi! I'm your Wild Stack design assistant. Let's brief your ${entry.label} together. I'll ask a few questions, you answer or upload, and I'll fill the template in for you.` })
      setTyping(true)
    }, 800)
    later(() => {
      setTyping(false)
      push({ from: 'ai', text: `The business type and format are already set from your template (${entry.category ? entry.category.charAt(0).toUpperCase() + entry.category.slice(1) : 'Restaurant'} · ${entry.format}), so we can jump straight in.` })
      ask(steps[0])
    }, 2000)
  }

  function start() {
    clearTimers()
    runRef.current += 1
    msgsRef.current = []
    blobUrls.current.forEach(u => URL.revokeObjectURL(u)); blobUrls.current = []
    setMessages([]); setAnswers({}); setCurrentId(null); setFinished(false); setShowResult(false); setDraft(''); setAiShown({}); setAiBusy(false)
    setTyping(true)
    runScript()
  }

  useEffect(() => {
    runScript()
    // Uploaded blob URLs are deliberately NOT revoked on unmount: Edit design
    // hands them to the editor, which owns them from there (start() revokes
    // them when the chat is reset instead).
    return () => { clearTimers() }
    // Runs once per mount; App remounts this component (key) on a template change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, typing, currentId, finished])

  // Each new question brings the whole card (composer included) into view.
  useEffect(() => {
    if (currentId) cardRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [currentId])

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
  // and the assistant only phrases the next question. If it is unreachable we
  // fall back to the scripted wording and take typed text literally.
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

    let nextAnswers = answersNow
    let nextId
    let text
    let showHint = true
    if (ai) {
      for (const r of ai.recorded) nextAnswers = { ...nextAnswers, [r.stepId]: { value: r.value, display: r.display } }
      for (const id of ai.skipped) nextAnswers = { ...nextAnswers, [id]: { skipped: true, display: 'Skipped' } }
      nextId = ai.nextStepId
      text = ai.reply
      showHint = steps.find(s => s.id === nextId)?.kind === 'upload'
    } else {
      if (typed && fromStep) nextAnswers = { ...nextAnswers, [fromStep.id]: { value: typed, display: typed } }
      const nextStep = steps.find(s => stepApplies(s, nextAnswers) && !nextAnswers[s.id])
      nextId = nextStep?.id ?? null
      const ack = skipped ? 'No problem.' : ACKS[Object.keys(nextAnswers).length % ACKS.length]
      text = nextStep ? `${ack} ${nextStep.ask}` : ''
    }

    setAnswers(nextAnswers)
    setTyping(false)
    if (!nextId) { finish(); return }
    push({ from: 'ai', text, hint: showHint ? steps.find(s => s.id === nextId)?.hint : undefined })
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
  // existing /api/ai-suggest route (Wolt copy knowledge base, per-field
  // character limits). Empty draft = fresh suggestions from the brief; typed
  // draft = polish/translate that line, same rule AISuggest.jsx uses. Credits
  // are deliberately not deducted here yet (to be decided).
  async function suggest(step, { more = false } = {}) {
    if (currentId !== step.id || aiBusy) return
    const seed = draft.trim()
    const shown = aiShown[step.id] ?? []
    push({ from: 'user', text: seed ? `Improve "${seed}" with AI` : (more ? 'Suggest more' : 'Suggest something with AI') })
    setAiBusy(true)
    setTyping(true)
    try {
      const category = entry.category ?? 'restaurant'
      const businessType = category.charAt(0).toUpperCase() + category.slice(1)
      const res = await fetch('/api/ai-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field: step.aiField, lang: 'de',
          context: { vertical: businessType, businessType, objective: answers.objective?.display, partnerName: partnerNameFrom(answers) },
          ...(seed ? { seed } : {}),
          ...(more ? { exclude: shown } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.suggestions?.length) throw new Error(data.error || 'No suggestions')
      setAiShown(prev => ({ ...prev, [step.id]: [...(more ? shown : []), ...data.suggestions] }))
      push({
        from: 'ai', stepId: step.id, options: data.suggestions,
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
    respond({ answersNow: answers, fromStep: step, typed: t })
  }

  // Same pipeline as the editor's own upload (FieldEditor's ImageUpload):
  // the zone's transparent-PNG rule, then a copy saved into the partner's
  // Library. A rejected file is explained in the chat and the step stays open.
  async function pickFile(step, file) {
    if (currentId !== step.id) return
    const zone = config?.zones?.find(z => z.id === step.id)
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
    }
  }

  // A pick from the Assets library is an image answer like an upload, minus the
  // validation upload needs - the picker already applied the transparent-PNG check.
  function pickAsset(step, asset) {
    setPickerId(null)
    submit(step, { value: asset.name, display: asset.name, imageUrl: asset.src })
  }

  const step = steps.find(s => s.id === currentId) ?? null
  const pickerStep = steps.find(s => s.id === pickerId) ?? null
  const activeSteps = steps.filter(s => stepApplies(s, answers))
  const answered = activeSteps.filter(s => answers[s.id]).length
  const rows = summarizeAnswers(steps, answers)

  const composerShell = { borderTop: '1px solid var(--border)', padding: '14px 18px 16px', background: '#fff' }
  const inputRow = (
    <div style={{ display: 'flex', gap: 8 }}>
      <input
        value={draft} onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && step) { e.preventDefault(); sendText(step) } }}
        placeholder={step?.kind === 'chips' ? 'Or type your own answer…' : (step?.placeholder ?? 'Type your answer…')}
        disabled={!step} maxLength={step?.maxLength}
        style={{ flex: 1, padding: '12px 14px', fontSize: 14, fontFamily: 'inherit', border: '1.5px solid var(--border)', borderRadius: 10, outline: 'none', background: step ? '#fff' : '#F9FAFB' }}
        onFocus={e => { e.currentTarget.style.borderColor = 'var(--primary)' }}
        onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
      />
      <button
        type="button" onClick={() => step && sendText(step)} disabled={!step || !draft.trim()} aria-label="Send"
        style={{ width: 46, borderRadius: 10, border: 'none', cursor: step && draft.trim() ? 'pointer' : 'not-allowed', background: step && draft.trim() ? 'var(--primary)' : '#E5E7EB', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
      </button>
    </div>
  )

  return (
    <div style={{ flex: 1, background: 'var(--bg)', overflow: 'auto' }}>
      <style>{'@keyframes pb-dot { 0%, 80%, 100% { opacity: 0.25; transform: translateY(0) } 40% { opacity: 1; transform: translateY(-3px) } }'}</style>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '64px 32px' }}>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 36 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>
              Prompt Brief
            </div>
            <h1 style={{ fontSize: 42, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--dark)', margin: '0 0 16px', lineHeight: 1.08 }}>
              Brief your design <span style={{ color: 'var(--primary)' }}>in a chat</span>
            </h1>
            <p style={{ fontSize: 15, color: 'var(--mid)', lineHeight: 1.6, maxWidth: 460 }}>
              Answer a few questions, the same ones a designer would ask. We'll fill in your template, ready to edit or send for review.
            </p>
          </div>

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
        </div>

        <div ref={cardRef} style={{ maxWidth: 760, margin: '0 auto', background: '#fff', border: '1px solid var(--border)', borderRadius: 18, scrollMarginTop: 74, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: CHAT_HEIGHT, boxShadow: '0 8px 32px rgba(2,6,24,0.06)' }}>
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
                {step && (step.options?.length > 0 || step.optional || step.aiField) && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
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
                {step?.kind === 'upload' ? (
                  <div style={{ display: 'flex', gap: 10, alignItems: 'stretch', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 260px', display: 'flex' }}>
                      <UploadDrop label={step.summaryLabel === 'Logo' ? 'Upload your logo.' : `Upload the ${step.summaryLabel.toLowerCase()}.`} onFile={f => pickFile(step, f)} />
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
                ) : inputRow}
              </>
            )}
          </div>
        </div>

        <div style={{ maxWidth: 760, margin: '32px auto 0' }}>
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
