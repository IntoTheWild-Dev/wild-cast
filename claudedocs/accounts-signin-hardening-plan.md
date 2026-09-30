# Accounts / sign-in — status check + build plan

Written 2026-09-29 from a read-only review of `main` @ `5774b7a`. Nothing here has been run;
findings are from reading the code and `wildcast-app/STATUS.md` (items 6, 7, 15, 36).

## Was it completed?

**Yes, the original task shipped.** Team sign-in (email + password, first login = signup) is on `main`:

| Piece | File |
|---|---|
| Signup-or-login route, scrypt hashing, role by email domain | `api/account-auth.js` |
| Session re-check on reload | `api/account-session.js` |
| Seat count endpoint (hidden while `SEAT_CAP = Infinity`) | `api/account-seats.js` |
| Shared helpers, auto-created personal folder | `api/_lib/accounts.js` |
| "Activation key" / "Sign in" tabs, name step for new emails | `src/components/ActivationGate.jsx` |
| Restore-on-mount branching on `wildcast_auth_type` | `src/App.jsx` ~449, ~709 |
| Sign-out clears both paths | `src/components/Header.jsx` ~90 |

STATUS.md records it verified against production (signup, wrong password, token rotation, reload, sign-out).
The seat cap was lifted for the pilot (item 36).

## What is NOT done / gaps found

Ordered by how much they matter.

1. **Account-signed-in `agency` users are likely blocked from designer routes.**
   `requireDesignerKey` (`api/_lib/auth.js`) only checks `X-Activation-Key` against `WILDCAST_KEYS`.
   `activationHeaders()` reads `wildcast_activation_key`, which account login never sets. So someone with a
   `@wildstack.studio` account sees the manage UI (role = agency) but publish/delete template calls
   (`TemplatePicker.jsx`, `TemplateImportPage.jsx`) should return 403. Needs a live check first.
2. **AI credits reset to 100 on every sign-in.** `ActivationGate.jsx` writes `ACCOUNT_DEFAULT_CREDITS` on each
   login, and credits live only in `localStorage`. Sign out / in = free refill; nothing per-seat on the server.
3. **No server-side identity on most routes.** Only two routes are gated, and only by activation key.
   `save-project`, `folders`, `move-project`, `delete-project`, `comments`, `ai-suggest`, `prompt-brief-chat`
   trust whatever email/name the client sends (STATUS.md line 94 already flags the AI routes).
   `account-session.js` is never called by the API side.
4. **No brute-force protection** on `account-auth.js` (no rate limit or lockout).
5. **No email verification and no password reset.** A typo'd email silently creates a new account; a forgotten
   password has no recovery path (needs an email service, a known prerequisite).
6. **Single session slot.** One `sessionToken` per account, so signing in on a second device logs out the first.
   Token stored in plaintext in the blob.
7. **No management screen** for seats/accounts (STATUS.md section 0, "planned, not scoped").
8. **Race:** two simultaneous first sign-ins for one email can both pass `findAccount` and the last `put` wins.
9. **No automated tests** for any of this (`package.json` has only dev/build/lint).

## Proposed build (tomorrow), in order

Each step is its own small commit; verify each one for real before moving on.

1. **Confirm gap #1 live** (sign in with a test `@wildstack.studio` account, try publish/delete template).
   *Fix:* extend `requireDesignerKey` to also accept `X-Account-Email` + `X-Account-Token`, validated the same
   way `account-session.js` does, and have `activationHeaders()` send whichever identity is active.
   Put the shared token-check in `api/_lib/accounts.js`.
2. **Shared `requireSession` helper** in `api/_lib/auth.js` (accepts key or account token, returns
   `{ email, role }`). Apply it to the routes in gap #3, starting with `ai-suggest` and `prompt-brief-chat`
   (cost exposure), then the project/folder write routes. Decide per route whether to enforce or log-only first.
3. **Server-side credits.** Store `credits` on the account blob, decrement in `ai-suggest`/`prompt-brief-chat`,
   stop resetting on login. Client reads the value from the login/session response.
4. **Rate limit login**: per-email + per-IP counter (blob or KV), e.g. 5 failures then a 15-minute delay.
5. **Small UX/safety fixes:** confirm-email field on first signup, clearer "wrong password" vs
   "new account" states, atomic create (fail if the blob already exists).
6. **Parked, needs a decision:** password reset + email verification (needs an email provider),
   multi-device sessions, accounts management screen.

## Decisions from Julia (2026-09-30) — planning only, nothing built yet

1. **Agency access = email domain.** Anyone with a `@wildstack.studio` **or `@intothewild.hamburg`** address is
   `agency`: full access, including publish templates and Figma import. (Today only `wildstack.studio` is
   recognised — `WILD_STACK_DOMAIN` in `api/_lib/accounts.js` becomes a list of two domains.)
2. **Client access = every other email** (mostly DoorDash / Wolt). Role `partner`: **no import**, no template
   publishing. For now they get both the **Manager and Designer** workflow toggle in the header.
   (Assumption to confirm: "Designer access" means the Manager/Designer toggle, not template management.)
3. **AI credits stay uncapped for now** until Julia understands usage better. So the server-side credits step
   is parked; we should still *log* AI usage per account so real numbers exist when the decision comes.
4. **Activation keys stay active this week only**, then account sign-in only. Needs: an exact cutoff date,
   a heads-up to key users so they create accounts first, and a switch (flag/date) rather than deleting the
   key code. Note projects saved under a key are owned by the key string, not a person.
5. **Executive write-up required at the end**: what we did and how it works, in plain language.
   Keep a running log of every change (what, why, how it was tested) so the write-up is easy to produce.

### New risk raised by decision 1
Roles are handed out purely by typing an email address, and there is **no email verification**. Anyone who
types `anyone@wildstack.studio` (or `@intothewild.hamburg`) at sign-up gets full agency access, including
import. This must be fixed before keys are switched off: either email verification (see below) or, as a
stop-gap, an allow-list / invite code for agency sign-ups.

### Email service (planning notes)
- **What it does:** sends two kinds of email: (a) a "confirm your email" link at sign-up, agency role only
  granted once confirmed; (b) a "reset your password" link.
- **Pieces:** an email provider account (e.g. Resend or Postmark); DNS records on the sending domain so mail
  isn't marked as spam; an API key stored as a Vercel env var; a small send helper; token + verified flag on
  the account; two new screens (check-your-inbox, set-new-password).
- **Effort (estimate):** ~1 day of build and testing, plus ~1–2 hours of setup and DNS access from whoever
  manages the domain (DNS can take up to a day to take effect). Free tiers should cover this volume; check
  current pricing before choosing.

## Original open questions (answered above where noted)

- Should `@wildstack.studio` accounts be allowed to publish/delete templates like the shared Wild Stack key can?
- Server-side credits: per-seat 100 total, or monthly? Do Wild Stack (`agency`) accounts get a cap at all?
- OK to enforce auth on the project/folder routes right away, or log-only for a few days first (risk: breaking
  existing shared-key partners)?
- Pick an email provider now (Resend / Postmark) so reset + verification can follow?

## Rules for the build session

Follow `CLAUDE.md`: fetch + pull `main` before branching, re-check `main` before opening a PR, verify by
running it (real requests / browser), never work on `main`.
