# Accounts & sign-in — change log

Running record for the executive write-up. Newest first. Each entry: what, why, how it was tested.

## 2026-09-30 — Steps 3, 4, 5: AI access checks + usage, key switch-off, wrong-password lock
**Step 3 — AI features now check who is calling, and record usage.**
`ai-suggest` and `prompt-brief-chat` refuse anyone who is not signed in (401), so a stranger with the web
address can no longer spend Anthropic credit. Each call is counted per person per day. **No credit cap** (Julia's
call). A team-only report at `/api/usage` shows totals per person and per feature, so a cap can be decided
later from real numbers. A failed usage write never blocks the feature.

**Step 4 — activation-key switch-off, ready but OFF until you set it.**
Set `ACTIVATION_KEYS_END` in Vercel to `2026-10-05T00:00:00+02:00` (Monday 5 Oct, Hamburg time). From that
moment every shared key stops working everywhere (sign-in, template management, AI), including for people
already signed in with one. Personal accounts are unaffected. Unset = keys keep working. A typo'd date is
ignored with a warning so nobody is locked out by accident. The key tab on the sign-in screen now tells key
users about 5 October (that text is fixed; keep it in step with the variable).

**Step 5 — wrong-password lock.** 5 wrong passwords for one email within 15 minutes locks sign-in for that
email for 15 minutes; a correct password clears the count; other emails are unaffected. Trade-off: while
locked even the right password is refused, so someone could nuisance-lock a colleague for 15 minutes.
Not covered: guessing across many different emails (no per-IP limit yet).

**Tested:** 26 automated tests in total, all pass (11 new for these steps: unauthenticated AI calls refused,
account/key/stale-token cases, per-person usage counting and summary, usage failures ignored, key cutoff
before/after the date and bad-date handling, lock after 5 failures, unlock after 15 minutes, count cleared by a
correct password, one email locked does not affect another). Deliberately breaking the AI check and the lock
made the matching tests fail. Sign-in screen checked in a real browser (key-tab notice; team address reveals
the invite-code field and shows the refusal message). App builds. Not yet tested against live storage or the
real AI service; that needs the Vercel preview.

## 2026-09-30 — Step 2: team accounts can publish and manage templates
**What:** publishing, archiving, editing zones and deleting templates now accept a personal team account
(`@wildstack.studio` / `@intothewild.hamburg`), not only the old shared key. The browser sends the person's
email and session token with those actions; the server checks the token is their latest sign-in and that their
role is team. Clients are refused. The old shared keys keep working until they are switched off.

**Why:** the problem was real. Account sign-ins never sent a key, so a team member saw the manage buttons and
was then refused with a 403. Reproduced first with a failing test (2 of the new tests failed), then fixed.

**Tested:** 6 new automated tests (15 total, all pass): shared keys (team/designer allowed, client refused),
team account with valid session allowed (incl. different email casing), stale or wrong token refused, client
account refused even with a valid session, missing/unknown/empty credentials refused. App build passes.
Not yet tested in a browser against live storage.

## 2026-09-30 — Step 1: team domains + approval for team sign-ups
**What:** `@intothewild.hamburg` now counts as a Wild Stack team address alongside `@wildstack.studio`.
A *new* team-address sign-up must be approved: either the exact email is on an approved list, or the person
enters an invite code. The sign-in screen shows an "Invite code" field only when needed. An earlier
`@intothewild.hamburg` account that was stored as a client is promoted to team at login if its exact email is
on the approved list. Existing team accounts and client accounts are unaffected.

**Why:** roles came purely from the typed email, with no proof of ownership, so anyone could sign up as
`anyone@wildstack.studio` and get full access including Figma import.

**Needs from Julia before this is live:** set two Vercel environment variables (Production):
- `AGENCY_APPROVED_EMAILS` — comma-separated team emails, e.g. `julia@wildstack.studio, anang@intothewild.hamburg`
- `AGENCY_INVITE_CODE` — one shared code to give new team members
If neither is set, no *new* team-address sign-up is possible (deliberately fails closed). Logins are unaffected.

**Tested:** 9 automated tests (`npm test`) run the real sign-up handler against an in-memory store: client
signs up as client; unapproved team address refused (both domains); wrong code refused; right code and
approved-list email succeed; nothing configured = refused; look-alike domain (`wildstack.studio.evil.com`) is a
client; team login works without a code, wrong password refused; promotion only for approved emails.
Breaking the approval check on purpose made 3 tests fail, so the tests do catch it. App build passes.
Not yet tested in a browser or against live storage.
