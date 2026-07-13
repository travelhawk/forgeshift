---
name: forge
description: Build the whole feature backlog hands-off - one wave-plan approval, then waves of parallel feature-pipeline builds, one PR per feature, verified work merged in dependency order, finished by an automatic deep-review of the integrated result with confirmed critical/high findings auto-fixed. Use after /kickoff or /adopt when many features should be built without per-feature supervision.
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
- Record the current HEAD commit as the run's baseline marker — the finish step
  reviews everything merged after it.

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
  untagged feature by capability signal per `docs/RISK-TIERS.md`, ties upward). The tier
  sets its validation depth in the pipeline — it does not affect wave partitioning
  (that's footprint only).
- Output: waves 1..N, each a list of pipeline entries with footprint, **tier +
  justification**, done-criteria, why it is parallel-safe, and flagged risks. Fewer,
  fatter waves beat many thin ones — parallelism inside a wave is the pipeline's job.

## 3. The gate (the only one)

Present in one message, then get one approval:

- The wave table: feature → wave → **tier** → footprint → done-criteria. The tier
  column is your batch override point — bump any feature up or down here before you
  approve (`docs/RISK-TIERS.md`); the approval covers the adjustment.
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
- A rough cost expectation (a 3+-feature wave is a feature-pipeline run: 5–30x
  session tokens; a 1–2-feature wave runs the direct `/feature` loop at roughly
  half that; plus one deep-review for the finish).
- The finish step (section 5) is included by default: automatic `deep-review` of the
  integrated result, confirmed critical/high findings fixed on the spot, plus — for UI
  products — a Playwright **visual walkthrough** (§5b: flow videos + a screen-overview
  image). Opt-out here at the gate — sensible only for mini-backlogs where the review
  overhead outweighs the run.

The approval covers everything downstream, including merges in auto-integrate mode
and the finish step's fixes.

## 4. Execute (hands-off from here)

**Small-wave shortcut (1–2 features):** the pipeline's value is parallel fan-out +
context isolation; below 3 features its fixed overhead (preflight, per-feature plan
agent, re-contexting) outweighs it. For such a wave, skip the workflow and run the
`/feature` loop §2–§4 directly per feature — plan inline (forge-blueprint only if
large), `forge-hammer` builds on a `feature/<slug>` branch, fresh-context verify per
tier (T1: quench + warden, T2: quench, T3: smoke) — still hands-off under the gate
approval, then continue at step 2 below (PR/merge machinery identical). Waves of 3+
fire the pipeline:

Per wave, in order:

1. Fire the `feature-pipeline` workflow with `{dir: <product path>, features: [wave
   entries], context}`. Each wave entry is an object `{feature, tier, done_criteria}` —
   the tier drives the pipeline's build model/effort and verify depth (T1 verify +
   security pass, T2 one verify, T3 smoke-only on Sonnet). Context carries the spec
   summary, project conventions, and the known-red baseline if any. Write the same
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

## 5. Finish (automatic — covered by the gate approval)

Runs only on a completed run — a run halted by a stop condition skips finish and
reports the stop instead. Unless opted out at the gate:

**review-PRs mode has no integrated main** (nothing merged). There is no merged whole
to review and no way to merge a fix PR, so the finish deep-review is skipped; the
report instead recommends the user run `/deep-review` after merging the open PRs. The
steps below apply to auto-integrate and local modes.

1. Fire the `deep-review` workflow on the integrated result:
   `{dir: <product path>, scope: "git diff <baseline commit>..HEAD — the merged output
   of this /forge run", priority: "<T1 features + their paths>"}` (substitute the
   section-0 baseline SHA). The `priority` note names the T1 features so reviewers
   concentrate their effort on the high-risk paths — T3 boilerplate, already smoke-built,
   gets swept but not ground over. Pipeline verification saw each feature in isolation —
   this is the adversarial pass over the merged whole, and the one review T3 features get.
   A deep-review error return (a result with no `confirmed`/`unverified` — preflight
   flaked, target refused) is ship-blocking: report the error, never emit
   ready-for-`/ship` without a completed review (same rule as a section-4 workflow
   error).
