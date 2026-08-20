# WildCast — Build Spec

> **Status: 🔄 Architecture pivot — Phase 1 PDF-injection MVP live on Vercel ✓. Pivoting to canvas-based editor (Fabric.js + Figma API import) for Phase 2. PDF approach deprecated as primary path.**
> Repo: https://github.com/IntoTheWild-Dev/wild-cast
> Live: https://cast.wildstack.studio (confirmed 2026-08-20 — the raw
> wild-cast.vercel.app domain is squatted by an unrelated site, an Estero
> High School podcast page; don't use it, use this custom domain instead)

> **Reminder (2026-08-19, from WildLoop work):** if this project uses the
> same "WOLT" custom font (Omnes-derived, stylistic sets baked in as
> defaults), check whether its internal name table has the same bug found
> in WildLoop — the `.otf` files were renamed on disk (`WOLT*.otf`) but
> their internal Family/PostScript names still read "Omnes", which broke
> font recognition in After Effects and Plainly's font validation. Fixed
> for WildLoop by rewriting the name table with `fontTools` (originals
> backed up to `~/Documents/WOLT-font-originals-backup/`). Apply the same
> fix here if WildCast's copy has the same issue — check via
> [fontdrop.info](https://fontdrop.info)'s Data tab before assuming it's
> fine.

---

## What WildCast does

A browser-based tool where Wolt restaurant partners edit pre-approved print templates (changing headline, offer text, and product image) and export a print-ready CMYK PDF — without needing a designer, Figma access, or any technical knowledge.

**The partner's experience:**
1. Open a link in Chrome (no login, no install)
2. Pick a template (Promo, New Opening, Seasonal)
3. Fill in 4–6 fields — changes appear live on the canvas
4. Optionally use AI copy suggestions
5. Hit Export → download CMYK PDF

Everything else (CMYK conversion, bleed, crop marks, brand consistency) happens automatically.

---

## Architecture (Phase 2 — Canvas approach)

**Pipeline:**
```
Figma design → export PNG background + zone config
     ↓
WildCast canvas editor (Fabric.js)
  - locked background PNG
  - editable text layers at exact Figma positions
  - swappable image slots
     ↓
Export: canvas → flat PNG (RGB)
     ↓
Ghostscript serverless function
  - RGB PNG → CMYK PDF
  - embeds ICC profile
  - adds bleed + crop marks
     ↓
Partner downloads CMYK PDF
```

**Why canvas instead of PDF injection:**

| | PDF injection (Phase 1, deprecated) | Canvas approach (Phase 2) |
|---|---|---|
| Add new template | Hunt PDF coordinates with pdfplumber | Export Figma frame as PNG, define zones in JSON |
| Preview | PDF.js render (delayed, not WYSIWYG) | Live canvas (instant, truly WYSIWYG) |
| Text editing | Cover original with teal rect, draw on top | Native canvas text — no cover trick needed |
| Image swap | Base64 → pdf-lib embed | Draw directly on canvas |
| Export | pdf-lib injection (RGB or CMYK with workaround) | Canvas PNG → Ghostscript (true CMYK) |
| Coordinate system | PDF points, bottom-left origin, painful | Figma pixels → canvas pixels, straightforward |
| Maintenance | Per-PDF coordinate hunting every time | Update PNG + JSON config |

---

## Tech Stack

| Layer | Tool | Notes |
|---|---|---|
| Frontend | React + Vite + Tailwind CSS | Stays the same |
| Hosting | Vercel | Required — Ghostscript needs Vercel Serverless |
| Canvas editor | **Fabric.js** | Replaces PDF.js — renders template PNG + editable layers |
| Template storage | Vercel Blob | PNG backgrounds + zone config JSONs |
| PDF export | **Ghostscript** (static binary on Vercel) | RGB canvas PNG → CMYK PDF |
| ICC Profiles | FOGRA39 (confirm with Wolt's print vendor) | Embedded at export |
| Figma import | **Figma REST API** | Auto-derives zone positions from layer names |
| AI Copy | Anthropic Claude API (claude-sonnet-4-6) | Not yet wired — planned |
| Google Drive | Google Drive API v3 | Planned Phase 2 |
| Auth | None in Phase 1 — open URL | Per-partner magic links in Phase 3 |

---

## Template System (Canvas approach)

Each template stored in Vercel Blob:

```
[blob storage]
├── wen-cheng-flyer1/
│   ├── background.png     ← Figma frame exported as PNG (with bleed zone)
│   └── zones.json         ← editable zone definitions
├── wen-cheng-flyer2/
│   ├── background.png
│   └── zones.json
└── promo-partner/
    ├── background.png
    └── zones.json
```

### zones.json format

```json
{
  "templateId": "wen-cheng-flyer1",
  "templateName": "Wen Cheng Flyer 1",
  "canvasWidth": 316,
  "canvasHeight": 441,
  "bleedMm": 3,
  "iccProfile": "FOGRA39",
  "staticLayers": [
    {
      "type": "text",
      "value": "WEN CHENG × WOLT",
      "x": 158, "y": 258, "width": 288,
      "fontSize": 13, "fontKey": "bold",
      "color": "#FFFFFF", "align": "center"
    }
  ],
  "editableZones": [
    {
      "id": "sub_headline",
      "type": "text",
      "label": "City tagline",
      "placeholder": "POTSDAMS NEUES",
      "charLimit": 30,
      "required": true,
      "x": 14, "y": 318, "width": 288, "height": 42,
      "fontSize": 30, "fontKey": "condBlack",
      "color": "#FFFFFF", "align": "center"
    },
    {
      "id": "headline",
      "type": "text",
      "label": "Restaurant name",
      "placeholder": "WEN CHENG",
      "charLimit": 25,
      "required": true,
      "x": 14, "y": 270, "width": 288, "height": 70,
      "fontSize": 44, "fontKey": "condBlack",
      "color": "#FFFFFF", "align": "center",
      "autoShrink": true
    },
    {
      "id": "offer",
      "type": "text",
      "label": "Offer / Promo",
      "placeholder": "10% OFF",
      "charLimit": 20,
      "required": true,
      "x": 68, "y": 78, "width": 184, "height": 35,
      "fontSize": 26, "fontKey": "black",
      "color": "#FFFFFF", "align": "center",
      "autoShrink": true
    },
    {
      "id": "tc",
      "type": "text",
      "label": "Terms & Conditions",
      "placeholder": "Nur für Neukunden...",
      "required": false,
      "x": 14, "y": 22, "width": 38, "height": 130,
      "fontSize": 5.5, "fontKey": "regular",
      "color": "#FFFFFF", "rotate": 90
    },
    {
      "id": "photo",
      "type": "image",
      "label": "Product Photo",
      "required": false,
      "x": 14, "y": 140, "width": 288, "height": 118,
      "aspectRatio": "free",
      "backgroundFill": "#00BCD4"
    }
  ]
}
```

---

## Figma API Import (auto-generate zones.json)

Instead of manually measuring zones, we use the Figma REST API to derive them automatically.

**Naming convention in Figma:** any layer prefixed `[EDIT]` is treated as an editable zone.
- `[EDIT] headline` → text zone, id = "headline"
- `[EDIT] photo` → image slot, id = "photo"
- No prefix → part of locked background (exported to PNG)

**Import flow:**
1. Designer provides Figma file URL
2. WildCast fetches the layer tree via Figma API
3. `[EDIT]` layers become `editableZones` entries (position, size, font size pulled from Figma)
4. Remaining layers are rasterized to `background.png` via Figma export API
5. `zones.json` is auto-generated and saved to Vercel Blob

**Requires:**
- `FIGMA_API_TOKEN` environment variable (Julia's personal token is fine for Phase 2)
- Figma file must be shared or accessible with that token

---

## Canvas Editor UI

Layout stays similar to Phase 1 (left canvas + right field panel). Key changes:

**Left panel — Fabric.js canvas instead of PDF.js:**
- Locked background PNG (template design, cannot be clicked/moved)
- Editable text layers on top — partner clicks directly on the canvas to edit in place, OR fills in the right panel (both stay in sync)
- Image slots show upload placeholder until partner uploads photo
- No "Preview" button needed — canvas IS the preview (WYSIWYG)
- Bleed boundary toggle (dashed line showing 3mm bleed zone)

**Right panel — field editor (stays similar):**
- Same fields as now (headline, offer, sub_headline, tc, photo)
- Character counter per field
- AI copy suggestion button per text field (not yet wired)
- Export button at bottom

**Template picker:**
- Stays the same (thumbnail grid + category filter)
- Thumbnails now served as PNG from Vercel Blob (faster than PDF rendering)

---

## CMYK Export Pipeline

```
Canvas.toDataURL('image/png')    ← flat RGB PNG from Fabric.js
        ↓
POST /api/export-cmyk
        ↓
Ghostscript:
  gs -dNOPAUSE -dBATCH -sDEVICE=pdfwrite
     -sColorConversionStrategy=CMYK
     -dProcessColorModel=/DeviceCMYK
     -sOutputICCProfile=FOGRA39.icc
     input.png → output.pdf
        ↓
Response: CMYK PDF stream → partner downloads
```

**Bleed & crop marks:** added by Ghostscript at export time using the `bleedMm` value from `zones.json`.

**Ghostscript on Vercel:** requires a static binary bundled with the function. Already researched — solvable, needs a spike build to confirm binary size fits within Vercel's 50MB function limit.

---

## AI Copy Assistant

No fine-tuning. Anthropic API + plain `.txt` corpus of Wolt's best copy.

When a partner clicks "Suggest copy":
1. Field label + current draft + template type → Claude API (`/api/ai-suggest.js`)
2. Wolt corpus + tone guidelines in system prompt
3. Returns 3 on-brand suggestions as JSON array
4. Partner clicks one to apply

**Corpus:** `/corpus/wolt.txt` — maintained by Julia, updated by pasting new campaign lines. Source: Google Sheets copywriting template columns D, E, F.

**Privacy:** no partner-uploaded images ever sent to Claude API. Text corpus only. GDPR compliant.

---

## Build Phases

### ✅ Phase 1 — PDF injection MVP (COMPLETE, deployed)

- [x] React + Vite + Tailwind scaffold on Vercel
- [x] Template picker (Wen Cheng Flyer 1, Flyer 2 + category filter)
- [x] PDF.js preview + text scan (auto-populates fields from PDF content)
- [x] pdf-lib injection — Omnes fonts embedded (Bold, Black, Regular, Cond Black)
- [x] WEN_CHENG_POTSDAM_MAP — rect cover + text draw for all 5 zones
- [x] Two-pass injection (rects first, text second)
- [x] Center alignment for headline/sub_headline/offer
- [x] Auto-shrink font size to fit within zone width
- [x] Static entry support — "WEN CHENG × WOLT" branding line always redrawn
- [x] Image injection — product photo replaces food circles area
- [x] Vercel Blob storage for compressed PDFs (Flyer_1_reduced.pdf 1.25MB, Flyer_2_reduced.pdf 1.24MB)
- [x] Serverless function `/api/generate-pdf.js` — fetch from Blob, inject, stream PDF response
- [x] Base64 image transfer (chunked 8192 bytes to avoid stack overflow)
- [x] Deployed and live on Vercel

**Known issues in Phase 1 (not worth fixing — superseded by Phase 2):**
- PDF coordinate system is painful and fragile
- Preview (PDF.js) is not WYSIWYG
- Adding new templates requires pdfplumber coordinate hunting
- "Jetzt mit Wolt bestellen &" fine print sometimes clipped (template design issue)
- Three separate food circle image slots not implemented (deferred)

---

### 🔄 Phase 2 — Canvas editor (CURRENT)

**Goal:** Replace pdf-lib injection with Fabric.js canvas. Templates become PNG backgrounds + zones.json configs. Export goes canvas PNG → Ghostscript → CMYK PDF.

**Step 1 — Fabric.js canvas foundation** *(build first)*
- [ ] Install `fabric` npm package
- [ ] Replace `PreviewCanvas.jsx` (PDF.js) with new `TemplateCanvas.jsx` (Fabric.js)
- [ ] Load background PNG from Vercel Blob onto locked canvas layer
- [ ] Render editable text zones from `zones.json` as Fabric text objects
- [ ] Live sync: right panel field inputs ↔ canvas text objects (bidirectional)
- [ ] Image slot: click to upload → draws image on canvas at zone position
- [ ] Omnes fonts loaded via FontFace API for accurate canvas rendering

**Step 2 — zones.json configs** *(in parallel with Step 1)*
- [ ] Write `zones.json` for wen-cheng-flyer1 (from current injection map coords)
- [ ] Write `zones.json` for wen-cheng-flyer2
- [ ] Export Wen Cheng designs from Figma as PNG backgrounds → upload to Vercel Blob
- [ ] Update TemplatePicker to load thumbnails from Blob PNGs

**Step 3 — Export pipeline**
- [ ] Canvas `toDataURL()` → base64 PNG → POST to `/api/export-cmyk.js`
- [ ] Spike: bundle Ghostscript static binary on Vercel, confirm it fits 50MB limit
- [ ] Ghostscript: RGB PNG → CMYK PDF with FOGRA39 ICC profile
- [ ] Add bleed area and crop marks
- [ ] Stream PDF back to browser

**Step 4 — Figma API import** *(adds new templates without manual zone-mapping)*
- [ ] Add `FIGMA_API_TOKEN` to Vercel environment
- [ ] Build `/api/figma-import.js` — fetch layer tree, extract `[EDIT]` layers, export background PNG
- [ ] Auto-generate `zones.json` from Figma layer data
- [ ] Upload background PNG + zones.json to Vercel Blob
- [ ] Simple import UI: paste Figma URL → "Import template" button

**Step 5 — AI copy suggestions**
- [ ] `/api/ai-suggest.js` Vercel function (proxies to Anthropic, keeps key server-side)
- [ ] Populate `/corpus/wolt.txt` from copywriting Sheets
- [ ] Wire "Suggest copy" button in FieldEditor to API

---

### Phase 3 — Scale

- Per-partner magic links + dedicated Drive folders
- Google Drive upload on export
- Slack notification to Wolt review channel on upload
- Admin dashboard: template management, usage stats
- Multi-language support (DE default + EN toggle)
- DPA signed before any live partner data flows

---

## UI Changes — Phase 1 → Phase 2

The overall layout (left canvas + right panel) stays. What changes:

| Element | Phase 1 | Phase 2 |
|---|---|---|
| Left panel | PDF.js render of template PDF | Fabric.js canvas with PNG background |
| Preview | Separate "Preview" button generates modified PDF | Live — canvas IS the preview |
| Text editing | Type in right panel only | Right panel OR click text directly on canvas |
| Image slot | Upload in right panel → injected on export | Upload in right panel → appears on canvas immediately |
| Export | pdf-lib injection → PDF stream | Canvas PNG → Ghostscript → CMYK PDF |
| "Replace PDF" button | Allows custom PDF upload | Removed (not needed) |
| Template picker thumbnails | Rendered from PDF via PDF.js | PNG thumbnails from Vercel Blob (faster) |

---

## Environment Variables

```env
# Already configured in Vercel
BLOB_READ_WRITE_TOKEN=...           # Vercel Blob access

# To add for Phase 2
FIGMA_API_TOKEN=...                  # Figma REST API personal token
ANTHROPIC_API_KEY=...                # Claude API — server-side only, never client
GHOSTSCRIPT_PATH=./bin/gs            # path to bundled static binary
```

---

## File Structure (Phase 2 target)

```
wildcast-app/
├── public/
│   └── fonts/                       ← Omnes TTF weights (for FontFace API)
├── api/
│   ├── export-cmyk.js               ← canvas PNG → Ghostscript → CMYK PDF
│   ├── figma-import.js              ← Figma API → zones.json + background PNG
│   └── ai-suggest.js                ← Claude API proxy
├── src/
│   ├── components/
│   │   ├── TemplatePicker.jsx       ← stays (thumbnails from PNG now)
│   │   ├── TemplateCanvas.jsx       ← NEW — replaces PreviewCanvas.jsx (Fabric.js)
│   │   ├── FieldEditor.jsx          ← stays (syncs bidirectionally with canvas)
│   │   ├── Header.jsx               ← stays
│   │   └── AISuggest.jsx            ← NEW — suggest copy button + dropdown
│   └── App.jsx                      ← simplified (no pdf-lib, no injection maps)
├── corpus/
│   └── wolt.txt                     ← AI copy training data
└── package.json
```

---

## What we need from Annika / Wolt

| Item | Why | Priority |
|---|---|---|
| Figma file access (sharing link or API token) | To auto-import templates via Figma API | 🔴 Phase 2 |
| ICC profile used by Wolt's print vendor | Wrong profile = files fail at printer | 🔴 Before Ghostscript build |
| Confirmed bleed size | Spec default is 3mm — confirm with their vendor | 🟡 Before export |
| Full copy corpus (Sheets file) | AI suggestions need real examples | 🟡 Before AI feature |
| DPA sign-off | Required before live partner data flows | 🔴 Before launch |

---

## Known Constraints

- Ghostscript cannot run on Cloudflare Workers — Vercel Serverless only
- Vercel Hobby plan: 50MB function limit, 10s timeout — Ghostscript binary must fit within 50MB
- Canvas export is RGB; Ghostscript converts to CMYK — this is the correct separation of concerns
- Never send partner images to the Claude API — text corpus only (GDPR)
- Figma API rate limit: 150 req/min per token — fine for template import (not per-partner request)
- Google Drive OAuth production verification takes 4–6 weeks — start early

---

## Out of Scope

- InDesign / IDML ingestion
- User accounts or saved sessions (Phase 3)
- Team collaboration / commenting
- Fine-tuning or custom model training
- Full preflight validation beyond bleed check

---

## Reference (Wild Stack internal patterns)

- **Wild CMYK** — ICC profile logic and Ghostscript export knowledge base
- **Super Localize** — field mapping UI pattern (reuse for FieldEditor)
- **Kali Dogwear automation** — Google Drive API integration (reuse `driveUpload.js` logic)
