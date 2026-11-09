// Print colours module: browser side of api/print-colors.js.
import { activationHeaders } from '../../lib/activationKey'

export const BRAND = 'wolt'

export async function printColorsApi(body) {
  const res = await fetch(`/api/print-colors${body ? '' : `?brand=${BRAND}`}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...activationHeaders() },
    body: body ? JSON.stringify({ brand: BRAND, ...body }) : undefined,
  })
  if (body?.action === 'sheet' && res.ok) return res.blob()
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

export function rgbToHex({ r, g, b }) {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, '0')).join('').toUpperCase()
}

export const fmtCmyk = c => `${c.c}/${c.m}/${c.y}/${c.k}`
