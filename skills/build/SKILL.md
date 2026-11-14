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

## 1. Wave plan (`forge-blueprint`)

Blueprint partitions the backlog by **file footprint**:

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
- **Execution lane per wave**: 3+ parallel-safe entries fire the `feature-pipeline` workflow,
  1–2 run the direct lane.
- Rough cost, and that the finish (§5) is included by default — opt out here only for
  mini-backlogs.

The approval also grants the spec's **Decision policy**: reversible calls are decided and
logged as ADRs mid-run; only one-way doors stop the run, and those batch. **If `docs/SPEC.md`
has no Decision policy section**, synthesize it from `$FORGE_HOME/templates/SPEC.md`, show it
verbatim in this message, and write it into the spec on approval.
**Never run the hands-off phase without a Decision policy in force.**

## 3. Execute

**Timestamp every stage boundary** with `date +%s` — wave start, builds done, verifies done,
merges done — into `.forge/run.json`. §6 reports wall-clock from those marks.

**Parallel entries get isolated worktrees** (`isolation: "worktree"`, or
`bash "$FORGE_HOME/scripts/forge-worktree.sh" new-build <n>`). Remove them before linting the
merged result: a stale worktree makes `lint` traverse a second copy of the source.

**Waves of 3+ independent entries** fire `feature-pipeline` with
`{dir, forge_home: "$FORGE_HOME", features: [{feature, tier, done_criteria}], context, known_failures}`.
Mirror the same object into `feature-pipeline.input.json` in the product root before invoking
(args fallback), delete it after. A workflow-level error is a stop condition.

**Small-wave shortcut (1–2 features)** — the direct lane, same tier contract as the pipeline
(`$FORGE_HOME/workflows/feature-pipeline.js` is the reference):

- **A T1 plan rides the session model**, then goes to the builder as its brief. T2/T3 need no
  separate plan: the builder gets the done-criteria and paths and plans inline.
- One `forge-hammer` per feature (T3 on the execute tier), launched in ONE message: disjoint
  footprints **build in PARALLEL, never serially**. In a chain, the next hammer starts on
  link N+1 while the review reads link N.
- **Verify per tier** — T1: `forge-quench` + a parallel security pass, both must pass. T2: one
  `forge-quench`. T3: smoke check. Chained entries share reviews: one per ~3 links plus one at
  the chain's end, over the combined diff. Scope every review to the diff it covers.
- **The diff can raise the tier.** Whoever verifies a T2/T3 reads
  `git diff --merge-base HEAD <branch>` and names any sensitive surface in it (authn/authz, a
  tenant boundary, external input, secrets, raw SQL or shell). A named surface adds the
  security pass. Raises depth only, never lowers it.

**A failed verify gets two fix rounds, not more.** Put this in every reviewer brief: a verify
blocks only on a finding that breaks normal operation — data loss, a security or privacy
hole, a crash, a wrong result in a normal case. Findings that need a degraded dependency,
throttling or unusual load go to the report's open list. A re-review checks only what the fix
addressed: each fix hands a fresh reviewer new code to find something in. Still failing after
round two → the feature is FAILED; a third round needs the user's explicit go.

### The merge gate — per wave, once

1. **Confirm HEAD is the integration branch.** A merge onto a feature branch silently forks
   the line.
2. **Kill orphaned test processes** the wave's agents left behind.
3. **Run the full suite and the e2e suite now**, on the integrated result. This is the only
   place e2e runs.
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
   their paths>"}`. Add `mode: "integration"` when every feature passed its tier verify and no
   wave had failures. A dirty run forfeits the shortcut, as does a resumed one. A review that
   returns no `confirmed`/`unverified` is ship-blocking.
2. CONFIRMED critical/high get `/forge:fix` discipline: regression test first, smallest fix,
   fresh reviewer on the fix diff. Two failed attempts → mark ship-blocking, stop fixing.
3. **Fail closed on `unverified`**: an unverified critical/high is not auto-fixed but IS
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
- **Where the time went**: per-wave build / verify / integrate wall-clock.
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
