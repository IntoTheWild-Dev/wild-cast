# Prompt Brief Chat — "AI Chatbox Improvements" Developer Brief

**Date:** 2026-09-28
**Status:** ✅ Built (GLM `7f770c0`) and extended through Julia's live testing on 2026-09-28 — this brief is now historical. Current state, what changed beyond it (chat-first template choice, no scripted fallback — both Julia's calls), and what's still open live in `wildcast-app/STATUS.md` → "Prompt Brief chat rework + AI Suggest v1.2 combined".
**Repository:** https://github.com/IntoTheWild-Dev/wild-cast
**Branch:** `AI-Chatbox-Improvements` (already cut from latest `main` — work on this branch, do not create a new one, do not touch `main` directly)

This brief is written for a developer (or AI coding assistant) with no prior context on WildCast or this feature. It is a first pass, meant to be reviewed and refined before merge — not a final spec.

## 1. Background

WildCast's "Prompt Brief" flow lets a partner brief a print flyer through a chat instead of filling out a form. It already shipped (see commits `393c8b8`, `cac82b7`, `241352b`) and is live. The product owner's ask now is to make it feel less like a rigid Q&A chatbot and more like briefing an actual assistant. Her literal note:

> **What it does:** Not a chat robot. The user follows the questions, or pastes a whole brief and the assistant asks only for what is missing. It recognises the partner and offers what it already holds: "This is Wen Cheng. We have the logo. Use it?" Note: credit heavy, so it has to be priced.
>
> **Test line:** A user pastes a three-line brief and gets a filled draft after two clarifying questions.

## 2. How the current implementation actually works

Read these files before changing anything — the architecture already supports more than it looks like from the UI:

