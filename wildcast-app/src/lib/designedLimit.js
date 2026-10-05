// Character limit for a text field on a template imported from Figma.
//
// FieldEditor's global limits (offer 20, tc 140, ...) are sized for the built-in
// templates. A Figma import carries the copy the designer actually put in that
// zone (`zone.placeholder`, see api/_lib/figma-import.js), so a designed line
// that is longer than the global limit (e.g. a 70-character "Und so sicherst du
// dir ..." offer line) must not be cut off at 20 characters - the box was
// designed for it. Returns the longer designed length, or undefined when the
// global limit already covers it (built-in templates, which have no
// `zone.placeholder`, are unaffected).
export function designedCharLimit(zone, globalLimit) {
  const designed = typeof zone?.placeholder === 'string' ? zone.placeholder.toUpperCase().length : 0
  return designed > (globalLimit ?? 0) && globalLimit ? designed : undefined
}
