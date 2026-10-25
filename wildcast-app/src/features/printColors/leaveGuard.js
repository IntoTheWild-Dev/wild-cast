// Print colours module: "Leave without saving?" for the app's own navigation
// (App.jsx calls confirmLeavePrintColors before leaving the screen). The page
// sets the flag; the browser's own tab-close warning is handled in the page.
import { showConfirm } from '../../lib/dialog'

let dirty = false

export function setPrintColorsDirty(value) {
  dirty = Boolean(value)
}

export async function confirmLeavePrintColors() {
  if (!dirty) return true
  const ok = await showConfirm('Your print colour changes will be lost.', { title: 'Leave without saving?', confirmLabel: 'Leave' })
  if (ok) dirty = false
  return ok
}
