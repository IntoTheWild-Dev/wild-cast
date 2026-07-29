# WildCast — Build Status

**Repo:** https://github.com/IntoTheWild-Dev/wild-cast  
**Live (Vercel):** auto-deploys on every push to `main`

---

## What's working right now

### Template Picker (redesigned 2026-06-30)
- **Two-level browse:** homepage shows group cards (e.g. "Restaurant Flyer · 5 designs"), clicking "View all →" drills into that group's option cards (A–E)
- **Search bar** at top of homepage — filters by format/category in real time
- **Headline:** "Design. Export. Print."
- 30 template slots total: 6 groups × 5 options (Restaurant + Retail × Flyer + Poster + Wild Poster)
- 2 live templates (Restaurant Flyer · Option A and Option B — both guided and designer modes)
- Coming soon tiles clearly labelled, greyed out with dashed border
- Group cards show live thumbnail, "X available" coral badge, "5 designs" count badge
- Options view shows "← All templates" back button, live count subtitle
- Mode picker modal on click: 4 options (Guided/Designer × Text-only/Text+Image)
- Category filter (Restaurant / Retail) and Format filter (Flyer / Poster · soon / Wild Poster · soon)

### Canvas Editor
- Fabric.js canvas with background PNG loaded from Vercel Blob
- Zoom via +/− magnifying glass buttons (no scroll wheel)
- Editable text zones: Headline, Sub-headline, Offer, T&Cs (rotated −90°)
- Per-field font size (− / + pt) and alignment (L / C / R) controls
- Drag to reposition text zones, drag right edge to reflow text width
- Per-field reset position (↺) + Reset layout button
- Pink (#FF3182) handles, Figma-style centre guide (drag only, hidden on export)
- Image upload: logo + food photo zones (Flyer 2), URL guard prevents interference
- **Guided mode:** teal "🔒 Guided mode · canvas locked" badge visible above canvas
- Image scale ±10% control in guided mode (appears after upload, 20–300%)
- clipPath on all images prevents bleed outside zone bounds
- **Zone boundary guides:** white dashed outlines on all zones (text + image), visible in both designer and guided mode, always hidden on export

### Field Editor (right panel)
- Numbered step layout for BOTH modes (same clean UI)
- Designer Mode: steps include font-size + alignment + reset controls
- Non-Designer (Guided) Mode: font-size ±pt controls on Headline, Sub-headline, Offer (not T&Cs); canvas locked
- Image upload zones with drag/drop style UI + scale control in guided mode
- AI Suggest buttons (mock copy, DE + EN)
- Language toggle DE / EN
- ICC Profile selector (FOGRA39, GRACoL, SWOP, Japan Color)
- **Export PDF** — CMYK PDF/X-4 via `/api/export-cmyk` (see below)
- **Send for Review** button — saves project + generates shareable link
- **Save button** — saves/re-saves project to Vercel Blob + localStorage registry

### Designs Tab
- Header nav: Templates · Designs · Help
- **Global** — every activation key sees every saved design (not per-browser), server-listed via `GET /api/save-project`
- "Find a design" popup (Format + Merchant dropdowns) gates the list before it renders; results grouped by format
- Opening a design (card click or "Continue editing") asks **"Edit original" or "Duplicate & edit a copy"** first — duplicating clones the full state under a new id so the source design is never overwritten
- Hover × delete button — deletes from Vercel Blob (project JSON + comments)
- Empty state with clear onboarding copy
- Projects stored in Vercel Blob (JSON, private) — no client-side registry

### Send for Review
- "Send for Review" button saves the project then shows a modal with a copyable share link
- Share link format: `wild-cast-psi.vercel.app/?review=<projectId>`
- Reviewer opens link → sees read-only flyer preview + comment panel
- Reviewer leaves name + comment → stored in Vercel Blob at `comments/<id>.json`
- Editor re-opens project from Designs → amber feedback panel appears on LEFT side of canvas
- Comments show reviewer name + date/time stamp
- Works across all 4 templates

### Export PDF (CMYK / PDF/X-4)
- "Export PDF" button sends the 4× canvas PNG to `/api/export-cmyk`
- Server resizes to **1311×1819px** (A6 + 3mm bleed at 300 DPI)
- Converts sRGB → FOGRA39 CMYK via `sharp` `.withIccProfile()` (ICC-aware, single-step conversion)
- Embeds **FOGRA39 (ISOcoated_v2_eci.icc)** — European print standard (ISO 12647-2:2004)
- Builds a **PDF/X-4** compliant document from scratch:
  - MediaBox: 111×154mm (314.6×436.5 pt) — full with bleed
  - TrimBox: 105×148mm (297.6×419.5 pt) — finished A6
  - BleedBox = MediaBox
  - OutputIntent: `/GTS_PDFIX` referencing embedded FOGRA39 ICC stream
  - ICC stream: FlateDecode compressed (1.8 MB → ~1.3 MB in PDF)
  - XMP metadata: `pdfx:GTS_PDFXVersion = PDF/X-4`, `pdfx:GTS_PDFXConformance = PDF/X-4`
  - Image: raw CMYK bytes (FlateDecode compressed) with `/ICCBased` colorspace referencing FOGRA39 — avoids CMYK JPEG APP14 byte-inversion bug
- Downloads as `<project-name>.pdf` (uses project name field)
- **Confirmed 2026-07-24, at Julia's request:** re-verified this whole chain end-to-end against the actual code (not just re-reading this doc) — the `.icc` file exists on disk and is a valid CMYK printer profile, `withIccProfile()` genuinely does the conversion, and the same profile is embedded in the output PDF both as the OutputIntent and as the image's real `/ICCBased` color space. FOGRA39 is the only profile ever used — the right-panel "ICC Profile" field previously showed a dropdown with GRACoL/SWOP/Japan Color options, but that `<select>` had no `value`/`onChange` at all, so picking a different option changed nothing (the export always used FOGRA39 regardless). Since the only client is Wolt DE (Germany), those other options were never relevant anyway — replaced the dead dropdown with a plain fixed "✓ FOGRA39 (European offset)" row so the UI doesn't imply a choice that was never real.

---

## All bugs fixed

| Bug | Fix |
|-----|-----|
| FUNCTION_PAYLOAD_TOO_LARGE on save | Client-side image compression (max 1500px, JPEG 82%) before sending |
| "Cannot use public access on a private store" | Changed `access: 'public'` → `access: 'private'` in save-project.js; added server-side load-project.js |
| "This blob already exists" on re-save | Added `allowOverwrite: true` to save-project.js and add-comment.js |
| Comments not visible on re-open | Fetch comments directly in handleOpenProject (not via useEffect) |
| Sub-headline font size resets on re-open | `loadKey` prop resets prevFieldsRef before auto-shrink comparison fires |
| Initial canvas shrink ignores saved font sizes | Shrink-to-fit pass now starts from `fontSizesRef.current` not `zone.fontSize` |
| T&C position + font size resets on re-open (designer) | Zone positions (left/top/width) saved in project JSON and restored on canvas init |
| Delete from Designs only cleared localStorage | Delete button now also calls `DELETE /api/delete-project` (removes project + comments from Blob) |
| **PDF colors completely wrong (near-black)** | CMYK JPEG carries an APP14 "Adobe" marker that inverts byte values (0=full ink); PDF viewers read it un-inverted, causing near-black. Fixed by converting to FOGRA39 CMYK via `withIccProfile`, extracting raw bytes, and compressing with FlateDecode — no JPEG encoding, no convention ambiguity. |
| **Sub-headline resets slightly on re-open** | Auto-shrunk font sizes were computed at runtime but never saved — only manual +/- overrides were persisted. On each re-open font-loading timing produced slightly different shrink results. Fixed by saving the canvas's actual displayed font sizes (`getEffectiveFontSizes()`) into the project JSON. |
| **Image scale (photo/logo) not restored on re-open** | `imageScales` effect ran before `fabric.Image.fromURL` callback completed, so `_wcBaseScale` wasn't set yet. Now applies saved scale immediately inside the image load callback. |
| Duplicate "Print settings" heading in right panel | Removed extra copy-paste heading from FieldEditor. |
| **Text left-aligned on re-open in guided mode** | Designs saved while in designer mode stored explicit `left` alignment values in the project JSON. On re-open in guided/non-designer mode (which has no alignment controls to correct it), those stale values overrode the template's `align: 'center'` zone config. Fixed by making `addZones()` and the alignment sync effect always use `zone.align` in non-designer mode, ignoring any saved alignment overrides. Also added `alignmentsRef` so the async canvas-init closure always reads the latest alignments. |
| **Canvas renders with wrong fonts on first production load** | `document.fonts.ready` only signals that `@font-face` declarations are parsed — the actual Omnes font files are not yet downloaded. On first production load (no cache), the canvas rendered with system fallback fonts, causing text to appear wrong and mis-sized. Fixed by adding `document.fonts.load()` calls for each Omnes weight used on the canvas; `addZones()` now only runs after the font files are confirmed downloaded. |
| **Re-saved project changes not reflected on re-open** | Three caching layers were all stacking: (1) browser cached `/api/load-project?url=...` since the URL never changed — fixed by adding `&_t=Date.now()` + `cache:'no-store'` to the browser fetch; (2) Vercel edge cached the API response — fixed by adding `Cache-Control: no-store` response headers in `load-project.js`; (3) Cloudflare CDN in front of Vercel Blob served stale blob content — fixed by appending `?_t=Date.now()` to the Blob URL inside the server-side fetch. Also added sessionStorage write-on-save / read-on-open to bypass the network entirely for same-session re-opens. |
| **Font sizes revert on project re-open (same template)** | `TemplateCanvas` received `loadKey` as a regular prop, not as a React `key`. Without `key={loadKey}`, the component never remounted when reopening the same template — the canvas init effect (which depends only on `[config]`) never re-ran because `TEMPLATE_ZONES[templateId]` is a constant reference. Stale Textbox objects from the first init kept their original font sizes. The `[fontSizes,config]` sync effect ran but fought the stale canvas state. Fixed by adding `key={loadKey}` to `<TemplateCanvas>` in App.jsx, forcing a full remount on every project open or template selection. |
| **Sub-headline (and other guided-mode zones) reverts to wrong size on re-open after manual size bump** | The locked-mode auto-shrink block in `addZones()` always re-ran from the saved font size as its starting point. If the user had manually bumped the size above what auto-shrink calculated (e.g., auto-shrink → 12pt, user bumped to 15pt, saved 15pt), the reload would start at 15pt, detect overflow (because 15pt was always too large), and shrink back to 12pt — silently undoing the user's manual change. The thumbnail captured at save showed 15pt; the canvas on reload showed 12pt. Fixed by skipping the shrink loop entirely when a saved font size exists — saved size is the source of truth. Auto-shrink from the zone default only runs on first-ever open of a fresh template with no saved state. |
| **Dead code cleanup** | Removed 4 files never imported anywhere: `PreviewCanvas.jsx`, `PdfThumbnail.jsx`, `src/lib/pdfSetup.js`, `api/generate-pdf.js` (legacy export route superseded by export-cmyk.js). Also uninstalled unused `pdfjs-dist` npm package. Build verified clean (27 modules, 0 errors). |
| **Print test (2026-07-13): frame cut off, no real bleed** | `export-cmyk.js` stretched the trim-size canvas render (`fit:'fill'`) across the *entire* bleed-inclusive page, pushing edge content — including the frame border — outward past the TrimBox line. The physical printer then trimmed 3mm off each side per the TrimBox and sliced the frame off. Fixed by resizing to the true trim pixel size (1241×1749px, no distortion) and using `sharp`'s `.extend({..., extendWith: 'mirror'})` to add a genuine 35px (3mm) bleed margin by mirroring the trim-edge pixels outward — all design content now stays registered exactly at the trim line. Verified locally that output dimensions land exactly at 1311×1819px. Not yet re-verified against an actual physical print run. |
| **Logo Position nudge did nothing on any template (2026-07-24)** | `clampOffset()` computed slack as `Math.max(0, (scaledDim - zoneDim)/2)` — correct for cover-fit photos (which always overflow the zone) but always zero for contain-fit logos, which fit *inside* the zone at 100% scale (underflow, not overflow). Fixed by using `Math.abs(scaledDim - zoneDim)/2`, which gives real slack in the letterboxed axis for contain-fit images too. Verified in-browser (designer + guided mode, both templates) via synthetic test images injected through React fiber + pixel-level canvas sampling — nudge now moves the image exactly the expected 4px per click, still correctly clamped to 0 on any axis with zero slack. |
| **Option A: restaurant name not inline with baked "♥ WOLT" (2026-07-24)** | Pixel-scanned the live canvas: `restaurant_name`'s own baseline sat 4px above the baked wordmark's baseline. Nudged `WEN_CHENG_V3_ZONES.restaurant_name.y` from 149→153. Verified: both baselines now land on the same canvas row. |
| **Option B: food photo couldn't overlap the headline (2026-07-24)** | Photo zone had no `overlapAbove`, and even after adding it, the z-order fix silently no-op'd due to a scoping bug — the effect referenced a bare `zones` variable that doesn't exist in that closure (only `config` does), throwing a swallowed `ReferenceError` inside the async image-load callback. Fixed the reference (`config.zones`) and made the reorder idempotent across zones/async load order (previously only the *current* zone's overlap image got re-fronted, so re-uploading e.g. the logo after the photo would silently un-overlap it). Verified via solid-color test image injected through React fiber — photo now renders continuously on top of the entire headline zone. |
| **Option B: CTA size was 11pt, spec calls for 10pt (2026-07-24)** | `OPT_B_ZONES.cta.fontSize` 11→10 (already correct Omnes Pro Semibold 600). |
| **Position nudge "stops working after ~3 attempts" (2026-07-24)** | Reproduced live, not just theorized: the clamp that prevents an image from being nudged far enough to reveal empty background is working exactly as intended, but for a near-exact-fit logo the total available range can be as little as ~8px — 2 clicks at 4px each — with zero visual feedback when you hit it. Not a logic bug; a missing-feedback UX problem. Added a plain-language hint under the Position control ("bump Scale up first for more room to nudge"). |
| **Scale steps looked like arbitrary numbers (2026-07-24)** | Steps were 10% from a 100% base, which is clean, but Julia wanted finer 5%-increments (70/75/80…) — changed the step size and disabled +/- at the 20%/300% hard bounds instead of leaving them silently inert there. |
| **No visual trim-line indicator in the editor (2026-07-24)** | The canvas only ever renders the trim-size art (bleed is added later at export, by mirroring the trim edge outward) — there was no marker at all for where the physical cut line sits. Added a thin red rect around the canvas perimeter, hidden on export like the other guides. |
| **Export frame looked bigger/different than the Figma master — first pass (2026-07-24)** | Initial investigation concluded the export was correctly sized and the extra margin was just the real 3mm bleed. **This was wrong/incomplete** — see the follow-up row below, which found and fixed the real cause after Julia pushed back with an actual InDesign-vs-WildCast side-by-side. The one genuine (if minor, ~1%) thing fixed in this pass stands: the editor canvas (316×441px) is ~1% off true A6's 105:148 ratio, so export's `fit:'fill'` resize was stretching every element slightly non-uniformly — switched to `fit:'cover'`. |
| **Export frame really was too small — real root cause found (2026-07-24)** | Measured precisely against Figma's own screenshot API (not a screenshot comparison by eye): the Figma master's teal-box margin is 6.35%/4.58% of the full bleed frame; a freshly-generated WildCast export measured 8.38%/6.37% — both numbers land almost exactly on "correct margin + one extra 3mm bleed." **Root cause:** `api/_lib/figma-import.js` exported Figma's FULL bleed frame (111×154mm) as the background PNG, but every zone coordinate — and the whole editor/export pipeline — treats that background as trim-only (105×148mm, no bleed). So every imported background carried an extra ~3mm margin the zone math didn't know about, and export-cmyk.js's own mirror-bleed-extend added a SECOND 3mm on top: effectively double bleed, silently shrinking every design ~4-6% smaller than the true master. Fixed by cropping the fetched image by the bleed margin (scaled to the export's pixel scale) before returning it, so the saved background genuinely is trim-only. Fixes every *future* import — does **not** retroactively fix the already-live Option A/B backgrounds, which are static files baked by the old buggy code; regenerating them needs a working Figma token (Claude's local one expired, same issue Julia hit) — flagged to Julia to provide one. |
| **Published import "nothing appears anywhere" (2026-07-24)** | Two real, previously-flagged-but-never-exercised bugs, both confirmed and fixed: (1) `api/list-templates.js`/`api/publish-template.js` read the record blob with no cache-busting — the same Cloudflare-CDN-staleness bug already hit and fixed for save/load-project, just never ported here, so a publish could flip `live:true` while the next list-templates read still served the stale pre-publish version. Fixed with the same proven pattern (timestamped blob reads, no-store response headers, no-store client fetch). (2) The background is a private Blob URL used directly in `<img src>`/`fabric.Image.fromURL` with no proxy — confirmed directly in Julia's own screenshot (the draft-review card showed no image at all). Added a `?url=` proxy branch to `list-templates.js` (same pattern as `library-assets.js`) via a new `templateAssetSrc()` helper, applied to the catalogue thumbnail, canvas background, and draft-review preview. Verified against Julia's real existing draft on production: proxy now correctly returns the real PNG (200, image/png). |
| **Draft/publish flow wasn't reassuring enough (2026-07-24)** | The existing "Draft" badge + Publish button were easy to miss (especially with the background not rendering, per the bug above — the whole card looked broken). Added an explicit pop-up right after import: "Saved as a draft — not visible to partners yet," with a clear **Keep as draft** / **Publish now** choice. |
| **No real bleed margin shown in the editor (2026-07-24)** | The earlier red trim-line guide marked the trim edge but showed nothing beyond it — Julia asked for exactly what the Figma master shows: a visible bleed margin around the trim line. Wrapped the canvas in a CSS-only bleed margin (9px ≈ 3mm at canvas scale) with a solid outer border and white background, dashed trim line sitting just inside it — purely a visual wrapper outside the actual `<canvas>`, zero change to canvasW/canvasH or any zone coordinate. |

---

## Figma import pipeline (new 2026-07-13)

Real templates can now be pulled straight out of Figma instead of manually pixel-scanning exported PNGs.

- **`wildcast-app/scripts/import-figma-template.js`** — run with `node --env-file=.env.local scripts/import-figma-template.js <figma-frame-url> <output-name>`. Fetches node geometry via Figma's REST API (`/v1/files/:key/nodes`) and a print-resolution background export (`/v1/images/:key?scale=4` — Figma caps image export at 4x/288 DPI server-side, just under the 300 DPI target but print-fine) via the same API. Outputs a background PNG into `public/templates/` and a ready-to-paste zone array into `scripts/*-zones.generated.js` (gitignored — copy the values into `templateZones.js` by hand).
- **Convention the script depends on:** any Figma node meant to become an editable WildCast zone must be named `zone:<id>` (e.g. `zone:headline`, `zone:logo`, `zone:photo`, `zone:cta`). Nodes named `zone:logo`/`zone:photo` become image zones (fit contain/cover); everything else becomes a text zone, with real font family/size/weight read automatically **only when the zone marker itself is a text node** — a placeholder shape (rectangle) gives correct position/size but no font data, which then needs manual completion.
- **Master template requirement:** the target Figma frame must be the bleed-size master (111×154mm @ 3mm bleed), with guide/placeholder layers set to `visible: false` as their *permanent resting state* in the file — the image export renders whatever is currently visible in the saved file, there's no way to toggle visibility live via the REST API the way the interactive Figma plugin can.
- **Needs a Figma personal access token** — each person who runs the script generates their own (Figma Settings → Security → Personal access tokens → scope `file_content:read` only), saved in `wildcast-app/.env.local` (`FIGMA_TOKEN=...`, gitignored, never shared).
- **First two templates brought in through this pipeline (2026-07-13):**
  - **Option A (Wen Cheng)** upgraded in place — real bleed-corrected background + script-derived zone positions, same template IDs as before. Caught and fixed a real regression risk during this: the Figma master still had "WEN CHENG" baked in as static text, which would have undone the already-shipped per-partner editable restaurant name feature. Masked it out and added a proper `zone:restaurant_name` marker instead. Also fixed sub_headline/headline/offer zones overlapping each other by 15–23px — the first pass used the raw text nodes' own bounding boxes (which reflect placeholder-text render height, not designed spacing) instead of their dedicated non-overlapping guide rectangles, same pattern already used correctly for logo/photo.
  - **Option B replaced entirely** with a McDonald's Q4 Koblenz-based flyer — the first template built through the new pipeline from scratch. The line naming McDonald's specifically was masked out of the background art and replaced with a free-text `cta` zone so any partner can fill in their own line.
- **Known Figma quirk hit during this work:** a cloned decorative vector (30pt white stroke, used for a card border effect) rendered with its stroke missing in one specific clone despite every measurable property (position, fill, stroke, z-order) being byte-identical to a working clone of the same source vector elsewhere in the file. Root cause not identified even after extensive diagnostic comparison — worked around by falling back to the simpler background construction (inset colored rect + white base fill) that was already proven reliable, rather than keep chasing it.
- **✅ Superseded (2026-07-13, same day) by a self-serve in-app import** — see below. The CLI script above still works and is what the in-app feature is built on top of, but you no longer need to run it by hand for a new template.

---

## Self-serve Figma import (new 2026-07-13)

The manual script above now has a real in-app front end — paste a Figma link into WildCast itself, no code edit or redeploy needed to bring in a new template.

- **How it works:** an "Import" nav item (visible only to `role:designer` activation keys) opens a form — Figma frame URL + target catalogue slot (any currently "coming soon" slot, e.g. "Restaurant Flyer · Option C"). Submitting calls `POST /api/import-figma-template`, which pulls zones + a real bleed background from Figma (same logic as the CLI script, now shared via `api/_lib/figma-import.js`) and saves both to Vercel Blob under `templates/<slotKey>.json` / `templates/<slotKey>-bg.png`.
- **Draft-first, always.** An import never goes live automatically — it lands with `live:false`. The designer reviews the result (background + zone list) in the same screen, then clicks **Publish** (`POST /api/publish-template`) to make it real. This is deliberate: a bad import can never surface to a real partner without a human choosing to publish it.
- **Templates stay hybrid, not fully migrated.** Option A and B are still hardcoded in `templateZones.js`/`templates.js` exactly as before — untouched, zero migration risk. Only *new* imports go through Blob, and they can only fill *empty* catalogue slots (`BASE_TEMPLATES` in `TemplatePicker.jsx` — the 30-slot skeleton never changes, just which slots have real data). `App.jsx` fetches `/api/list-templates` once on load and merges the result with the static templates; if that fetch fails for any reason, the app just falls back to the static templates silently.
- **New role field on `WILDCAST_KEYS`** — see Activation key system below. Defaults to `partner` so every existing key keeps working with zero changes.
- **Figma token is now managed in-app, not just a Vercel env var (2026-07-24)** — see the dedicated section below. `FIGMA_TOKEN` (Vercel env var) still works as a fallback for a brand-new deploy that's never had a token set via the app.
- **✅ 2026-07-24: real end-to-end test happened** (Julia imported + attempted to publish a real "Restaurant Flyer · Option C" draft) and found two real bugs — see the "Published import 'nothing appears anywhere'" bug-table row above. Both fixed and confirmed against her actual production draft.
- **✅ 2026-07-20 live check:** confirmed via the deployed JS bundle that all of the above code (import route, list/publish/delete routes, `restaurant_name` zone, v3 backgrounds) is genuinely live in production — Vercel auto-deploy from GitHub is working correctly. The "Import" nav item is still invisible on the live site because the `role` field has never actually been added to `WILDCAST_KEYS` in Vercel (confirmed by logging in live with `WILD-Demo-KEY` — nav shows Templates/Library/Designs/Help, no Import). This is a one-time Vercel dashboard edit, not a code issue — see Activation key system below.
- **Key files:** `api/_lib/figma-import.js` (shared extraction logic), `api/import-figma-template.js` / `api/list-templates.js` / `api/publish-template.js` / `api/delete-template.js`, `src/lib/customTemplates.js` (static+dynamic merge), `src/components/TemplateImportPage.jsx`.
- **✅ Fixed 2026-07-24** (was flagged 2026-07-21 as a likely latent bug): `backgroundUrl` was a raw private Blob URL used directly in `fabric.Image.fromURL`/`<img src>` — confirmed broken the first time a real import actually went through (Julia's draft-review card showed no image). Fixed via a `?url=` proxy on `api/list-templates.js` + `templateAssetSrc()` helper in `src/lib/customTemplates.js`, same pattern as `api/library-assets.js` below.
- **⚠️ New, related, not yet fixed:** the background PNG itself was also found to carry an extra ~3mm of unaccounted bleed margin (see "Export frame really was too small" in the bug table above) — fixed in `api/_lib/figma-import.js` for all *future* imports, but Option A/B's already-live static backgrounds still have the old, incorrect margin baked in. Needs a working Figma token to regenerate them via `scripts/import-figma-template.js`.

### Real end-to-end import test on "Restaurant Flyer · Option C" surfaced 4 real bugs (2026-07-28)

Julia's first real (non-Option A/B) import went through the whole pipeline for the first time — surfaced problems the earlier "coming soon" testing never exercised, since Option C is the first template with placeholder-shape zone markers, a separate real-text sibling layer, and a rotated fine-print zone.

- **Canvas stuck on "Loading canvas..." forever, no error shown.** Root cause, confirmed via a live JS stack trace (reproduced in-browser, not guessed): a zone whose Figma marker wasn't itself live text (`_needsFontReview`) saved `fontFamily: null` — Fabric's Textbox throws constructing/measuring text with a null fontFamily ("Cannot read properties of null (reading 'toLowerCase')" deep in its font-cache code), an uncaught exception mid-loop in `TemplateCanvas.jsx`'s `addZones()`, so `setLoading(false)` at the end of that function never ran. Fixed with real fallback values (`fontFamily: 'omnes-cond'`, `fontSize: 24`) instead of null, both at the point of use and at the source in `figma-import.js`.
- **Headline/Sub-headline position and font completely wrong.** Root cause, found by reading the real Figma file's layer data directly (`mcp__Figma__get_metadata`): Julia's file has `zone:headline`/`zone:sub_headline` as separate position-only marker boxes, with the actual styled text sitting in plain-named sibling layers (`headline`/`sub_headline`, no "zone:" prefix) that don't share the marker's exact box. `toCanvasZone()` only ever read geometry+style from the `zone:<id>` node itself. Now searches the whole frame for a plain-named TEXT layer matching the zone id when the marker itself isn't text, and uses that layer's real box + style instead — a normal, valid Figma workflow (separate boundary marker + actual content) the importer previously couldn't handle.
- **T&Cs never rotated — a gap in the pipeline, not this file specifically.** `tc` has no live text anywhere in this Figma file to sample from at all, but by app-wide convention (confirmed against Option A) it's always the narrow rotated fine-print sidebar. The importer had never captured rotation from Figma at all. Added a small `ROTATED_TEXT_DEFAULTS` table (currently just `tc`) that sets `rotate: -90` + a matching `textWidth` even with zero live text to go on.
- **Every imported heading rendered ~5% larger than its real Figma size.** `fontSize` was being multiplied by the same `scaleY` factor used for position/dimensions (~1.05 for this file) — correct for spatial coordinates, which genuinely need remapping from Figma's frame space into the fixed 316×441 canvas space, but wrong for a font's point size, which should read the same as what a designer sees directly in Figma's own text panel. Caught by comparing Julia's exact spec (headline 51 / sub-headline 35) against the imported 54 / 37 — precisely the scaleY-multiplied values once rounded, not a coincidence. `fontSize` is no longer scaled at all now.
- All four fixed and reverified live against Julia's real draft (re-imported after each fix, not just claimed) — confirmed via `GET /api/list-templates` showing the corrected zone JSON, and by opening the actual canvas via a direct React-fiber `onSelect` call (no UI workaround needed) to visually confirm rendering.
- **Also found and fixed in the same investigation:** the in-app "Update token" flow had the exact same Cloudflare-CDN staleness bug already hit and fixed elsewhere in this file (`list-templates.js`, `publish-template.js`) — a freshly-saved Figma token could still read back the old cached value on the very next import. `resolveFigmaToken()` in `api/import-figma-template.js` now cache-busts the same way.

### Designs go global + categorized, Import list organized by group (2026-07-29)

- **Designs were never actually global** — confirmed by reading the code, not assuming: the list of "which designs exist" lived entirely in a per-browser `localStorage` registry. Even though each design's content was already saved server-side, nobody but whoever saved it, on that exact browser, ever knew it existed. Julia confirmed this should change (over keeping Designs per-browser but better organized).
- **`api/save-project.js` gains a GET (list) handler** alongside the existing POST (save) — still 12 total function files. Lists every saved project straight from Blob, computing a `merchant` tag server-side (real restaurant name if the template has one, else the project's own name).
- **`DesignsPage.jsx` rewritten**: fetches the global list; derives each design's format (Restaurant Flyer, Retail Poster, etc.) from the same `cat`/`format` fields every template card already carries — no new data needed on a saved project itself. Shows a **"Find a design" popup** (Format + Merchant dropdowns, both default to "All") before any design renders — Julia's ask for a structured pre-filter gate rather than just an inline search box — then groups results by format below it, with a "Filters" button to reopen and adjust. Verified live: the popup correctly listed real merchants from 14 existing saved designs, and grouped them correctly after applying.
- Removed the now-dead `localStorage` write in `App.jsx`'s save flow (the separate `sessionStorage` same-session-reopen cache is untouched).
- **`TemplateImportPage.jsx`'s "Previously imported" list is now grouped into collapsible sections** by category + format (same grouping Templates already uses), instead of one flat list that would only get harder to scan as more templates get imported.
- **Reverted same day, per Julia's own follow-up call**: archived templates stay visible with the "Archived" label + Restore action right on the Templates catalogue page (not hidden, and not exclusively on the Import screen as briefly tried) — she tried both and preferred having it in both places.

### Duplicate-or-edit-original safety net for Designs (2026-07-29)

- **Risk surfaced by going global**: once every activation key can see and open every saved design, there's no ownership boundary — anyone can open, edit, and overwrite anyone else's saved work. Julia's fix: ask first.
- Opening a design from the Designs tab (card click or "Continue editing") now shows a popup: **"Edit original"** (unchanged behaviour — opens and, on next Save, overwrites that exact record) or **"Duplicate & edit a copy"** (clones the full saved state under a brand-new id, saves the clone immediately as its own independent record, then opens the *copy* — the original is never touched).
- `App.jsx`: `handleOpenProject` split into `loadFullProject` (sessionStorage-then-fetch) + `openLoadedProject` (populate editor state), so both the original-opening path and the new `handleDuplicateProject` path share one implementation instead of two copies of the same logic.
- No new API route — the duplicate is created with the same `POST /api/save-project` every regular Save already uses, just called immediately with a cloned payload.

### Option D test found 3 more real bugs, then a deploy incident briefly took production down (2026-07-28)

- **Publish/Archive looked like it needed 2-3 clicks.** Real cause: every action handler refetched to show the new status, but that refetch reads through the same Vercel Blob `list()` consistency lag noted above — the first click's refetch could still show the pre-action status. Fixed by applying each action's own response (already known-good) straight to local state instead of waiting on a refetch that might lag behind.
- **T&Cs auto-shrink was completely disabled for any rotated zone**, on every template including Option A/B — masked until now because their content happened to already fit. A rotated zone's pre-rotation height becomes the visual *thickness* once drawn at -90°, so the fit check needs `zone.width`, not `zone.height`. Fixed properly instead of skipping rotated zones.
- **No way to preview a draft before publishing it** — the catalogue's draft tile had no click handler at all. Designer-role users can now click a draft tile to open it in the normal editor, same as a live card; still invisible to non-designer users.
- **A real archived custom template had no way back — its own menu still showed Publish/Archive instead of Restore.** The archived-check only applied to the hardcoded Option A/B override records, not real archived Figma imports. Fixed to check `archived` first, unconditionally.
- **Deploy incident (self-inflicted, disclosed plainly):** while investigating why a push seemed stuck, a stale local Vercel project link (silently pointing at an unrelated, unconfigured project of the same name) led to a manual deploy that briefly took the real site down — `/api/validate-key` and other routes 404ing — for a couple of minutes before being caught and reverted. Root cause and full account in this session's Claude memory (`project_vercel_deploy_safety`). Every push before and after this deployed correctly via the normal automatic git-push flow; this was not a recurring platform problem.
- All fixes verified live post-deploy via direct DOM/API inspection.

### Making imports more self-correcting (added 2026-07-28)

Julia asked for a way to "pin down" the kind of pixel-level corrections above without needing a code change + chat round-trip every time, plus two QR-specific asks (auto-fit, merchant tagging).

- **"Zone settings" review panel** — `TemplateImportPage.jsx`'s result panel (shown right after a fresh import) now lists every text zone with an editable font-size input and a "Rotate 90°" checkbox, saved via a new `updateZones` action on `api/publish-template.js` (full zones-array replacement, no new function file needed — still 12 total). A designer can now fix a font size or flip a rotation immediately after import, no code change or redeploy required. Scoped to the just-imported record only (tied to the transient import result, not re-openable later for an older draft — re-import again if needed, which is safe/idempotent).
- **QR auto-crop on upload** — many QR generators export with a big white "quiet zone" margin baked into the file, which showed as visible gaps around the code even though contain-fit/scale/position were all working correctly. `src/lib/image.js`'s new `cropToContent()` scans a downsampled copy of any QR upload for the tightest bounding box of non-white/non-transparent content and crops to it before placing — partners never need to manually crop or resize their own QR export.
- **Merchant tagging fallback for templates without `restaurant_name`** — previously always landed in a generic "General" folder when a template had no restaurant-name field to key off (e.g. Option C). Now falls back to the Project Name field instead, still zero extra clicks for the partner.
- **Real gotcha hit while testing `updateZones`:** rapid back-to-back writes to the exact same blob key (import → save → save again, all within under a minute) can take up to ~30s for a subsequent `list()`-based read to reflect the latest write — a genuine Vercel Blob storage-consistency characteristic, not a caching bug the existing `_t=` cache-busting can solve (that only defeats Cloudflare's CDN layer, not backend replication lag). Confirmed self-resolving (not a data-loss bug) via a direct curl-only repro with no browser involved. Not a concern for normal one-edit-then-move-on usage — only surfaced under stress-testing rapid successive saves.

### Archive a template + safer re-import (added 2026-07-28)

Julia asked for a way to archive an imported template, while separately noting an existing draft ("Restaurant Flyer · Option C", imported the day before) needed re-importing. Investigating surfaced a real gap alongside the explicit ask: `TemplateImportPage.jsx`'s target-slot dropdown read emptiness off `BASE_TEMPLATES`' own static `live:false` — which never changes for a custom slot — so a slot that had already been published via a custom record would still show up as a valid import target, risking an accidental overwrite of something partners currently see. Fixed as part of this feature, not left for later.

- **`api/publish-template.js` is now action-based** (still one file, no new function slot needed): `POST {slotKey, action}` where `action` is `publish` (→ live), `unpublish` (→ back to draft, still publishable), `archive` (→ hidden everywhere, frees the slot for a fresh import), or `restore` (→ back to draft, does *not* auto-publish).
- **`archived` is a real field now**, threaded through `src/lib/customTemplates.js`'s `customTemplateCards()` and checked in `TemplatePicker.jsx`'s `overlayCustomCards()` — an archived record renders exactly as if the slot had never been imported into, both in the catalogue and hero briefing flow.
- **`TemplateImportPage.jsx`'s target-slot dropdown now excludes any slot with a currently-*live* custom record** (draft and archived slots stay valid re-import targets — re-importing over an unpublished draft, like Option C, or a previously-archived slot, just overwrites it, exactly as before).
- **"Previously imported" list rebuilt** with a real three-state badge (Live / Draft / Archived) and per-record action buttons (Publish, Unpublish, Archive, Restore) — previously this list was read-only with no way to act on a past import at all.
- Archiving a currently-*live* record asks for an inline confirmation first (it's immediately partner-visible-to-invisible) — restoring never auto-publishes, so getting a slot back is always a deliberate second step.
- **On-card manage menu (same day, follow-up).** Julia found the Import screen's list wasn't where she wanted to manage things from — she's naturally browsing the Templates catalogue when she notices something's wrong with a specific card. Added a designer-only "⋯" menu directly on each Figma-imported card in `TemplatePicker.jsx`'s `OptionsView` (Publish/Unpublish/Archive), gated on `activation.role === 'designer'` (threaded via a new `canManage` prop from `App.jsx`). Draft (unpublished) custom records also now render distinctly — "Draft — not published" with a coral dashed border — instead of being indistinguishable from a truly-empty "Coming soon" slot, which was itself a real gap (no way to visually tell the two apart before this).
- Verified live: `GET /api/list-templates` on the deployed app confirmed the "Restaurant Flyer · Option C" record correctly reached `{live:false, archived:true}` after Julia used the feature herself.

### Figma access token — now managed in-app (2026-07-24)

Julia hit a real `403 Token expired` from the Figma API even though her token (visible in Figma's own settings) wasn't actually expired yet — the real problem was that Vercel's `FIGMA_TOKEN` env var held an *old* token value that no longer matched her current one, and fixing that meant a Vercel dashboard visit + redeploy. Since these tokens expire every few months, that dependency on a developer was the actual complaint.

- `api/import-figma-template.js` (already at the 12-function limit, so no new file) gained `GET` (returns `{configured, source, updatedAt}` — never the token value itself) and `PUT` (saves a new token) handlers alongside the existing `POST` import handler.
- Token is stored in Vercel Blob (`config/figma-token.json`, private) via a shared `resolveFigmaToken()` helper — checked first on every import, falling back to the `FIGMA_TOKEN` env var only if nothing's ever been saved to Blob yet. A brand-new deploy still works via the env var exactly as before; setting a token in-app just takes over from there.
- New "Figma access token" panel at the top of the Import screen (`TemplateImportPage.jsx`) shows configured/not-configured + last-updated date, with a password-masked field to set or replace it — no code, no redeploy, no Vercel dashboard needed going forward.

---

## Asset library (rebuilt 2026-07-21 — Vercel Blob, not localStorage)

The library used to be 100% client-side localStorage, capped at 800px per image to fit the ~5-10MB browser storage ceiling — fine for browsing thumbnails, but meant anything reused from the library was well below print resolution, and the library was siloed per-browser. Rebuilt on Vercel Blob (Julia's choice, over keeping it browser-only) — same architecture as saved projects/templates.

- **One route, `api/library-assets.js`**, dispatched by HTTP method: `GET` (no query) lists everything, `GET ?url=<blobUrl>` proxies a single private blob's bytes to the browser, `POST` uploads, `DELETE ?url=<blobUrl>` removes. All three original separate files got merged into this one — see the function-count gotcha below.
- **Data model:** no metadata JSON per asset — folder + display name are encoded directly in the blob's pathname (`library/<folder>/<uuid>__<name>.<ext>`), `uploadedAt` comes from Blob's own list() metadata.
- **Frontend:** `src/lib/assetLibrary.js`'s `getLibraryAssets`/`saveAssetToLibrary`/`deleteLibraryAsset` are now async (fetch-based). Every asset gets a `.src` field (the proxied path) — always use `.src` for rendering/pixel-reads, `.url` (the raw private blob URL) only for delete.
- **Direct upload UI added to the Library page itself** (previously the only way in was auto-save from inside a template editor) — four buttons now (logo / product photo / sticker-badge / QR code), same `hasTransparency()` check the canvas already enforces per zone type, plus a resolution badge per asset (general ≥1200px-on-the-long-side heuristic, since there's no specific print zone to check against on this page).
- **Rename support (2026-07-21)** — click an asset's name on the Library page to rename it in place. No in-place rename in Vercel Blob, so this `copy()`s to a new pathname (same folder/id, new name) then `del()`s the old one — folded into `api/library-assets.js` as a `PATCH` to avoid a new function file. Added because several QR codes look visually identical and are otherwise impossible to tell apart.
  - **Gotcha hit + fixed:** the sanitization regex used when building the blob pathname (`name.replace(/[^a-zA-Z0-9._-]/g, '_')`) stripped spaces, so a rename to "Munich Store QR" round-tripped as "Munich_Store_QR" on the next list refresh (display name is derived from the pathname, not stored separately) — defeats the point of a human-readable rename. Relaxed to only strip characters genuinely unsafe in a URL path segment (`/ \ ? % * : | " < >`), spaces and most punctuation now survive.
- **Known limitation:** old localStorage-saved assets do not migrate automatically — different storage system. Acceptable given this is still early/low-volume usage, not real client data.
- **⚠️ Two real Vercel gotchas hit and fixed while building this — worth knowing before adding any future `api/*.js` file:**
  1. **Serverless function count limit.** This project's Vercel plan caps a deployment at 12 functions. Adding 3 new one-per-route files (15 total) made the deploy **fail silently** — build logs look clean, it just dies right after "Deploying outputs..." with no code-level error anywhere in the CLI. Only found via `gh api repos/.../commits/<sha>/status` + `vercel inspect <deployment-id> --logs`. **Before adding a new API file, run `ls api/*.js | wc -l` — if already near 12, merge into an existing file (dispatch by `req.method`) instead.**
  2. **The Blob store is private-access-only.** `put(..., {access:'public'})` is flatly rejected: `"Cannot use public access on a private store."` Any binary asset needs the same proxy-through-a-server-route pattern as private JSON already uses elsewhere (`load-project.js`) — a plain `<img src>` on the raw blob URL will not work.
- **Verified end-to-end live**, not just build-clean: uploaded a synthetic 1600×1200 test PNG directly via the API, confirmed it lists correctly, proxies back at full resolution, and renders/applies correctly both on the Library page and inside a template's "choose from library" picker. Cleaned up the test asset after.

### Merchant folders + search (added 2026-07-24)

Wolt DE is the only client, but they have many merchants (restaurants) — the shared library had no way to separate one restaurant's assets from another's, and "choose from library" had no way to find anything once a folder grew past a handful of items.

- **Pathname gains a merchant segment:** `library/<folder>/<merchant>/<id>__<name>.<ext>` — defaults to `"General"` when no merchant is given (shared/non-merchant assets, e.g. a generic Wolt app-store badge). `api/library-assets.js`'s GET/PATCH handlers parse both this new 4-segment format and the older 3-segment (no-merchant) format for backward compatibility — old assets just show under "General" rather than needing a migration script. Renaming an old asset also migrates it into the merchant-scoped format.
- **Library page:** a "Viewing" dropdown filters the asset grid below by merchant (or "All merchants", showing everything with a small merchant tag per card). A search box filters by name within whatever view is active. Last-used view remembered via `localStorage`. **(Originally this same dropdown also silently decided which merchant a new upload got tagged with — see the UX fix below; it's now purely a view filter.)**
- **In-canvas "choose from library" is now a real pop-up modal** (was an inline-expanding grid), with its own search box and a merchant filter dropdown (only shown when the folder actually has more than one merchant). **Defaults to whichever restaurant name is currently typed in the editor** — and any NEW upload made from inside the canvas editor is auto-tagged to that same restaurant (via a new `merchant` prop threaded from `fields.restaurant_name` down through `FieldEditor` → `ImageUpload`), so normal editing needs zero extra steps to stay organized by merchant. Stickers and QR codes (already their own folders since 2026-07-21) get the exact same merchant scoping automatically — no separate mechanism needed.
- **Verified locally** via a mocked `/api/library-assets` (local `vite dev` still has no working serverless layer) — merchant filtering, search, the auto-default-to-current-restaurant behavior, and upload prop-threading (confirmed via React fiber inspection, since a naive raw-DOM `select.value` mutation doesn't reliably trigger React state and gave a false-negative on first attempt) all checked out.
- **Fixed same day: casing typos creating duplicate merchant folders.** Julia hit exactly the limitation flagged above ("Wen Cheng" vs "wen cheng"). Fixed properly rather than just patched for this one case: `api/library-assets.js` now has a shared `resolveMerchant()` helper that snaps a requested merchant name to an existing merchant's exact casing when they match case-insensitively (first-seen casing wins) — applied on both upload (POST) and rename/move (PATCH). The Library page's merchant selector does the same snap client-side before even hitting the server. Also added a **"move to merchant" action** — in the "All merchants" view, click an asset's merchant tag to reassign it to any other merchant, so existing stray-cased assets can be consolidated manually.
- **UX fix (2026-07-24): merchant tagging wasn't obvious.** The page-level "Merchant" filter silently deciding what a new upload got tagged with took real figuring-out to notice — no visual link between the two. Replaced with an explicit pop-up on every upload click: **"Add to existing merchant"** (dropdown, defaults to whichever merchant is currently being viewed) or **"Add new merchant"** (name field) — the file picker only opens once you've chosen. `LibraryPage.jsx`'s `MerchantPickerModal`. The top filter is now purely a view filter with no upload-tagging side effect.

---

## Activation key system

Keys gate access to the app. Set in Vercel Environment Variables:

```
WILDCAST_KEYS=WOLT-DE-demo-key|Wolt DE|20,WILD-Demo-KEY|Wild Stack|100|designer
```

Format: `key|Client Name|credits|role` — role is **optional** (added 2026-07-13; omit it and a key behaves exactly as before, defaulting to `partner`) — comma-separated for multiple keys. `role:designer` unlocks the "Import" nav item (self-serve Figma import, see above).

| Key | Client | Credits | Role | Purpose |
|-----|--------|---------|------|---------|
| `WOLT-DE-demo-key` | Wolt DE | 20 | partner | Client demo |
| `WILD-Demo-KEY` | Wild Stack | 100 | *(set to `designer` for Julia + colleague)* | Internal use |

**Also needs `FIGMA_TOKEN`** (separate env var, for the self-serve import feature) — see the "Self-serve Figma import" section above and `ACTIVATION_KEYS.txt` for exact setup steps.

**How credits work (demo):** 1 PDF export = 1 credit. Tracked client-side in localStorage. Credits shown in editor breadcrumb bar. Export blocked at 0. Sign out button in header clears the session.

**Production upgrade path:** Replace localStorage credit tracking with Vercel KV (server-side Redis). Add payment integration (Stripe) → webhook auto-generates key → emails to customer. Half-day build when ready.

---

## Custom domain

- **Target:** `cast.wildstack.studio`
- **Vercel:** Domain added ✅ — waiting for DNS
- **IONOS action required:** Add CNAME record to `wildstack.studio`:
  - Type: CNAME
  - Host: `cast`
  - Points to: `7b09b04663fd7de5.vercel-dns-017.com`
  - TTL: 3600
- Once IONOS record is added: Vercel → Domains → Refresh → goes green automatically

---

## Next steps (priority order)

### 1. ⏳ IONOS DNS record (waiting on executive)
Add CNAME for `cast.wildstack.studio` → see Custom domain section above.

### 2. ⏳ Google Drive export (waiting on executive confirmation)
Wolt executive requested Drive export in addition to local download. Blocked on two clarification questions:
- Does she use her @wolt.com work account or personal Gmail for Drive?
- Does her current tool show a Google OAuth popup, or does it connect silently?

Answer determines whether DoorDash/Wolt's Google Workspace security settings will allow a new OAuth app. If yes, ~1 day to build using Google Drive API v3 in-browser OAuth flow.

### 3. Production activation key system (when taking real customers)
- Vercel KV for server-side credit tracking (credits can't be manipulated)
- Stripe payment → webhook → auto-generate key → email to customer
- Admin dashboard to view/manage keys and credit usage

### 4. More templates (on hold — pending client buy-in)
- Flyer Option B–E (different designs, same format)
- Poster format (portrait A3/A2)
- Wild Poster (landscape)
- Retail category templates

### 5. New zone types for the next Figma import — pipeline-side support ✅ done, Julia still needs to design + import the real master
The next template needs three things the original `zone:<id>` convention didn't handle — **all three now supported as of 2026-07-21:**
- **Sticker/badge** (e.g. a circular "26% OFF" badge) — `zone:sticker` now imports as an image zone (contain-fit, requires transparent PNG), matching Julia's instinct that this shouldn't be editable text.
- **QR code** — `zone:qr` now imports as an image zone (contain-fit, square preview, no transparency requirement since QR generators commonly export flat PNGs). **Rename support also shipped** — click an asset's name on the Library page to relabel it, so multiple QR codes don't become indistinguishable.
- **Promo/discount code box** (e.g. "CODE FRESSNAPFMUC10") — already worked with no changes; any `zone:<id>` that isn't `logo`/`photo`/`sticker`/`qr` becomes a text zone automatically (e.g. `zone:code`).

**Still outstanding:** Julia hasn't designed the actual Figma master yet — reference screenshots (AKKO Chicken & Grilled, Wolt×Fressnapf) show what she's aiming for. Once she has a real bleed-master frame with `zone:sticker`/`zone:qr`/`zone:code` markers, the existing self-serve Import screen should just work — this hasn't been tested against a *real* sticker/QR Figma file yet (only synthetic API-level testing so far).

---

## Tech stack
- React + Vite, hosted on Vercel (auto-deploy from GitHub)
- Fabric.js v5 canvas editor
- Adobe Fonts — Omnes Pro + Omnes Condensed via Typekit (uot3jfu)
- Template backgrounds: PNG stored in Vercel Blob
- Project saves: JSON stored in Vercel Blob (private), registry in localStorage
- Comments: stored in Vercel Blob at `comments/{id}.json`
- CMYK export: `sharp` (libvips) + bundled FOGRA39 ICC + manual PDF/X-4 builder
- Activation keys: env var `WILDCAST_KEYS`, credits tracked in localStorage (demo); Vercel KV planned for production

---

*Last updated: 2026-07-13 — Built self-serve Figma import: paste a link into WildCast's new "Import" screen (designer-role-gated), it lands as a draft, publish when ready — no code deploy needed for a new template anymore. Templates stay hybrid: Option A/B still hardcoded (untouched), only new imports go through Vercel Blob into empty catalogue slots. Needs a new `FIGMA_TOKEN` Vercel env var to actually run — see "Self-serve Figma import" section above. Not yet tested against a live deploy (no local serverless emulation available); draft-first design makes that low-risk. Prior entry (same day): built the manual CLI import pipeline (`scripts/import-figma-template.js`) and used it to upgrade Option A + replace Option B.*

*Update 2026-07-20 — Julia reported after live testing that "updates seem not committed." Verified directly (not assumed): everything was committed, pushed, and Vercel had auto-deployed it correctly — confirmed by pulling the live JS bundle and finding the new code strings in it. The real gap was the `role` field on `WILDCAST_KEYS` never being added in Vercel (still needed — see Activation key system), which is why the Import nav looked "missing." Also found and fixed two real bugs from live testing: (1) Option B's catalogue tile was reusing its real designer background as the thumbnail instead of a placeholder-labelled preview like Option A has — generated a matching placeholder PNG from Option B's actual zone coordinates; (2) added a "choose from library" option next to every image zone's upload button, pulling from the existing per-folder asset library (logos/product images) instead of requiring a fresh file picker every time. Both fixed, committed, pushed.*

*Update 2026-07-21 — Julia set up `role:designer` + `FIGMA_TOKEN` in Vercel; confirmed live end-to-end (Import nav shows, submitted a real request to Figma's API and got a genuine response back, proving the token round-trips correctly). Also fixed, same day: Option B's real background color (`#00C2E8`, not Option A's `#00C2CB` — confirmed against the Figma master directly), Option B's CTA weight (real Omnes Pro Semibold/600, confirmed genuinely loaded in the Typekit kit), and a real wrap bug on Option A's `restaurant_name` zone in Designer mode (no manual size control existed for that field in any mode, but the auto-shrink safety net was Guided-mode-only — fixed with a new `alwaysShrink` zone flag). Biggest piece: rebuilt the asset library on Vercel Blob for genuine hi-res, cross-browser storage, with a direct upload UI on the Library page — see "Asset library" section above, including two real Vercel gotchas (function count limit, private-only Blob store) worth reading before adding any new API route.*

*Update 2026-07-21 (cont'd) — Option B's catalogue tile preview (`preview_opt-b.png`) went through a few rounds: first a code-generated placeholder (wrong font — generic Arial instead of Omnes Condensed, since a server-side raster can't legitimately load a Typekit font file), then a corrected version rendered live in-browser onto a canvas element to use the real Typekit font, then found the label sizes were arbitrary guesses instead of matching each zone's real configured `fontSize` (headline was rendering far too small). Julia then just designed and exported the real tile herself directly in Figma at true 4x (1191×1679, matching Option A) — replaced the file, no code change needed since `TemplatePicker.jsx` already points at that same path. **Lesson for next time: ask Julia to design/export catalogue tile previews herself from the start** — she has full control over exact copy/fonts/layout and it's more reliable than trying to reverse-engineer her visual style in code. Confirmed live via direct file hash comparison.
**⚠️ Flagged, not yet resolved:** this tile has real "McDonald's" branding baked into the copy ("...bei McDonald's bestellen"), which conflicts with the 2026-07-10 client requirement (commit `09c34c2`: "Client doesn't want real merchant branding shown in the template picker previews"). Asked Julia twice; she pushed ahead without addressing it either time — re-raise if it comes up again, don't silently assume it's fine.
**Heads up from Julia — next templates need new zone types not yet supported by the import pipeline:** (1) a sticker/badge (e.g. a "26% OFF" circular badge) — Julia's own instinct is image-upload, not an editable text field, given how visually specific these are; (2) a QR code — image upload, plus **needs a rename/label capability** since multiple QR codes will look visually identical and be impossible to tell apart otherwise; (3) a promo/discount **code box** (e.g. "CODE FRESSNAPFMUC10") — a short text field, but a distinct *kind* of field from headline/offer (a discount code, likely wants a distinct visual treatment). None of these map cleanly onto the current `zone:logo`/`zone:photo`/(anything else = text) convention in `api/_lib/figma-import.js` — needs real design work before the next Figma master is built. See reference screenshots Julia shared (AKKO Chicken & Grilled, Wolt×Fressnapf) for what these look like in practice.
