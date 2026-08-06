# Figma Template Import — Roadmap

**Status:** Not started
**Why:** The current import (`api/import-figma-template.js` + `api/_lib/figma-import.js`) pulls
from Figma's REST API using a Personal Access Token stored in Vercel Blob. PATs expire every
few months, which has already broken background regeneration once (see STATUS.md). No one is
using the import tool yet, so there's no compatibility to preserve — replace it outright rather
than patching the token flow again.

**Decision:** Replace the server-side REST pull with a minimal Figma plugin. A plugin runs inside
Figma's own authenticated session, so there's no token to expire, rotate, or misconfigure — this
removes the failure class entirely rather than managing it better.

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

## Build steps

1. New Figma plugin project (`manifest.json` + sandbox code + minimal UI) — separate from the
   existing Wild CMYK plugin, since it's a different audience (internal template import, not an
   end-user tool).
2. Port zone-detection logic to Plugin API node shapes.
3. Wire `node.exportAsync` for trim-size PNG export.
4. New WildCast backend endpoint (with simple `x-api-key` auth, same pattern the Wild CMYK
   backend already uses) to receive the plugin's payload and write the draft record.
5. Delete the token-based path (see above) once the plugin path is confirmed working.

## Open question — confirm before/while building

This changes the workflow from "paste a Figma URL into a web page, from anywhere" to "open the
Figma file and run the plugin from inside it, then switch to WildCast to review." Given someone
already needs Figma file access to generate a working token today, this is probably a net
improvement — but it's a real workflow change, not just plumbing, and should be confirmed as
acceptable before/while building.
