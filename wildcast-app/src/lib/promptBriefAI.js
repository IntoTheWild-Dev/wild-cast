// Client side of api/prompt-brief-chat.js. Returns null on ANY failure
// (network, timeout, server error, unexpected shape) - the chat then falls
// back to its scripted questions, so the assistant being down never blocks a
// brief. Note: plain `vite dev` has no /api, so locally this always returns
// null and the chat runs on the scripted fallback.
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
        template: { label: entry.label, category: entry.category, format: entry.format },
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
