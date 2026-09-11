---
name: design-panel
description: Generate N independent design approaches, score them with a judge panel, synthesize the winner - for architecture or design decisions where the solution space is wide and a wrong pick is expensive (system design, data model, API shape, major refactor strategy). Pass the design brief as args.
argument-hint: "[design brief: problem + constraints + context | {dir, brief, panel:'wide'}]"
---

# /forge:design-panel — independent designs → judged → synthesized

Fire the `design-panel` workflow: independent designers with different priors beat one
design iterated (iteration anchors on the first idea). Default is the **lean** panel
(3 designers + 1 judge-synthesizer); `panel: "wide"` runs 4 designers + 3 voting judges +
a separate synthesis — reserve it for the most expensive decisions.

1. Resolve the plugin home once: `FORGE_HOME="${CLAUDE_PLUGIN_ROOT:-$(forge-home 2>/dev/null || ls -d ~/.claude/plugins/cache/forge/forge/*/ | sort -V | tail -1)}"`. Pass
   the target repo as `dir` (absolute) — workflows do NOT follow the shell `cd`.
2. Parse `$ARGUMENTS` into the brief (problem, constraints, context), or an object
   `{dir, brief, panel}`. If the brief may not arrive intact, write it to
   `design-panel.input.md` in the product root first — the workflow reads it as a fallback;
   delete it after.
3. Invoke: Workflow tool, `scriptPath: "$FORGE_HOME/.claude/workflows/design-panel.js"`,
   `args: {dir: "<abs product root>", brief: "<parsed>", panel: "<lean|wide>"}`.
4. Relay the synthesized recommendation with the runner-up trade-offs, so the choice and
   its cost are both visible.

**Next →** record the decision in an ADR, then `/forge:feature` (or `/forge:build`) to
implement it.
