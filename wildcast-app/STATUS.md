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
- **Export PDF** button (PNG 4× for now — CMYK PDF/X-4 next)
- **Send for Review** button — saves project + generates shareable link
- **Save button** — saves/re-saves project to Vercel Blob + localStorage registry

### Designs Tab
- Header nav: Templates · Designs · Help
- Saved projects appear as thumbnail tiles (template name + date)
- "Continue editing" — opens editor with full state restored (text, font sizes, images, comments)
- Hover to reveal × delete button (removes from local list)
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

---

## Known issues / fixed

### Auto-shrink on typing (FIXED)
~~When a user adjusts font size then uploads an image, the sub-headline shrinks back.~~
Fixed: auto-shrink now only fires when that field's own text changes, not on any field update.

### Sub-headline sizing changes on re-open (FIXED)
~~Opening a saved design reset text zones to a different font size than when saved/sent for review.~~
Fixed: `loadKey` prop on TemplateCanvas — increments on every project load, syncing `prevFieldsRef` to
the incoming fields before auto-shrink can compare them. Fires on both new template selection and Designs re-open.

### Blob overwrite error on re-save (FIXED)
~~Saving an already-saved design threw "This blob already exists" error.~~
Fixed: `allowOverwrite: true` added to both `save-project.js` and `add-comment.js`.

### Comments not visible on re-open (FIXED)
~~Reviewer comments didn't appear when re-opening the same project from Designs.~~
Fixed: comments fetched directly in `handleOpenProject`, not via useEffect (which wouldn't re-fire for the same project ID).

---

## Next steps (priority order)

### 1. CMYK / PDF/X-4 export — NEXT UP
**Approach: `sharp` + bundled FOGRA39 ICC + manual PDF/X-4 builder (no Ghostscript needed)**
- Vercel function receives the 4× canvas PNG
- `sharp` converts RGB → CMYK using ISOcoated_v2_eci.icc (FOGRA39, European standard)
- Output size: 1311×1819px (A6 + 3mm bleed at 300 DPI)
- Custom PDF/X-4 builder embeds the CMYK JPEG with FOGRA39 OutputIntent, correct MediaBox, XMP metadata
- 300 DPI pre-flight: checks uploaded image pixel dimensions before export, warns if below print quality
- "Export PDF" button wires up to new CMYK endpoint instead of current PNG download

**Ghostscript note:** Ghostscript is an option if the sharp approach hits any edge cases, but `sharp`
(libvips) handles ICC-based RGB→CMYK correctly without a binary dependency, which is safer on Vercel.

### 2. Custom domain
Point domain to Vercel deployment before client demo. 5-min setup in Vercel → Settings → Domains.

### 3. More templates (on hold — pending client buy-in)
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

---

*Last updated: 2026-06-23 — sub-headline fix, reviewer feedback left panel, CMYK next*
