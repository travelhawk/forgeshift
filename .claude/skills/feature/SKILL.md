---
name: feature
description: Build one feature through the full quality loop - plan, failing test, implement, fresh-context verify. Use for any feature or task from the spec/PROGRESS.md, or an ad-hoc feature request during a build.
argument-hint: "[feature description or F# from the spec]"
---

# /feature — One feature through the loop

Build "$ARGUMENTS" tests-first with independent verification. One feature per
invocation; a batch of independent features belongs in the `feature-pipeline` workflow
instead (offer it when the user lists 3+ independent items).

## 1. Anchor

- Establish the target product first: cd into its directory (`projects/<name>/` when
  run from the harness root). Multiple products and it's ambiguous → ask.
- Find the feature in `docs/SPEC.md` / `PROGRESS.md` if it exists there; use its
  done-criteria. Ad-hoc feature → write 2-5 checkable done-criteria now and get a nod.
- Run the existing test suite first. Starting from red means fixing that first or
  explicitly recording that the red is pre-existing and unrelated.

## 2. Plan — size it honestly

- **Small** (single file, describable diff in one sentence): plan inline, skip ceremony.
- **Medium**: show the inline plan — approach, files to touch, test plan — and proceed
  without waiting for approval; the user can interrupt.
- **Large or judgment-heavy** (new subsystem, data-model change, security-relevant):
  delegate planning to `forge-planner`, record the plan as `docs/features/F<#>.md` from
  `templates/FEATURE.md` (harness root), and **block on user approval** before building.

## 3. Build

- Medium+ features build on a branch `feature/<F#-or-slug>`; merge to main only after
  step 4 verification passes. Small fixes may commit straight to main.
- Implement per the plan — yourself for small work, via `forge-implementer` for medium+
  (give it the plan, done-criteria, and paths; it works tests-first and commits per
  green cycle). Never delete or weaken existing tests to get to green.

## 4. Verify (fresh context, non-negotiable for medium+)

Send `forge-reviewer` the diff scope and the done-criteria. It sees only the result, not
the build reasoning. Fix CONFIRMED critical/high findings immediately; judge medium/low
with the user if the fix isn't obvious. Small cosmetic changes may skip this — say so
explicitly when you do.

## 5. Close

- Tick the feature in `PROGRESS.md` **only after** done-criteria are demonstrably met —
  paste the evidence (test names + output) into the session log line.
- Update `docs/SPEC.md` if the implementation legitimately deviated from it.
- Commit(s) are already granular from the build; ensure the final state is committed.
- Report: what shipped, evidence, deviations, and what's the natural next feature.

## Escalation

Two failed attempts at the same problem → stop grinding: `/debug-hard` for bugs,
`forge-planner` (or the `design-panel` workflow) for design dead-ends. A third identical
attempt is banned.
