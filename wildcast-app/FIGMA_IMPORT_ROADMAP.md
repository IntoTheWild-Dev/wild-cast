# Figma Template Import — Roadmap

**Status:** Not started. The pieces it depends on ARE ready (see "What's already in place" below) — no plugin code exists yet.

**Note (2026-08-07):** an earlier conversation this same week floated a simpler alternative — auto-fill the existing paste-a-URL Import screen's field from the plugin's current selection, reusing `api/import-figma-template.js` as-is, no port of zone-detection logic needed. That would work, but it does NOT solve either problem this doc exists to solve (token staleness, the crop-math bug class) — it's a faster-to-type version of the same REST+token flow, not a replacement of it. **The plan below (Plugin API-native, no token) is the one to build.** Flagging this explicitly so Monday doesn't start from the wrong doc.

**Why:** The current import (`api/import-figma-template.js` + `api/_lib/figma-import.js`) pulls
from Figma's REST API using a Personal Access Token stored in Vercel Blob. PATs expire every
few months, which has already broken background regeneration once (see STATUS.md). No one is
using the import tool yet, so there's no compatibility to preserve — replace it outright rather
than patching the token flow again.

**Decision:** Replace the server-side REST pull with a minimal Figma plugin. A plugin runs inside
Figma's own authenticated session, so there's no token to expire, rotate, or misconfigure — this
removes the failure class entirely rather than managing it better.

## What's already in place (2026-08-07)

Nothing plugin-specific has been built, but two things this plan depends on now exist:

- **A role tier to gate the new endpoint with.** `role:'agency'` (Wild Stack only) vs.
  `role:'designer'` (client-facing test keys — template management yes, Import no) already exists
  and is enforced both in the UI and server-side (`api/_lib/auth.js`'s `requireAgencyKey`/
  `requireDesignerKey`). The new plugin-upload endpoint (Build step 4 below) still needs its OWN
  check — `x-api-key` (a single shared secret baked into the plugin, matching the existing Wild
  CMYK plugin's pattern) is a better fit for a tool with no logged-in WildCast user at all than
  reusing the activation-key system. Don't reuse `requireAgencyKey` for it; it solves a different
  problem (a human with a WildCast key vs. a plugin with a service credential).
- **The review screen is now genuinely more capable than "stays exactly as-is."** Every zone
  (text AND image, e.g. Logo/Photo — previously invisible in review) now gets X/Y/Width/Height
  fields plus a live overlay drawn on the background preview, so a bad bounding box from a new
  import is something you catch and fix in the review step, not something that forces a re-import.
  This still applies unchanged under the plugin plan — the review step consumes whatever's in the
  draft record regardless of which endpoint created it.

**Likely non-issue, confirm when building:** CORS was a real open question for the *URL-paste*
alternative (a browser page calling our API cross-origin). Under this plan, if the plugin's upload
call happens from the plugin's main sandboxed code (not its UI iframe) with the target domain
listed in `manifest.json`'s `networkAccess.allowedDomains`, Figma's plugin runtime does not enforce
standard browser CORS the way a page load does — meaning the new endpoint may not need CORS
headers at all. Not verified against a real plugin yet; check this early in Build step 1, since it
changes whether Build step 4 needs any CORS work.

## Scope (deliberately minimal — MVP only)

- One command, one button: select a frame in Figma, click "Import to WildCast." No settings
  screen, no OAuth flow.
- Zone detection logic (`zone:<id>` naming convention, image vs. text zone rules) ports from
  `figma-import.js` to the Plugin API — same rules, read off the live node tree instead of
  Figma's REST JSON (property names differ slightly, e.g. `absoluteBoundingBox` vs
  `absoluteRenderBounds`).
- Plugin exports the background PNG at **trim size directly** (`node.exportAsync`), not
  bleed-inclusive + server-side crop. Removes the "double bleed" bug class described in
  STATUS.md entirely, since there's no crop math left to get wrong.
- One new WildCast endpoint accepts `{ zones JSON, PNG bytes, slotKey, label, cat, format }`
  directly from the plugin and writes the same draft record the current import writes today.
- Draft → review → publish flow (`live: false` until reviewed via `/api/publish-template`)
  stays exactly as-is — no change to that safety gate.

## To delete once the plugin ships

- `resolveFigmaToken()`, the Blob-stored `config/figma-token.json`, the token GET/PUT handlers
  in `api/import-figma-template.js`.
- The token entry UI in `src/components/TemplateImportPage.jsx`.
- `figmaFetch()`, `parseFigmaUrl()`, and the `/files/` + `/images/` REST calls in
  `api/_lib/figma-import.js` — the zone-computation logic (`collectZoneNodes`, `toCanvasZone`,
  `boxToZoneRect`) is what ports forward, not the fetching.

## Build steps — start here Monday

1. **New Figma plugin project** (`manifest.json` + sandbox code + minimal UI) — separate repo/
   folder from the existing Wild CMYK plugin (different audience: internal template import, not
   an end-user tool). First thing to actually check, before writing zone logic: confirm the
   CORS question above by making one throwaway `fetch()` call from plugin sandbox code to any
   WildCast API route and seeing whether it succeeds without CORS headers on our end. This
   answers whether step 4 needs CORS work at all.
2. **Port zone-detection logic** to Plugin API node shapes — `collectZoneNodes`, `toCanvasZone`,
   `boxToZoneRect` in `api/_lib/figma-import.js` are the functions to port; same `zone:<id>` rules,
   different property names off the live node (e.g. Plugin API's own bounding-box property, not
   `absoluteBoundingBox` from the REST JSON — check the exact name against Figma's current Plugin
   API docs, it's changed naming before).
3. **Wire `node.exportAsync`** for trim-size PNG export. Depends on the actual Figma master's node
   structure having a distinct trim-size node to export (not just an inferred inset from the bleed
   frame's edges) — check this against a real master file first; if no such node exists today,
   either add one to the Figma file convention or fall back to exporting the bleed frame and
   cropping (same math already in `figma-import.js`, just ported).
4. **New WildCast backend endpoint** — accepts `{ zones JSON, PNG bytes, slotKey, label, cat,
   format }`, gated by `x-api-key` (see "What's already in place" above — a service credential,
   not an activation key), writes the same draft record shape `api/import-figma-template.js`
   writes today so the review screen needs zero changes.
5. **Delete the token-based path** (see above) once the plugin path is confirmed working end to
   end — don't delete it before then, the current screen is still the only way to import until
   the plugin actually ships.

## Open question — confirm before/while building

This changes the workflow from "paste a Figma URL into a web page, from anywhere" to "open the
Figma file and run the plugin from inside it, then switch to WildCast to review." Given someone
already needs Figma file access to generate a working token today, this is probably a net
improvement — but it's a real workflow change, not just plumbing, and should be confirmed as
acceptable before/while building.
