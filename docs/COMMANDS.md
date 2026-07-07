# Command Guide — how skills, workflows, and agents interlock

The harness exposes everything as `/commands`, but three mechanically different
building blocks sit behind them. Knowing which is which tells you what a command
costs, where it runs, and when you'll be asked for input.

![Command architecture: you type a command; skills run as playbooks in the main session and delegate to forge agents or fire workflows; workflows run as JS scripts outside the chat and spawn agent fleets](diagrams/command-architecture.svg)

## The three building blocks

**Skills** (`.claude/skills/<name>/SKILL.md`) are markdown playbooks. Typing
`/kickoff a recipe app` injects the SKILL.md into your running session
(`$ARGUMENTS` replaced by your text); the main-session Claude then follows the
script — interviews you, runs commands, delegates, and pauses at defined gates for
your approval. A skill keeps your full conversation context; it is choreography,
not a program.

**Agents** (`.claude/agents/forge-*.md`) are not commands — they are the
specialists skills delegate to. Each has its own system prompt, tool allowlist, and
pinned model, and starts with a **fresh, empty context**: it sees only the brief it
is handed. That is deliberate — `forge-quench` judges a diff without seeing the
builder's reasoning, so it can't be pulled into the builder's blind spots.
Blueprint, quench, temper, and warden (planner, reviewer, debugger, security) carry
persistent memory (`.claude/agent-memory/`) and get sharper across projects.

**Workflows** (`.claude/workflows/<name>.js`) are JavaScript scripts the runtime
executes *outside* the chat. The code decides deterministically which agents start
when (parallel / pipelined), on which model, at which effort, with which output
schema — and what happens to the results (dedup, refuter voting, fail-closed
verdicts). Orchestration is code, therefore reproducible.

## Three worked examples

**`/feature F2` — a skill conducting agents.** The playbook anchors the goal (read
the spec, run the suite), sizes the work, then: small → the session builds it
itself; medium+ → plan and done-criteria go to `forge-hammer` (Opus,
tests-first on a branch), the resulting diff goes to `forge-quench` (session model, fresh
context). Only after confirmed findings are fixed does it open a PR for the branch
(evidence in the body) and tick PROGRESS.md — with pasted evidence. The feature never
lands straight on main; the PR is the review record you merge.

**`/ship v0.1.0` — a skill firing a workflow.** The playbook first writes the
release commit (CHANGELOG, version bump), then invokes the `release-gate` workflow:
six gate agents (three inspecting in parallel, then tests → build → runtime smoke
sequentially), aggregated fail-closed — a gate that doesn't report blocks. The
SHIP/NO-SHIP verdict returns to your session, where the playbook walks the manual
checklist with you before tag and deploy.

**`/forge` — one gate, then the whole backlog.** The skill has `forge-blueprint`
partition the unchecked feature list into waves by predicted file footprint
(overlapping or dependent features never run in parallel), presents wave plan +
integration mode + cost once — and after your single approval runs wave after wave
of the `feature-pipeline` workflow. Every verified feature is pushed, gets its own
evidence-bearing PR, and (in auto-integrate mode) is squash-merged so the next wave
builds on it. Failures are collected and reported at the end, never discussed
mid-run. The run finishes with an automatic `deep-review` of the integrated result
(auto-integrate and local modes; skipped in review-PRs mode and on opt-out):
confirmed critical/high findings are fixed on the spot in `/fix` discipline,
medium/low land in the final report — which closes with ready-for-`/ship` or the
reasons it is not.

One line: **skills orchestrate *with you* in context; workflows orchestrate
*without you* in breadth** — and skills are the bridge that fires workflows at the
right moment.

## Risk tiers cut the cost of breadth

Every feature is tagged **T1/T2/T3** at spec time (by capability signal, not by label),
and `/feature`, `/forge`, and `feature-pipeline` branch validation depth on the tag: T1
gets the full loop plus a security pass, T2 build + one verify, T3 a fast Sonnet build
with a smoke test only. That's what keeps `/forge` affordable on a backlog full of
boilerplate while concentrating scrutiny on auth/payment/tenant code. Tags are seeded
automatically and overridable — edit the marker in PROGRESS.md, adjust at the `/forge`
gate, or pass `/feature F3 as tier 1`. Full scheme: `docs/RISK-TIERS.md`.

## When to use what

| Situation | Command | Kind |
|---|---|---|
| New product idea | `/kickoff <idea>` | Skill (interviews you) |
| Existing repo to bring in | `/adopt <path>` | Skill |
| Build one feature | `/feature F3` | Skill → agents |
| Whole backlog, hands-off | `/forge` | Skill → waves of feature-pipeline + PRs |
| Raw batch, no PR ceremony | `/feature-pipeline` | Workflow (parallel worktrees) |
| A bug | `/fix <symptom>` | Skill |
| Bug survived 2 attempts | `/debug-hard` | Skill → hard-bug debugger (session model) |
| Before shipping manual work (`/forge` fires it automatically) | `/deep-review` | Workflow (review + refuters) |
| Before first public deploy | `/harden` | Skill → security agent |
| Release | `/ship v0.2.0` | Skill → release-gate workflow |
| Understand a big/foreign codebase | `/understand [question]` | Workflow |
| Hard architecture decision | `/design-panel <brief>` | Workflow (4 designers, 3 judges) |
| Session end / re-entry | `/status` | Skill |
| After a milestone | `/retro` | Skill (improves the harness itself) |

## Three rules of thumb

1. **Triggering.** `/kickoff`, `/adopt`, `/forge`, `/ship`, `/retro` are user-only
   (`disable-model-invocation`) — their consequences belong to you. `/feature`,
   `/fix`, `/harden`, `/status`, `/debug-hard` may also be invoked by Claude when
   the situation matches.
2. **Cost.** Skills cost roughly a normal session. Workflows cost 5–30x because
   they launch agent fleets — that's why they sit at the gates (review, release)
   and at genuine breadth (feature batches, codebase mapping), never at 20-line
   changes. The ladder in `ORCHESTRATION.md`: solo → one agent → parallel →
   workflow; when unsure, one rung lower.
3. **You stay product owner.** Every playbook pauses where taste or scope is
   decided (spec approval, stack approval, finding triage, manual ship checklist).
   Everything else — building, testing, verifying, collecting evidence — runs
   without you.

Reminder that pays rent: **always start sessions from the harness root** — skills,
agents, and workflows only load from there. The product under `projects/<name>/`
is the working target *inside* the session.
