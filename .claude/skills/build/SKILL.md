---
name: build
description: Build the whole feature backlog hands-off - one wave-plan approval, then waves of parallel feature-pipeline builds, one PR per feature, verified work merged in dependency order, finished by an automatic deep-review of the integrated result with confirmed critical/high findings auto-fixed. Use after /forge:kickoff or /forge:adopt when many features should be built without per-feature supervision.
argument-hint: "[F#-list / range / feature descriptions - empty = all unchecked features]"
disable-model-invocation: true
---

# /forge:build — approve the plan once, then the whole backlog builds

Build "$ARGUMENTS" (empty → every unchecked feature in PROGRESS.md) with exactly ONE
approval gate. After the gate: no questions, no per-feature check-ins — failures are
collected and reported at the end, never discussed mid-run. The user can always
interrupt.

## 0. Anchor & baseline

- Establish the target product (cd into it; ambiguous → ask — that happens before the
  gate, so it's allowed).
- Harness assets and the workflow scripts ship with the plugin, not the product. Resolve
  their home once and reuse it this run: `FORGE_HOME="${CLAUDE_PLUGIN_ROOT:-$(forge-home)}"`.
  Read harness docs as `$FORGE_HOME/docs/…`, and **fire every workflow by
  `scriptPath: "$FORGE_HOME/.claude/workflows/<name>.js"`** with an absolute path (name-based
  invocation is unreliable — see `$FORGE_HOME/CLAUDE.md`). Workflows do NOT follow the shell
  `cd`; always pass the product as their `dir` arg.
- The baseline must hold, else stop and report instead of building on sand: working
  tree clean, full test suite green — or the pre-existing red explicitly recorded in
  PROGRESS.md, in which case the recorded failing set IS the baseline: every later
  suite check in this run compares against it (stop on NEW failures, not on the known
  red), and the known-red list travels to the pipeline verifiers via context.
- Remote status known (`git remote get-url origin`); when a remote exists,
  `gh auth status` must pass against a GitHub host before the PR-based modes below
  are offered.
- Record the current HEAD commit as the run's baseline marker — the finish step
  reviews everything merged after it.
- Write the run-state `.forge/run.json` (the map `/forge:resume` reads after a mid-run
  stop): `{run_id, command: "/forge:build", baseline_sha, integration_mode (once the gate
  sets it), known_red, waves:[{n, features:[{id, tier, branch, status:"pending", pr,
  evidence}]}], next}`. It is local-only (gitignore `.forge/` in the product) and an
  accelerator, not a source of truth — git stays authoritative, so a stale file never
  blocks. Update it at every boundary in §4/§5; on any stop condition, leave `next`
  pointing at the exact resume action.

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
- **Carry each feature's risk tier** (the `T?` marker from PROGRESS.md; classify any
  untagged feature by capability signal per `$FORGE_HOME/docs/RISK-TIERS.md`, ties upward). The tier
  sets its validation depth in the pipeline — it does not affect wave partitioning
  (that's footprint only).
- Output: waves 1..N, each a list of pipeline entries with footprint, **tier +
  justification**, done-criteria, why it is parallel-safe, and flagged risks. Fewer,
  fatter waves beat many thin ones — parallelism inside a wave is the pipeline's job.

## 3. The gate (the only one)

Present in one message, then get one approval:

- The wave table: feature → wave → **tier** → footprint → done-criteria. The tier
  column is your batch override point — bump any feature up or down here before you
  approve (`$FORGE_HOME/docs/RISK-TIERS.md`); the approval covers the adjustment.
- The integration mode:
  - **auto-integrate** (default): every verified feature → branch pushed → PR with
    evidence → squash-merged → the next wave builds on the updated main. Hands-off
    end to end.
  - **review-PRs**: PRs stay open for the user to merge. Only valid when no later
    feature overlaps with or depends on an unmerged one — in practice: single-wave
    plans (each PR carries its own isolated verification; there is no integrated-main
    check because nothing merges). Otherwise offer auto-integrate or a re-scoped
    backlog.
  - **local** (no remote — or chosen on purpose): with no remote, offer `gh repo create
    --private --source .` once; declined → `git merge --no-ff` per verified feature, the
    merge commits are the audit trail, no PRs. **Recommend it proactively for a solo
    product with no CI and no second reviewer** — same branches, same gates, none of the
    per-feature PR + checks round-trips. This is the run's speed lever.
- **The execution mode, stated plainly:** which waves fire the `feature-pipeline`
  workflow (3+ parallel-safe entries) and which run the direct lane, with the one-line
  why ("no wave has 3+ parallel-safe entries — engine features share one footprint").
  The user should never have to ask afterward why a workflow did or didn't run.
- A rough cost expectation (a 3+-feature wave is a feature-pipeline run: 5–30x
  session tokens; a 1–2-feature wave runs the direct lane at roughly half that; plus
  the finish deep-review — scoped to integration seams on a clean run, §5).
- The finish step (section 5) is included by default: automatic `deep-review` of the
  integrated result, confirmed critical/high findings fixed on the spot, plus — for UI
  products — a Playwright **visual walkthrough** (§5b: flow videos + a screen-overview
  image), and a **documentation pass** (§5c: `forge-etcher` rewrites the README from the
  shipped reality, replacing scaffolder boilerplate). Opt-out here at the gate — sensible
  only for mini-backlogs where the review overhead outweighs the run.

The approval covers everything downstream, including merges in auto-integrate mode
and the finish step's fixes. It also grants the build phase the spec's **Decision policy**
authority (`docs/SPEC.md`): reversible two-way-door calls are decided and logged as ADRs
mid-run, never surfaced as questions; only genuine one-way doors (persisted schema, public
contract, money/auth semantics, scope change) stop the run — and those batch.
**If `docs/SPEC.md` has no Decision policy section** (common after `/forge:adopt`, whose spec is
reverse-engineered) the no-questions build phase has no authority basis — so synthesize the
default two-way/one-way-door policy from `$FORGE_HOME/templates/SPEC.md`, show it verbatim in
this gate message, and write it into the spec on approval:
**never run the hands-off phase without a Decision policy in force.**
This is why "no questions after the gate" is safe, not reckless: every call rides a branch/PR
and is overruleable at the finish deep-review.

## 4. Execute (hands-off from here)

**Small-wave shortcut (1–2 features):** below 3 features the workflow engine's fixed
overhead and extra moving parts outweigh the scripted fan-out — run the loop directly,
with the SAME gate shape the pipeline enforces (the tier contract is the quality
promise; the lane is only the vehicle). **The shortcut is not a license to serialize
everything** (the forgedefense run lost hours to it):

- **Plan rides the session model** — inline, `forge-blueprint` only if large; planning is
  judgment, never pinned to a build tier (`$FORGE_HOME/docs/MODEL-ROUTING.md`).
- **Disjoint-footprint features build in PARALLEL, never serially** — one `forge-hammer`
  subagent per feature (Opus pinned for T1/T2, Sonnet for T3) in isolated worktrees
  (`bash "$FORGE_HOME/scripts/forge-worktree.sh" new-build <n>`, or `isolation:
  "worktree"`), launched in one message, merged in plan order; the fresh-context verifies
  fan out the same way. Two parallel hammers ≈ half the wave's wall-clock.
- **Chained entries overlap stages:** while the consolidated quench reviews segment N
  (read-only on committed branches), the next hammer already builds link N+1 branched
  off N. A failed review costs one rebase of N+1; a passed one (the common case) saves
  the entire review latency.
- **Full e2e runs at checkpoints, not per link:** unit + typecheck + lint per link;
  the e2e suite at wave boundaries and every ~3 chain links. The integrated-main suite
  check after each wave's merges stays untouched.
- **Post-build tier re-check — the same net the pipeline runs:** per T2/T3 feature, a
  cheap Haiku subagent reads `git diff --merge-base HEAD <branch>` (read-only) and, if
  the built diff touches a security-sensitive surface the seeded tier under-budgeted
  (tenant query, webhook parser, token handling…), escalates that feature: its verify
  additionally gets the adversarial security pass, combined fail-closed like a T1.
  Raises depth only, never lowers it (`$FORGE_HOME/docs/RISK-TIERS.md`).
- Verify per (possibly escalated) tier: T1 quench + warden in parallel, T2 quench,
  T3 smoke.

Still hands-off under the gate approval; continue at step 2 below (PR/merge machinery
identical). **Waves of 3+** genuinely-independent entries fire the pipeline:

Per wave, in order (capture `date +%s` at each stage boundary — wave start → builds done
→ verifies done → merges done — §6 reports per-stage wall-clock, so "slow" gets a
culprit stage, not a feeling):

1. Fire the `feature-pipeline` workflow (scriptPath per §0) with `{dir: <product path>, features: [wave
   entries], context, known_failures}`. Each wave entry is an object `{feature, tier,
   done_criteria}` — the tier drives the pipeline's build model/effort and verify depth
   (T1 verify + security pass, T2 one verify, T3 smoke-only on Sonnet). Context carries
   the spec summary and project conventions. **Pass the recorded known-red baseline as its
   own `known_failures` field, not buried in `context`** — the pipeline threads it verbatim
   to every builder and verifier so a pre-existing failure is never counted as this
   feature's regression (a distilled `context` can drop it; a first-class field cannot).
   Write the same `{features, context, known_failures}` to `feature-pipeline.input.json`
   in the product root before invoking and delete it after the wave (args-mangling
   fallback per `$FORGE_HOME/CLAUDE.md`). A workflow-level error return is a stop condition — report,
   don't continue. The pipeline's verify stage returns `pr_title`, `pr_body`, and
   `evidence` per feature.
2. **Push + open PRs for the whole wave in ONE batch — they are independent across
   features, so never serialize them.** Write one manifest line per PASSED feature
   (`<branch>\t<title>\t<body-file>`; body = summary, done-criteria checklist, evidence)
   to a scratchpad file, then `bash "$FORGE_HOME/scripts/forge-pr.sh" open-all <manifest>`
   — it pushes every branch in a single `git push` and creates the PRs concurrently
   (`--head` required so the session checkout stays on main, never a feature branch).
   The pipeline's `pr_title`/`pr_body` are ready to use as-is; only if a title is a bare
   task id ("wire up F7") or a body lacks the What / How-to-review / Evidence sections,
   polish it inline before writing the manifest (main session, cheap) — but carry the
   done-criteria checklist and the verification evidence through **verbatim**; a polish
   that trims evidence violates hard rule 7. `FORGE_BASE` overrides the base branch; the
   per-feature `open <branch> "<title>" <body-file>` + raw `git push`/`gh pr create` are
   the fallback.
   **Then merge (auto-integrate mode):** `bash "$FORGE_HOME/scripts/forge-pr.sh" merge
   <num>` (`gh pr merge <num> --squash --delete-branch`) in dependency order — merges DO
   serialize (each moves main forward for the next). Blocked by checks → watch the wave's
   PRs **concurrently, not one at a time**, and wait only on **required** checks
   (`gh pr checks <num> --watch --required`); a non-required/advisory check never blocks a
   merge. Still blocked after its required checks pass-or-fail → leave the PR open and skip
   any later feature that depends on it (report why).
3. After a wave's merges: `git pull`, then run the FULL suite on integrated main —
   each branch was verified in isolation, the merged whole was not. On NEW failures
   versus the recorded baseline, **re-run only those failing tests once** before
   concluding — an intermittent (flaky) test must not halt an unattended run. A failure
   that **reproduces** on the targeted re-run is a real regression → stop the run, report,
   leave later waves unbuilt (never "fix forward" into the next wave). A failure that
   **clears** on re-run is logged as flaky in the report (test name + that it passed on
   retry) and the run continues — flakiness is surfaced, never silently swallowed.
4. Tick PROGRESS.md per merged feature with its evidence string; one session-log line
   per wave. Update `.forge/run.json` the same moment — the feature's `status`
   (`merged`/`failed`), `branch`, `pr`, `evidence`, and the run's `next` — so a stop right
   after this leaves a resumable trail for `/forge:resume`.
5. Per FAILED feature: record branch + issues and continue the wave. A failure only
   blocks features that depend on it.

After the last wave, ONE retry round: failed features whose issues read fixable go
through a final pipeline wave with those issues in the context. Whatever fails twice
is reported for `/forge:fix` or `/forge:debug-hard` — a third automatic attempt is banned
(hard rule 3).

## 4b. Visual checkpoints (products with a visual surface — fail-soft)

Logic gates never look at pixels; these do. Twice per run, covered by the gate approval,
never a stop condition. The critique is **generic by design**: it judges screenshots
against the spec's own **Art direction** block, whatever the product type.

1. **First-light** — right after the first feature that renders real UI merges: run the
   app, screenshot it, and critique with fresh eyes (forge-proof or inline) against the
   Art direction: cohesion (reads as one hand, one style), fidelity (stated palette/
   mood/shape language actually present), craft (anything reading as placeholder-grade —
   untextured primitives, no motion where motion is promised, flat empty environments).
   Confirmed gaps feed the **next features' build prompts** — steering early is cheap,
   reworking at the end is not.
2. **Polish pass** — after the last feature merges, before the §5 deep-review:
   screenshot every distinct screen/state, same critique, then spend ONE focused polish
   feature (own branch, T3 smoke verify) on the confirmed gaps. §5b then captures the
   polished result.

Spec has no Art direction block → note it in the report and skip (that gap belongs to
kickoff, not to this run). Kill dev servers by process tree (Windows: `taskkill //F //T
//PID` / `npx kill-port`).

## 5. Finish (automatic — covered by the gate approval)

Runs only on a completed run — a run halted by a stop condition skips finish and
reports the stop instead. Unless opted out at the gate:

**review-PRs mode has no integrated main** (nothing merged). There is no merged whole
to review and no way to merge a fix PR, so the finish deep-review is skipped; the
report instead recommends the user run `/forge:deep-review` after merging the open PRs. The
steps below apply to auto-integrate and local modes.

1. Fire the `deep-review` workflow (scriptPath per §0) on the integrated result:
   `{dir: <product path>, scope: "git diff <baseline commit>..HEAD — the merged output
   of this /forge:build run", priority: "<T1 features + their paths>"}` (substitute the
   section-0 baseline SHA). The `priority` note names the T1 features so reviewers
   concentrate their effort on the high-risk paths — T3 boilerplate, already smoke-built,
   gets swept but not ground over. Pipeline verification saw each feature in isolation —
   this is the adversarial pass over the merged whole, and the one review T3 features get.
   **Scope it to what per-feature verification could NOT see:** when every merged feature
   passed its tier verify and no wave had failures or skipped dependents, add
   `mode: "integration"` — deep-review then runs ONE integration-seam lens (cross-feature
   interactions, contract/migration mismatches, merge artifacts, a light T3 sweep steered
   by `priority`) instead of re-grinding already-reviewed internals with all 3 lenses; the
   adversarial verify of findings is unchanged. Run the FULL review (omit `mode`) whenever
   any feature merged without its tier verify, a wave had failures, or the run was
   resumed/reconciled mid-way — a dirty run forfeits the shortcut.
   A deep-review error return (a result with no `confirmed`/`unverified` — preflight
   flaked, target refused) is ship-blocking: report the error, never emit
   ready-for-`/forge:ship` without a completed review (same rule as a section-4 workflow
   error).
2. CONFIRMED critical/high findings are fixed in `/forge:fix` discipline: regression test
   first, smallest fix, fresh `forge-quench` pass on the fix diff — the fixer never
   verifies itself. Suite stays green versus the baseline. Two failed fix attempts
   on a finding → stop fixing it, mark it ship-blocking (hard rule 3).
3. Fixes integrate like features: one `fix/deep-review-<suffix>` branch → PR with
   the findings as evidence → merged in auto-integrate mode (local mode: direct
   commits).
4. Fail closed on the `unverified` bucket: deep-review returns findings whose refuters
   crashed as `unverified` ("treat as open, do not discard"). An unverified
   critical/high is NOT auto-fixed but IS ship-blocking — it counts against the
   ready-for-`/forge:ship` verdict exactly like a twice-failed fix.
5. Medium/low findings (confirmed or unverified) are NOT auto-fixed — they are
   judgment calls and go to the report for the user to triage at `/forge:ship` time.
6. Spot-check the `rejectedBlockers` bucket: deep-review returns each critical/high
   finding it dismissed together with the refutation reasoning. These are not
   ship-blocking, but a single refuter killed a would-be ship-blocker — skim the
   reasoning, and if a dismissal looks wrong, re-open it as a confirmed finding and fix
   it in step-2 discipline. List them in the report so the call is visible, never silent.
7. Keep `.forge/run.json`'s `next` current through the finish (`finish: deep-review` →
   `finish: fixing <finding>` → `complete — ready for /forge:ship` / the blocker) — a stop
   during the finish is then as resumable via `/forge:resume` as one mid-wave.

