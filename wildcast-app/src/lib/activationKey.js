// Attaches the signed-in activation key to a designer-only API call (see
// api/_lib/auth.js) - read straight from localStorage rather than threading
// `activation` through props, since these screens are only ever reachable
// already-activated.
export function activationHeaders() {
  return { 'X-Activation-Key': localStorage.getItem('wildcast_activation_key') || '' }
}
