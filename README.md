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

**Where products get hammered into shape.** A Claude Code control center for building
any software product — web app, SaaS, API, CLI, mobile, desktop, extension, or library —
from idea to shipped, with quality gates that actually gate.

*Built by Michael Falk, forged with Claude Fable 5 (architecture) and Opus 4.8 (build).*

---

## What this is (and isn't)

F.O.R.G.E. is **not a library you install** — it's a **workspace you clone and work
inside of.** You start Claude Code from its root and drive whole products through a set
of `/commands`: `/kickoff` to spec-and-scaffold, `/forge` to build a backlog hands-off,
`/ship` to release. The workspace ships the parts that make that reliable:

- **11 lifecycle skills** — `/kickoff`, `/next`, `/feature`, `/forge`, `/fix`, `/harden`,
  `/ship`, and more — playbooks that run *with you* in the session and pause at real
  decision points.
- **5 orchestration workflows** — parallel agent fleets for review, release gates, feature
  batches, codebase mapping, and design panels — that run *without you*, in breadth.
- **8 specialist agents** — planner, implementer, reviewer, debugger, tester, security,
  scout, scribe — each fresh-context and model-routed, so the builder never grades its own work.
- **An operating manual** (`CLAUDE.md`) + method docs + 8 stack playbooks that every
  session runs under.

The bet: **the bottleneck in AI-built software isn't generation, it's trust.** So the
harness spends its structure on verification — tests-first, fresh-context review,
adversarial refutation, fail-closed release gates — and on *not making you babysit it*.

## Why an AI builder would want it

- **No babysitting.** `/forge` takes a whole backlog, gets one wave-plan approval from
  you, then builds feature after feature in parallel waves — a PR each, auto-merged in
  dependency order, finished with an automatic deep-review. Your touchpoints for a whole
  product drop to roughly three: approve the spec, approve the wave plan, run `/ship`.
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

- **Claude Code**, current version, with the **Workflow tool** (dynamic workflows) — the
  five `/workflow` commands depend on it; skills and agents work on any recent version.
- **git**, and **Node 22+ with pnpm** (`corepack enable`) for the default playbooks.
  Per-type extras (Go, Rust for Tauri, Expo/EAS, Apple Developer) are listed in each
  playbook and only needed when you build that type.
- **`gh` CLI** (authenticated) — only for `/forge`'s PR flow and `/ship`. Everything else
  works without a remote.

## Getting started

**1. Clone the workspace and enter it.**

```bash
git clone https://github.com/travelhawk/forge-harness.git
cd forge-harness
```

**2. Start Claude Code from the harness root.** This is non-negotiable: skills, agents,
and workflows load *only* from the root. Starting Claude Code inside a product folder
won't see them.

```bash
claude          # run on Opus 4.8; switch to Fable 5 for architecture-heavy days
```

**3. Kick off your first product.**

```
> /kickoff a habit tracker that guilt-trips me with charts
```

`/kickoff` interviews you, writes `docs/SPEC.md`, picks a stack from a playbook, and
scaffolds a **new product under `projects/<name>/`** — its own git repo, its own
`CLAUDE.md`, a runnable test setup — then verifies the scaffold actually boots.
Already have a codebase? Use `/adopt <path>` instead, which reverse-engineers a spec and
progress file from what's there.

**4. Build it.** In a fresh session (again from the harness root):

```
> /forge             # hands-off: approve the wave plan once → all features build in
>                    #   parallel waves, a PR each, then an automatic deep-review
> /feature F3        # or one feature at a time: plan → failing test → build → review
> /fix <bug>         # bug lane: reproduce → regression test → fix → review
> /harden            # security + robustness sweep before first public exposure
> /ship v0.1.0       # release commit → automated gates + checklist → tag → deploy
```

**5. Ship the next version.** Once v1 is out and you have new ideas:

```
> /next add teams, usage-based billing, and a dark mode
```

`/next` is kickoff's iteration sibling — it clarifies the ideas (a lighter, spec-aware
interview), appends them to the spec as the next version's risk-tiered features, and hands
the whole slice to the forge flow under **one approval**. `/kickoff` births a product,
`/next` grows it, `/forge` is the builder both hand off to.

That's the loop. New to it? Read [docs/LIFECYCLE.md](docs/LIFECYCLE.md) for the full
idea-to-ship path, and [docs/COMMANDS.md](docs/COMMANDS.md) for what each command costs
and when it pauses for you.

> **The one rule that pays rent:** always start sessions from the **harness root**, then
> make the product your working target *inside* the session (`cd` in the shell). The
> harness lives at the root; the product lives under `projects/<name>/`.

## What's inside

| Layer | Where | What |
|---|---|---|
| Operating manual | `CLAUDE.md` | The rules every session runs under |
| Specialists | `.claude/agents/forge-*.md` | blueprint/quench/temper — planner/reviewer/debugger (session model); hammer/proof/warden — implementer/tester/security (Opus); prospector/etcher — scout/scribe (Sonnet) |
| Lifecycle skills | `.claude/skills/` | `/kickoff` `/adopt` `/next` `/feature` `/forge` `/fix` `/harden` `/ship` `/debug-hard` `/status` `/retro` `/understand` |
| Orchestration | `.claude/workflows/` | `/design-panel` `/feature-pipeline` `/deep-review` `/release-gate` |
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

- **The harness is a git repo — treat harness changes like code.** Every edit to
  CLAUDE.md, playbooks, skills, or workflows gets committed with a one-line why;
  that's your rollback when an agent (or you) breaks the operating manual.
- Quarterly (or when models change): re-check `docs/MODEL-ROUTING.md` pricing/IDs.
- At each kickoff: verify the playbook's major versions against the live ecosystem.
- When a session teaches you something durable about how you want to build: it goes in
  `CLAUDE.md` (tersely), and something stale comes out — commit both.
- After each milestone: `/retro` — mines the build for friction and turns it into
  committed harness improvements. This loop is what keeps "best" true over time.

## Credits & license

Built by **Michael Falk**, forged with Claude Fable 5 (architecture) and Opus 4.8 (build).
Shared for other AI builders to fork, adapt, and argue with.

No license file ships yet — add one that matches how you intend to share it (MIT for
"do what you like," or keep it all-rights-reserved for a private share).
