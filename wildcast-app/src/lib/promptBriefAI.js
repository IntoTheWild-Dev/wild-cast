// Client side of api/prompt-brief-chat.js. Returns null on ANY failure
// (network, timeout, server error, unexpected shape) - since 2026-09-28 the
// chat no longer falls back to scripted questions when this happens: it
// pauses with "Chat box not available right now." and offers a retry
// (Julia's explicit call - a half-scripted chat read as broken, not
// graceful). Note: plain `vite dev` has no /api, so locally this always
// returns null and the chat stays paused - exercise the real flow on a
// Vercel preview.
const TIMEOUT_MS = 9000

export async function askAssistant({ entry, steps, answers, currentStepId, userMessage = '', messages = [] }) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch('/api/prompt-brief-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        // entry is null until the partner confirms a template (the chat now
        // opens before one is picked) - the template line is then just empty
        // and the step list alone gives the model its context.
        template: { label: entry?.label ?? '', category: entry?.category ?? '', format: entry?.format ?? '' },
        steps: steps.map(s => ({
          id: s.id, kind: s.kind, label: s.summaryLabel, ask: s.ask, hint: s.hint, optional: !!s.optional,
          maxLength: s.maxLength ?? null, whenAnswer: s.whenAnswer ?? null,
          options: (s.options ?? []).map(o => ({ label: o.label, value: o.value })),
        })),
        answers: Object.fromEntries(Object.entries(answers).map(([id, a]) => [id, { value: a.value ?? '', display: a.display ?? '', skipped: !!a.skipped }])),
        currentStepId, userMessage,
        history: messages.filter(m => m.text).slice(-8).map(m => ({ from: m.from === 'user' ? 'user' : 'assistant', text: m.text })),
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!data || !Array.isArray(data.recorded) || !Array.isArray(data.skipped) || typeof data.reply !== 'string') return null
    return data
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