2. CONFIRMED critical/high findings are fixed in `/fix` discipline: regression test
   first, smallest fix, fresh `forge-quench` pass on the fix diff — the fixer never
   verifies itself. Suite stays green versus the baseline. Two failed fix attempts
   on a finding → stop fixing it, mark it ship-blocking (hard rule 3).
3. Fixes integrate like features: one `fix/deep-review-<suffix>` branch → PR with
   the findings as evidence → merged in auto-integrate mode (local mode: direct
   commits).
4. Fail closed on the `unverified` bucket: deep-review returns findings whose refuters
   crashed as `unverified` ("treat as open, do not discard"). An unverified
   critical/high is NOT auto-fixed but IS ship-blocking — it counts against the
   ready-for-`/ship` verdict exactly like a twice-failed fix.
5. Medium/low findings (confirmed or unverified) are NOT auto-fixed — they are
   judgment calls and go to the report for the user to triage at `/ship` time.

## 5b. Visual walkthrough (UI products only — automatic, fail-soft)

Runs on the completed, green integrated result (auto-integrate and local modes; skipped
in review-PRs mode — nothing is merged to run). **UI products only**, and **never a stop
condition**: any failure is a note in the report, never a block on ready-for-`/ship` —
this is a deliverable, not a gate. Delegate to `forge-proof` with the product path, the
dev-server command (product `CLAUDE.md`), and the core journey + shipped features from
`docs/SPEC.md`:

1. **Applicability.** No runnable web UI (CLI, API, library) → report "no UI to capture"
   and stop. UI present → ensure Playwright is available (`npx playwright install
   chromium` if missing; the web-app playbook already ships it).
2. **Run the app.** Start the dev server in the background, poll until it responds; kill
   the whole process tree at the end — Windows: `taskkill //F //T //PID <pid>` or
   `npx kill-port <port>` (a bare kill leaks node.exe holding the port).
3. **Videos of the main user flows.** Derive the flows from the spec's core journey plus
   the shipped features — one flow per journey, not one per click. A Playwright script
   drives each flow end-to-end with `recordVideo` → one `.webm` per flow in
   `docs/walkthroughs/videos/`. A flow that can't be driven (auth/seed not available) is
   recorded as skipped with the reason; partial capture still ships what it got.
4. **Overview image of all screens.** Screenshot every distinct screen/route into
   `docs/walkthroughs/screens/`, then assemble ONE contact-sheet
   `docs/walkthroughs/overview.png` (ImageMagick `montage`, or lay the shots into an HTML
   grid and screenshot that).
5. **Artifacts.** Commit the small, review-friendly ones (`overview.png`, the
   screenshots); add `docs/walkthroughs/videos/` to the product `.gitignore` (videos are
   large binaries) — they stay on disk and are linked in the report. Follow the product's
   own convention if it already commits media.

Covered by the same finish opt-out at the gate.

## 6. Report

- Table: feature → branch → PR → verdict → merged.
- Suite state on integrated main (pasted output); PROGRESS.md updated.
- Finish results: confirmed findings fixed (with evidence), unverified crit/high held
  as ship-blocking, medium/low open. In review-PRs mode: the deferred-review note.
- Visual walkthrough (UI products): the paths to the flow videos and `overview.png`, plus
  any flows skipped and why. Not a UI product / not run → say so plainly. This is never a
  ship blocker.
- What needs the user: open PRs (review-PRs mode) with the run-`/deep-review`-after-
  merge recommendation, skipped dependents, twice-failed features, medium/low triage.
- Closing verdict: **ready for `/ship`** — or NOT ship-ready, with the reasons
  (ship-blocking confirmed OR unverified crit/high, a deep-review error return, failed
  features, new suite failures). Never soften this. Two cases are never a bare "ready
  for `/ship`": review-PRs mode is "PRs ready for your review"; a finish opt-out is
  "ship-ready pending the deep-review you skipped — run `/deep-review` before `/ship`".

## Stop conditions (report, never push through)

Unrecorded red baseline at start · more than half a wave fails verification · NEW
suite failures on integrated main after a merge · a workflow-level pipeline error ·
an unmergeable PR that later waves depend on. /forge never
force-pushes, never merges a feature that failed verification, and never weakens a
test to get green.
