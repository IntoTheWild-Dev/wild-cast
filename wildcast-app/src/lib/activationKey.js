// Attaches the signed-in identity to a designer-only API call (see
// api/_lib/auth.js) - read straight from localStorage rather than threading
// `activation` through props, since these screens are only ever reachable
// already-activated. Sends the shared activation key and/or the personal
// account's email + session token, whichever this browser has; the server
// accepts either.
export function activationHeaders() {
  const headers = { 'X-Activation-Key': localStorage.getItem('wildcast_activation_key') || '' }
  if (localStorage.getItem('wildcast_auth_type') === 'account') {
    headers['X-Account-Email'] = localStorage.getItem('wildcast_account_email') || ''
    headers['X-Account-Token'] = localStorage.getItem('wildcast_account_token') || ''
  }
  return headers
}
