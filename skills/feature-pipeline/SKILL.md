---
name: feature-pipeline
description: Implement independent features in parallel - plan, implement in an isolated git worktree, verify per risk tier. The engine /forge:build drives; use it directly for a raw batch of independent features without the PR ceremony. Needs a git repo with at least one commit.
argument-hint: "[array of feature entries | {dir, features, context, known_failures}]"
---

# /forge:feature-pipeline — parallel build of independent features

Fire the `feature-pipeline` workflow: each feature is built in its own git worktree and
verified in fresh context, at the depth its risk tier sets. Dependent features belong in ONE
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
4. Relay `pr_title`/`pr_body`/`evidence` per feature. The branches were verified **in
   isolation**: merge them, then run the full suite on the merged result.

**Next →** open a PR per passed feature (or let `/forge:build` do the merging), then
`/forge:deep-review` the integrated whole.
