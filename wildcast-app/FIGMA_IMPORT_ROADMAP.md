# Figma Template Import — Roadmap

**Status:** Build steps 1–4 have a first pass written (2026-08-07). A CORS bug blocking the plugin's slot-list fetch was found and fixed 2026-08-13 (see "Open questions" below — the fallback that section anticipated). Step 5 (delete the old token path) is done as of 2026-08-13 — see the note below "To delete once the plugin ships." **The plugin still hasn't been run against a real Figma file end to end** — that's still the next real test, now with no fallback import method if it turns something up.

**Note (2026-08-07):** an earlier conversation this same week floated a simpler alternative — auto-fill the existing paste-a-URL Import screen's field from the plugin's current selection, reusing `api/import-figma-template.js` as-is, no port of zone-detection logic needed. That would work, but it does NOT solve either problem this doc exists to solve (token staleness, the crop-math bug class) — it's a faster-to-type version of the same REST+token flow, not a replacement of it. **The plan below (Plugin API-native, no token) is the one to build.** Flagging this explicitly so Monday doesn't start from the wrong doc.

**Why:** The current import (`api/import-figma-template.js` + `api/_lib/figma-import.js`) pulls
from Figma's REST API using a Personal Access Token stored in Vercel Blob. PATs expire every
few months, which has already broken background regeneration once (see STATUS.md). No one is
using the import tool yet, so there's no compatibility to preserve — replace it outright rather
than patching the token flow again.

**Decision:** Replace the server-side REST pull with a minimal Figma plugin. A plugin runs inside
Figma's own authenticated session, so there's no token to expire, rotate, or misconfigure — this
removes the failure class entirely rather than managing it better.

## What's built (2026-08-07) — untested against a real Figma file

A first pass of the whole pipeline exists, written without access to a real Figma master file
(no live Plugin API session available to test against from here) — **treat every property name
and the CORS assumption as needing a real test run, not confirmed fact.** Files:

- **`figma-plugin/manifest.json`, `code.js`, `ui.html`** — the plugin itself. `code.js` reads the
  selected frame, walks every descendant node, serializes the ones that matter (name, type,
  bounding box, and — for TEXT nodes — fontSize/fontFamily/fontWeight-as-a-style-NAME/
  textAlignHorizontal), exports the frame as a PNG via `node.exportAsync`, and POSTs all of it as
  JSON to the new endpoint. `ui.html` is just a slot dropdown (populated by fetching
  `/api/list-templates` and diffing against a hardcoded copy of `BASE_TEMPLATES` — see the comment
  in `code.js`, **must be kept in sync by hand** if the slot catalogue ever changes) + an Import
  button.
- **Deliberate change from the original plan below:** the plugin does NOT export at trim size
  directly. Figma's plugin sandbox has no image-processing library (no `sharp`, no Node APIs at
  all) — cropping has to happen somewhere with real image-manipulation capability. So the plugin
  exports the full bleed frame as-is (identical to what the REST path always did) and the crop
  happens server-side, same as before — just fed the PNG bytes directly instead of fetching them
  from Figma's images API. New shared `cropToTrim()` in `api/_lib/figma-import.js` — the REST
  path's own crop step was refactored to call it too, so there's one crop implementation, not two.
- **`api/_lib/figma-import.js`: new `toCanvasZoneFromPluginNode()`.** A twin of the existing
  `toCanvasZone()`, adapted for the plugin's raw JSON node shape instead of the REST API's shape —
  **the geometry/font math itself runs server-side, reusing `boxToZoneRect()`/`IMAGE_ZONE_CONFIG`/
  `ROTATED_TEXT_DEFAULTS` directly**, rather than porting that math into the plugin's own JS
  runtime (a second copy in a different environment risks a second, different bug). The plugin's
  only job is extracting raw node data and exporting the PNG; the backend does everything else,
  same as the REST path always has. Also new: `FONT_WEIGHT_NAME_MAP`/`weightFromStyleName()` —
  Plugin API text nodes give weight as a style NAME (`"Bold"`, `"SemiBold"`) via `node.fontName`,
  not a number the way REST's `node.style.fontWeight` does; unrecognized names fall back to 400
  rather than blocking the import. **Verified directly** (not just read-through): a Node script
  fed realistic mock plugin-node data through `toCanvasZoneFromPluginNode()` and confirmed all of
  — text zone font extraction, image zone config, the "marker box + separately-named real text
  sibling" fallback, weight-name mapping (Bold→700, SemiBold→600), and the no-text-anywhere
  rotated-default fallback — behave correctly (12/12 checks passed). `cropToTrim()` also verified
  directly against a real generated PNG (correct pixel dimensions after crop).
- **`api/import-figma-plugin.js`** — the new endpoint. Gated by `requirePluginKey()` (new, in
  `api/_lib/auth.js`) — checks a single header (`x-plugin-key`) against the `FIGMA_PLUGIN_KEY`
  Vercel env var. **Not the same as `requireAgencyKey`** — that's for a human with a WildCast
  activation key; this is a static service credential for a tool with no logged-in user at all,
  matching how the existing Wild CMYK plugin authenticates against its own backend. Writes the
  exact same draft record shape `api/import-figma-template.js` writes today, so
  `TemplateImportPage.jsx`'s review screen (zone position/size editor, overlay, publish flow)
  needs zero changes to work with plugin-created drafts.

**Still an open question, now more specifically scoped:** does `fetch()` from Figma plugin *main*
sandbox code (not the UI iframe) actually bypass browser CORS when the target domain is listed in
the manifest's `networkAccess.allowedDomains`? `code.js` is written assuming yes. If it turns out
no, the fallback is adding CORS headers to `api/import-figma-plugin.js` and `api/list-templates.js`
— a small, contained change, not a redesign. **This can only be confirmed by actually running the
plugin in Figma desktop** — first thing to check once it's loaded.

