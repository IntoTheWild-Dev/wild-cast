# WildCast — Build Status

**Repo:** https://github.com/IntoTheWild-Dev/wild-cast  
**Live (Vercel):** auto-deploys on every push to `main`

---

## What's working right now

### Template Picker
- View Catalogue — browse by Category → Format → Option, with live and placeholder tiles
- 4 template tiles: Non-Designer Flyer 1 + Flyer 2 first, then Designer Flyer 1 + Flyer 2
- PNG preview thumbnails (filled example showing real content)
- Two-row filter: Category (Restaurant / Retail) + Format (Flyer / Poster · soon / Wild Poster · soon)
- Mode badges, Text only / Text + Image type tags, Use ↗ CTA

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
| **Dead code cleanup** | Removed 4 files never imported anywhere: `PreviewCanvas.jsx`, `PdfThumbnail.jsx`, `src/lib/pdfSetup.js`, `api/generate-pdf.js` (legacy export route superseded by export-cmyk.js). Also uninstalled unused `pdfjs-dist` npm package. Build verified clean (27 modules, 0 errors). |

---

## Next steps (priority order)

### 1. Custom domain
Point your domain to the Vercel deployment before any client demo.  
5 minutes: Vercel → Project → Settings → Domains → Add domain.

### 2. More templates (on hold — pending client buy-in)
- Flyer Option B (same layout, different design)
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

---

*Last updated: 2026-06-26 — Dead code sweep (PreviewCanvas, PdfThumbnail, pdfSetup, generate-pdf, pdfjs-dist removed); font size revert fix (key={loadKey}); three-layer cache fix; sessionStorage bypass*
