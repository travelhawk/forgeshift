---
name: fix
description: Bugfix lane - reproduce, regression test, fix, review, optional patch release. Lighter than /feature (no spec ceremony), earlier than /debug-hard (which needs two failed attempts). Use for reported bugs, production issues, and broken behavior.
argument-hint: "[bug description or error message]"
---

# /fix — Bug → regression test → fix → reviewed

Fix "$ARGUMENTS". Bugs don't get feature ceremony — they get the reproduce-test-fix
discipline, and nothing else.

## 1. Reproduce

Locate the product (cd into it), then reproduce the bug: exact command/steps, observed
vs expected. Can't reproduce from the report → gather what's missing from the user
before touching code. Intermittent or already survived two fix attempts → this is
`/debug-hard`, hand over now instead of burning attempts.

## 2. Regression test first

Write the test that encodes the correct behavior and FAILS on the current code. This is
non-negotiable — it pins the bug and proves the fix. Put it where the suite will run it
forever.

## 3. Fix

Smallest change that makes the regression test pass with the full suite staying green.
No drive-by refactoring, no surrounding cleanup — if the bug revealed a design problem,
note it for an ADR/feature instead of fixing the world now. Commit:
`fix: <symptom> (<root cause in five words>)`.

## 4. Review

`forge-quench` on the diff — security-relevant or data-touching fixes always; trivial
one-liners with an obvious regression test may skip (say so when you do).

## 5. Release the fix (when it needs to go out now)

Patch releases use `/ship` with the ABBREVIATED manual checklist: walk only the broken
journey (not all of them), confirm migrations/env unchanged, rollback command known.
The automated release-gate runs in full — that part never abbreviates. Not urgent →
it rides the next regular release; note it in CHANGELOG under Unreleased.

## 6. Close

PROGRESS.md session log: symptom → root cause → the test that now guards it. If the
same class of bug happened before, say so — twice is a pattern worth an ADR or a
`forge-quench` memory note.