## Scope (deliberately minimal — MVP only)

- One button: select a frame in Figma, pick a target slot, click Import. No OAuth flow, no
  per-user auth — a single shared plugin key.
- Zone detection logic (`zone:<id>` naming convention, image vs. text zone rules) runs
  server-side against raw node data the plugin sends — see "What's built" above for why this
  ended up as reuse-via-raw-data-passthrough rather than a literal port of the REST functions.
- ~~Plugin exports the background PNG at trim size directly~~ — **changed during build**: exports
  the full bleed frame (plugin sandbox has no crop capability), same server-side crop as before,
  just fed bytes directly instead of fetched from Figma's images API. Still removes the token
  dependency, which was the actual point; the "double bleed" bug class was already fixed in the
  REST path months ago and stays fixed either way, since both paths now share one crop function.
- New WildCast endpoint (`api/import-figma-plugin.js`) accepts raw node data + PNG bytes + slot
  info from the plugin and writes the same draft record shape the current import writes today.
- Draft → review → publish flow (`live: false` until reviewed via `/api/publish-template`)
  stays exactly as-is — no change to that safety gate.

## Step 5 — deleted 2026-08-13, before the plugin had been tested against a real Figma file

Done ahead of the original plan's own caution ("don't touch until the plugin path is confirmed
working end to end") — Julia asked for it explicitly, aware that it removes the fallback import
method until the plugin's first real test happens.

- **Deleted:** `api/import-figma-template.js` whole file (`resolveFigmaToken()`, the token
  GET/PUT handlers, and the paste-a-URL POST import handler), the Blob-stored
  `config/figma-token.json` object (now orphaned, harmless), `requireAgencyKey()` in
  `api/_lib/auth.js` (its only caller), and the token-entry UI + paste-a-URL import form in
  `src/components/TemplateImportPage.jsx`. That page is now review-only: it lists drafts/live
  records the plugin created and reuses the exact same zone-overlay/editor/publish panel that
  used to only populate right after a same-page import.
- **Kept, deviating from the original plan below:** `figmaFetch()`, `parseFigmaUrl()`,
  `importFigmaTemplate()`, and `toCanvasZone()` (the REST-shaped original) in
  `api/_lib/figma-import.js` — turns out `scripts/import-figma-template.js`, a local CLI script
  still actively recommended (see `project_template_rules` memory) as a fallback for adding a
  template without going through the web app, depends on all four. Deleting them would have
  broken that script for no reason connected to what was actually asked (removing the *web app's*
  token dependency). `boxToZoneRect`, `IMAGE_ZONE_CONFIG`, `ROTATED_TEXT_DEFAULTS`, `cropToTrim`,
  `toCanvasZoneFromPluginNode` were always shared with/used only by the plugin path and are
  unaffected either way.

## Start here Monday — set up + first real test

1. **Add the `FIGMA_PLUGIN_KEY` Vercel env var** — same place `WILDCAST_KEYS` lives. Value must
   exactly match the constant at the top of `figma-plugin/code.js` (`PLUGIN_KEY`). **Redeploy
   after saving it** — same gotcha as `WILDCAST_KEYS` last time, Vercel env vars don't apply to
   already-deployed functions until the next deploy.
2. **Load the plugin in Figma desktop**: menu → Plugins → Development → Import plugin from
   manifest… → point at `wildcast-app/figma-plugin/manifest.json`.
3. **Open a real WildCast master file, select one bleed-size frame with real `zone:<id>` layers**,
   run the plugin, pick an empty slot, click Import. This is the real first test — nothing above
   has been run against live Figma data yet.
4. **Watch for, in rough order of likely failure point:**
   - Does the slot dropdown populate at all? (Tests: manifest's `networkAccess` is accepted by
     Figma, `code.js`'s `fetch` to `/api/list-templates` works from plugin sandbox code.)
   - Does clicking Import get past "Uploading to WildCast…" without an error? (Tests: the CORS
     assumption above, and that `x-plugin-key` matches.)
   - Once it reports success, open WildCast's Import/Designs review and check the zones actually
     landed in sane positions — this is where a wrong Plugin API property name would show up as a
     zone in the wrong place rather than a thrown error.
5. **Once that works**, move to deleting the token-based path (see "To delete once the plugin
   ships" above) — not before.

## Open questions — confirm during the first real test

- ~~The CORS assumption (see "What's built" above)~~ — **answered, 2026-08-13.** Main-thread
  `fetch()` does NOT bypass browser CORS in the Figma webview after all — Julia's first plugin
  load hit "Could not load slot list: Failed to fetch" exactly as this section predicted might
  happen. Fixed by adding `Access-Control-Allow-Origin` to `api/list-templates.js` and
  `api/import-figma-plugin.js`, plus explicit `OPTIONS` preflight handling on the latter (its
  POST carries a custom `x-plugin-key` header, which triggers a preflight). Confirmed live via
  `curl` against both endpoints after deploy.
- Do the real Figma masters' `zone:<id>` marker boxes tend to BE the styled text themselves, or
  a separate boundary box next to a plainly-named text layer (the "sibling" fallback path in
  `toCanvasZoneFromPluginNode`)? Both are handled, but knowing which is the common case in
  practice would help prioritize testing.
- This changes the workflow from "paste a Figma URL into a web page, from anywhere" to "open the
  Figma file and run the plugin from inside it, then switch to WildCast to review." Given someone
  already needs Figma file access to generate a working token today, this is probably a net
  improvement — but confirm it's still the workflow you want once you've actually used it once.
