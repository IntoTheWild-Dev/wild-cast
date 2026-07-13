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
- 1 live template (Restaurant Flyer · Option A — both guided and designer modes)
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

---

## Activation key system

Keys gate access to the app. Set in Vercel Environment Variables:

```
WILDCAST_KEYS=WOLT-DE-demo-key|Wolt DE|20,WILD-Demo-KEY|Wild Stack|100
```

Format: `key|Client Name|credits` — comma-separated for multiple keys.

| Key | Client | Credits | Purpose |
|-----|--------|---------|---------|
| `WOLT-DE-demo-key` | Wolt DE | 20 | Client demo |
| `WILD-Demo-KEY` | Wild Stack | 100 | Internal use |

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

*Last updated: 2026-07-13 — Fixed real bleed export bug found in print testing (frame was getting cut off; see bug table above). Prior entry (2026-06-30): Homepage redesigned: two-level browse (group cards → options view), search bar, "Design. Export. Print." headline, 30 template slots (5 per format per category). Google Drive export requested by Wolt executive — awaiting security clarification before building.*
