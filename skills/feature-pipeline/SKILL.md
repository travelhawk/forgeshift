---
name: feature-pipeline
description: Build independent features in parallel - one agent per feature in its own git worktree, a fresh security pass for T1 and sensitive diffs. The engine /forge:build drives; use it directly for a raw batch of independent features without the PR ceremony. Needs a git repo with at least one commit.
argument-hint: "[array of feature entries | {dir, features, context, known_failures}]"
---

# /forge:feature-pipeline — parallel build of independent features

Fire the `feature-pipeline` workflow: one agent per feature builds it in its own git worktree,
tests first. T1, and any diff its builder flags as sensitive, gets one fresh security pass. Dependent features belong in ONE
entry. Usually `/forge:build` drives it; run it directly only for a raw independent batch.

1. `FORGE_HOME="${FORGE_HOME:-${CLAUDE_PLUGIN_ROOT:-$(forge-home 2>/dev/null || ls -d ~/.claude/plugins/cache/forge/forge/*/ | sort -V | tail -1)}}"`.
2. Parse `$ARGUMENTS`: an array of feature entries — a string, optionally with a `[T1]`
   marker, or `{feature, tier, done_criteria}` — or an object
   `{dir, features, context, known_failures}`. `known_failures` names the tests already red at
   baseline, as its own field.
3. Invoke `$FORGE_HOME/workflows/feature-pipeline.js` with
   `args: {dir: "<abs product root>", forge_home: "$FORGE_HOME", features: [...], context, known_failures}`.
   `dir` is required: workflows do not follow the shell `cd`.
   Claude Code: the Workflow tool, that file as `scriptPath`. Any other host: write the args
   to a JSON file and run `node "$FORGE_HOME/bin/forge-run.mjs" feature-pipeline --args-file <file>`.
   If args may not arrive intact, also write them to `feature-pipeline.input.json` in the
   product root (fallback); delete it after.
4. Relay `pr_title`/`pr_body`/`evidence` per feature (raw material for the delivery PR text). The branches were tested **in
   isolation**: merge them, then run the full suite on the merged result.

**Next →** integrate the passed branches and let `/forge:build` deliver them (PR boundaries:
`docs/LIFECYCLE.md`; a passed feature is not automatically its own PR), then
`/forge:deep-review` the integrated whole.
