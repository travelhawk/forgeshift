---
name: build
description: Build the whole feature backlog hands-off - one wave-plan approval, then waves of parallel feature builds, verified work merged in dependency order, finished by an automatic deep-review of the integrated result with confirmed critical/high findings auto-fixed. Use after /forge:kickoff or /forge:adopt when many features should be built without per-feature supervision.
argument-hint: "[F#-list / range / feature descriptions - empty = all unchecked features]"
disable-model-invocation: true
---

# /forge:build — approve the plan once, then the whole backlog builds

Build "$ARGUMENTS" (empty → every unchecked feature in PROGRESS.md) with exactly ONE
approval gate. After it: no questions, no per-feature check-ins. Failures are collected and
reported at the end. The user can always interrupt.

## 0. Anchor

- `cd` into the target product (ambiguous → ask; that is before the gate, so it's allowed).
- `FORGE_HOME="${CLAUDE_PLUGIN_ROOT:-$(forge-home)}"`. Fire workflows by
  `scriptPath: "$FORGE_HOME/.claude/workflows/<name>.js"` with an absolute path, and always
  pass the product as their `dir` arg — workflows do not follow the shell `cd`.
- Baseline or stop: clean tree, suite green — or the pre-existing red **recorded in
  PROGRESS.md**, which then IS the baseline every later check compares against (stop on NEW
  failures only) and travels to verifiers as `known_failures`.
- Record HEAD as the run's baseline SHA. Know the remote (`git remote get-url origin`); with
  one, `gh auth status` must pass before PR modes are offered.
- Write `.forge/run.json` (gitignored): `{run_id, command, baseline_sha, integration_mode,
  known_red, waves:[{n, features:[{id, tier, branch, status, pr, evidence}]}], next}`. It
  accelerates `/forge:resume`; git stays authoritative, so staleness costs a reconcile, never
  a break. Update it at every wave boundary with `next` pointing at the exact resume action.

## 1. Wave plan (`forge-blueprint`)

Blueprint partitions the backlog by **file footprint**:

- Predict which files each feature creates or modifies. Overlapping footprint or a build
  dependency → chain into ONE entry (built sequentially inside it) or a later wave.
- **Name the shared surfaces and give them one owner, early.** A schema + its migration, the
  i18n catalog, `package.json`, and any component several features mount are where parallel
  waves actually collide. The first feature should freeze them — complete, not incrementally
  — so later features only add their own files. Component seams need their final prop
  signature from the start; a stub with the right signature is what makes a wave parallel.
- Carry each feature's `T?` tier verbatim from PROGRESS.md (classify untagged ones by
  capability signal per `$FORGE_HOME/docs/RISK-TIERS.md`, ties up). Tier sets validation
  depth, not wave membership — that's footprint only.
- **Fewer, fatter waves.** Parallelism inside a wave is the lane's job.

Output per entry: features, tier + justification, footprint, why it is parallel-safe,
done-criteria. Plus: which done-criteria **cannot be proven in this environment** and the
honest substitute — those get reported open at the end, never ticked.

## 2. The gate (the only one)

One message, one approval:

- The wave table: feature → wave → **tier** → footprint → done-criteria. Tiers are the
  user's override point here; the approval covers any adjustment.
- **Integration mode.** `auto-integrate` (default): verified feature → branch → PR with
  evidence → squash-merge → next wave builds on updated main. `review-PRs`: PRs stay open —
  only valid when nothing later depends on an unmerged one (in practice: single-wave plans).
  `local`: no remote — offer `gh repo create --private --source .` once; declined →
  `git merge --no-ff` per feature, merge commits are the audit trail. **Recommend `local`
  proactively for a solo product with no CI** — same branches, same gates, none of the PR
  round-trips. It is the run's speed lever.
- **Execution lane per wave**, stated plainly: 3+ parallel-safe entries fire the
  `feature-pipeline` workflow, 1–2 run the direct lane, with the one-line why.
- Rough cost, and that the finish (§5) is included by default — opt out here only for
  mini-backlogs.

