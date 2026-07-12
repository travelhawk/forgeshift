---
name: adopt
description: Bring an EXISTING codebase under the harness - maps the code, reverse-engineers an as-built spec, seeds PROGRESS.md and a project CLAUDE.md so the full lifecycle (/feature, /harden, /ship) works on it. Use when the user points at a repo they already have instead of starting fresh.
argument-hint: "[path to the existing project]"
disable-model-invocation: true
---

# /adopt — Existing codebase → harness contract

Adopt "$ARGUMENTS" (a path; if omitted, ask which repo). Nothing here scaffolds or
rewrites code — adoption only ADDS the harness artifacts the lifecycle skills anchor on.

## 1. Map

Run the `understand` workflow on the repo (from its root). It returns the architecture
brief and subsystem maps. If the repo is small (< ~20 source files), skip the workflow
and read it directly.

## 2. Reverse-engineer the contract

From the brief + manifests + README + git history, write into the project:

1. `docs/SPEC.md` — as-built: what the product actually does today, its real users/
   journey as far as inferable, current feature set as F#-rows with observed behavior as
   done-criteria, **each tagged with a risk tier** (T1/T2/T3 + one-line justification, by
   capability signal — `docs/RISK-TIERS.md`) so later `/feature`/`/forge` work on it is
   right-sized. **Mark it clearly at the top: "Reverse-engineered <date> — verify before
   relying on intent statements."** Unknowns go in Open Questions, not guesses.
2. `CLAUDE.md` from `templates/PROJECT-CLAUDE.md` (harness root) — with the repo's REAL
   commands, verified by running them: install, test, dev, build. A command that fails
   gets documented as broken in Gotchas, not documented as working.
3. `PROGRESS.md` from `templates/PROGRESS.md` (harness root) — feature list seeded from
   open TODOs/FIXMEs, open issues (if `gh` available and the user wants), and the
   spec's Open Questions; "Next session should" usually: "get the test suite green" or
   "verify the as-built spec with the user".
4. `docs/adr/` — one ADR-001 recording the CURRENT stack as-found (no rationale
   invented; "historical, adopted as-is").

If a reference matches this product type — consult `references/INDEX.md` (harness root)
and read only the match, never the whole folder — use its checklist to surface **gaps**:
missing must-haves (e.g. no Impressum on a landing page) go into the spec's Open
Questions, not silently added (this is as-built adoption). No index or no match → skip
(`CLAUDE.md` → References).

## 3. Health baseline

Run the test suite and note the state honestly in PROGRESS.md (X passing / Y failing /
no tests). No tests at all → the seeded feature list starts with "F0: smoke test +
test runner wired" because every later /feature depends on it.

## 4. Handoff

Commit the added artifacts on a branch `chore/harness-adopt` (the repo is theirs — they
merge). Report: what was mapped, what the spec claims vs. what is unverified, health
baseline, and the recommended first move. The full lifecycle now works: `/feature`,
`/harden`, `/ship` all anchor on the files just created.

**Make the as-built spec easy to verify** — it's reverse-engineered, so the user must
review it. Present it for quick review without hunting through the editor: render
`docs/SPEC.md` as an **artifact** (Artifact tool, minimal design; load `artifact-design`
first) and/or drop a direct link to it in the handoff.
