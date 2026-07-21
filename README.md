# ForgeShift

```
 ███████╗ ██████╗ ██████╗  ██████╗ ███████╗
 ██╔════╝██╔═══██╗██╔══██╗██╔════╝ ██╔════╝
 █████╗  ██║   ██║██████╔╝██║  ███╗█████╗
 ██╔══╝  ██║   ██║██╔══██╗██║   ██║██╔══╝
 ██║     ╚██████╔╝██║  ██║╚██████╔╝███████╗
 ╚═╝      ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝
 F.O.R.G.E. — Fable-Orchestrated, Review-Gated Engineering
```

**Where products get hammered into shape.** A Claude Code plugin for building any
software product — web app, SaaS, API, CLI, mobile, desktop, extension, or library — from
idea to shipped: brief the crew once (spec, wave plan, design), and a whole shift runs without you
until the ship decisions. A build lane which is focused on long-autonomous runs with quality gates which actually gates, risk-tiered validation and model routing. Install once; use in any folder.

*Built by Michael Falk, forged with Claude Fable 5 (architecture) and Opus 4.8 (build).*

---

## What this is (and isn't)

F.O.R.G.E. is **not a library you import** — it's a **Claude Code plugin you install once
and use everywhere.** Install it globally, then run `claude` inside any product folder (or use the app) and
drive whole products through a set of `/forge:*` commands: `/forge:kickoff` to
spec-and-scaffold, `/forge:build` to build a backlog hands-off, `/forge:ship` to release.
The plugin ships the parts that make that reliable:

- **12 lifecycle skills** — `/forge:kickoff`, `/forge:next`, `/forge:feature`, `/forge:build`,
  `/forge:fix`, `/forge:harden`, `/forge:ship`, and more — playbooks that run *with you* in
  the session and pause at real decision points.
- **4 orchestration workflows** — `/forge:deep-review`, `/forge:design-panel`,
  `/forge:feature-pipeline`, `/forge:release-gate` — parallel agent fleets for review, release
  gates, feature batches, and design panels that run *without you*, in breadth.
- **8 specialist agents** — planner, implementer, reviewer, debugger, tester, security,
  scout, scribe — each fresh-context and model-routed, so the builder never grades its own work.
- **An operating manual** (`CLAUDE.md`) + method docs + 8 stack playbooks that every command
  runs under.

The bet: **the bottleneck in AI-built software isn't generation, it's trust.** So the plugin
spends its structure on verification — tests-first, fresh-context review, adversarial
refutation, fail-closed release gates — and on *not making you babysit it*.

## Why an AI builder would want it

- **No babysitting.** `/forge:build` takes a whole backlog, gets one wave-plan approval from
  you, then builds feature after feature in parallel waves — a PR each, auto-merged in
  dependency order, finished with an automatic deep-review. Your touchpoints for a whole
  product drop to roughly three: approve the spec, approve the wave plan, run `/forge:ship`.
- **Gates that gate.** No feature merges with failing or missing tests. Reviews only
  trust a finding after independent refuters fail to kill it. Release gates fail *closed* —
  a gate that doesn't report blocks the ship. None of this is optional "if you remember to."
- **Risk-tiered validation.** Every feature is tagged T1/T2/T3 at spec time by what it can
  *do* (touches money? crosses a tenant boundary? makes an authz call?). Auth and payment
  code gets the full loop plus a security pass; CRUD boilerplate builds fast on Sonnet with
  a smoke test. You stop paying for exhaustive validation on scaffolding and concentrate it
  on the dangerous 20%. Overridable per feature. Details: [docs/RISK-TIERS.md](docs/RISK-TIERS.md).
- **The builder never verifies itself.** Every review runs in a fresh agent context that
  never saw the builder's reasoning, so it can't inherit the builder's blind spots.
- **Model routing by decision density, not vibes.** Judgment rides your session model
  (Opus 4.8, or Fable 5 on architecture days); building rides Opus; well-defined execution
  drops to Sonnet; mechanical sweeps to Haiku. One session-model choice raises or lowers
  the whole judgment tier. Policy: [docs/MODEL-ROUTING.md](docs/MODEL-ROUTING.md).

## Requirements

- **Claude Code**, current version (plugin support + the **Workflow tool** for dynamic
  workflows — the four orchestration commands depend on it).
- **git**, and **Node 22+ with pnpm** (`corepack enable`) for the default playbooks.
  Per-type extras (Go, Rust for Tauri, Expo/EAS, Apple Developer) are listed in each
  playbook and only needed when you build that type.
- **`gh` CLI** (authenticated) — only for `/forge:build`'s PR flow and `/forge:ship`.
  Everything else works without a remote.

## Installation

F.O.R.G.E. installs as a Claude Code plugin from the marketplace bundled in this repo —
once, globally, so its commands are available in every folder.

No clone needed — the marketplace registers straight from GitHub:

```bash
claude plugin marketplace add travelhawk/forgeshift
claude plugin install forge@forge
```

Or from inside Claude Code: `/plugin marketplace add travelhawk/forgeshift` then
`/plugin install forge@forge`.

- **Project-scoped instead of global?** Add `--scope project` to the install — the plugin is
  enabled only for the repo you run it in.
- **Working from a clone anyway?** `claude plugin marketplace add ./forgeshift` registers
  the local path instead (copies the working tree, untracked files included), or run the
  wrapper `npm run install-forge` from the clone.
