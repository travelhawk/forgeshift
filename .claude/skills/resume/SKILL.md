---
name: resume
description: Resume a stalled /forge:build or /forge:next run - read .forge/run.json, reconcile it against git and open PRs, and state the exact next action (which wave, which merge, which fix). Use after a run died mid-way (rate limit, crash, closed session) or when unsure where a batch left off.
argument-hint: "[optional: product path or run note]"
---

# /forge:resume — where did the run stop, and what's next

Recover a `/forge:build` / `/forge:next` run that stopped mid-way — without re-planning or
branch archaeology. **Git is ground truth; `.forge/run.json` is the map that makes reading
it fast.** A missing or stale map never blocks recovery — step 2 rebuilds the truth from
git.

## 1. Locate

- Establish the target product (cd into it; `$ARGUMENTS` may name it; ambiguous → ask).
- Harness assets and scripts ship with the plugin, not the product: resolve their home once
  with `FORGE_HOME="${CLAUDE_PLUGIN_ROOT:-$(forge-home)}"` and read them as
  `$FORGE_HOME/<path>`.
- Read `.forge/run.json` if present — the run-state `/forge:build`/`/forge:next` write at
  each boundary: `baseline_sha`, `integration_mode`, the wave plan, and each feature's
  last-known status. Absent/stale is fine; it only saves work, it is not trusted.

## 2. Reconcile against reality (never trust run.json alone)

Run these on the current tree and compare to the map:

- `git log --oneline <baseline_sha>..HEAD` — what actually merged since the run started.
- `git branch --list 'feature/*' 'fix/*'` + `git worktree list` — unmerged work that
  survives as branches (commits live in the shared `.git`), and stale worktrees to prune.
- `gh pr list --state open` (remote + `gh auth` present) — PRs awaiting merge.
- The test suite on HEAD — green/red vs. the recorded baseline / known-red set.

Per feature resolve the TRUE status: **merged** (in the log) · **PR-open** (branch pushed,
PR exists, unmerged) · **built** (branch has commits, no PR) · **failed** (recorded fail,
or branch missing) · **not-started**. Correct `run.json` wherever it disagrees with git.

## 3. Report + the single next action

- Table: feature → tier → true status → branch / PR → evidence.
- Stale worktrees to prune (`git worktree prune`, or
  `bash "$FORGE_HOME/scripts/forge-worktree.sh" clean`); any NEW suite failures vs.
  baseline (a stop condition — report, don't build past it).
- **The one next action, stated exactly** — e.g. "resume at wave 3 (F7–F9 not started)",
  "merge open PRs #42, #43, then run the finish deep-review", "F5 failed verification twice
  → send to `/forge:fix`", or "run complete — nothing to resume".

## 4. Continue (only if asked)

Reporting is automatic; continuing is not — resuming an autonomous run needs the user's
go-ahead (same authority bar as the original `/forge:build` gate). On that go-ahead:

- Remaining features to build/merge → hand back to `/forge:build` for exactly those,
  reusing the recorded `baseline_sha` and `integration_mode` (no re-planning, no second
  gate).
- Only the finish left → run the `deep-review` finish (`/forge:build` §5) directly.
- A twice-failed feature → `/forge:fix` or `/forge:debug-hard`, never a third identical
  attempt.

**Next →** the action from §3: `/forge:build` for the remaining features · `/forge:fix`
(or `/forge:debug-hard`) for a twice-failed one · `/forge:deep-review` when only the finish
is left · `/forge:ship` when the run is complete and green.
