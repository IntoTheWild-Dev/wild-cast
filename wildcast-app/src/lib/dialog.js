// App-wide replacements for the browser's own alert() / confirm() / prompt()
// (Anang's ask, 2026-10-09: no native popups anywhere - they can't be styled
// and block the whole tab). Same idea as askRemoveBackground in
// removeBackground.js: AppDialog.jsx, mounted once in main.jsx, registers the
// opener below and draws every dialog in the Sign out popup's look.
//
//   await showAlert('Saved.', { title: 'Done' })
//   if (!(await showConfirm('Delete this design?', { confirmLabel: 'Delete' }))) return
//   const name = await showPrompt('New folder name')   // string, or null on Cancel
//
// All three return a Promise, so a caller that used to read window.confirm()
// synchronously has to await it (and be async itself).

let openDialog = null

export function setDialogOpener(fn) {
  openDialog = fn
}

function open(dialog) {
  // Only before AppDialog has mounted (never in practice) - resolve as if
  // dismissed rather than fall back to a native popup.
  if (!openDialog) return Promise.resolve(dialog.kind === 'confirm' ? false : null)
  return openDialog(dialog)
}

// opts: { title, confirmLabel }
export function showAlert(message, opts = {}) {
  return open({ kind: 'alert', message, ...opts })
}

// opts: { title, confirmLabel, cancelLabel } -> true / false
export function showConfirm(message, opts = {}) {
  return open({ kind: 'confirm', message, ...opts })
}

// opts: { title, defaultValue, placeholder, confirmLabel } -> trimmed string, or null
export function showPrompt(message, opts = {}) {
  return open({ kind: 'prompt', message, ...opts })
}
