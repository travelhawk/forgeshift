---
name: understand
description: Map an unfamiliar or large codebase with parallel read-only subagents, then synthesize one architecture brief. Use at the start of work on a foreign/large codebase, or when a change spans subsystems you have not read. Optional focus question narrows the maps.
argument-hint: "[optional focus question, e.g. 'how does auth work']"
---

# /forge:understand — Parallel mapping → one architecture brief

Map "$ARGUMENTS" (a focus question, or empty for a whole-repo map). This was a workflow;
it is a skill because it carries no fail-closed gate and no code-only aggregation — just a
scout → parallel readers → synthesis fan-out, which the main session orchestrates directly
(cheaper, and it sidesteps the workflow launch/args plumbing). The one thing the workflow
did that a skill must not lose is **context hygiene**: subsystem maps are bulky, so readers
write them to scratchpad files and the synthesizer reads those files — the maps never
transit the main session context.

## 1. Anchor (inline — the target sanity check the workflow's preflight did)

Establish the target product: normally the folder you launched `claude` in (cd into it if
needed; ambiguous → ask). **Refuse to map the forge plugin repo itself** — if the target
holds a `.claude-plugin/plugin.json` or a `.claude/workflows/` directory, that's the forge
harness source, not a product; stop and ask which product. Confirm it holds real code (a
manifest/source); an empty or nonexistent dir → stop and report.

## 2. Scout — the subsystem layout

Read only the top-level structure, manifests, and build config (not implementation).
Group the code into **3–10 coherent subsystems** (frontend, api, db layer, auth, jobs,
shared libs, infra, tests…), each with its paths and a one-line hypothesis. Small repo
(< ~20 source files)? Skip the fan-out — read it directly and write the brief yourself.
A focus question → make sure the subsystems relevant to it are separated out.

## 3. Map — one read-only subagent per subsystem (parallel, Sonnet)

Fan out one **Sonnet** read-only mapper per subsystem (spawn them in parallel). Each is
**scope-boxed** to its own paths — this is the deliberate mapper exception to the
scope-box rule (`$FORGE_HOME/docs/ORCHESTRATION.md`, where
`FORGE_HOME="${CLAUDE_PLUGIN_ROOT:-$(forge-home 2>/dev/null || ls -d ~/.claude/plugins/cache/forge/forge/*/ | sort -V | tail -1)}"`): a mapper's job *is* the broad read,
but only of *its* subsystem, not the whole tree. Give each mapper:

- Its subsystem name, paths, and hypothesis; the focus question if any.
- The instruction to read the actual code and report — key files + roles, entry points,
  data/control flow, conventions new code must match, and fragile spots/risks — precisely
  enough that a new contributor could write code that fits.
- **Write the full map to a scratchpad file** (`<scratchpad>/understand-<subsystem>.md`)
  and return ONLY the file path plus a one-line status. The map does not come back through
  chat — that is what keeps the main context clean.
- If its paths turn out empty or not code, say so in the file (found=false) — never invent
  a map. A mapper that fails or finds nothing is noted; the brief will be partial, not
  blocked.

## 4. Synthesize — one subagent reads the map files (session model)

Delegate to one synthesizer on the **session model**: give it the scratchpad map-file
paths (not their contents), have it read them, resolve contradictions by re-reading the
code itself, and produce ONE architecture brief in markdown:

1. System overview paragraph.
2. Module map with responsibilities.
3. Cross-cutting conventions every change must follow.
4. Top risks / fragile areas.
5. Where a new feature typically plugs in.
6. If a focus question was asked: a direct, specific answer to it.

## 5. Report

Present the brief (or link the scratchpad brief file if long). Note any subsystem that
failed or was empty — the brief is partial, say so plainly. Interrupted mid-run? The
per-subsystem map files already on disk are the salvage; re-run only the missing ones.

**Next →** `/forge:adopt` if this was reconnaissance for bringing the repo under the harness;
otherwise `/forge:feature`/`/forge:fix` on the subsystem the brief flagged, or `/forge:design-panel` if it
surfaced a hard architecture decision. Name the one move.
