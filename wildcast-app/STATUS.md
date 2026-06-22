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

### Field Editor (right panel)
- Numbered step layout for BOTH modes (same clean UI)
- Designer Mode: steps include font-size + alignment + reset controls
- Non-Designer (Guided) Mode: font-size ±pt controls on Headline, Sub-headline, Offer (not T&Cs); canvas locked
- Image upload zones with drag/drop style UI + scale control in guided mode
- AI Suggest buttons (mock copy, DE + EN)
- Language toggle DE / EN
- ICC Profile selector (FOGRA39, GRACoL, SWOP, Japan Color)
- Export PNG button (4× multiplier)

---

## Known issues (to fix)

### Text scale reset on field change (guided mode)
When a user adjusts font size with the ±pt controls, typing in a different field triggers
auto-shrink which resets the font size of previously edited fields back toward the zone default.
The panel still shows the user's chosen pt value but the canvas renders at the shrunk size.
Fix needed: auto-shrink should only apply to the field currently being typed into, not all fields.

### Food photo zone calibration
The photo zone (x:15, y:160, w:286, h:150) is closer but still not perfectly aligned with
the background template PNG. Needs visual calibration against the actual Figma measurements
(requires Figma Dev Mode MCP or manual pixel measurement from the Figma frame).

---

## Next steps (priority order)

### 1. Fix text scale reset + food photo zone (quick polish before demo)
See Known Issues above.

### 2. CMYK PDF export (highest priority feature)
Vercel serverless function `/api/export-cmyk.js`:
- `@img/sharp-linux-x64` for ICC-based RGB→CMYK conversion
- `pdf-lib` to wrap in PDF at A6 + 3mm bleed (111×154mm)
- Bundled FOGRA39 profile (~500KB)
- Frontend sends PNG → function returns CMYK PDF download
- No Ghostscript, no Railway, no extra accounts

### 3. Cuisine sub-filter
Under Restaurant in the picker filter:
- Thai · Italian · Indian · Chinese · Japanese/Sushi · Turkish · Greek · Mexican · Burger · Korean · Vietnamese · Vegan/Vegetarian

### 4. More templates
- Flyer Option B (same layout, different design)
- Poster format (portrait A3/A2)
- Wild Poster (landscape — distinct format, not yet designed)
- Retail category templates
- Discuss UI structure and onboarding flow for new templates

### 5. Non-designer mode polish
- Logo on white background option

### 6. Background PNG
Move to public Vercel Blob store (current private URL may expire)

---

## Tech stack
- React + Vite, hosted on Vercel (auto-deploy from GitHub)
- Fabric.js v5 canvas editor
- Adobe Fonts — Omnes Pro + Omnes Condensed via Typekit (uot3jfu)
- Template backgrounds: PNG stored in Vercel Blob

---

*Last updated: 2026-06-22 — Guided mode font size + image scale controls added; zone calibration in progress*
