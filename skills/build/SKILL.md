---
name: build
description: Build the whole feature backlog hands-off - plan, build in waves where parallel, integrate verified work locally, finish with an automatic deep-review (confirmed critical/high findings auto-fixed), then deliver as one PR (split only where reviewability needs it) for a human merge. Asks only where a decision is open. Use after /forge:kickoff or /forge:adopt when many features should be built without per-feature supervision.
argument-hint: "[F#-list / range / feature descriptions - empty = all unchecked features]"
disable-model-invocation: true
---

# /forge:build — the whole backlog, from plan to a delivered PR

Build "$ARGUMENTS" (empty → every unchecked feature in PROGRESS.md, or in the issue phase every
open issue labelled `forge`, tier from its body). You own the outcome: plan, build, verify,
deliver. The user is asked only where a decision is open (§2); after that no questions, no
per-feature check-ins. Failures are collected and reported at the end. The user can always
interrupt. Vocabulary and the PR-boundary rule: `$FORGE_HOME/docs/LIFECYCLE.md`.

The sections below are phases with a goal and a done-state. You run them and decide in each
whether to work yourself or delegate. Fresh context is spent only where it buys something:
an independent check, real parallelism, or keeping your own context clear.

## 0. Anchor

- `cd` into the target product (ambiguous → ask; that is before the run, so it's allowed).
- `FORGE_HOME="${FORGE_HOME:-${CLAUDE_PLUGIN_ROOT:-$(forge-home 2>/dev/null || ls -d ~/.claude/plugins/cache/forge/forge/*/ | sort -V | tail -1)}}"`. Fire workflows by
  absolute path `$FORGE_HOME/workflows/<name>.js` — Claude Code: the Workflow tool with that
  file as `scriptPath`; any other host: `node "$FORGE_HOME/bin/forge-run.mjs" <name>
  --args-file <json>`. Always pass the product as their `dir` arg — workflows do not follow
  the shell `cd`.
- Baseline or stop: clean tree, suite green — or the pre-existing red **recorded in
  PROGRESS.md**. That red is then the baseline every later check compares against, and it
  travels to verifiers as `known_failures`.
- Record HEAD as the run's baseline SHA. With a remote, `gh auth status` must pass; delivery
  needs it. Read the product's `AGENTS.md`, `CONTRIBUTING.md` and `.github/`: their branch and
  commit conventions win over the defaults named here. Create the **integration branch**
  `forge/<slug>` from the baseline and work on it: features land there, never on `main`
  (`integration_mode: branch`, `integration_branch` recorded in run.json). Only with no
  remote is there no protected branch: integrate into the current branch
  (`integration_mode: local`). A resumed run checks out the recorded integration branch and
  creates none.
- `.agents/` must be ignored (run state lives in `.agents/forge/`): run
  `node "$FORGE_HOME/scripts/forge-git.mjs" ignore-local .agents/`. It changes nothing when
  `.agents/` is already ignored; otherwise (an adopted repo) it adds it to the local
  `.git/info/exclude` and leaves the product's files alone. Safe to re-run.
- Write `.agents/forge/run.json`: `{run_id, command, baseline_sha, integration_mode,
  integration_branch, known_red, waves:[{n, features:[{id, tier, branch, status, pr, evidence}]}], next}`. Update
  it at every wave boundary, with `next` naming the exact resume action. Git stays
  authoritative; the file only speeds up `/forge:resume`.

## 1. Wave plan

**Size the run first.** A **small run** — about 6 features or fewer, on code you can hold in
your context — has no waves: you build the features yourself, one after another, each on
its own branch from the last merged state. No worktrees, no parallel merges, no per-feature
checks: the T1 check moves into the finish review, with the T1 paths as its priority. A
small run needs no top model: say at the start that a Sonnet session is enough, and that you
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

## 2. Start — a gate only when a decision is open

The backlog is already in the spec, which the user approved at kickoff, and the wave plan is
technical. So a plan nobody has to decide on is not shown for approval. Ask, in ONE message,
only for what is genuinely open, each with your default:

- a one-way door in the backlog (data migration that cannot be undone, a vendor or licence
  choice, a public API contract);
- done-criteria too vague to build against, or in conflict with each other or the spec;
- a backlog or spec the user has not reviewed (adopt-seeded, reverse-engineered), or a
  missing Decision policy (below) in such a product;
- no remote and the user may want one: offer `gh repo create --private --source .` once.

Otherwise state the plan in one message and start: the outcome in one line, feature → done
means in product language, the execution order (a wave table **only when two or more
features run in parallel**), run size and rough cost. Tier per feature is shown for override,
not for approval.

- **Run size**: small (built in order by you, one review at the end, a Sonnet session is
  enough) or large (waves; in parallel worktrees where 3+ entries are parallel-safe: the
  `feature-pipeline` workflow).
- **Integration** is local: features land on the integration branch and delivery (§5d)
  opens the PR(s). With no remote, integrating straight into the current branch is the
  run's speed lever: same gates, no PR round-trip.

The spec's **Decision policy** is in force for the run: reversible calls are decided and
logged as ADRs mid-run; only one-way doors stop the run, and those batch. **If `docs/SPEC.md`
has no Decision policy section**, synthesize it from `$FORGE_HOME/templates/SPEC.md`, state
it verbatim in the start message, and write it into the spec; an objection stops the run.
**Never run the hands-off phase without a Decision policy in force.**

## 3. Build — you orchestrate, fresh context only where it pays

**Timestamp every stage boundary** with `date +%s` — wave start, builds done, checks done,
merges done — into `.agents/forge/run.json`. §6 reports wall-clock from those marks.

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
- **The independent check.** In a large run each T1 feature gets ONE fresh-context security
  pass (`forge-warden`) on its diff, which also proves the done-criteria on their failure
  paths. A named surface on a T2/T3 feature does not get its own pass: it goes into the
  finish review's priority, which reads every line anyway. In a small run the T1 pass is
  skipped too: the finish review covers it, with the T1 paths as its priority.
  The builder never checks its own work: everything else is checked by the merge gate's full
  suite and the finish review.

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

1. **Confirm HEAD is the integration branch** (`forge/<slug>`, or the current branch with
   no remote). A merge onto a feature branch silently forks the line.
2. **Kill orphaned test processes** the wave's agents left behind.
3. Merge each verified feature branch into the integration branch in dependency order
   (`git merge --no-ff`), no PR: a feature is not a reviewable unit by itself (§5d decides
   that), and CI runs once on the delivery PR, not once per feature. A conflict is yours to
   resolve.
4. **Run the full suite and the e2e suite now**, on the merged result, after every wave
   including the last. This is the only place e2e runs. Compare its time and the new test
   count with the test budget in the project `AGENTS.md`; over budget goes to the report as
   a finding to prune, not a stop.
5. NEW failures versus the baseline: **re-run only those failing tests once**. Reproduces →
   real regression: find the feature merge that caused it, revert that merge on the
   integration branch, mark the feature `failed` in run.json and PROGRESS.md with the revert
   SHA, stop the run and report. Bringing it back needs `git revert <revert-sha>` first; a
   plain re-merge of the branch silently keeps the old code out. Clears → log it as flaky (name + passed on
   retry) and continue.
6. Tick PROGRESS.md per integrated feature with its evidence (issue phase: collect the
   evidence for the delivery PR body, which carries `Closes #<issue>`); update
   `.agents/forge/run.json`.

Per FAILED feature: record branch + issues, continue the wave. A failure blocks only its
dependents. After the last wave, ONE retry round for failures that read fixable; whatever
fails twice is reported for `/forge:fix` or `/forge:debug-hard`.

## 4. Visual checkpoints (UI products — fail-soft, never a stop)

Twice, critiqued against the spec's **Art direction** block: **first-light** right after the
first feature that renders real UI merges (confirmed gaps feed the next briefs), and a
**polish pass** after the last feature, spending ONE T3 feature on the confirmed gaps. No Art
direction block → note it and skip.

## 5. Finish (automatic, no approval)

Only on a completed run; a halted run reports the stop instead. The review runs on the
integration branch before any PR exists, so findings are fixed before a reviewer sees them.

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
5. **Visual walkthrough** (UI products, fail-soft): yourself, per
   `$FORGE_HOME/docs/FINISH.md` (`forge-proof` only to keep your context clear).

## 5c. Documentation pass

**Yourself, fail-soft** (`forge-etcher` only for a large docs set). Rewrite the README from
the SHIPPED reality, per `$FORGE_HOME/docs/FINISH.md`.
**Verify every command it documents by running it.**

## 5d. Deliver

Decide the PR boundaries by the rule in `$FORGE_HOME/docs/LIFECYCLE.md` § PR boundaries:
one PR unless a split serves the reviewer. No remote → nothing to open; the work is already
on the current branch.

1. Push the integration branch. For a split, cut one branch per reviewable concern from the
   integration branch (parts with a build dependency stay together). Several PRs open in one
   batch: `bash "$FORGE_HOME/scripts/forge-pr.sh" open-all <manifest>`; one PR:
   `forge-pr.sh open`. Each targets the repo's main branch, never another feature's branch.
2. PR text from the repo's `.github/pull_request_template.md` if it has one, else from its
   `AGENTS.md`, else: what the user gets, evidence (the pasted merge-gate and review results),
   deviations, risks. Per-feature `pr_body` data from the pipeline is raw material for it,
   not a second description. Say why the boundary is where it is when it is not one PR.
3. Wait for the required checks (`gh pr checks <n> --watch --required`, several PRs
   **concurrently, not one at a time**) and fix red ones within the usual two rounds. A
   fix on a PR branch is a new commit, never a force-push.
4. Never merge the delivery. Merging into a protected branch is the user's call; the report
   links the PR(s). The run still closes with the final verdict.

## 6. Report

1–2 lines per feature during the run. **Every message to the user names a feature by what it
does for the user** ("import contacts from CSV"); an ID may follow in brackets. Harness words
— wave, tier, gate, agent names — stay internal or are said in plain words.

The final report is compact:

- Table: feature → verdict → delivered in PR. One line on the PR boundary. Suite state on the
  integrated branch (pasted), CI state of the PR(s).
- Flaky tests that cleared on a re-run. Security tier escalations, with the surface named.
- **Where the time went**: per-wave build / check / integrate wall-clock.
- **Actual spend vs. the estimate stated at the start.**
- **Autonomous decisions to review**: the ADRs, each with its one-line rationale and path.
- **Criteria reported open, not ticked**, with the substitute that ran.
- What needs the user: the PR(s) to merge, skipped dependents, twice-failed features,
  medium/low triage.
- Closing verdict: **ready for `/forge:ship`** once the PR(s) are merged — or not, with
  reasons. Never soften it.
- **Next →** the line matching the verdict.

## Stop conditions (report, never push through)

Unrecorded red baseline · more than half a wave fails verification · NEW suite failures on
integrated branch that reproduce on a targeted re-run · a workflow-level error · a feature
branch that conflicts beyond a safe resolution and that later waves depend on.

`/forge:build` never force-pushes, never merges a feature that failed verification, and
never weakens a test to get green. It never merges into a protected branch. On any stop,
`.agents/forge/run.json` holds the state for `/forge:resume`.
