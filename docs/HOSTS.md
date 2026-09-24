# Hosts — one harness, any agent CLI

F.O.R.G.E. is **fleet-orchestrated**: the playbooks, specialists and workflow scripts are
written once and run on whichever coding agent you have. A *host* is an agent CLI with a
headless mode. Supported: **Claude Code**, **Codex CLI**, **OpenCode**. CLI flags and file
formats below were verified on 2026-09-21 (claude 2.1.272, codex-cli 0.154.0, opencode
1.18.31) — re-check when a CLI ships a major.

## One source, three surfaces

| Canonical file | Claude Code | Codex CLI | OpenCode |
|---|---|---|---|
| `skills/<name>/SKILL.md` | plugin skill `/forge:<name>` | Agent Skill `$forge-<name>` | Agent Skill + command `/forge-<name>` |
| `agents/forge-*.md` | plugin subagent | `.codex/agents/forge-*.toml` | `opencode/agents/forge-*.md` (`mode: subagent`) |
| `workflows/*.js` | native Workflow tool | `bin/forge-run.mjs` | `bin/forge-run.mjs` |
| `AGENTS.md` (manual) | via the `CLAUDE.md` stub (`@AGENTS.md`) | read natively | read natively |

Claude Code loads the repo as a plugin, unchanged. Every other host gets a **rendered copy**
(`lib/render.mjs`): frontmatter cut down to what the host accepts, `/forge:build` rewritten to
`forge-build`, and `$FORGE_HOME` resolved to the installed harness. Never edit a rendered file —
edit the canonical one and re-run the installer.

## Install

```
node scripts/install.mjs                    # every agent CLI found on PATH, global
node scripts/install.mjs --host codex       # claude | codex | opencode | all | a,b
node scripts/install.mjs --project <dir>    # register in one repo instead of globally
node scripts/install.mjs --dry-run          # list every path first
node scripts/install.mjs --uninstall        # removes exactly what the manifest lists
```

| What | Global | `--project <dir>` |
|---|---|---|
| Harness copy (`$FORGE_HOME`) | `~/.forge/home` | `~/.forge/home` |
| Skills (Codex + OpenCode share them) | `~/.agents/skills/forge-*/` | `<dir>/.agents/skills/forge-*/` |
| Codex subagents | `~/.codex/agents/` | `<dir>/.codex/agents/` |
| OpenCode agents + commands | `~/.config/opencode/{agents,commands}/` | `<dir>/.opencode/{agents,commands}/` |
| Manifest | `~/.forge/install.json` | `<dir>/.forge/install.json` |
| Claude Code | `claude plugin install forge@forge` | same, `--scope project` |

Everything forge writes is prefixed `forge-`, so it never shadows your own skills or agents.
Re-running the installer replaces the harness copy and removes files a previous version
wrote and this one does not. The manifest tracks each host separately: installing or
removing one host never touches another's files. The harness copy is shared, so only the
global uninstall removes it, and only if it carries forge's marker file. The installer never
deletes anything outside its own `forge-*` files, whatever a manifest lists.

## Workflows — the portable runner

The four workflow scripts are plain JavaScript against a small runtime: `agent()`,
`parallel()`, `pipeline()`, `phase()`, `log()`, `budget`. Claude Code provides that runtime
natively. `lib/runtime.mjs` provides the same one everywhere else, and `bin/forge-run.mjs`
drives it — **the script file is identical on every host.**

**`bin/forge-run.mjs` is the reference implementation.** The behaviour a workflow is
entitled to is what the portable runner does, because that is what the test suite executes —
the native invocation has no automated coverage (see Known limits). Two rules follow:
a workflow may not depend on anything only the native runtime offers, and a fix to shared
script logic lands in `lib/workflow-preamble.mjs`, never in one script. The native path stays
because it earns its keep on Claude Code: `model: inherit` really is the session model there,
and the user sees phases live and can interject. It is an accelerator, not a second standard.

```
node "$FORGE_HOME/bin/forge-run.mjs" release-gate --args-file args.json
node "$FORGE_HOME/bin/forge-run.mjs" hosts          # which CLIs are found, tier → model
```

| Flag | Meaning |
|---|---|
| `--args-file <json>` | the workflow's `args`; `dir` must be the absolute product root |
| `--host <name>` | default: `FORGE_HOST`, else the agent calling the runner, else `config.host`, else the first CLI found |
| `--mode workspace\|readonly\|full` | what each agent may touch — see below. Default `workspace` |
| `--concurrency <n>` | parallel agents, default 4 |
| `--resume <run-id>` | finished agents replay from cache; only the rest re-run |
| `--timeout-min <n>` | per agent, default 45 |

Each `agent()` call is one fresh headless session of the host CLI, started in `dir`. The
result JSON goes to stdout — the same object the Claude Workflow tool returns — and the exit
code is 1 when the workflow reports `error`. Run state (agent cache, log, result) lives in
`~/.forge/runs/<run-id>/`, never in the product.

**Fail-closed is kept.** An agent that crashes, times out, or answers off-schema (after one
cheap reformat pass) returns `null`, exactly like the native runtime — and every gate treats
a missing report as a failed gate. A session that dies mid-answer counts as a crash, not as a
short answer, and the reformat pass may answer `NO_ANSWER` rather than invent a verdict.
Codex gets `--output-schema` only when every schema node has a `type` (OpenAI rejects the
rest); otherwise the schema rides in the prompt and the runtime validates the reply.
Ctrl-C stops every running agent with the runner.

**`isolation: 'worktree'`** — the runner creates a detached sibling worktree (`../wf-iso-*`),
runs the agent there and removes it after. Branches the agent made survive.

### Modes

