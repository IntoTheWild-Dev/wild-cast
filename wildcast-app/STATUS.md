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
- Saved projects appear as thumbnail tiles (template name + date)
- "Continue editing" — opens editor with full state restored (text, font sizes, images, zone positions, comments)
- Hover × delete button — removes from localStorage AND deletes from Vercel Blob (project JSON + comments)
- Empty state with clear onboarding copy
- Projects stored in Vercel Blob (JSON, private); local registry in localStorage

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
- **⚠️ Needs a new Vercel env var to actually work: `FIGMA_TOKEN`** (server-side secret, separate from the local `.env.local` one used by the CLI script) — see Activation key system section / `ACTIVATION_KEYS.txt` for setup steps. Until it's set, the import route returns a clean 500 ("FIGMA_TOKEN is not configured on the server") rather than crashing anything.
- **Verification status, to be transparent about:** the CLI-script refactor was proven byte-identical (re-ran against the existing Wen Cheng master, diffed output). Role-gating and the import form were verified in-browser. The actual live Blob-backed import flow has **not** been tested end-to-end yet — there's no local serverless emulation for `api/*.js` under plain `vite dev` (confirmed earlier this project), and the Blob token is Vercel-only. First real test needs to happen after `FIGMA_TOKEN` is set in Vercel — low risk either way given the draft-first design above.
- **✅ 2026-07-20 live check:** confirmed via the deployed JS bundle that all of the above code (import route, list/publish/delete routes, `restaurant_name` zone, v3 backgrounds) is genuinely live in production — Vercel auto-deploy from GitHub is working correctly. The "Import" nav item is still invisible on the live site because the `role` field has never actually been added to `WILDCAST_KEYS` in Vercel (confirmed by logging in live with `WILD-Demo-KEY` — nav shows Templates/Library/Designs/Help, no Import). This is a one-time Vercel dashboard edit, not a code issue — see Activation key system below.
- **Key files:** `api/_lib/figma-import.js` (shared extraction logic), `api/import-figma-template.js` / `api/list-templates.js` / `api/publish-template.js` / `api/delete-template.js`, `src/lib/customTemplates.js` (static+dynamic merge), `src/components/TemplateImportPage.jsx`.
- **⚠️ Likely latent bug, flagged 2026-07-21, not yet confirmed or fixed:** `backgroundUrl` is uploaded with `access:'private'` but rendered client-side via a raw `fabric.Image.fromURL(backgroundUrl)` — no proxy. Found (on a *different* feature, the asset library, see below) that this Blob store is configured private-access-only, and a private blob genuinely cannot be loaded as a plain `<img>`/`fabric.Image` source — it needs a server-side proxy attaching the Blob token. Since no real Figma import has ever been published end-to-end yet, this has never actually been exercised — check it the first time a real import goes through; if the background fails to render, apply the same proxy pattern used in `api/library-assets.js` below.

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
