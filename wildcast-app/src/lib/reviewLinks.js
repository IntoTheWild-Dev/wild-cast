import { activationHeaders } from './activationKey'

export function reviewHeaders(token) {
  return { ...activationHeaders(), ...(token ? { 'x-review-token': token } : {}) }
}
export async function createReviewLink(id) {
  const response = await fetch(`/api/save-project?reviewLink=${encodeURIComponent(id)}`, { headers: activationHeaders() })
  const result = await response.json()
  if (!response.ok || !result.token) throw new Error(result.error || 'Could not create a review link')
  return `${window.location.origin}/?review=${encodeURIComponent(id)}&access=${encodeURIComponent(result.token)}`
}
