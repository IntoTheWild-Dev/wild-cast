// Shared sessionStorage cache patch, extracted 2026-09-24 from
// DesignsPage.jsx (built 2026-09-21 for a folder/owner-move bug: "the
// buttons work but it doesn't move it") since App.jsx's editor now needs
// the exact same fix for a different field.
//
// Every save writes the full project into sessionStorage under
// `wildcast_project_<id>` (App.jsx's doSave), and re-opening a design reads
// that copy FIRST, before the server. Any action that changes a project's
// server record WITHOUT going through doSave() - a folder move, a rename,
// or (App.jsx) an Approve/Request-changes status PATCH - has to patch this
// cached copy too, or re-opening that design in the same tab loads the
// stale pre-change value and its next autosave can write it straight back
// over the real change.
export function patchCachedProject(id, patch) {
  try {
    const key = `wildcast_project_${id}`
    const cached = sessionStorage.getItem(key)
    if (cached) sessionStorage.setItem(key, JSON.stringify({ ...JSON.parse(cached), ...patch }))
  } catch { /* storage unavailable or corrupt - the server copy is still right */ }
}
