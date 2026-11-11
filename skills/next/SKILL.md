---
name: next
description: Hand the next version of an existing product to forge in one command - clarify new feature ideas into right-sized, risk-tiered features, append them to the spec, then build the whole slice hands-off through the forge flow (waves of PRs, merge, deep-review finish). Use after a product is already kicked off/adopted and you have new ideas or a next-version scope. New product = /forge:kickoff; existing un-spec'd code = /forge:adopt; one feature now = /forge:feature.
argument-hint: "[new feature ideas / next-version description - empty = you'll be asked]"
disable-model-invocation: true
---

# /forge:next — Ideas → tiered features → forge builds them

Turn *new* ideas into the next slice of an existing product and build it: **one command, one
approval**. To build only the existing unchecked backlog, use `/forge:build`.

The build half of this command IS `/forge:build`. Resolve
`FORGE_HOME="${FORGE_HOME:-${CLAUDE_PLUGIN_ROOT:-$(forge-home 2>/dev/null || ls -d ~/.claude/plugins/cache/forge/forge/*/ | sort -V | tail -1)}}"`
and read `$FORGE_HOME/skills/build/SKILL.md` now: its sections are referenced below by name.

## 0. Anchor

- Establish the target product (ambiguous → ask). It must have `docs/SPEC.md` and
  `PROGRESS.md`. Without them, stop and redirect: a new product is `/forge:kickoff`, existing
  code without a spec is `/forge:adopt`.
- Then `/forge:build`'s **Anchor**: clean tree, green or recorded-red baseline, baseline SHA,
  remote and `gh auth` status.

## 1. Intake (clarify — don't just accept)

- Ideas come from `$ARGUMENTS`; empty → ask what to build next.
- **Read the product first**: `docs/SPEC.md`, `PROGRESS.md`, `docs/adr/`.
- If `$FORGE_HOME/references/INDEX.md` exists, read the single reference that matches this
  product type and fold its checklist into the new features. No match → skip.
- Ask only about what the ideas leave open (batched, each question with a default):
  - Vague scope → propose a concrete cut.
  - **Collisions** with the architecture, the data model or a recorded ADR — raise them now.
  - A large ask → propose which slice is *this* version and what moves to a later one.
  - "du entscheidest" / "you decide" → decide and record the decision.

## 2. Decompose & tier (`forge-blueprint`)

`forge-blueprint` turns the clarified ideas into features and a wave plan. It returns
markdown; nothing lands on disk before the gate.

- **Right-size**: a feature is a slice of user value that builds and tests on its own, with
  2–5 done-criteria. Too much for one version → move the rest to a later one.
- **Tier each** per `$FORGE_HOME/docs/RISK-TIERS.md` (ties up), with the signal named.
- Place them as the next unstarted `### V<n> — <theme>` section under `## Scope`, F#-rows
  continuing the existing numbering.
- **Wave plan** as in `/forge:build`'s **Wave plan**.

## 3. The gate (the only one)

Publish the proposed spec section as an artifact (Artifact tool; unavailable → a scratchpad
`.md`) and link it: the new features are not in `docs/SPEC.md` yet, so the artifact is the
review surface.

One message, one approval — `/forge:build`'s **gate**, plus at the top:

- **The phase in one line**: what someone can do after this slice that they cannot do now.
  Product language only — no tier codes, wave numbers or file paths.

This approval covers writing the spec, the whole build, the merges and the finish. The build
does **not** ask again.

## 4. Land the spec (before building)

- Append the features to `docs/SPEC.md` and add matching F#-rows to `PROGRESS.md`, each with
  its tier marker and justification, unchecked. Point "Next session should" at this version.
- Write `.forge/run.json` (`command: "/next"`, baseline SHA, integration mode, the wave plan
  with every feature `pending`) so `/forge:resume` can recover a stopped run.
- Commit: `docs: plan V<n> — <theme> (<N> features)`.

## 5. Build & finish

Run `/forge:build`'s **Execute**, **Visual checkpoints**, **Finish** and **Documentation
pass** on exactly the approved features. No re-planning, no second gate. Its stop conditions
and hard rules apply unchanged.

## 6. Report

`/forge:build`'s **Report**, with two lines on top: the spec update (version section,
commit) and the ideas moved to a later version.

**Next →** `/forge:ship` on a ready-for-ship verdict; `/forge:fix <feature>` or
`/forge:debug-hard` per named blocker otherwise.
