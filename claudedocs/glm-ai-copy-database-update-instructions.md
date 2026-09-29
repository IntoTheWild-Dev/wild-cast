> ⛔ **SUPERSEDED AND DONE — do not execute.** This was replaced by `glm-ai-suggest-v1.2-rebuild-instructions.md`, which is itself ✅ complete (2026-09-25, branch `feat/ai-suggest-v1.2`). See `wildcast-app/STATUS.md` → "AI Suggest v1.2 rebuild" for the current state.

# GLM Task: Swap in the new AI copy database

## Before you start (required — see repo CLAUDE.md)

```bash
git fetch origin
git checkout main
git pull origin main
git checkout -b fix/ai-copy-database-update
```

Do not work on `main`. Run lint/typecheck/test before staging anything, per the repo's GLM safety rules.

## Context

WildCast has two separate copy features, both reading from the same Google-Sheets-hosted "Wolt AI Copywriting Knowledge Base":

- `wildcast-app/api/_lib/campaignSheet.js` — shared loader. Fetches two tabs from a Google Sheet (by `SHEET_ID`, via the CSV export endpoint) and parses them into rows.
- `wildcast-app/api/presets.js` — serves real past copy lines **verbatim, no AI**. This one is correct as-is; do not change its behavior or logic.
- `wildcast-app/api/ai-suggest.js` — generates **6 brand-new AI-written** copy options per request, using Claude, with the sheet's examples only as tone/style grounding (few-shot), never copied verbatim. This is already working correctly and is already creative — **do not change its prompt or generation logic.** It is out of scope for this task.

## The actual task

Julia has a **new Google Sheet** (different link from the one currently wired in) that should replace the current copy database. Your job is to point the app at it — nothing else.

1. In `wildcast-app/api/_lib/campaignSheet.js`, update the `SHEET_ID` constant:
   ```js
   const SHEET_ID = '1F-6mpmPzPqE4wsj47hVkER7q3OCkH62G' // ← replace with the new sheet's ID
   ```
   The ID is the long string in the sheet's URL between `/d/` and `/edit`, e.g.
   `https://docs.google.com/spreadsheets/d/<THIS_PART>/edit`.
   **Julia will give you the new sheet's link — extract the ID from it.**

2. **Confirm the new sheet is shared correctly.** The code fetches it unauthenticated via the `gviz` CSV export endpoint, which only works if the sheet's sharing is set to "Anyone with the link can view." If it's still private, every request will fail. Check this before assuming the code is broken.

3. **Confirm the new sheet has the same tab names and columns as the old one** — the code matches tabs and columns by exact name, so if these don't match, it will silently return empty results (not an error) rather than failing loudly.

   - Tab `Headline Library` — must have columns: `Copy`, `Content Type` (values: `Headline` / `Subline` / `CTA`), `Vertical` (values: `Restaurant` / `Retail` / `Cross-vertical / Brand` / `Mixed / Multi-vertical`), `Merchant / Context`.
   - Tab `Vertical Guide` — must have columns: `Vertical`, `Definition`, `Typical subjects / nouns`, `Typical verbs / mechanisms`, `AI rule`.

   If the new sheet uses different tab names or column headers, either rename them in the sheet to match exactly, or (only if Julia confirms the new sheet's structure is intentionally different) update the tab/column names in `campaignSheet.js` to match the new sheet — check with Julia before changing column-matching logic, don't guess.

4. There's a 5-minute in-memory cache (`CACHE_MS` in `campaignSheet.js`). When testing locally, restart the dev server (or wait 5 minutes) between changes so you're not testing against stale cached data.

## Explicitly out of scope — do not touch

- `ai-suggest.js`'s generation prompt or logic (already correct, already creative — confirmed by Julia).
- Any change to how `presets.js` selects or dedupes rows. Julia raised a possible concern (presets could resurface copy a partner has already seen before) but explicitly said to leave that out of this task — don't "fix" it unprompted.
- Any UI changes to `AISuggest.jsx` or `PresetPicker.jsx`.

## Verify before opening a PR

- With the dev server running, test `GET /api/presets?field=headline&vertical=Restaurant` (and one `Retail` case) — confirm real copy lines come back from the new sheet, not an empty array.
- Test `POST /api/ai-suggest` for at least one field/vertical combo — confirm it still returns 6 AI-generated options, and that they're stylistically grounded in the new sheet's examples (spot-check a couple against the new sheet's content).
- Confirm the vertical gating still holds: a Restaurant request never returns Retail-only lines and vice versa (Cross-vertical / Brand lines are fine in both).

## Note for Julia (not part of GLM's task)

Get the new Google Sheet's share link and its sharing setting confirmed ("Anyone with the link can view") before handing this to GLM — steps 1–2 above depend on both.