The approval also grants the spec's **Decision policy**: reversible calls are decided and
logged as ADRs mid-run, never surfaced; only genuine one-way doors stop the run, and those
batch. **If `docs/SPEC.md` has no Decision policy section** (common after `/forge:adopt`), the
hands-off phase has no authority basis — synthesize it from `$FORGE_HOME/templates/SPEC.md`,
show it verbatim in this message, write it into the spec on approval.
**Never run the hands-off phase without a Decision policy in force.**

## 3. Execute

**Timestamp every stage boundary** with `date +%s` — wave start, builds done, verifies done,
merges done — into `.forge/run.json`. §6 reports per-stage wall-clock from those marks, never
reconstructed from agent logs afterwards.

**Per agent, the gate is `typecheck` + `lint` + the tests covering what it touched.** Nothing
more. A full suite from inside a feature agent starves its siblings — they share one port and
one database directory — and proves nothing its own files didn't.

**Parallel entries get isolated worktrees** (`isolation: "worktree"`, or
`bash "$FORGE_HOME/scripts/forge-worktree.sh" new-build <n>`). Two agents editing one tree is
not a wave, it is a merge conflict with extra steps. **Remove the worktrees before linting the
merged result** — a stale worktree makes `lint` traverse a second copy of the source.

**Waves of 3+ independent entries** fire `feature-pipeline` (scriptPath per §0) with
`{dir, features: [{feature, tier, done_criteria}], context, known_failures}` — `known_failures`
as its own field, not buried in `context`, so a pre-existing red is never counted as this
feature's regression. Mirror the same object into `feature-pipeline.input.json` in the product
root before invoking (args-mangling fallback), delete it after. A workflow-level error is a
stop condition.

**Small-wave shortcut (1–2 features)** — the direct lane, same tier contract.
**Plan rides the session model** (judgment, never pinned to a build tier), then one `forge-hammer`
per feature (Opus for T1/T2, Sonnet for T3), launched in ONE message: disjoint footprints
**build in PARALLEL, never serially**.
**The shortcut is not a licence to serialize.** Chained entries overlap stages: while the
consolidated review reads segment N, the next hammer already builds link N+1 branched off it.

**Verify per tier** — T1: `forge-quench` + a parallel security pass, both must pass. T2: one
`forge-quench`. T3: smoke check. **Chained entries share reviews** — one consolidated review
per ~3 links plus one at the chain's end, over the combined diff, not a fresh reviewer per
link. **Scope every review to the diff it covers**; an unscoped audit over a whole subsystem
can cost more wall-clock than the feature took to build.

**Post-build tier re-check:** per T2/T3 feature, a cheap Haiku pass reads
`git diff --merge-base HEAD <branch>` and escalates to the security pass if the built diff
touched a sensitive surface the seed under-budgeted. Raises depth only, never lowers it.

### The merge gate — per wave, once

1. **Confirm HEAD is the integration branch** before merging. A merge onto a feature branch
   silently forks the line and every later agent inherits a wrong premise.
