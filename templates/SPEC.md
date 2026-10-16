# Spec: <product name>

> The contract: what the user gets and how they check it. How it is built lives in the code,
> and once code exists the code is the truth for stack, data model and behaviour details.
> Write nothing here that the code or a manifest already states. Change this file only when
> what the user gets changes.

## Problem
<Who has what problem. One paragraph. If you can't write this, validate the problem first.>

## Solution in one sentence
<The product in ≤ 25 words.>

## Users & core journey
- Primary user: <who>
- Core journey: <the ONE path that must be flawless, step by step>

## Scope

### V1 — must ship
Each row is a slice of user value, buildable and testable on its own. Small tool ~3-6 rows,
MVP ~8-15; phase anything bigger into a V2 section. Risk = tier + the signal that set it
(`docs/RISK-TIERS.md` in the harness).

| # | Feature | Risk | Done means |
|---|---|---|---|
| F1 | <what someone can do that they could not before> | T? (<signal>) | <2-5 criteria, `·`-separated, each checkable without reading the code> |

### Out of scope (V1)
- <thing people will ask about — and why it waits>

## Non-functional requirements
<Only what you will actually check: performance target, security/data sensitivity, supported
platforms.>

## Art direction
<Visual products only — delete otherwise. The direction the user chose at kickoff, in 3-6
lines: mood, palette, type and shape, motion, 1-2 references. Visual checkpoints critique
screenshots against this block.>

## Stack
<Kickoff only: the choices, one line, rationale in `docs/adr/001-stack.md`. Versions live in the
manifest, not here.>

## Decision policy
Approving this spec lets the build decide by reversibility:
- **Two-way doors — decide and log.** Anything cheap to undo (a library or pattern within the
  stack, an internal data shape, naming, layout, anything on a feature branch): pick the
  reversible default, write a one-line ADR, keep building.
- **One-way doors — ask, batched.** A persisted schema or public API later features depend on,
  money or auth semantics, or a change to this spec's scope. Collect them into one question;
  do not block mid-run.

The run's autonomous calls are listed together in the finish report.

## Open questions
- [ ] <question> — owner: <you/agent>, blocking: <F#/no>
