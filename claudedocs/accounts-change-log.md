# Accounts & sign-in — change log

Running record for the executive write-up. Newest first. Each entry: what, why, how it was tested.

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
