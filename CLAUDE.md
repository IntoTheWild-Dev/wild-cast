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
