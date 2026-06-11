# WildCast — Build Spec

> **Status: 🟢 Phase 1 MVP in progress — multi-page preview ✓, text scan ✓, category filter ✓, upload + category tag ✓, UI polish ✓. Next: wire pdf-lib.**
> Repo: https://github.com/IntoTheWild-Dev/wild-cast

---

## What WildCast does

A browser-based tool where Wolt restaurant partners edit pre-approved print templates (changing headline, offer text, and product image) and export a print-ready PDF — without needing a designer, Figma access, or any technical knowledge.

**The partner's experience:**
1. Open a link in Chrome (no login, no install)
2. Pick a template (Promo, New Opening, Seasonal)
3. Fill in 4–6 fields
4. Optionally use AI copy suggestions
5. Hit Export → download PDF

Everything else (CMYK conversion, bleed, crop marks, brand consistency) happens automatically.

---

## Tech Stack

| Layer | Tool | Notes |
|---|---|---|
| Frontend | React + Vite + Tailwind CSS | Fast to build, easy to deploy |
| Hosting | Vercel | Required — Ghostscript needs Vercel Serverless (not Cloudflare) |
| Template rendering | PDF.js | Renders the base PDF template to canvas for live preview |
| Preview overlay | HTML/CSS overlay on canvas | Text + image fields rendered on top of the PDF canvas |
| PDF export | pdf-lib | Injects updated text + images directly into the source PDF |
| CMYK conversion | Ghostscript (static binary on Vercel) | Converts RGB → CMYK, embeds ICC profile, adds bleed + crop marks |
| ICC Profiles | GRACoL 2013, FOGRA39, SWOP, Japan Color 2001, Grayscale 2.2 | Confirm with Wolt's print vendor which one they use |
| AI Copy | Anthropic Claude API (claude-sonnet-4-20250514) | Already provisioned |
| Google Drive | Google Drive API v3 | OAuth scoped to drive.file only |
| Auth | None in Phase 1 — open URL | Per-partner magic links in Phase 2 |

---

## Templates

Templates are exported from Figma as press-ready PDFs and bundled directly into the app. No Figma API needed for Phase 1.

Each template lives in its own folder:

```
templates/
├── wolt-promo/
│   ├── template.pdf       ← Figma export (with bleed, correct print dimensions)
│   └── fields.json        ← field map (see format below)
├── wolt-new-opening/
│   ├── template.pdf
│   └── fields.json
└── wolt-seasonal/
    ├── template.pdf
    └── fields.json
```

### fields.json format

This file tells the app what is editable, where it sits on the template, and what rules apply. Character limits are hardcoded here — do not calculate dynamically.

```json
{
  "templateId": "wolt-promo",
  "templateName": "Promo Flyer",
  "bleedMm": 3,
  "iccProfile": "FOGRA39",
  "fields": [
    {
      "id": "headline",
      "type": "text",
      "label": "Main Headline",
      "charLimit": 30,
      "required": true,
      "bbox": { "x": 120, "y": 84, "width": 480, "height": 60, "unit": "pt" }
    },
    {
      "id": "offer_text",
      "type": "text",
      "label": "Offer (e.g. 2-for-1)",
      "charLimit": 20,
      "required": true,
      "bbox": { "x": 120, "y": 160, "width": 480, "height": 40, "unit": "pt" }
    },
    {
      "id": "sub_headline",
      "type": "text",
      "label": "Sub-headline",
      "charLimit": 60,
      "required": false,
      "bbox": { "x": 120, "y": 210, "width": 480, "height": 36, "unit": "pt" }
    },
    {
      "id": "product_image",
      "type": "image",
      "label": "Product Photo",
      "required": true,
      "aspectRatio": "1:1",
      "minDpi": 150,
      "blockBelowDpi": 72,
      "bbox": { "x": 640, "y": 80, "width": 360, "height": 360, "unit": "pt" }
    }
  ]
}
```

> **Note:** Bounding box coordinates, character limits, and ICC profile must be confirmed with Annika once actual Figma templates are provided.

---

## Field Editing UI