- **Developing the plugin itself?** Skip install and launch with `claude --plugin-dir
  /path/to/forgeshift` to load your working copy live (`/reload-plugins` picks up edits).
- **Update / remove:** `claude plugin update forge` (pulls the latest commit from GitHub) ·
  `claude plugin uninstall forge`.

## Getting started

Once installed, **run `claude` inside your product folder** (or use the Claude app) — the `/forge:*` commands are available everywhere.

**1. Kick off your first product.**

```
> /forge:kickoff a habit tracker that guilt-trips me with charts
```

`/forge:kickoff` interviews you, writes `docs/SPEC.md`, picks a stack from a playbook, and
scaffolds a **new product in the current folder** — its own git repo, its own `CLAUDE.md`, a
runnable test setup — then verifies the scaffold actually boots. Already have a codebase? Use
`/forge:adopt <path>` instead, which reverse-engineers a spec and progress file from what's
there.

**2. Build it.**

```
> /forge:build             # hands-off: approve the wave plan once → all features build in
>                          #   parallel waves, a PR each, then an automatic deep-review
> /forge:feature F3        # or one feature at a time: plan → failing test → build → review
> /forge:fix <bug>         # bug lane: reproduce → regression test → fix → review
> /forge:harden            # security + robustness sweep before first public exposure
> /forge:ship v0.1.0       # release commit → automated gates + checklist → tag → deploy
```

**3. Ship the next version.** Once v1 is out and you have new ideas:

```
> /forge:next add teams, usage-based billing, and a dark mode
```

`/forge:next` is kickoff's iteration sibling — it clarifies the ideas (a lighter, spec-aware
interview), appends them to the spec as the next version's risk-tiered features, and hands
the whole slice to the forge flow under **one approval**. `/forge:kickoff` births a product,
`/forge:next` grows it, `/forge:build` is the builder both hand off to.

That's the loop. New to it? Read [docs/LIFECYCLE.md](docs/LIFECYCLE.md) for the full
idea-to-ship path, and [docs/COMMANDS.md](docs/COMMANDS.md) for what each command costs
and when it pauses for you.

> **The one rule:** run `claude` **inside your product** and let the plugin
> do the rest — its commands, agents, and workflows are available in every folder.

## What's inside

| Layer | Where | What |
|---|---|---|
| Plugin manifest | `.claude-plugin/` | `plugin.json` + `marketplace.json` — what makes it installable and namespaces the `/forge:*` commands |
| Asset anchor | `bin/forge-home` | Resolves the plugin's install dir so skills read bundled templates/docs/workflows from any product folder |
| Operating manual | `CLAUDE.md` | The rules every command runs under |
| Specialists | `.claude/agents/forge-*.md` | blueprint/quench/temper — planner/reviewer/debugger (session model); hammer/proof/warden — implementer/tester/security (Opus); prospector/etcher — scout/scribe (Sonnet) |
| Lifecycle skills | `.claude/skills/` | `/forge:kickoff` `/forge:adopt` `/forge:next` `/forge:feature` `/forge:build` `/forge:fix` `/forge:harden` `/forge:ship` `/forge:debug-hard` `/forge:status` `/forge:retro` `/forge:understand` |
| Orchestration | `.claude/workflows/` | `/forge:design-panel` `/forge:feature-pipeline` `/forge:deep-review` `/forge:release-gate` |
| Playbooks | `docs/playbooks/` | Verified 2026-07 default stacks per product type |
| Templates | `templates/` | SPEC, FEATURE, ADR, PROGRESS, release checklist, project CLAUDE.md |
| Method docs | `docs/` | COMMANDS (guide + diagram), LIFECYCLE, ORCHESTRATION, MODEL-ROUTING |

## Make it yours

The harness is meant to be forked and shaped to how *you* build:

- **`CLAUDE.md`** is the operating manual — the highest-leverage file. Loosen or tighten
  the hard rules, change the model-routing defaults, add your own conventions.
- **`.claude/agents/forge-*.md`** — each specialist's system prompt, tool allowlist, and
  model pin. Rename, re-scope, or add your own.
- **`docs/playbooks/`** — the default stack per product type. Swap in your framework of
  choice; they carry an as-of date and are meant to be re-verified.
- **`.claude/settings.json`** — the permission allowlist. Scoped by design (force-push is
  hard-denied, deploys sit on the ask-list); adjust to your risk tolerance.

Nothing here is load-bearing infrastructure you can't touch — it's a starting point with
strong opinions. Disagree with an opinion? Edit the file and commit the reason.

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

- **The coding workflow is a git repo — treat changes like code.** Every edit to
  CLAUDE.md, playbooks, skills, or workflows gets committed with a one-line why;
  that's your rollback when an agent (or you) breaks the operating manual.
- Quarterly (or when models change): re-check `docs/MODEL-ROUTING.md` pricing/IDs.
- At each kickoff: verify the playbook's major versions against the live ecosystem.
- When a session teaches you something durable about how you want to build: it goes in
  `CLAUDE.md` (tersely), and something stale comes out — commit both.
- After each milestone: `/forge:retro` — mines the build for friction and turns it into
  committed harness improvements. This loop is what keeps "best" true over time.

## Credits & license

Built by **Michael Falk**, forged with Claude Fable 5 (architecture) and Opus 4.8 (build).
Shared for other AI builders to fork, adapt, and argue with.
