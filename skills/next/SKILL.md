---
name: next
description: Hand the next version of an existing product to forge in one command - clarify new feature ideas into right-sized, risk-tiered features, append them to the spec, then build the whole slice hands-off through the forge flow (waves, deep-review finish, one delivery PR). Use after a product is already kicked off/adopted and you have new ideas or a next-version scope. New product = /forge:kickoff; existing un-spec'd code = /forge:adopt; one feature now = /forge:feature.
argument-hint: "[new feature ideas / next-version description - empty = you'll be asked]"
disable-model-invocation: true
---

# /forge:next — Ideas → tiered features → forge builds them

Turn *new* ideas into the next slice of an existing product and build it: **one command**,
asking only where a decision is open (§3). To build only the existing unchecked backlog, use
`/forge:build`.

The build half of this command IS `/forge:build`. Resolve
`FORGE_HOME="${FORGE_HOME:-${CLAUDE_PLUGIN_ROOT:-$(forge-home 2>/dev/null || ls -d ~/.claude/plugins/cache/forge/forge/*/ | sort -V | tail -1)}}"`
and read `$FORGE_HOME/skills/build/SKILL.md` now: its sections are referenced below by name.

## 0. Anchor

- Establish the target product (ambiguous → ask). It must have `docs/SPEC.md` and
  `PROGRESS.md` or, in the issue phase, issues labelled `forge`. Without them, stop and redirect: a new product is `/forge:kickoff`, existing
  code without a spec is `/forge:adopt`.
- Then `/forge:build`'s **Anchor** (including the integration branch `forge/<slug>`): clean tree, green or recorded-red baseline, baseline SHA,
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

## 2. Decompose & tier

You turn the clarified ideas into features and a wave plan, by the feature rules in
`$FORGE_HOME/agents/forge-blueprint.md`; hand it to `forge-blueprint` only when the code to
read would flood your context. Nothing lands on disk before §4.

- **Right-size**: a feature is a whole capability a user notices, not a step. It builds and
  tests on its own, with 2–5 done-criteria. Prefer fewer, larger features; too much for one
  version → move the rest to a later one.
- **Tier each** per `$FORGE_HOME/docs/RISK-TIERS.md` (ties up), with the signal named.
- Place them as the next unstarted `### V<n> — <theme>` section under `## Scope`, F#-rows
  continuing the existing numbering.
- **Wave plan** as in `/forge:build`'s **Wave plan**.

## 3. A gate only when a decision is open

The ideas are the user's own words, so turning them into features is not a decision to
approve. Stop for one batched message, each question with your default, only when the
intake left one of these open: a scope cut or a slice moved to a later version, a collision
with the architecture or a recorded ADR, a one-way door, or a changed done-criterion of an
existing feature (`/forge:build` §2 lists the same triggers). Publish the proposed spec
section as an artifact (Artifact tool; unavailable → a scratchpad `.md`) and link it: the
new features are not in `docs/SPEC.md` yet, so the artifact is the review surface.

Otherwise state the slice in one message and start: **the phase in one line** (what someone
can do after it that they cannot do now, in product language, no tier codes, wave numbers or
file paths), then `/forge:build`'s start message. An answer, or no objection, covers
writing the spec, the whole build and the finish. The build does **not** ask again.

## 4. Land the spec (before building)

- Append the features to `docs/SPEC.md` and add matching F#-rows to `PROGRESS.md`, each with
  its tier marker and justification, unchecked. Point "Next session should" at this version.
  Issue phase: no `PROGRESS.md`, and **no issues for the slice being built now** — they would
  be temporary steps; the slice lives in the spec rows and `.agents/forge/run.json`, and the
  delivery PR body carries the evidence. Issues are for work that outlives the run, so
  only the ideas moved to a later version become issues (`gh issue create --label forge`,
  body = done-criteria + tier line, same shape `retire-progress.mjs` writes).
- Write `.agents/forge/run.json` (`command: "/next"`, baseline SHA, integration mode and branch, the wave plan
  with every feature `pending`) so `/forge:resume` can recover a stopped run.
- Commit: `docs: plan V<n> — <theme> (<N> features)`.

## 5. Build & finish

Run `/forge:build`'s **Build**, **Visual checkpoints**, **Finish**, **Documentation
pass** and **Deliver** on exactly the planned features. No re-planning, no second gate. Its stop conditions
and hard rules apply unchanged.

## 6. Report

`/forge:build`'s **Report**, with two lines on top: the spec update (version section,
commit) and the ideas moved to a later version.

**Next →** merge the delivery PR(s), then `/forge:ship` on a ready-for-ship verdict; `/forge:fix <feature>` or
`/forge:debug-hard` per named blocker otherwise.
