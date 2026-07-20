---
name: next
description: Hand the next version of an existing product to forge in one command - clarify new feature ideas into right-sized, risk-tiered features, append them to the spec, then build the whole slice hands-off through the forge flow (waves of PRs, merge, deep-review finish). Use after a product is already kicked off/adopted and you have new ideas or a next-version scope. New product = /forge:kickoff; existing un-spec'd code = /forge:adopt; one feature now = /forge:feature.
argument-hint: "[new feature ideas / next-version description - empty = you'll be asked]"
disable-model-invocation: true
---

# /forge:next — Ideas → tiered features → forge builds them

The iteration sibling of `/forge:kickoff`. Kickoff turns an idea into a spec'd, scaffolded
product; `/forge:next` turns *new* ideas into the next slice of that product and hands them to
the forge flow — **one command, one approval**. You clarify up front (like a light
kickoff), approve once, and the build runs hands-off from there.

`/forge:next` is for **new** ideas that become new features. If you only want to build the
*existing* unchecked backlog, that's plain `/forge:build`.

## 0. Anchor & baseline

- Establish the target product (cd into it; ambiguous → ask — pre-gate, allowed). It must
  already have `docs/SPEC.md` + `PROGRESS.md`. **No spec / not a real product yet → stop
  and redirect**: a brand-new product is `/forge:kickoff`; existing code without a spec is
  `/forge:adopt`. `/forge:next` iterates a product that already exists.
- Harness assets (references, RISK-TIERS) ship with the plugin, not the product. Resolve
  their home once and reuse it: `FORGE_HOME="${CLAUDE_PLUGIN_ROOT:-$(forge-home)}"` — then
  read e.g. `$FORGE_HOME/docs/RISK-TIERS.md`. Product files stay relative to the product.
- Baseline must hold or you build on sand (same rule as `/forge:build` §0): working tree clean,
  full suite green — or the pre-existing red explicitly recorded in `PROGRESS.md`, in
  which case that recorded red IS the baseline every later check compares against, and it
  travels to the pipeline verifiers via context.
- Remote status known (`git remote get-url origin`); when a remote exists, `gh auth
  status` must pass before the PR-based integration modes are offered.
- Record the current HEAD commit as the run's baseline marker — the finish step reviews
  everything merged after it.

## 1. Intake (clarify — don't just accept)

- Ideas come from `$ARGUMENTS`; empty → ask what to build next.
- **Read the product first**: `docs/SPEC.md`, `PROGRESS.md`, and `docs/adr/`. You are
  iterating a known product, not starting blank — this is what lets the intake be lighter
  than a kickoff.
- **Pull in a reference if one fits.** If `$FORGE_HOME/references/INDEX.md` exists,
  consult the index for this product's type/domain and read only the matching reference,
  folding its checklist into the new features. No index or no match → skip; never read the
  whole folder (`$FORGE_HOME/CLAUDE.md` → References).
- Push back where it matters (AskUserQuestion, batched, **only on genuine ambiguity** —
  you already have the spec + code, so keep it tight). Cover only what the ideas leave
  open:
  - Vague scope → propose a concrete cut and let the user react.
  - **Collisions** with the existing architecture, data model, or a recorded ADR decision
    — surface them now, before anything is built.
  - A large ask → propose which slice is *this* version and what phases to a later one.
  - Propose a default in every question; "du entscheidest" / "you decide" → decide and
    record the decision.

## 2. Decompose & tier (`forge-blueprint`)

Have `forge-blueprint` turn the clarified ideas into buildable features and a wave plan —
it returns markdown/structure, it does not write files (the draft lands in step 4):

