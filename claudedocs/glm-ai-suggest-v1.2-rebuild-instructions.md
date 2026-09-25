# GLM Task: Rebuild AI Suggest per Mark's v1.2 spec (Phase 1)

> ✅ **DONE — 2026-09-25.** Built on branch `feat/ai-suggest-v1.2` (6 commits, awaiting merge on Mark's go-ahead — see `wildcast-app/STATUS.md` → "AI Suggest v1.2 rebuild" for the full state, handoff notes and post-merge follow-ups).
>
> What shipped: new sheet reader (`api/_lib/campaignSheet.js`), brief + prompt + tool + §9 checks (`api/ai-suggest.js`, `api/_lib/checks.js`), §5.1 presets (`api/presets.js`), pair/queue client (`src/lib/usePairQueue.js`, `src/components/AISuggest.jsx`, `src/components/FieldEditor.jsx`), §4.1 field settings for Options A/B/C (`src/data/templateZones.js` — §11 ESTIMATE values, Julia still owes measured ones), Prompt Brief chat moved to the new contract. Two independent review rounds: 10 bugs + 1 blocker + 3 smaller issues found and fixed (all recorded in STATUS.md). All 12 §11 test briefs run — 11 via `wildcast-app/scripts/run-12-briefs.mjs` against the Vercel preview, T12 manually by Julia. JSON sent to Mark 2026-09-25.
>
> Deferred (do NOT rebuild without a scoping conversation, per "Explicitly deferred" below): partner history (§4.4) and usage logging (§10).

**Supersedes** the earlier `glm-ai-copy-database-update-instructions.md` — that assumed a simple sheet swap with the same schema. Mark's spec (`wildcast-generate-with-ai-spec.md`) replaces the schema and the generation logic entirely. Use this document instead.

## Before you start

```bash
git fetch origin
git checkout main
git pull origin main
git checkout -b feat/ai-suggest-v1.2
```

Never work on `main`. Run lint/typecheck/test before staging anything.

## Reality check on scope (read this first)

Mark's spec (attached, `wildcast-generate-with-ai-spec.md`) is a full rebuild of AI Suggest — new system prompt, new example-selection scoring, a forced-JSON tool schema, a client-side suggestion queue, and a checks/validation layer. It's bigger than "swap the database," and it assumes some data (partner records, per-template box limits, usage logs) that doesn't fully exist in WildCast today.

We checked the actual codebase against every data requirement in Mark's spec. Verdict: **most of it can be built directly on WildCast's current architecture** (flat JSON files, no database) — it does NOT require adding a real database. **Two things are genuinely new infrastructure**, not just wiring: partner history and usage logging (see "Explicitly deferred" below). Everything else in this brief is buildable now.

## The new database (already confirmed)

Google Sheet `wolt-copy-kb-clean.xlsx`: https://docs.google.com/spreadsheets/d/1FQ5R_go_zlA3RXddZ3wddEMbTVpbOcOY/edit — live, shared as "Anyone with the link — View only," no sign-in required. Its tabs: **Copy Library**, **Skeletons**, **Patterns**, **Rules**, **Verticals**, **Layouts**, **Fineprint**, **Changelog**. This fully replaces the old two-tab schema ("Headline Library" / "Vertical Guide") that `api/_lib/campaignSheet.js` currently reads — this is not an additive change, the column structure is different (`Copy Library` uses `use_as_example`, `field`, `language`, `vertical`, `tier`, `merchant`, `mechanic`, `city`, `category`, `pattern`, `Lockup: Sub-headline`, `Lockup: Headline`, `Source`, etc. — see spec §5 for the exact scoring fields).

## Files to change

- `api/_lib/campaignSheet.js` — rewrite the sheet loader for the new `Copy Library` / `Skeletons` / `Patterns` / `Verticals` tabs and columns. Update `SHEET_ID` to the new sheet's ID (from its URL).
- `api/ai-suggest.js` — rewrite to: build the brief JSON (spec §4.5), run the example-selection scoring (spec §5), use the new system prompt (spec §6, copy verbatim, insert the Patterns table at `{{PATTERNS_TABLE}}`), and call the new `return_pairs` tool schema (spec §7.1) instead of the current one.
- `api/presets.js` — rewrite to read from the same new sheet (spec §5.1): tier A/B only, filtered by the `Lockup: Headline` / `Lockup: Sub-headline` columns and box-fit (`max_chars_min_pt`), matching vertical.
- `src/components/AISuggest.jsx` — needs to move from "one field, one click, one API call" to the pair/queue model (spec §8.2): clicking Headline shows a pair and stores the sub-headline as a "partner line" so a subsequent Sub-headline click shows the matching line with no new API call.
- `src/data/templateZones.js` — add the field-settings block from spec §4.1 (`max_chars`, `max_chars_min_pt`, `max_lines`, `default_pt`, `min_pt`, `role`, `position`, `static_text`, `other_fields`, `caps`) to the Headline and Sub-headline zones of Restaurant Flyer templates A, B, and C only. **Use the estimated numbers from spec §11 as placeholder values** (Option C: sub-headline 20/24, headline 9/11; Option B: sub-headline 16, headline 10/12) — these are explicitly marked as estimates in the spec, not final. Julia still owes real measured values (see "What Julia still needs to do," below); don't block on it, ship with the estimates and it's a one-line update later.
- `src/components/FieldEditor.jsx` — the current `CHAR_LIMITS` is one global object; for headline/sub_headline on templates A/B/C it now needs to read the per-template values from `templateZones.js` instead (other fields/templates keep using the current global fallback).

## What to reuse instead of building new (important — avoids scope creep)

- **Partner identity:** WildCast has no `partner_id` system. Don't build one. Reuse what already exists: `merchantForUpload` in `src/lib/assetLibrary.js` already derives a partner/merchant name string from `fields.restaurant_name`. Use that same string as `partner.name` in the brief JSON (spec §4.5). `campaignSheet.js`'s existing `filterRowsByPartner` already matches on partner name text — same pattern, no new ID needed.
- **Format:** every current template is A6. Hardcode `format: 'flyer_a6'` in the brief for now rather than building a format-selection system — there's nothing else to select yet.
- **City/district:** there's currently no city/district field anywhere in the app (not on designs, not on partners). Spec examples lean on city for some patterns (T1, T5, T9, T10). For Phase 1, treat `city`/`district` as optional/blank in the brief — the model already knows to work without them (spec's own T6 test covers "too little context"). **Flag to Julia** (don't decide silently): adding a simple city text field to the briefing form would noticeably improve output quality on local-flavor lines, but it's a UI addition outside this task's current scope — her call whether to add it now or later.
- **Credits:** the existing client-side decrement (`handleAiCreditUsed` in `src/App.jsx`) already exists. Just change *when* it fires — once per new batch generated (spec §8.1), not once per click. Serving from the queue or "Choose preset" should NOT decrement it. No new backend needed for this.
- **Queue:** build this as in-memory React state (same pattern as the existing `byLang` cache in `AISuggest.jsx`), scoped per `design_id + context_hash` as the spec describes (§8.1). It does not need to persist to a database — it's meant to reset when context changes anyway, per the spec's own "Reset" rule.
- **Checks (spec §9, C1–C12):** these are pure validation logic run against the AI's own output plus data already in the brief (offer facts, static text, exclude list, locked field). No new data model needed — implement them directly in `ai-suggest.js` after the API call returns.

## Explicitly deferred — do not build without a follow-up scoping conversation

- **Partner history** (spec §4.4 — last 10 approved/exported designs per partner, sent to the model as reference). Requires scanning saved designs by partner and by an "exported" state that doesn't fully exist yet (`reviewStatus` today is `design / review / changes_requested / approved` — no `exported` flag). Doable as another flat JSON lookup, following the existing `api/save-project.js` pattern, but it's new work, not a rewire — scope it separately once Phase 1 is live.
- **Logging / the weekly learning loop** (spec §10) — no usage-logging table exists today (no `batch_id`, `pair_id`, `kept`/`edited`/`skipped` tracking anywhere). This is genuinely new infrastructure (a new blob store, following the pattern of `api/comments.js`) and a manual weekly review workflow on Julia/Annika's side. Separate task.

## What Julia still needs to do (Mark assigned these to her in spec §13 — not GLM's job)

- Real measured box limits for Headline/Sub-headline on Restaurant Flyer A, B, C (spec §4.1) — GLM is shipping with Mark's estimated numbers in the meantime.
- Decide the Option B guided-mode fix (make "WIE WÄR'S MIT" an editable Sub-headline field, like Option C).
- Decide the Option B app-download-line default text fix.
- Confirm every logo in the asset library carries a usable partner name (mostly already true via `merchantForUpload`, per above).

## Verify before opening a PR

Run the 12 test briefs from spec §11 against the real API (this is Mark's own stated finish line for this phase — send him the raw JSON for each one). Confirm:
- Every pair passes the §9 checks.
- Headline/sub-headline read as one message (spot-check a few by eye).
- Vertical gating still holds (Restaurant briefs never get Retail language and vice versa).
- The queue behavior from T12 works: second click on a different field shows the matching partner line with no new API call; third click on the original field starts a new pair and shows the "Matching sub-headline →" link.
