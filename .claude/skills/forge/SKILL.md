---
name: forge
description: Build the whole feature backlog hands-off - one wave-plan approval, then waves of parallel feature-pipeline builds, one PR per feature, verified work merged in dependency order. Use after /kickoff or /adopt when many features should be built without per-feature supervision.
argument-hint: "[F#-list / range / feature descriptions - empty = all unchecked features]"
disable-model-invocation: true
---

# /forge — approve the plan once, then the whole backlog builds

Build "$ARGUMENTS" (empty → every unchecked feature in PROGRESS.md) with exactly ONE
approval gate. After the gate: no questions, no per-feature check-ins — failures are
collected and reported at the end, never discussed mid-run. The user can always
interrupt.

## 0. Anchor & baseline

- Establish the target product (cd into it; ambiguous → ask — that happens before the
  gate, so it's allowed).
- The baseline must hold, else stop and report instead of building on sand: working
  tree clean, full test suite green — or the pre-existing red explicitly recorded in
  PROGRESS.md, in which case the recorded failing set IS the baseline: every later
  suite check in this run compares against it (stop on NEW failures, not on the known
  red), and the known-red list travels to the pipeline verifiers via context.
- Remote status known (`git remote get-url origin`); when a remote exists,
  `gh auth status` must pass against a GitHub host before the PR-based modes below
  are offered.

## 1. Backlog

Resolve $ARGUMENTS against `PROGRESS.md` / `docs/SPEC.md`. Every feature needs
checkable done-criteria; features missing them get criteria drafted by
`forge-blueprint` in the next step and shown at the gate.

## 2. Wave plan (`forge-blueprint`)

Blueprint partitions the backlog:

- Predict each feature's file footprint (which dirs/modules it will touch).
- Features with overlapping footprints or a build-order dependency never run in
  parallel: chain them into ONE pipeline entry (built sequentially inside it) or push
  the dependent one into a later wave.
- Output: waves 1..N, each a list of pipeline entries with footprint, done-criteria,
  why it is parallel-safe, and flagged risks. Fewer, fatter waves beat many thin ones —
  parallelism inside a wave is the pipeline's job.

## 3. The gate (the only one)

Present in one message, then get one approval:

- The wave table: feature → wave → footprint → done-criteria.
- The integration mode:
  - **auto-integrate** (default): every verified feature → branch pushed → PR with
    evidence → squash-merged → the next wave builds on the updated main. Hands-off
    end to end.
  - **review-PRs**: PRs stay open for the user to merge. Only valid when no later
    feature overlaps with or depends on an unmerged one — in practice: single-wave
    plans (each PR carries its own isolated verification; there is no integrated-main
    check because nothing merges). Otherwise offer auto-integrate or a re-scoped
    backlog.
  - **local** (no remote): offer `gh repo create --private --source .` once; declined →
    `git merge --no-ff` per verified feature, the merge commits are the audit trail,
    no PRs.
- A rough cost expectation (each wave is a feature-pipeline run: 5–30x session tokens).

The approval covers everything downstream, including merges in auto-integrate mode.

## 4. Execute (hands-off from here)

Per wave, in order:

1. Fire the `feature-pipeline` workflow with `{dir: <product path>, features: [wave
   entries], context}` — context carries the spec summary, project conventions,
   per-feature done-criteria, and the known-red baseline if any. Write the same
   `{features, context}` to `feature-pipeline.input.json` in the product root before
   invoking and delete it after the wave (args-mangling fallback per CLAUDE.md). A
   workflow-level error return is a stop condition — report, don't continue.
   The pipeline's verify stage returns `pr_title`, `pr_body`, and `evidence` per
   feature.
2. Per PASSED feature: `git push -u origin <branch>`, then `gh pr create --head
   <branch> --base main --title ... --body-file <scratchpad file>` (body: summary,
   done-criteria checklist, evidence) — `--head` is required; the session checkout
   stays on main, never on the feature branch.
   Auto-integrate: `gh pr merge <num> --squash --delete-branch`; blocked by required
   checks → `gh pr checks <num> --watch`, then merge; still blocked → leave the PR
   open and skip any later feature that depends on it (report why).
3. After a wave's merges: `git pull`, then run the FULL suite on integrated main —
   each branch was verified in isolation, the merged whole was not. NEW failures
   versus the recorded baseline → stop the run, report, leave later waves unbuilt.
   Never "fix forward" into the next wave.
4. Tick PROGRESS.md per merged feature with its evidence string; one session-log line
   per wave.
5. Per FAILED feature: record branch + issues and continue the wave. A failure only
   blocks features that depend on it.

After the last wave, ONE retry round: failed features whose issues read fixable go
through a final pipeline wave with those issues in the context. Whatever fails twice
is reported for `/fix` or `/debug-hard` — a third automatic attempt is banned
(hard rule 3).

## 5. Report

- Table: feature → branch → PR → verdict → merged.
- Suite state on integrated main (pasted output); PROGRESS.md updated.
- What needs the user: open PRs (review-PRs mode), skipped dependents, twice-failed
  features.
- Recommend `/deep-review` on the integrated result before `/ship` — pipeline
  verification is one fresh-context pass per feature, not the adversarial
  six-dimension gate.

## Stop conditions (report, never push through)

Unrecorded red baseline at start · more than half a wave fails verification · NEW
suite failures on integrated main after a merge · a workflow-level pipeline error ·
an unmergeable PR that later waves depend on. /forge never
force-pushes, never merges a feature that failed verification, and never weakens a
test to get green.
