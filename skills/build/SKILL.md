---
name: build
description: Build the whole feature backlog hands-off - one wave-plan approval, then waves of parallel feature builds, verified work merged in dependency order, finished by an automatic deep-review of the integrated result with confirmed critical/high findings auto-fixed. Use after /forge:kickoff or /forge:adopt when many features should be built without per-feature supervision.
argument-hint: "[F#-list / range / feature descriptions - empty = all unchecked features]"
disable-model-invocation: true
---

# /forge:build — approve the plan once, then the whole backlog builds

Build "$ARGUMENTS" (empty → every unchecked feature in PROGRESS.md, or in the issue phase every
open issue labelled `forge`, tier from its body) with exactly ONE
approval gate. After it: no questions, no per-feature check-ins. Failures are collected and
reported at the end. The user can always interrupt.

The sections below are phases with a goal and a done-state. You run them and decide in each
whether to work yourself or delegate. Fresh context is spent only where it buys something:
an independent check, real parallelism, or keeping your own context clear.

## 0. Anchor

- `cd` into the target product (ambiguous → ask; that is before the gate, so it's allowed).
- `FORGE_HOME="${FORGE_HOME:-${CLAUDE_PLUGIN_ROOT:-$(forge-home 2>/dev/null || ls -d ~/.claude/plugins/cache/forge/forge/*/ | sort -V | tail -1)}}"`. Fire workflows by
  absolute path `$FORGE_HOME/workflows/<name>.js` — Claude Code: the Workflow tool with that
  file as `scriptPath`; any other host: `node "$FORGE_HOME/bin/forge-run.mjs" <name>
  --args-file <json>`. Always pass the product as their `dir` arg — workflows do not follow
  the shell `cd`.
- Baseline or stop: clean tree, suite green — or the pre-existing red **recorded in
  PROGRESS.md**. That red is then the baseline every later check compares against, and it
  travels to verifiers as `known_failures`.
- Record HEAD as the run's baseline SHA. With a remote, `gh auth status` must pass before PR
  modes are offered.
- Write `.forge/run.json` (gitignored): `{run_id, command, baseline_sha, integration_mode,
  known_red, waves:[{n, features:[{id, tier, branch, status, pr, evidence}]}], next}`. Update
  it at every wave boundary, with `next` naming the exact resume action. Git stays
  authoritative; the file only speeds up `/forge:resume`.

## 1. Wave plan

**Size the run first.** A **small run** — about 6 features or fewer, on code you can hold in
your context — has no waves: you build the features yourself, one after another, each on
its own branch from the last merged state. No worktrees, no parallel merges, no per-feature
checks: the T1 check moves into the finish review, with the T1 paths as its priority. A
small run needs no top model: say at the gate that a Sonnet session is enough, and that you
raise it only if a feature fails twice. Everything below is for larger runs.

You partition the backlog by **file footprint**. Hand it to `forge-blueprint` only when
reading the backlog and code would flood your context.

- Features with overlapping files or a build dependency chain into ONE entry (built in
  order inside it) or move to a later wave.
- **Give shared surfaces one owner, early.** A schema and its migration, the i18n catalog,
  `package.json` and components several features mount are where parallel waves collide. The
  first feature freezes them — complete, with final prop signatures — so later features only
  add their own files.
- Carry each feature's tier from PROGRESS.md (untagged → classify per
  `$FORGE_HOME/docs/RISK-TIERS.md`, ties up). Tier sets validation depth, never wave membership.
- **Fewer, fatter waves.** A slice with no parallelism is a normal outcome: new work on a
  mature product converges on existing files. Then say "built in order" and skip the wave
  table.

Output per entry: features, tier + justification, footprint, why it is parallel-safe,
done-criteria. Plus the done-criteria that **cannot be proven in this environment** and the
honest substitute — those are reported open at the end, never ticked.

## 2. The gate (the only one)

One message, one approval:

- **What the user gets**, first: the backlog's outcome in one line, then feature → done means
  in product language. This is the part being approved.
- **How it gets built**, in a separate block below: the tier per feature (the user's override
  point) and the execution order. Show a **wave table only when two or more features run in
  parallel**; otherwise "built in order: A → B → C".
- **Integration mode.** `auto-integrate` (default): verified feature → branch → PR with
  evidence → squash-merge → next wave builds on updated main. `review-PRs`: PRs stay open —
  only valid when nothing later depends on an unmerged one. `local`: no remote — offer
  `gh repo create --private --source .` once; declined → `git merge --no-ff` per feature.
  **Recommend `local` for a solo product with no CI**: same branches, same gates, no PR
  round-trips. It is the run's speed lever.
