# Hosts — one harness, any agent CLI

F.O.R.G.E. is **fleet-orchestrated**: the playbooks, specialists and workflow scripts are
written once and run on whichever coding agent you have. A *host* is an agent CLI with a
headless mode. Supported: **Claude Code**, **Codex CLI**, **OpenCode**. CLI flags and file
formats below were verified on 2026-09-19 (claude 2.1.272, codex-cli 0.154.0, opencode
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
wrote and this one does not.

## Workflows — the portable runner

The four workflow scripts are plain JavaScript against a small runtime: `agent()`,
`parallel()`, `pipeline()`, `phase()`, `log()`, `budget`. Claude Code provides that runtime
natively. `lib/runtime.mjs` provides the same one everywhere else, and `bin/forge-run.mjs`
drives it — **the script file is identical on every host.**

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
a missing report as a failed gate.

**`isolation: 'worktree'`** — the runner creates a detached sibling worktree (`../wf-iso-*`),
runs the agent there and removes it after. Branches the agent made survive.

### Modes

| Mode | Claude Code | Codex CLI | OpenCode |
|---|---|---|---|
| `workspace` | `acceptEdits` + file, shell and web tools | sandbox `workspace-write`, plus the product's parent dir (sibling worktrees) | `--auto` |
| `readonly` | no Write/Edit tools | sandbox `read-only` | no `--auto`: your OpenCode permission rules decide |
| `full` | `bypassPermissions` | no sandbox, no approvals | `--auto` |

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
| **`feature-pipeline` on sandboxed hosts.** Worktrees and commits write outside the workspace root; the runner grants the parent dir, but the full pipeline has not been run end-to-end on Codex or OpenCode. | Unverified. |
| **Claude through the runner.** Inside Claude Code the native Workflow tool is used, so the runner's Claude adapter is rarely needed. It is covered by recorded-output tests only. | Not live-tested. |
| **OpenCode `readonly`.** `opencode run` has no read-only switch; reviewers are told in their prompt not to edit. | By design of the host. |
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
