# Command Guide — how skills, workflows, and agents interlock

`CLAUDE.md` lists what each command does. This is what each one *costs*, where it runs, and
when it will stop to ask you.

![Command architecture: you type a command; skills run as playbooks in the main session and delegate to forge agents or fire workflows; workflows run as JS scripts outside the chat and spawn agent fleets](diagrams/command-architecture.svg)

## The three building blocks

| | Where it runs | Keeps your context? | Cost |
|---|---|---|---|
| **Skill** `.claude/skills/<name>/SKILL.md` | Injected into your running session; the main-session Claude follows the playbook, pausing at defined gates | Yes — choreography, not a program | ~a normal session |
| **Agent** `.claude/agents/forge-*.md` | Delegated to by skills; own system prompt, tool allowlist, pinned model | No — **empty context**, sees only its brief | 1 turn each |
| **Workflow** `.claude/workflows/<name>.js` | JavaScript the runtime executes *outside* the chat | No | 5–30x |

Agents' empty context is the point: `forge-quench` judges a diff without seeing the builder's
reasoning, so it cannot inherit the builder's blind spots. Blueprint, quench, temper and warden
additionally carry persistent memory (`.claude/agent-memory/`) and sharpen across projects.
Workflow code decides deterministically which agents start when, on which model, at which
effort, with which output schema, and what happens to the results (dedup, refuter voting,
fail-closed verdicts) — orchestration as code, therefore reproducible.

**Skills orchestrate *with you* in context; workflows orchestrate *without you* in breadth** —
and skills are the bridge that fires workflows at the right moment.

## Three worked examples

**`/forge:feature F2` — a skill conducting agents.** Sizes the work: small → the session builds
it; medium+ → plan and done-criteria to `forge-hammer` (Opus, tests-first, on a branch), diff to
`forge-quench` (session model, fresh context). Only after confirmed findings are fixed does it
open a PR with evidence in the body and tick PROGRESS.md. The feature never lands straight on
main; the PR is the review record.

**`/forge:ship v0.1.0` — a skill firing a workflow.** Release commit (CHANGELOG, version bump),
then `release-gate`: six gate agents (three inspecting in parallel, then tests → build → runtime
smoke sequentially), aggregated fail-closed — a gate that doesn't report blocks. The SHIP/NO-SHIP
verdict returns for the manual checklist before tag and deploy.

**`/forge:build` — one gate, then the whole backlog.** `forge-blueprint` partitions unchecked
features into waves by predicted file footprint (overlapping or dependent features never run in
parallel); you approve wave plan + integration mode + cost **once**; then wave after wave runs,
each verified feature getting an evidence-bearing PR and, in auto-integrate mode, a squash-merge
so the next wave builds on it. Failures are collected, never discussed mid-run. The finish is an
automatic `deep-review` of the integrated result: confirmed critical/high fixed on the spot in
`/forge:fix` discipline, medium/low into the report. Per-feature depth follows the **risk tier**
([RISK-TIERS.md](RISK-TIERS.md)) — that is what keeps this affordable on a boilerplate-heavy
backlog while concentrating scrutiny on auth/payment/tenant code.

## When to use what

Two intakes and one builder: `/forge:kickoff` (new product) and `/forge:next` (next version)
both interview you, shape tiered features, and hand off to `/forge:build`; `/forge:feature` is
the one-at-a-time lane. So: **one feature → `/forge:feature`; a new batch of ideas →
`/forge:next`; an already-spec'd backlog → `/forge:build`.** You rarely type
`/forge:feature-pipeline` by hand — it's the engine the others drive.

| Situation | Command | Kind |
|---|---|---|
| New product idea | `/forge:kickoff <idea>` | Skill (interviews you) |
| Existing repo to bring in | `/forge:adopt <path>` | Skill |
| Next version of an existing product | `/forge:next <ideas>` | Skill (interviews you) → forge flow |
| Build one feature | `/forge:feature F3` | Skill → agents |
| Whole backlog already spec'd, hands-off | `/forge:build` | Skill → waves of feature-pipeline + PRs |
| Raw batch, no PR ceremony | `/forge:feature-pipeline` | Workflow (parallel worktrees) |
| A bug | `/forge:fix <symptom>` | Skill |
| Bug survived 2 attempts | `/forge:debug-hard` | Skill → hard-bug debugger (session model) |
| Before shipping manual work (`/forge:build` fires it automatically) | `/forge:deep-review` | Workflow (review + refuters) |
| Before first public deploy | `/forge:harden` | Skill → security agent |
| Release | `/forge:ship v0.2.0` | Skill → release-gate workflow |
| Understand a big/foreign codebase | `/forge:understand [question]` | Skill (fans out readers) |
| Hard architecture decision | `/forge:design-panel <brief>` | Workflow (lean: 3 designers + 1 judge-synthesizer; `panel: "wide"` → 4+3) |
| Session end / re-entry | `/forge:status` | Skill |
| A `/forge:build`/`/forge:next` run died mid-way | `/forge:resume` | Skill (reads `.forge/run.json`, reconciles with git) |
| After a milestone | `/forge:retro` | Skill (improves the harness itself) |

## Three rules of thumb

1. **Triggering.** `/forge:kickoff`, `/forge:adopt`, `/forge:next`, `/forge:build`,
   `/forge:ship`, `/forge:retro` are user-only (`disable-model-invocation`) — their consequences
   belong to you. `/forge:feature`, `/forge:fix`, `/forge:harden`, `/forge:status`,
   `/forge:debug-hard` may also be invoked by Claude when the situation matches.
2. **Cost.** Workflows cost 5–30x a skill because they launch agent fleets — which is why they
   sit at gates (review, release) and at genuine breadth (feature batches), never at 20-line
   changes. Ladder in [ORCHESTRATION.md](ORCHESTRATION.md); unsure → one rung lower.
3. **You stay product owner.** Every playbook pauses where taste or scope is decided (spec
   approval, stack approval, finding triage, manual ship checklist). Building, testing,
   verifying, collecting evidence runs without you.

**Run `claude` inside your product** — the plugin is global, so its skills, agents, and
workflows are available in every folder. Workflows still need the product passed as their `dir`
arg; they do not follow the shell `cd`.
