---
name: release-gate
description: Run the six ship gates (static, security, docs, tests, build, runtime smoke) across three agents, aggregated fail-closed into a SHIP/NO-SHIP verdict. /forge:ship fires this automatically; use it directly for a standalone pre-release check.
argument-hint: "[version + change summary | {dir, context}]"
---

# /forge:release-gate — six ship gates, fail-closed verdict

Fire the `release-gate` workflow: static / security / docs checks in parallel, then
tests → build → runtime smoke sequentially, each returning evidence, aggregated **fail
closed** — a gate that doesn't report blocks the ship. Usually fired by `/forge:ship`; run
it directly for a standalone pre-release check.

1. Resolve the plugin home once: `FORGE_HOME="${CLAUDE_PLUGIN_ROOT:-$(forge-home)}"`. Pass
   the target repo as `dir` (absolute) — the gates run real commands there, and workflows do
   NOT follow the shell `cd`.
2. Parse `$ARGUMENTS` into the release context (version + change summary), or an object
   `{dir, context}`.
3. Invoke: Workflow tool, `scriptPath: "$FORGE_HOME/.claude/workflows/release-gate.js"`,
   `args: {dir: "<abs product root>", context: "<version + change summary>"}`.
4. Relay the SHIP/NO-SHIP verdict with each gate's evidence. **NO-SHIP blocks the release —
   fix the blockers and re-run; never override.** A `skipped` TESTS gate means wrong
   directory or a broken setup, never an acceptable pass.

**Next →** `/forge:ship` on SHIP; fix the named blockers and re-run on NO-SHIP.