## 5b. Visual walkthrough (UI products only — automatic, fail-soft)

**UI products only, never a stop condition** — a deliverable, not a gate. Delegate to
`forge-proof`: Playwright flow videos of the spec's core journeys → `docs/walkthroughs/
videos/` (gitignored), plus a screenshot of every screen assembled into one contact-sheet
`docs/walkthroughs/overview.png` (committed). No runnable UI (CLI/API/library) → "no UI to
capture" and stop. Full procedure — applicability, dev-server lifecycle (kill the whole
tree), flow derivation, artifact commit rules: **`$FORGE_HOME/docs/FINISH.md`**. Covered by
the same finish opt-out at the gate.

## 5c. Documentation pass (`forge-etcher` — automatic, fail-soft)

**Never a stop condition.** Nothing in the build loop owns the README, so a scaffolded
product ships with boilerplate unless this replaces it. Delegate to `forge-etcher` (product
path, `docs/SPEC.md`, `PROGRESS.md`, the real manifest scripts): rewrite `README` from the
SHIPPED reality — stack, getting-started, actual scripts, honest known-gaps, one-line-per-
module map — replacing scaffolder boilerplate.
**Verify every command it documents by running it** — a README documenting a failing command
is a lie (hard rule 2). Then fix any doc drift the run caused, and commit
`docs: README + docs sync (/forge:build finish)` on the
integrated branch. Full procedure: **`$FORGE_HOME/docs/FINISH.md`**. Covered by the same
finish opt-out at the gate.

## 6. Report

**Verbosity rule (run-wide):** between-feature progress messages are 1-2 lines — id,
verdict, PR#, test delta. No per-feature recap tables mid-run, no restating evidence
that already lives in the PR body and PROGRESS.md. The final report is the compact
version of everything below — a reader should get the verdict in 10 seconds and the
detail only by following links.

- Table: feature → branch → PR → verdict → merged.
- Suite state on integrated main (pasted output); PROGRESS.md updated. List any test
  that failed then **cleared on a targeted re-run** (flaky) — surfaced, never a stop.
- **Security tier escalations:** any feature the pipeline's post-build diff re-check
  raised to a security pass (its seeded tier under-budgeted a sensitive surface) — with
  the surface named, so an under-seeded feature is visible, not silently smoke-only.
- **Actual spend vs. the gate estimate:** the run's real output-token spend (from the
  pipeline's reported `spend`) against the "5–30x" quoted at the gate — calibrates the
  next estimate instead of leaving it a guess.
- **Where the time went:** per-wave stage wall-clock (build / verify / integrate, from
  the `date +%s` boundaries recorded in §4) beside the spend line — the next tuning
  decision starts from a measured bottleneck, not an impression.
- Finish results: confirmed findings fixed (with evidence), unverified crit/high held
  as ship-blocking, medium/low open. In review-PRs mode: the deferred-review note.
- Visual walkthrough (UI products): the paths to the flow videos and `overview.png`, plus
  any flows skipped and why. Not a UI product / not run → say so plainly. This is never a
  ship blocker.
- **Autonomous decisions — review these:** the reversible (two-way-door) calls the build
  phase decided and logged as ADRs during this run, per the spec's Decision policy — each
  with its one-line rationale and `docs/adr/` path, so you can overrule any at the finish
  gate. A one-way door that forced a mid-run stop is reported separately as a blocker, not
  here.
- Documentation pass (§5c): README written/refreshed with the commands verified, or the
  reason it was skipped/failed. Never a ship blocker.
- What needs the user: open PRs (review-PRs mode) with the run-`/forge:deep-review`-after-
  merge recommendation, skipped dependents, twice-failed features, medium/low triage.
- Closing verdict: **ready for `/forge:ship`** — or NOT ship-ready, with the reasons
  (ship-blocking confirmed OR unverified crit/high, a deep-review error return, failed
  features, new suite failures). Never soften this. Two cases are never a bare "ready
  for `/forge:ship`": review-PRs mode is "PRs ready for your review"; a finish opt-out is
  "ship-ready pending the deep-review you skipped — run `/forge:deep-review` before `/forge:ship`".
- **Next →** the line that matches the verdict: ready-for-ship → `**Next →** /forge:ship`;
  NOT ship-ready → `**Next →** /forge:fix <feature>` (or `/forge:debug-hard` if it resisted a retry)
  for each blocker; review-PRs → `**Next →** merge the PRs, then /forge:deep-review`; finish
  opt-out → `**Next →** /forge:deep-review, then /forge:ship`. Never point at `/forge:ship` under a
  blocking verdict.

## Stop conditions (report, never push through)

Unrecorded red baseline at start · more than half a wave fails verification · NEW
suite failures on integrated main after a merge that **reproduce on a targeted re-run**
(a failure that clears on re-run is a flake — logged, not a stop) · a workflow-level
pipeline error · an unmergeable PR that later waves depend on. /forge:build never
force-pushes, never merges a feature that failed verification, and never weakens a
test to get green. On any stop (or a killed session), `.forge/run.json` holds the
state — `/forge:resume` reads it, reconciles against git, and states the next action.