| Mode | Claude Code | Codex CLI | OpenCode |
|---|---|---|---|
| `workspace` | `acceptEdits` + file, shell and web tools, plus the product's parent dir | sandbox `workspace-write`, plus the product's parent dir (sibling worktrees), its `.git`, and an isolated agent's own worktree admin dir (without both, no commit) | `--auto` |
| `readonly` | Write/Edit denied — **the shell still runs and can write** | OS sandbox `read-only` | no `--auto`: your OpenCode permission rules decide |
| `full` | `bypassPermissions` | no sandbox, no approvals | `--auto` |

Only Codex enforces `readonly` below the agent. On Claude and OpenCode it removes the edit
tools and the prompt forbids edits — enough for reviewers, not a security boundary.

`full` removes the guard rails. Use it only in a container or a throwaway checkout.

## Models — tiers, not names

Agent files and workflow scripts name a **tier** by its Claude alias, because the native
Claude runtime reads those tokens. Everywhere else the alias is only a tier:

| On disk | Tier | Job |
|---|---|---|
| `inherit` | `judge` | specs, architecture, review verdicts, hard bugs |
| `opus` | `build` | all real building |
| `sonnet` | `execute` | docs, research, written plans, command-running gates |
| `haiku` | `sweep` | mechanical sweeps, classification |

Claude maps tiers to its aliases. **Codex and OpenCode default every tier to the host's own
configured model** and separate the tiers by reasoning effort — model names there differ per
account and age fast, so forge does not guess them. Map them once in `~/.forge/config.json`:

```json
{
  "host": "codex",
  "concurrency": 4,
  "hosts": {
    "codex":    { "models": { "judge": "<strongest>", "build": "<strong>", "execute": "<mid>", "sweep": "<cheap>" } },
    "opencode": { "models": { "sweep": "<provider/cheap-model>" }, "args": [] }
  }
}
```

`FORGE_MODEL_<TIER>` overrides one tier for one run. The installer writes the same mapping
into the rendered subagents, so re-run it after changing the config. Full policy:
`MODEL-ROUTING.md`.

## Specialists

Delegate to `forge-*` with the host's own subagent mechanism: Claude's Agent tool, a Codex
subagent, OpenCode's task tool. When the host has none, or you want a guaranteed fresh
context on a chosen host:

```
node "$FORGE_HOME/bin/forge-run.mjs" agent forge-quench --dir <product> --prompt-file brief.md
```

The brief is the same self-contained, scope-boxed contract as everywhere (`ORCHESTRATION.md`).

## Known limits

| Limit | Status |
|---|---|
| **Codex sandbox vs. background processes.** Under `workspace-write`, Codex refused the release-gate's background smoke run ("blocked by policy"). The gate failed closed — correct, but a false NO-SHIP. | Seen 2026-09-19. Run the runtime gate with `--mode full` in a safe checkout, or grant the command in your Codex config. |
| **`feature-pipeline` end-to-end.** Two features in parallel (a light-check one and a fully reviewed one), each planned, built on its own branch in its own worktree, and verified; main tree untouched, no worktree left. Codex needed two grants for that: the repo's `.git` and the worktree's own admin dir. | Claude, Codex, OpenCode: passed 2026-09-21 on Windows 11. macOS/Linux not yet run. |
| **Codex on Windows leaves its sandbox rules behind.** It writes deny entries into the permissions of the folders it guards and never removes them, so a path once guarded can stay locked for a later run that grants it. | Seen 2026-09-21. Fresh worktree paths avoid it; `icacls <dir>` shows the entries. |
| **The installer's Claude route is not covered by `npm test`.** Every other path is (`scripts/install.mjs` is driven end to end against a temp project), but the Claude branch shells out to `claude plugin install/uninstall`, which would rewrite the plugin setup of whoever runs the suite. The suite therefore runs the installer with a PATH that reaches no agent CLI at all. | By design. Check that branch with `--dry-run`, or in a throwaway account. |
| **The native Workflow invocation on Claude Code is not covered by `npm test`.** The suite drives every workflow through `lib/runtime.mjs`; the native runtime can only be exercised by a live run. Both known mangling modes — args arriving JSON-stringified, agents starting in the session's directory instead of the product — come from that path and are guarded inside each script (`lib/workflow-preamble.mjs`). | By design of the hosts; re-check with a live run after touching a workflow's args handling. |
| **An agent that dies mid-task** can leave the `../wf-*` worktree it made itself. The runner removes only worktrees it created. | `git worktree prune`, then delete the folder. |
| **The CLI must be on the runner's PATH.** On Windows, npm installs `codex`/`opencode` into `%APPDATA%\npm`; a shell without it gets "not on PATH" and the list of CLIs that were found. | — |
| **`readonly` on Claude and OpenCode** removes the edit tools, not the shell (see Modes). | By design of the hosts. |
| **Persistent agent memory** (`memory: project`) is a Claude Code feature. Other hosts start every specialist cold. | Not portable. |
| **Cost numbers** in `MODEL-ROUTING.md` and `EVALS.md` are Claude prices. The runner reports output tokens per run on every host. | — |

## Adding a host

1. `lib/hosts.mjs` — one entry: `bin`, `models`, `command(opts) → argv`, `parse({stdout,
   outFile}) → {text, structured, outputTokens}`, plus its env marker in `callingHost()`.
   The prompt always arrives on stdin; nothing free-form rides the command line.
2. `lib/render.mjs` — a renderer, only if the host cannot read Agent Skills or needs its own
   subagent format.
3. `scripts/install.mjs` — where the rendered files go.
4. `tests/cross-agent.test.mjs` — record one real output of the CLI and pin `parse()` on it.