2. **Kill orphaned test processes** (the test-runner workers the wave's agents spawned). A leaked
   worker does not fail anything — it halves the machine for every wave after it.
3. **Run the full suite and the e2e suite now**, on the integrated result. This is the only
   place e2e runs, and it must run *before* the merge is blessed, not at the end of the
   backlog: e2e is where wiring bugs live, and a wave's worth is far cheaper to repair than
   the whole product's.
4. NEW failures versus the baseline: **re-run only those failing tests once**. Reproduces →
   real regression, stop the run and report, leave later waves unbuilt. Clears → log as flaky
   (name + that it passed on retry) and continue. Flakiness is surfaced, never swallowed.
5. Merge in dependency order (merges serialize — each moves main forward). PR modes: open the
   wave's PRs in ONE batch (`bash "$FORGE_HOME/scripts/forge-pr.sh" open-all <manifest>`),
   then merge each; wait only on **required** checks (`gh pr checks <n> --watch --required`),
   watched across the wave **concurrently, not one at a time**.
6. Tick PROGRESS.md per merged feature with its evidence; one session-log line per wave;
   update `.forge/run.json`.

Per FAILED feature: record branch + issues, continue the wave. A failure blocks only its
dependents. After the last wave, ONE retry round for failures that read fixable; whatever
fails twice is reported for `/forge:fix` or `/forge:debug-hard` — a third automatic attempt is
banned.

## 4. Visual checkpoints (products with a visual surface — fail-soft, never a stop)

Twice, covered by the gate approval, critiqued against the spec's own **Art direction** block:
**first-light** right after the first feature that renders real UI merges (confirmed gaps feed
the next features' briefs — steering early is cheap), and a **polish pass** after the last
feature, spending ONE focused T3 feature on the confirmed gaps. No Art direction block → note
it and skip. Kill dev servers by process tree.

## 5. Finish (automatic — covered by the gate approval)

Only on a completed run; a run halted by a stop condition reports the stop instead.
`review-PRs` mode has no integrated main — skip the review and recommend `/forge:deep-review`
after merging.

1. Fire `deep-review` (scriptPath per §0): `{dir, scope: "git diff <baseline>..HEAD",
   priority: "<T1 features + their paths>"}`. Add `mode: "integration"` when every feature
   passed its tier verify and no wave had failures — it then runs ONE integration-seam lens
   instead of re-grinding reviewed internals. A dirty run forfeits the shortcut, as does a resumed one.
   A review that returns no `confirmed`/`unverified` is ship-blocking — report the error,
   never emit ready-for-ship without a completed review.
2. CONFIRMED critical/high get `/forge:fix` discipline: regression test first, smallest fix,
   fresh reviewer on the fix diff. Two failed attempts → mark ship-blocking, stop fixing.
3. **Fail closed on `unverified`**: an unverified critical/high is not auto-fixed but IS
   ship-blocking. Medium/low go to the report for the user to triage.
4. Skim `rejectedBlockers` — a single refuter killed a would-be blocker. If a dismissal looks
   wrong, re-open it. List them so the call is visible.
5. **Visual walkthrough** (UI products, fail-soft): delegate to `forge-proof` — Playwright flow
   videos of the core journeys → `docs/walkthroughs/videos/` (gitignored) plus one committed
   contact-sheet `overview.png`. Procedure: `$FORGE_HOME/docs/FINISH.md`.
## 5c. Documentation pass

**`forge-etcher`, fail-soft, never a stop.** Rewrite the README from the SHIPPED reality:
stack, getting started, real scripts, honest known-gaps, one line per module.
**Verify every command it documents by running it** — a README documenting a failing command is
a lie. Keep it short: docs are a cost like verbosity, and an ADR is for a one-way door or a
genuine surprise, ≤ 15 lines, not a diary of every choice.

## 6. Report

1–2 lines per feature during the run; no mid-run recap tables. The final report is compact —
verdict in 10 seconds, detail behind links:

- Table: feature → branch → PR → verdict → merged. Suite state on integrated main (pasted).
- Flaky tests (failed, then cleared on a targeted re-run). Security tier escalations, with the
  surface named.
- **Where the time went**: per-wave build / verify / integrate wall-clock from the §3 marks,
  beside **Actual spend vs. the gate estimate**. Tuning starts from a measured bottleneck.
- **Autonomous decisions to review**: the reversible calls logged as ADRs, each with its
  one-line rationale and path.
- **Criteria reported open, not ticked** — anything the environment could not prove, with the
  substitute that ran.
- What needs the user: open PRs, skipped dependents, twice-failed features, medium/low triage.
- Closing verdict: **ready for `/forge:ship`** — or not, with reasons. Never soften it.
  `review-PRs` is "PRs ready for your review"; a finish opt-out is "ship-ready pending the
  deep-review you skipped".
- **Next →** the line matching the verdict.

## Stop conditions (report, never push through)

Unrecorded red baseline · more than half a wave fails verification · NEW suite failures on
integrated main that reproduce on a targeted re-run · a workflow-level error · an
unmergeable PR that later waves depend on.

`/forge:build` never force-pushes, never merges a feature that failed verification, and never
weakens a test to get green. On any stop, `.forge/run.json` holds the state for
`/forge:resume`.
