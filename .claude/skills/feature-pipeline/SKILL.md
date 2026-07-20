---
name: feature-pipeline
description: Implement independent features in parallel - plan, implement in an isolated git worktree, verify per risk tier. The engine /forge:build drives; use it directly for a raw batch of independent features without the PR ceremony. Needs a git repo with at least one commit.
argument-hint: "[array of feature entries | {dir, features, context, known_failures}]"
---

# /forge:feature-pipeline — parallel build of independent features

Fire the `feature-pipeline` workflow: each feature is planned, built in its own isolated
git worktree, and verified in fresh context by risk tier (T1 verify + security pass, T2 one
verify, T3 smoke-only on Sonnet). Dependent features belong in ONE entry (built
sequentially inside it). Usually driven by `/forge:build`; run it directly only for a raw
independent batch.

1. Resolve the plugin home once: `FORGE_HOME="${CLAUDE_PLUGIN_ROOT:-$(forge-home)}"`. Pass
   the target repo as `dir` (absolute) — workflows do NOT follow the shell `cd`, and this
   one needs a git repo with ≥1 commit.
2. Parse `$ARGUMENTS`: an array of feature entries (a string, optionally with a `[T1]`
   marker, or `{feature, tier, done_criteria}`), or an object
   `{dir, features, context, known_failures}`. Pass `known_failures` as its own field when
   the repo starts from a recorded known-red baseline — it is threaded verbatim to every
   builder/verifier so a pre-existing failure is not mistaken for a regression. If args may
   not arrive intact, write `{features, context, known_failures}` to
   `feature-pipeline.input.json` in the product root first (fallback); delete it after.
3. Invoke: Workflow tool, `scriptPath: "$FORGE_HOME/.claude/workflows/feature-pipeline.js"`,
   `args: {dir: "<abs product root>", features: [...], context, known_failures}`.
4. Branches are verified **in isolation** — after merging, run the full suite on the merged
   result before calling the batch done (integration breaks surface there). Relay
   `pr_title`/`pr_body`/`evidence` per feature.

**Next →** open a PR per passed feature (or let `/forge:build` do the merge machinery), then
`/forge:deep-review` the integrated whole.