- **Right-size** per the granularity rule: a feature is a slice of user value
  (independently buildable + testable, ~2-5 done-criteria), not one-per-requirement.
  Fewer, coherent features mean fewer waves and subagents. This slice phases into a later
  version rather than cramming (`$FORGE_HOME/docs/RISK-TIERS.md` sizing; the spec's V-cap logic).
- **Tier each** by capability signal (`$FORGE_HOME/docs/RISK-TIERS.md`, ties break **upward**), each
  with a one-line justification naming the signal — same scheme kickoff uses.
- Place them as the **next version slice**: the next unstarted `### V<n> — <theme>`
  section under `## Scope` in the spec (create it if none exists), with F#-rows continuing
  the existing numbering.
- **Partition into waves** by predicted file footprint exactly as `/forge:build` §2 does
  (overlapping or dependent features never run in parallel — chain or push to a later
  wave). This is the same wave plan the build will use.
- Hold the whole draft (features + tiers + wave plan); nothing lands on disk until the
  gate approves it.

## 3. The gate (the only one — this IS forge's gate, run early)

**Render the proposed new features (the new spec section) as an artifact** for quick
review — publish the held draft markdown with the Artifact tool (minimal design; load
`artifact-design` first; unavailable → link a scratchpad `.md`) and link it in the gate
message, so the user reviews the full slice in place rather than opening a file (same
mechanism as `/forge:kickoff` §2). The features are appended to `docs/SPEC.md` only in step 4
*on approval*, so the **artifact is the review surface here** — word the gate to point at
it, never at the on-disk spec (which doesn't include the new features yet).

Present in one message, get one approval:

- **Proposed new features**: feature → version → tier → done-criteria. The tier column is
  your override point — bump any up or down here (`$FORGE_HOME/docs/RISK-TIERS.md`); ties break up.
- **The wave table**: feature → wave → tier → footprint → why it's parallel-safe.
- **Integration mode** (identical to `/forge:build` §3): auto-integrate (default) · review-PRs
  (single-wave only) · local (no remote → offer `gh repo create` once, else `git merge
  --no-ff`).
- **Rough cost** (each wave is a feature-pipeline run: 5-30× session tokens, plus one
  deep-review for the finish).
- **The finish** (deep-review of the integrated result + confirmed crit/high auto-fixed,
  plus the Playwright visual walkthrough for UI products) is included by default —
  opt-out here.

**This single approval covers everything downstream**: writing the spec (step 4), the
whole build, merges in auto-integrate mode, and the finish. Because this gate already
covers it, the forge run in step 5 does **not** prompt again.

## 4. Land the spec (before building, not after)

On approval, write the held draft to disk and commit — spec-sync precedes the build:

- Append the new features to `docs/SPEC.md` (the `### V<n>` section) and add matching
  F#-rows to `PROGRESS.md` (each with its **tier marker + justification**, unchecked).
- Update `PROGRESS.md` "Next session should" to point at this version.
- Write `.forge/run.json` for this run (`command: "/next"`, the §0 baseline SHA, the
  approved integration mode, the wave plan with every feature `pending`) so a mid-run stop
  is recoverable via `/resume` — thereafter updated at each boundary exactly as `/forge`
  §4/§5 do (CLAUDE.md → run state).
- Commit: `docs: plan V<n> — <theme> (<N> features)`.

## 5. Build & finish — the `/forge:build` flow, no second gate

Run `/forge:build`'s **Execute (§4)** and **Finish (§5 + §5b)** on exactly the approved new
features, treating step 3 above as forge's gate — **no re-prompt, no re-planning** (the
wave plan is already approved). That is: per wave in order → `feature-pipeline` with each
entry as `{feature, tier, done_criteria}` → PR per PASSED feature → merge in the approved
integration mode → full suite on integrated main (stop on NEW failures vs. baseline) →
tick `PROGRESS.md` per merged feature → one retry round for fixables → deep-review finish
(confirmed crit/high fixed in `/forge:fix` discipline; unverified crit/high held ship-blocking)
→ visual walkthrough for UI products. **All of `/forge:build`'s stop conditions and hard rules
apply unchanged** — never force-push, never merge a failed feature, never weaken a test.

## 6. Report

Emit `/forge:build`'s report (§6) — feature → branch → PR → verdict → merged table, suite state
on integrated main (pasted), finish results (confirmed fixed / unverified held / med-low
open), walkthrough artifacts, and the closing **ready-for-`/forge:ship`** or NOT-ship-ready
verdict — plus, at the top: the spec/PROGRESS update (new version section, commit) and any
ideas that were intentionally phased to a later version.

Close with the same **Next →** line `/forge:build` §6 mandates: `/forge:ship` on a ready-for-ship
verdict, `/forge:fix <feature>` (or `/forge:debug-hard`) per named blocker otherwise — never `/forge:ship`
under a blocking verdict.
