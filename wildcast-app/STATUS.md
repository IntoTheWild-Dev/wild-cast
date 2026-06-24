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
  - Image: CMYK JPEG with `/ICCBased` colorspace referencing FOGRA39
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
| **PDF colors completely wrong (near-black)** | Fixed CMYK conversion order: `.toColourspace('cmyk')` before `.withIccProfile()` caused a generic non-ICC conversion to be re-tagged with FOGRA39, producing wrong values. Now `.withIccProfile(fogra39)` runs alone and does the full ICC-aware sRGB→CMYK transform correctly. |
| **Image scale (photo/logo) not restored on re-open** | `imageScales` effect ran before `fabric.Image.fromURL` callback completed, so `_wcBaseScale` wasn't set yet. Now applies saved scale immediately inside the image load callback. |
| Duplicate "Print settings" heading in right panel | Removed extra copy-paste heading from FieldEditor. |

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

*Last updated: 2026-06-24 — CMYK color fix (ICC conversion order), image scale restore on re-open, duplicate UI section removed*