- **Run size**: small (built in order by you, one review at the end, a Sonnet session is
  enough) or large (waves; in parallel worktrees where 3+ entries are parallel-safe: the
  `feature-pipeline` workflow).
- Rough cost, and that the finish (§5) is included by default — opt out here only for
  mini-backlogs.

The approval also grants the spec's **Decision policy**: reversible calls are decided and
logged as ADRs mid-run; only one-way doors stop the run, and those batch. **If `docs/SPEC.md`
has no Decision policy section**, synthesize it from `$FORGE_HOME/templates/SPEC.md`, show it
verbatim in this message, and write it into the spec on approval.
**Never run the hands-off phase without a Decision policy in force.**

## 3. Build — you orchestrate, fresh context only where it pays

**Timestamp every stage boundary** with `date +%s` — wave start, builds done, checks done,
merges done — into `.forge/run.json`. §6 reports wall-clock from those marks.

You are the orchestrator, and a capable builder yourself. Per wave, decide who builds:

- **Build it yourself** when the wave is small or a chain, and the code it touches fits your
  context. One builder that already holds the plan beats a hand-off.
- **Delegate** only for one of three reasons: **real parallelism** (independent features,
  each in its own worktree), **protecting your context** (a feature that would read a lot of
  code you will not need again), or **an independent check** (below). Not for ceremony.

The per-feature contract is the same either way (`$FORGE_HOME/workflows/feature-pipeline.js`
is the reference):

- **One builder per feature, no separate plan.** It reads the code it touches, plans inline,
  writes tests first and commits to its own branch. A T1 Plan rides the session model: think
  through who must NOT be able to do what before coding, and hand that to the builder if you
  delegate.
- Its gate is typecheck, lint and the tests covering its diff. The full suite is the merge
  gate's job.
- **The diff can raise the tier.** The builder reads `git diff --merge-base HEAD <branch>`
  and names any sensitive surface in it (authn/authz, a tenant boundary, external input,
  secrets, raw SQL or shell, output another program interprets).
  Raises depth only, never lowers it.
- **The independent check.** T1, and any feature with a named surface, gets ONE fresh-context
  security pass (`forge-warden`) on its diff; for T1 it also proves the done-criteria on their
  failure paths. In a small run this pass is skipped: the finish review covers it, with the
  T1 paths and named surfaces as its priority. The builder never checks its own work:
  everything else is checked by the merge gate's full suite and the finish review.

How to run it:

- **Small-wave shortcut (1–2 features)**: build them yourself, or one `forge-hammer` each
  (T3 on the execute tier), launched in ONE message: disjoint footprints
  **build in PARALLEL, never serially**, each in its own worktree
  (`bash "$FORGE_HOME/scripts/forge-worktree.sh" new-build <n>`).
- **Waves of 3+ independent entries**: the `feature-pipeline` workflow does exactly the
  contract above in parallel and keeps your context clean. Fire it with
  `{dir, forge_home: "$FORGE_HOME", features: [{feature, tier, done_criteria}], context, known_failures}`.
  Mirror the same object into `feature-pipeline.input.json` in the product root before
  invoking (args fallback), delete it after. A workflow-level error is a stop condition.
- Remove worktrees before linting the merged result: a stale worktree makes `lint` traverse
  a second copy of the source.

**A failed check gets two fix rounds, not more.** Put this in every reviewer brief: a check
blocks only on a finding that breaks normal operation — data loss, a security or privacy
hole, a crash, a wrong result in a normal case. Findings that need a degraded dependency,
throttling or unusual load go to the report's open list. A re-check covers only what the fix
addressed. Still failing after round two → the feature is FAILED; a third round needs the
user's explicit go.

### The merge gate — per wave, once

1. **Confirm HEAD is the integration branch.** A merge onto a feature branch silently forks
   the line.
2. **Kill orphaned test processes** the wave's agents left behind.
3. **Run the full suite and the e2e suite now**, on the integrated result. This is the only
   place e2e runs. Compare its time and the new test count with the test budget in the
   project `AGENTS.md`; over budget goes to the report as a finding to prune, not a stop.
4. NEW failures versus the baseline: **re-run only those failing tests once**. Reproduces →
   real regression, stop the run and report. Clears → log it as flaky (name + passed on retry)
   and continue.
