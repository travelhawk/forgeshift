---
name: debug-hard
description: Escalate a stubborn bug to the Fable 5 debugging specialist with a structured handoff. Use when a bug survived two fix attempts, reproduces intermittently, or looks impossible - instead of a third normal attempt.
argument-hint: "[symptom in one line]"
---

# /debug-hard — Escalate, don't grind

The bug: "$ARGUMENTS". A third attempt with the same approach would fail like the first
two — this skill changes the approach: full context, fresh eyes, bigger model.

## 1. Assemble the handoff (this is most of the value)

Write the dossier — from the session, git, and the user where needed:

- **Symptom**: exact observed behavior vs expected, verbatim error output.
- **Reproduction**: exact steps/commands and how reliably it fires (always? 1 in 10?).
  If unknown, say so — reproduction is then the first goal.
- **Timeline**: when it started, what changed around then (`git log` the suspect window).
- **Failed attempts**: each previous fix idea, what it changed, and how it failed.
  These are evidence about what the bug is NOT — the most valuable section.
- **Environment**: where it happens (dev/CI/prod, OS, versions) and where it doesn't.

Don't include your current favorite theory as fact — label hypotheses as hypotheses.

## 2. Delegate

Hand the dossier to `forge-debugger`. It works hypothesis-driven: reproduce →
fault model → discriminating experiments → root-cause fix → regression test proven in
both directions. Expect it to take its time — that's the point.

## 3. Verify & close

- Confirm the regression test fails on pre-fix code and passes post-fix (the debugger
  proves this; spot-check the claim against its evidence).
- For previously intermittent bugs: enough repeat runs that the old failure rate would
  have shown itself.
- Record the root cause in one plain-language line in PROGRESS.md session log
  (trigger → mechanism → symptom). If it revealed a design weakness, propose the ADR.
