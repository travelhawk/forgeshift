---
name: deep-review
description: Multi-dimension code review with adversarial verification of every finding - before merging or shipping non-trivial work. Reviews the current diff by default; pass args to scope it. /forge:build and /forge:ship fire this automatically; use it directly for a standalone review.
argument-hint: "[empty=current diff | 'all' | path list | {dir, scope, priority}]"
---

# /forge:deep-review — 3-lens review, findings adversarially verified

Fire the `deep-review` workflow against the target repo: three review lenses in parallel,
then every finding is adversarially verified by independent refuters, returned fail-closed
(confirmed vs. unverified vs. rejectedBlockers).

1. Resolve the plugin home once: `FORGE_HOME="${CLAUDE_PLUGIN_ROOT:-$(forge-home)}"`. The
   **target repo is the product you're in** — pass it as `dir` (absolute path); workflows do
   NOT follow the shell `cd`, so `dir` is required.
2. Parse `$ARGUMENTS`: empty → review the current diff; `all` → whole repo; a path list →
   those paths; or an object `{dir, scope, priority}` where `priority` names the high-risk /
   T1 paths to concentrate on (`$FORGE_HOME/docs/RISK-TIERS.md`).
3. Invoke: Workflow tool, `scriptPath: "$FORGE_HOME/.claude/workflows/deep-review.js"`,
   `args: {dir: "<abs product root>", scope: "<parsed>", priority: "<optional>"}`.
4. Relay the verdict — confirmed critical/high first, unverified held open (fail-closed),
   and skim `rejectedBlockers` for a wrong dismissal. Never emit an all-clear without a
   completed review.

**Next →** `/forge:fix <finding>` per confirmed blocker, else `/forge:ship` when clean.
