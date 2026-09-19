import { useState, useRef, useEffect, useMemo } from 'react'
import { FeatureGrid, WildScaleTip } from './BriefingForm'
import PromptBriefResultModal from './PromptBriefResultModal'
import { buildSteps, summarizeAnswers, assembleBrief, partnerNameFrom } from '../lib/promptBriefFlow'

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

function Bubble({ msg }) {
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

export default function PromptBriefChat({ entry, zones, onBack, onChangeTemplate, onEdit }) {
  const steps = useMemo(() => buildSteps(zones), [zones])
  const [messages, setMessages] = useState([])
  const [answers, setAnswers] = useState({})
  const [currentId, setCurrentId] = useState(null)
  // Starts true: the greeting is already "being typed" on first paint, and
  // the mount effect below then only has to schedule timers.
  const [typing, setTyping] = useState(true)
  const [finished, setFinished] = useState(false)
  const [showResult, setShowResult] = useState(false)
  const [draft, setDraft] = useState('')
  const timers = useRef([])
  const blobUrls = useRef([])
  const msgId = useRef(0)
  const scrollRef = useRef(null)
  const cardRef = useRef(null)

  const later = (fn, ms) => { timers.current.push(setTimeout(fn, ms)) }
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = [] }
  const push = msg => setMessages(m => [...m, { id: ++msgId.current, ...msg }])

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
    setMessages([]); setAnswers({}); setCurrentId(null); setFinished(false); setShowResult(false); setDraft('')
    setTyping(true)
    runScript()
  }

  useEffect(() => {
    runScript()
    const urls = blobUrls.current
    return () => { clearTimers(); urls.forEach(u => URL.revokeObjectURL(u)) }
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

  function advance(next, fromId, skipped) {
    const idx = steps.findIndex(s => s.id === fromId)
    const nextStep = steps.slice(idx + 1).find(s => !s.when || s.when(next))
    if (nextStep) ask(nextStep, skipped ? 'No problem.' : ACKS[idx % ACKS.length])
    else finish()
  }

  function submit(step, answer) {
    if (currentId !== step.id) return
    push({
      from: 'user',
      text: answer.imageUrl ? answer.display : (answer.skipped ? 'Skip for now' : answer.display),
      image: answer.imageUrl ?? null,
    })
    const next = { ...answers, [step.id]: answer }
    setAnswers(next)
    setCurrentId(null)
    setDraft('')
    later(() => advance(next, step.id, answer.skipped), 350)
  }

  function pickOption(step, opt) {
    const display = opt.value === '__partner__' ? (partnerNameFrom(answers) || opt.label) : opt.label
    submit(step, { value: opt.value, display })
  }

  function sendText(step) {
    const t = draft.trim()
    if (!t) return
    submit(step, { value: t, display: t })
  }

  function pickFile(step, file) {
    const url = URL.createObjectURL(file)
    blobUrls.current.push(url)
    submit(step, { value: file.name, display: file.name, imageUrl: url })
  }

  const step = steps.find(s => s.id === currentId) ?? null
  const activeSteps = steps.filter(s => !s.when || s.when(answers))
  const answered = activeSteps.filter(s => answers[s.id]).length
  const rows = summarizeAnswers(steps, answers)

  const composerShell = { borderTop: '1px solid var(--border)', padding: '14px 18px 16px', background: '#fff' }
  const inputRow = (
    <div style={{ display: 'flex', gap: 8 }}>
      <input
        value={draft} onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && step) { e.preventDefault(); sendText(step) } }}
        placeholder={step?.kind === 'chips' ? 'Or type your own answer…' : (step?.placeholder ?? 'Type your answer…')}
        disabled={!step}
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
            {messages.map(m => <Bubble key={m.id} msg={m} />)}
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
                {step && (step.options?.length > 0 || step.optional) && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                    {step.options?.map(o => <Chip key={o.value} onClick={() => pickOption(step, o)}>{o.label}</Chip>)}
                    {step.optional && <Chip onClick={() => submit(step, { skipped: true, display: 'Skipped' })}>Skip for now</Chip>}
                  </div>
                )}
                {step?.kind === 'upload'
                  ? <UploadDrop label={step.summaryLabel === 'Logo' ? 'Upload your logo.' : `Upload the ${step.summaryLabel.toLowerCase()}.`} onFile={f => pickFile(step, f)} />
                  : inputRow}
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

      {showResult && (
        <PromptBriefResultModal
          entry={entry}
          rows={rows}
          onEdit={() => onEdit(assembleBrief(answers, entry))}
          onClose={() => setShowResult(false)}
        />
      )}
    </div>
  )
}
