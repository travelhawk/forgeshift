# F.O.R.G.E.

```
 ███████╗ ██████╗ ██████╗  ██████╗ ███████╗
 ██╔════╝██╔═══██╗██╔══██╗██╔════╝ ██╔════╝
 █████╗  ██║   ██║██████╔╝██║  ███╗█████╗
 ██╔══╝  ██║   ██║██╔══██╗██║   ██║██╔══╝
 ██║     ╚██████╔╝██║  ██║╚██████╔╝███████╗
 ╚═╝      ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝
   Fable-Orchestrated, Review-Gated Engineering
```

**Where products get hammered into shape.** A control center for building products
with Claude Code: any web app, SaaS, API, CLI, mobile, desktop, extension, or
library — from idea to shipped, with quality gates that actually gate.

*Built by Michael Falk, forged with Claude Fable 5 (architecture) and Opus 4.8 (build).*

Built for and around the Claude 5 era: judgment (architecture, specs, hard bugs, review
verdicts) rides the **session model** — run the session on **Fable 5** on architecture
days or **Opus 4.8** otherwise, and the whole gate layer rises with it (so nothing stalls
when Fable is capped). **Opus 4.8** for building, Sonnet/Haiku for execution and sweeps.
Routing policy: [docs/MODEL-ROUTING.md](docs/MODEL-ROUTING.md).

## Prerequisites

- **Claude Code** current version with the Workflow tool (dynamic workflows) — the five
  `/workflow` commands depend on it; skills and agents work on any recent version.
- **git** and **Node 22+ with pnpm** (`corepack enable`) for the default playbooks;
  per-type extras (Go, Rust for Tauri, Expo/EAS account, Apple Developer, `gh` CLI) are
  listed in each playbook and only needed when you build that type.
- Cost sense: `/feature`, `/fix`, `/status` are cheap. Workflows fan out 5-30x tokens —
  `/deep-review`, `/feature-pipeline`, `/design-panel` are worth it at gates and
  batches, not for 20-line changes. See docs/ORCHESTRATION.md.

## Quickstart

```bash
cd D:/DevProjects/private/agent-harness    # ALWAYS start sessions from the harness root
claude                       # best on Opus 4.8; Fable 5 for architecture-heavy days
> /kickoff a habit tracker that guilt-trips me with charts
```

`/kickoff` interviews you, writes the spec, picks the stack from a playbook, scaffolds
into `projects/<name>/` (its own git repo), and verifies the scaffold actually runs.
Already have a codebase? `/adopt <path>` instead. Then, in a fresh session (again from
the harness root):

```bash
> /feature F1        # plan → failing test → build → fresh-context review
> /forge             # hands-off: approve the wave plan once → all features build in
>                    #   parallel waves, PR each, automatic deep-review finish
> /fix <bug>         # bug lane: reproduce → regression test → fix → review
> /deep-review       # gate for manual work — /forge fires it automatically
> /harden            # before first public exposure
> /ship v0.1.0       # release commit → 6 automated gates + checklist + deploy
```

## What's inside

| Layer | Where | What |
|---|---|---|
| Operating manual | `CLAUDE.md` | The rules every session runs under |
| Specialists | `.claude/agents/forge-*.md` | blueprint/quench/temper — planner/reviewer/debugger (session model); hammer/proof/warden — implementer/tester/security (Opus); prospector/etcher — scout/scribe (Sonnet) |
| Lifecycle skills | `.claude/skills/` | `/kickoff` `/adopt` `/feature` `/forge` `/fix` `/harden` `/ship` `/debug-hard` `/status` `/retro` |
| Orchestration | `.claude/workflows/` | `/understand` `/design-panel` `/feature-pipeline` `/deep-review` `/release-gate` |
| Playbooks | `docs/playbooks/` | Verified 2026-07 default stacks per product type |
| Templates | `templates/` | SPEC, FEATURE, ADR, PROGRESS, release checklist, project CLAUDE.md |
| Method docs | `docs/` | COMMANDS (guide + diagram), LIFECYCLE, ORCHESTRATION, MODEL-ROUTING |

## Design principles

1. **Two invariants under everything:** protect the attention budget (fresh context for
   verification, subagents for bulk reading, state on disk not in chat) and close every
   loop with a runnable check (tests, gates, evidence — never "looks done").
2. **Judgment up, execution down.** The session model decides, Opus builds, Sonnet
   executes plans, Haiku sweeps. Raise the session model after two failures; never
   downgrade a review gate below Opus.
3. **The spec is the contract.** `docs/SPEC.md` per product, checkable done-criteria,
   drift fixed in the same change that causes it.
4. **Adversarial by default.** Review findings survive only if independent refuters fail
   to kill them (two for critical/high, one below); builders never grade their own work.
5. **Playbooks age.** Stack defaults carry an as-of date and get re-verified at kickoff.

## Maintenance

- **The harness is a git repo — treat harness changes like code.** Every edit to
  CLAUDE.md, playbooks, skills, or workflows gets committed with a one-line why;
  that's your rollback when an agent (or you) breaks the operating manual.
- Quarterly (or when models change): re-check `docs/MODEL-ROUTING.md` pricing/IDs.
- At each kickoff: verify the playbook's major versions against the live ecosystem.
- When a session teaches you something durable about how you want to build: it goes in
  `CLAUDE.md` (tersely), and something stale comes out — commit both.
- After each milestone: `/retro` — mines the build for friction and turns it into
  committed harness improvements. This loop is what keeps "best" true over time.