5. Merge in dependency order. **Every PR targets the integration branch, never another
   feature's branch**: a chained feature is rebased onto the integration branch before its PR
   opens. A PR whose base is merged and deleted first lands in a dead ref and still reads
   MERGED. An unavoidable stacked base is a stop-and-report. PR modes: open the wave's PRs in
   ONE batch (`bash "$FORGE_HOME/scripts/forge-pr.sh" open-all <manifest>`), then merge each;
   wait only on **required** checks (`gh pr checks <n> --watch --required`), watched
   **concurrently, not one at a time**.
6. Tick PROGRESS.md per merged feature with its evidence (issue phase: the PR body carries the
   evidence and `Closes #<issue>`); update `.forge/run.json`.

Per FAILED feature: record branch + issues, continue the wave. A failure blocks only its
dependents. After the last wave, ONE retry round for failures that read fixable; whatever
fails twice is reported for `/forge:fix` or `/forge:debug-hard`.

## 4. Visual checkpoints (UI products — fail-soft, never a stop)

Twice, critiqued against the spec's **Art direction** block: **first-light** right after the
first feature that renders real UI merges (confirmed gaps feed the next briefs), and a
**polish pass** after the last feature, spending ONE T3 feature on the confirmed gaps. No Art
direction block → note it and skip.

## 5. Finish (automatic — covered by the gate approval)

Only on a completed run; a halted run reports the stop instead. `review-PRs` mode has no
integrated main — skip the review and recommend `/forge:deep-review` after merging.

1. Fire `deep-review`: `{dir, scope: "git diff <baseline>..HEAD", priority: "<T1 features +
   their paths, every named sensitive surface, and every path that saves, loads or deletes
   user data>"}`. A small run adds `depth: "quick"`
   (one reviewer, one refuter: on a seeded-bug benchmark it found as much as the full review
   at a third of the tokens); a large run takes the full review. It is the first independent read of every T2/T3 feature,
   so never pass `mode: "integration"` here. A review that returns no
   `confirmed`/`unverified` is ship-blocking.
2. CONFIRMED critical/high get `/forge:fix` discipline: regression test first, smallest fix,
   fresh reviewer on the fix diff. Two failed attempts → mark ship-blocking, stop fixing.
   **Data safety is always high, always fixed**: data loss, data corruption, a silent
   overwrite of stored data (corrupt load then save, two tabs) and a destructive action that
   runs twice (double-click delete) are fixed here, whatever severity the review gave them,
   CONFIRMED or `unverified`. Never downgrade one to the report's medium/low list.
3. **Fail closed on `unverified`**: an unverified critical/high is not auto-fixed (except data safety, step 2) but IS
   ship-blocking. Medium/low go to the report.
4. Skim `rejectedBlockers`. If a dismissal looks wrong, re-open it. List them in the report.
5. **Visual walkthrough** (UI products, fail-soft): delegate to `forge-proof` per
   `$FORGE_HOME/docs/FINISH.md`.

## 5c. Documentation pass

**`forge-etcher`, fail-soft.** It rewrites the README from the SHIPPED reality, per
`$FORGE_HOME/docs/FINISH.md`. **Verify every command it documents by running it.**

## 6. Report

1–2 lines per feature during the run. **Every message to the user names a feature by what it
does for the user** ("import contacts from CSV"); an ID may follow in brackets. Harness words
— wave, tier, gate, agent names — stay internal or are said in plain words.

The final report is compact:

- Table: feature → branch → PR → verdict → merged. Suite state on integrated main (pasted).
- Flaky tests that cleared on a re-run. Security tier escalations, with the surface named.
- **Where the time went**: per-wave build / check / integrate wall-clock.
- **Actual spend vs. the gate estimate.**
- **Autonomous decisions to review**: the ADRs, each with its one-line rationale and path.
- **Criteria reported open, not ticked**, with the substitute that ran.
- What needs the user: open PRs, skipped dependents, twice-failed features, medium/low triage.
- Closing verdict: **ready for `/forge:ship`** — or not, with reasons. Never soften it.
- **Next →** the line matching the verdict.

## Stop conditions (report, never push through)

Unrecorded red baseline · more than half a wave fails verification · NEW suite failures on
integrated main that reproduce on a targeted re-run · a workflow-level error · an
unmergeable PR that later waves depend on.

`/forge:build` never force-pushes, never merges a feature that failed verification, and never
weakens a test to get green. On any stop, `.forge/run.json` holds the state for
`/forge:resume`.