- Split layout: live PDF preview on the left, editable fields on the right
- Text fields: character counter, turns red at limit, cannot exceed limit
- Image fields: aspect ratio locked, warns below 150dpi, hard-blocks below 72dpi
- Labels use plain language — no Figma layer names
- Original template layout is never modified — only content is swapped in

---

## Live Preview

- PDF.js renders the source `template.pdf` to a canvas element (left panel)
- A transparent HTML overlay sits on top of the canvas
- As the partner types, their text/image appears in the correct position on the overlay
- Preview is screen-resolution only — the actual print-quality rendering happens at export
- Bleed boundary (dashed) and safe zone boundary can be toggled on/off
- Font rendering in preview is approximate if the original Figma fonts are not web-loadable. Wolt brand fonts should be loaded via FontFace API if available.

### Multi-page PDF support

**Key discovery:** the Wolt template PDFs are multi-page. Both Partner and Generic variants live in the same file (V1 Bamberg = page 1 McDonald's partner, V2 DessauRoßlau = page 2 generic with QR). Some PDFs will be 1 page, some 2+.

**Required behaviour:**
- On load, detect total page count (`pdf.numPages`)
- Show a page navigator (← Page 1 of 2 →) below the preview canvas when `numPages > 1`
- Edit fields apply to the **currently selected page** (each page may have different editable text)
- On export, ALL pages are output in the final PDF (not just the edited page)
- Text scanning (like the InDesign plugin pattern): scan all text items across all pages using `page.getTextContent()`, identify editable placeholder strings by convention (e.g. `{{headline}}`, `{{offer}}` or by bounding-box position from `fields.json`), surface them as the field list automatically
- This replaces the hardcoded field list — fields are derived from the PDF itself

---

## AI Copy Assistant

### How it works

No fine-tuning. No new model. Just the Anthropic API already provisioned, paired with a plain `.txt` corpus of Wolt's best copy.

When a partner clicks "Suggest copy" on a text field:
1. The field label, current draft value, and template type are sent to Claude
2. The Wolt corpus + tone-of-voice guidelines are in the system prompt
3. Claude returns exactly 3 on-brand suggestions as a JSON array
4. Partner clicks one to apply, or ignores and types freely

### Corpus file

Location: `/corpus/wolt.txt`

This is a plain text file maintained by Julia. Updated quarterly by pasting in new campaign lines — no retraining, no new vendor, no extra cost.

**The Google Sheets copywriting template (columns D, E, F) is the primary source for this file.** Extract headlines, sub-headlines, and promo stickers into the corpus. Even a partial corpus is far better than none — the AI suggestions improve proportionally to how much copy you feed in.

Suggested corpus format:

```
# WOLT CORPUS — GERMAN MARKET

## Tone of voice
Punchy, direct, appetite-driven. Always in German. Short sentences. Action-first.
Wolt's voice is confident and slightly playful — never corporate, never generic.

## Headlines
Churro Deal
POTSDAM, DEIN BURGER WARTET.
Wie wär's mit Bowl für zwei?
2FÜR1 auf alle Bowls
WIE WÄR'S MIT SHOPPEN OHNE SCHLEPPEN
PHO REAL, DÜSSELDORF.
Wie wär's mit Barry's Smashburger

## Sub-headlines
Classic 5er Sticks & Classic Crepes. Jetzt bestellen auf Wolt.
Saftig. Frisch. Friedrich. In Minuten bei dir
Super Bowl, Happy Bowl, Boom Bowl, Green Bowl.
Mit Wolt bestellst du deinen Fressnapf Einkauf bequem von der Couch aus.
30% auf ausgewählte Gerichte bei Hanoi. Jetzt bestellen. In Minuten geliefert.
OB Smashburger, Cheeseburger oder Veggie - einen gibt's dazu.

## Promo stickers / CTAs
26% Rabatt Für Alle
26% auf ausgewählte Produkte
2FÜR1
WOLTREX10 / 1×10 €
JETZT 2FÜR1
```

### System prompt structure

```
You are a copywriter for Wolt Germany. Suggest short, punchy German marketing headlines.

Tone of voice: [2-3 sentence description from corpus]

Examples of copy that has worked well:
[corpus content]

The user is editing a [template type] flyer.
The field is: [field label]
Their current draft: [current value or empty]

Return exactly 3 options as a JSON array of strings. No preamble.
```

### Privacy rule
The corpus is text only. **No partner-uploaded images are ever sent to the Claude API.** GDPR compliant by design.

### Cost
~€0.001–€0.003 per export at current Claude Sonnet pricing.

---

## CMYK Export

### What the serverless function does

1. Takes the source `template.pdf` + partner's field values (text strings + image file)
2. Uses `pdf-lib` to inject the updated content directly into the PDF
3. Passes the result through Ghostscript for RGB → CMYK conversion
4. Embeds the ICC profile specified in `fields.json`
5. Adds 3mm bleed (configurable per template) and crop marks
6. Returns the final PDF

### Export options
- Download to local machine
- Send to Google Drive (user confirms folder once, saved to localStorage)

### File naming
`[TemplateName]_[YYYY-MM-DD_HHMMSS].pdf` — e.g. `WoltPromo_2026-06-29_143022.pdf`

### Technical note on Ghostscript
Ghostscript is not available by default in Vercel's serverless environment. A static Ghostscript binary must be compiled and bundled with the function. This is a known solvable pattern — it must be spiked and confirmed working before the rest of the export pipeline is built.

---

## Google Drive Integration

- OAuth2 Google login scoped to `drive.file` only (write to files the app creates — nothing else is readable)
- Partner selects target folder once; saved to localStorage
- On export: file uploaded with the naming convention above
- Optional: Slack notification to Wolt review channel on upload

> **For the initial demo:** Local download is sufficient. Drive integration is a polish step.

---

## File & Folder Structure

```
wildcast/
├── public/
│   └── icc/
│       ├── GRACoL2013.icc
│       ├── FOGRA39.icc
│       ├── SWOP.icc
│       ├── JapanColor2001.icc
│       └── Grayscale_Gamma22.icc
├── corpus/
│   └── wolt.txt                    ← AI copy training data
├── templates/
│   ├── wolt-promo/
│   │   ├── template.pdf
│   │   └── fields.json
│   ├── wolt-new-opening/
│   │   ├── template.pdf
│   │   └── fields.json
│   └── wolt-seasonal/
│       ├── template.pdf
│       └── fields.json
├── src/
│   ├── components/
│   │   ├── TemplatePicker.jsx       ← template selection cards
│   │   ├── FieldEditor.jsx          ← text + image inputs (right panel)
│   │   ├── AISuggest.jsx            ← "Suggest copy" button + dropdown
│   │   ├── PreviewCanvas.jsx        ← PDF.js base + HTML overlay (left panel)
│   │   └── ExportPanel.jsx          ← ICC selector, export button
│   ├── lib/
│   │   ├── loadTemplate.js          ← loads template.pdf + fields.json
│   │   ├── buildPreview.js          ← canvas + overlay rendering logic
│   │   ├── aiSuggest.js             ← calls /api/ai-suggest
│   │   └── driveUpload.js           ← Google Drive API upload
│   └── api/                         ← Vercel Serverless Functions
│       ├── export-cmyk.js           ← pdf-lib injection → Ghostscript → ICC
│       └── ai-suggest.js            ← Claude API proxy (API key server-side only)
├── .env.example
├── vite.config.js
├── tailwind.config.js
└── package.json
```

---

## Environment Variables

```env
VITE_GOOGLE_CLIENT_ID=your_google_oauth_client_id
GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret
ANTHROPIC_API_KEY=your_anthropic_api_key        # server-side only — never expose to client
GHOSTSCRIPT_PATH=./bin/gs                        # path to bundled static binary
```

> `ANTHROPIC_API_KEY` must only ever be used inside `/api/ai-suggest.js`. Never in client-side code.

---

## Build Phases

### Phase 1 — Demo MVP
*🟢 In progress.*

- [x] Visual prototype approved — `wildcast_prototype.html`
- [x] Repo initialised — https://github.com/IntoTheWild-Dev/wild-cast
- [x] React + Vite + Tailwind scaffold (`wildcast-app/`)
- [x] Template picker — Promo Flyer Partner, Promo Flyer Generic (real PDF thumbnails), New Opening (coming soon), Upload card
- [x] Field editing UI — Headline (required), Offer/Promo sticker (if necessary), Sub-headline, T&C (if necessary), Brand Logo, Product Photo, QR Code (Generic only)
- [x] Live canvas preview via PDF.js — auto-loads bundled PDF, live text overlay
- [x] AI copy suggestions UI — DE/EN toggle inside dropdown, placeholder copy per field; **API not yet wired**
- [x] Expandable sidebar panel, favicon updated
- [x] **Multi-page PDF support** — detects `pdf.numPages`, `← Page 1 of 2 →` navigator, per-page render
- [x] **Text scanning** — `page.getTextContent()` runs on all pages at load, raw items logged to console (Promo Flyer Partner: 8 items p.1, 24 items p.2 including promo code `X7NPHG` and T&C block)
- [x] **Category filter interactive** — Restaurant / Retail toggle filters template grid
- [x] **Upload card** — file import functional; "Tag as Restaurant / Retail" selector before upload; navigates to editor with correct category on file select
- [x] **UI fixes** — "If necessary" badge layout fixed (flex wraps correctly beside long labels); expand/collapse panel button works (moved inside header, was being clipped by overflow:hidden)

**Next up (in order):**
- [ ] **Wire pdf-lib** — install pdf-lib, load template PDF, draw white rect over original text at scanned coordinates, write partner's field values on top, output modified PDF for download
- [ ] Connect Anthropic API for real AI copy (`/api/ai-suggest.js`)
- [ ] PDF export — local download (RGB via pdf-lib first; CMYK Ghostscript spike after)
- [ ] Wolt corpus file populated from copywriting sheet
- [ ] Deploy to Vercel

### Phase 1 Full — Post-demo sign-off
- [ ] All 3 templates live (New Opening, Seasonal)
- [ ] Full CMYK pipeline confirmed
- [ ] Google Drive upload
- [ ] Slack notification ping
- [ ] DPA signed before any live partner data flows

### Phase 2 — Scale
- Figma REST API: pull templates live, auto-detect fields
- Per-partner magic links + dedicated Drive folders
- Admin dashboard: review queue, usage stats
- Multi-template library with admin UI
- Billing: monthly SaaS or per-export pricing

---

## What we need from Annika / Wolt before build starts

| Item | Why it's needed | Priority |
|---|---|---|
| Figma PDF export of Promo template (with bleed) | Everything is built against this — without it we're guessing | 🔴 Before Day 1 |
| ICC profile used by Wolt's print vendor | Wrong profile = files fail at the printer | 🔴 Before Day 1 |
| Confirmed bleed size (assuming 3mm) | Spec default may not match their print vendor | 🔴 Before Day 1 |
| Wolt brand fonts | Needed for correct text rendering in PDF export | 🟡 Before export is built |
| Full copy corpus (the Sheets file + anything else) | AI suggestions need real examples to work properly | 🟡 Before AI feature is built |
| Annika's Google account email | Needed to add as OAuth test user for Drive | 🟢 Before Drive is built |

---

## Known Constraints

- Ghostscript cannot run on Cloudflare Workers — Vercel Serverless only
- PDF.js preview is screen-resolution only — print rendering is always server-side
- Corpus language determines AI output language (current corpus = German → German suggestions)
- Never send partner images to the Claude API — text corpus only (GDPR)
- Google Drive OAuth requires the app to be in "Testing" mode for the demo. Production verification takes 4–6 weeks — do not leave this until the last week.

---

## Out of Scope — Phase 1

- InDesign / IDML ingestion
- User accounts or saved sessions
- Team collaboration / commenting
- Fine-tuning or custom model training
- Full preflight / print spec validation beyond bleed check

---

## Reference (Wild Stack internal patterns)

- **WildScale** — reuse processing queue pattern
- **Wild CMYK** — ICC profile logic and CMYK export knowledge base
- **Super Localize** — field mapping UI pattern (reuse for FieldEditor)
- **Kali Dogwear automation** — Google Drive API integration (reuse `driveUpload.js` logic)