- `wildcast-app/src/components/PromptBriefChat.jsx` — the chat UI. Renders one step at a time from a fixed `steps` array, drives the composer (single-line `<input>`, chips, or upload dropzone depending on the current step's `kind`).
- `wildcast-app/src/lib/promptBriefFlow.js` — builds the ordered step list per template: 3 fixed form questions (partner, objective, project name) + one question per zone the chosen template defines (`logo`, `headline`, `sub_headline`, `photo`, `tc`, `cta`, `offer`, plus any custom zone). Also has `assembleBrief()`, which turns final `answers` into the shape the rest of the app (editor, save pipeline) already expects.
- `wildcast-app/api/prompt-brief-chat.js` — serverless endpoint, calls Claude Haiku (`claude-haiku-4-5-20251001`) once per chat turn. **The model never decides what to ask.** The app sends it the full ordered step list + current answers + last 8 messages; the model's only job is (1) figure out which step(s) the partner's typed message answers, (2) write a short acknowledgement, (3) phrase the next open question naturally. Every recorded answer is re-validated server-side (§3) before the client ever sees it — the model's claims are never trusted directly.
- `wildcast-app/src/lib/promptBriefAI.js` — client wrapper. Returns `null` on any failure/timeout, at which point the chat falls back to the fully scripted, single-question-at-a-time flow with canned acknowledgements. **This fallback path must keep working** — it's the safety net if the AI call is down or times out.
- `wildcast-app/src/lib/assetLibrary.js` — shared asset library (Vercel Blob-backed). `getLibraryAssets()` returns every stored asset with `{ folder, merchant, name, url, src }`. `assetFolderForZone(zoneId)` maps a zone id to a folder (`logo` → `logos`, `photo` → `product-images`, etc.). This is the *exact same* library the editor's own "Choose from library" and the chat's existing `PromptBriefAssetPicker.jsx` already use — nothing new needs to be built for storage, only for how the chat *offers* what's already in it.
- `wildcast-app/src/lib/briefConstants.js` — `PLACEHOLDER_PARTNERS` is a hardcoded list of 4 partner names (no real partner backend yet — this is a known, accepted limitation, not something this task should try to fix).

### Server-side validation rules already in place (do not weaken these)

In `api/prompt-brief-chat.js`:
- A recorded text answer must literally appear (case/whitespace-normalized) in what the partner actually typed — the model cannot paraphrase or invent an answer.
- Chip/option answers must match a real option's value or label.
- Text answers longer than the step's `maxLength` are rejected with an explicit "too long" acknowledgement, not silently truncated.
- The **next step to ask is always computed deterministically** server-side (`allSteps.find(s => applies(s, settled) && !settled[s.id])`) — the model's own `askStepId` guess is only used if it matches; otherwise the app's own scripted `ask` text for that step is used verbatim.

Keep this validate-everything posture for any new behavior you add.

## 3. Scope for this task

Three items, all confirmed in scope — the third is a verify-and-fix-only-if-needed item, not a ground-up build:

### 3.1 Paste-and-extract as a real entry point

Today the multi-answer extraction already exists in the Haiku tool call (`recorded` is an array — several steps can be filled from one message), but it's hidden behind a UI that always opens by asking question 1 first, and a hard `MAX_MESSAGE = 600` character cap that a real pasted brief could exceed.

**Requirements:**
1. On the chat's opening turn, alongside (not instead of) the first scripted question, give the partner an obvious way to paste a whole brief instead of answering one question at a time — e.g. a visible "Paste your brief instead" affordance that expands the composer into a multi-line textarea. Don't force a decision up front; both paths must stay available at any point in the conversation, not just turn one.
2. The composer needs to accept multi-line free text. It is currently a single-line `<input>` (`PromptBriefChat.jsx`, the `inputRow` block) — this needs to become a `<textarea>` (auto-growing, Enter still submits unless Shift+Enter, same as the existing single-line behavior) when the partner is composing a longer message. Match the existing input's visual style (border, radius, focus color) rather than introducing a new pattern.
3. Raise `MAX_MESSAGE` in `api/prompt-brief-chat.js` to comfortably fit a real pasted brief (a few paragraphs — suggest 2000 characters, but sanity-check against Haiku's `max_tokens: 500` output budget and the `TIMEOUT_MS = 8000` request timeout; a much longer input may need a higher `max_tokens` and/or timeout too. Verify empirically rather than guessing.).
4. After a paste, the assistant should record every step it can confidently match (already-existing `recorded` mechanism), acknowledge briefly, and then ask **only** about what's left open — exactly the existing `next` step logic, just exercised with a bigger first message instead of many small ones.
5. Verify the fallback (Haiku unreachable) degrades sensibly: a giant pasted message hitting the scripted fallback path (`promptBriefAI.js` returns `null`) should not crash or behave strangely — at minimum it should be treated as free text for the currently-open step, same as today.

### 3.2 Partner recognition + asset reuse offer

Today, `logo` and `photo` steps always ask for a fresh upload (or "Choose from Assets", which requires the partner to manually search), even when that partner already has a logo on file from a previous design.

**Requirements:**
1. As soon as the `partner` step is answered (chip pick or typed name — see `partnerNameFrom()` in `promptBriefFlow.js`), look up that partner's existing assets via `getLibraryAssets()`, filtered to `merchant === partnerName` (case-insensitive match — merchant names are free text, so exact-case matching will miss real matches).
2. When the chat reaches an upload-kind step (`logo`, `photo`, or any other `kind: 'upload'` zone) and a matching asset already exists for that partner in the right folder (`assetFolderForZone(step.id)`), change how that step is presented: lead with an option to reuse the existing asset (show its thumbnail + name), and still offer "Upload something different" and the existing "Choose from Assets" picker alongside it. Reusing an asset should behave exactly like `pickAsset()` does today (same `submit(step, { value, display, imageUrl })` shape) — don't build a second code path for the same outcome.
3. The assistant's message text for this case should say what it found, plainly — the product owner's own example: *"This is Wen Cheng. We have the logo. Use it?"* — not a generic "here are some options." If there's no Haiku-authored line for this turn (e.g. the fallback path, or the step was reached without user text), fall back to a clear scripted equivalent in `promptBriefFlow.js`'s `ZONE_QUESTIONS`.
4. If a partner has assets in multiple matching files (e.g. two logos on file), don't guess — offer the reuse option only when there's exactly one unambiguous match; otherwise fall through to today's normal upload/Choose-from-Assets behavior (the existing picker already handles "many assets, let them choose").
5. This lookup is a plain fetch against the existing `/api/library-assets` route (same one `PromptBriefAssetPicker.jsx` already calls) — no new backend endpoint should be needed. If you find you need one, stop and flag it rather than assuming.

### 3.3 Auto-place/resize parity with the canvas's AI Suggest behavior

Julia's third requirement: when a partner briefs a design through this chat (whether one question at a time or via the §3.1 paste), the resulting headline/sub-headline/etc. should auto-place and auto-resize to fill their zone — the same behavior the canvas already gives text applied via AI Suggest (`AISuggest.jsx`) in the regular editor. Her words: "it auto-places and resizes just like we did before."

**What's already true (verify this first, do not rebuild it):**
- `AISuggest.jsx` itself does not contain any resize logic — it only fetches copy suggestions and calls `onApply(text)`. The actual auto-grow/shrink is a zone-level effect in `wildcast-app/src/components/TemplateCanvas.jsx` (around lines 663-699), gated purely on each zone's `autoShrink` flag, and by its own comment runs "for every autoShrink zone regardless of mode" — i.e. it doesn't matter whether the text arrived by typing, AI Suggest, or anything else. It re-measures and resizes whenever a zone's text field changes.
- `PromptBriefResultModal.jsx` (the chat's "here's how it looks" finished-design screen, and the source of what "Edit design" opens into) already renders through this exact same `TemplateCanvas` component — see line 254 — fed by `assembleBrief()` → `buildCandidateFields()`, the same `fields` shape the classic brief-form → editor pipeline has always used.

So on paper, the chat's filled-in text should already auto-resize correctly, for free, with no new code — **because it's the same canvas, not a separate renderer.**

**What has NOT been confirmed (this is the actual task):**
- This has only been verified by reading the code, not by running it. Local `vite dev` has no `/api` routes (confirmed: even the activation-key login fails locally), so this needs a real Vercel preview deploy to test.
- **Step 1:** On a real preview of this branch, brief a design through the chat with a short headline (e.g. 2-3 characters, well under the zone's natural size) and a long one (near/over the character limit). Confirm both grow/shrink to fill their zone exactly as the same text would if typed directly into the editor or applied via `AISuggest.jsx` there.
- **Step 2:** Only if that test shows a real gap (e.g. the chat's preview shows unresized/default-size text, or "Edit design" opens with the wrong size), diagnose why — likely candidates: a zone missing `autoShrink: true` when reached via this path, or `buildCandidateFields()` producing a `fields` shape `TemplateCanvas` doesn't treat the same way as the classic brief form's output. Fix that specific gap; do not add a parallel resize mechanism.
- If Step 1 passes, this requirement needs **no code change** — just note it as verified in the PR description.

## 4. Explicitly out of scope for this pass

- Any change to how partners are stored/looked up (`PLACEHOLDER_PARTNERS` stays a hardcoded list — a real partner backend is a separate, larger piece of work).
- Credit/pricing logic. The product owner flagged that this feature is "credit heavy" and "has to be priced," but did not ask for metering or pricing UI in this pass — flag your actual API-call counts (how many Haiku calls a typical paste-and-extract session uses vs. today's one-question-at-a-time flow) in your PR description so that conversation can happen with real numbers, but do not build a pricing/credit-limiting mechanism.
- Redesigning the chat's visual style, the result modal, or anything downstream of `assembleBrief()`.
- Changing the Haiku model, its system prompt's core contract (deterministic next-step, app-owns-the-questions), or the validate-everything posture in §2 — these are deliberate, documented design decisions, not incidental.

## 5. Working rules while building this

- Branch `AI-Chatbox-Improvements` already exists off current `main` — work there. Re-pull `main` before opening a PR in case it's moved (this repo has 2-3 people, including other AI assistants, committing directly to `main`).
- Read a file fully before editing it — several of these files have load-bearing comments explaining *why* something is the way it is (e.g. the fallback-must-keep-working note, the char-limit duplication note). Don't remove or contradict those without understanding why they're there first.
- No placeholder/TODO code, no stubbed functions — every change should be in a working, testable state.
- Match this codebase's existing style: inline styles via style objects (no CSS framework), comments only where they explain non-obvious *why* (see the existing files for the level/tone), no speculative abstraction beyond what §3 asks for.
- Run whatever lint/build check this project uses before considering a change done (check `wildcast-app/package.json` for the actual scripts).
- Test the real thing, not just a read-through: run the dev server, actually paste a multi-line brief into the chat and confirm it fills multiple steps in one turn, and actually confirm the partner-recognition prompt appears for a partner with existing assets in the library.

## 6. Future phase — context only, not part of this ask

**Do not build this now.** Documented here only so nothing in §3 accidentally forecloses it.

Julia's fourth requirement, deferred to its own follow-up brief once §3.1-3.3 have shipped and been tested: today, once the chat has every answer, it shows the finished design once (`PromptBriefChat.jsx`'s `finish()` → `PromptBriefResultModal`) and stops — the only next steps are "Edit design" (full editor) or "Send for review." She wants the chat to stay alive after that point and proactively offer further changes ("want to change anything — headline, subline, photo?"), then handle those conversationally, re-rendering the preview (and re-running the §3.3 auto-resize) after each change.

This is a materially bigger lift than §3.1-3.3: the current Haiku prompt and step-matching logic in `api/prompt-brief-chat.js` only know how to move forward through a list of *open* steps — there's no concept of going back and revising an *already-answered* one. It will need its own design pass on: how the model distinguishes "revise an existing answer" from "answer" intent, how the preview re-renders live rather than once at the end, and how revisions to image zones (re-upload, re-pick from Assets) fit the same conversational pattern as text zones. Flag this to Julia once §3.1-3.3 are landed and tested — don't start it speculatively.

## 7. Acceptance criteria

- [ ] Chat still works exactly as today when a partner answers one question at a time (regression check — this is the fallback path and must not break).
- [ ] A partner can paste a multi-line brief (test with the product owner's own scenario: paste a three-line brief covering partner, objective, headline, sub-headline) and the chat fills every step it can confidently match in one turn, then asks only about what's left.
- [ ] The remaining-questions count for a reasonably complete 3-line paste is low (the product owner's own bar: "filled draft after two clarifying questions" — treat this as the target to test against, not a hard technical constraint, since it depends on how much the pasted brief actually covers).
- [ ] For a partner with an existing logo in the asset library, the chat's logo step offers to reuse it, phrased plainly ("This is \<Partner\>. We have the logo. Use it?" or equivalent), and picking it produces the same result as today's "Choose from Assets" flow.
- [ ] For a partner with no existing assets, or with ambiguous multiple matches, the upload step behaves exactly as it does today — no regression, no broken guess.
- [ ] No change in behavior when the Haiku API call fails or times out — scripted fallback still functions, including for pasted multi-line text.
- [ ] A short and a long headline/sub-headline briefed through the chat auto-resize to fill their zone on the finished-design preview and in the editor after "Edit design," matching what the same text would do if typed directly into the editor or applied via AI Suggest there (§3.3). If this already passes with no code change, say so explicitly in the PR — don't add new resize logic just to have something to show.
- [ ] PR description states the actual Haiku call count per typical session, old flow vs. new flow, so the credit/pricing conversation has real numbers.

## 8. Handoff note

This brief was drafted by Claude after reading the current implementation end-to-end (§2) so the next developer doesn't have to re-derive it. It's a first pass — flag anything that turns out to be wrong once you're actually in the code, rather than working around it silently.
