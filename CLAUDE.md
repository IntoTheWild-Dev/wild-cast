# WildCast — Working Rules

Read this before doing any git work in this repo. See `WILDCAST_CLAUDE.md` for
the product/architecture spec and `wildcast-app/STATUS.md` for build history.

## Always pull from `main` before branching

**Before creating any new branch, always `git fetch` + pull the latest `main`
first — not just before pushing.**

```bash
git fetch origin
git checkout main
git pull origin main
git checkout -b your-branch-name
```

**Why this matters here specifically:** this repo has more than one person
(and more than one AI assistant) working on it at the same time, sometimes on
the exact same task without knowing it. On 2026-09-24, this happened twice in
one session:

- A branch was cut from a `main` that was already a few commits behind, and
  by the time it was ready to merge, `main` had moved and the PR conflicted.
- Independently, two different people (Julia + Claude, and Anang + Claude)
  each picked up the same Notion card ("remove AI Suggest from factual
  fields") and built two separate, overlapping fixes without either side
  knowing the other was in progress — one had already been merged into `main`
  by the time the second one was ready, forcing a "close mine, follow up on
  top of theirs instead" cleanup.

Branching from a stale `main` doesn't just risk a merge conflict — it risks
silently duplicating a teammate's already-merged work. Anang asked for this
exact rule on 2026-09-21, and Julia asked for it again on 2026-09-24 — if
you're reading this because it keeps needing to be repeated, that's the
point of this file: don't rely on memory across sessions for this one,
just always do it.

**Before opening a PR, also re-fetch and check `main` hasn't moved again**
since you branched — a long-running branch can go stale mid-task, not just
at the start.

## Other durable rules

- **Never work directly on `main`.** Every change gets its own branch, even
  a one-line fix.
- **Verify before claiming done.** Don't report a fix as working from reading
  the code alone — run it (a real test script, a browser check, an actual
  generated file) and show the result.
- **Read `wildcast-app/STATUS.md` before starting non-trivial work** in an
  area you haven't touched recently — it's the authoritative build history
  and often already documents a relevant past bug, decision, or rejected
  approach (e.g. Ghostscript for CMYK export was already tried and abandoned
  once — see STATUS.md's CMYK/color section before re-proposing it).
- **Figma plugin work (added 2026-10-05, after a day of avoidable churn):**
  - The plugin can't be run from the Claude cloud sandbox, and
    `cast.wildstack.studio` is blocked by the egress policy (no production
    records, no server logs). So **ask for the plugin's final message and a
    screenshot before guessing**, and make every plugin step report its own
    result in that message.
  - **Never tell the designer to un-hide `zone:` content layers** for an import:
    a visible layer is baked into the background PNG/PDF as well as being an
    editable zone. Hidden content is exported from a temporary visible copy.
  - **Don't stack a new plugin step on one that hasn't been confirmed live.**
    Keep each upload small and independent. The plugin's extra files are only
    *saved* at fixed names (`<slot>-tile.png`, `-ph-photo.png`, ...) and
    `list-templates.js` attaches them by name - **never store links to them in
    `templates/<slot>.json` and never rewrite that record after the main
    import**: Vercel Blob reads can lag a write by ~30s, and a rewrite from a
    stale read puts an old record back and drops anything newer (this made the
    tile and photo vanish after a perfect import). Any new read-modify-write of
    the record must send `expectedCreatedAt` so a stale copy gets a 409, not a write.
  - `manifest.json` doesn't change between plugin versions - bump the version
    line in `figma-plugin/ui.html` on every plugin change and send a fresh zip.
  - Layer naming is by **exact name** (`sub_headline`, not `subline`); the
    table is at the end of `wildcast-app/STATUS.md`.
  - To correct artwork in an already-imported template, use the plugin's
    **Update background only** (it writes only `<slot>-bg.png` + PDF + tile) -
    don't tell the designer to redo the import, which resets zone settings made
    on the review screen.
