// Ownership is public metadata; authentication credentials must never be IDs.
import { createHash } from 'node:crypto'
import process from 'node:process'

const configuredKeys = () => (process.env.WILDCAST_KEYS || '').split(',').map(row => row.trim().split('|')[0].trim()).filter(Boolean)
export function ownerId(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  const text = value.trim()
  const credential = configuredKeys().includes(text)
  if (!credential && /^key:[a-f0-9]{64}$/.test(text)) return text
  if (!credential && text.includes('@')) return text.toLowerCase()
  return 'key:' + createHash('sha256').update(text).digest('hex')
}
export function ownerRecord(record) {
  const ownerEmail = ownerId(record.ownerEmail)
  const ownerName = record.ownerName === record.ownerEmail && ownerEmail !== record.ownerEmail
    ? 'Shared account' : record.ownerName
  return { ...record, ownerEmail, ownerName }
}
export function legacyKeysFor(id) {
  return configuredKeys().filter(key => ownerId(key) === id)
}
