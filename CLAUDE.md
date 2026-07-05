# F.O.R.G.E. — Fable-Orchestrated, Review-Gated Engineering

This repo is a **control center for building products**, not a product itself. Products
live in `projects/<name>/` (each its own git repo, gitignored here). Everything in this
file governs how work happens anywhere under this root.

## The loop

Idea → `/kickoff` → spec + scaffold → `/feature` loop (or `feature-pipeline` workflow
for batches) → `/deep-review` gate → `/harden` before exposure → `/ship`. Details on
demand: `docs/LIFECYCLE.md`

## Command map

Full guide with mechanics and worked examples on demand: `docs/COMMANDS.md`

| Command | What it does |
|---|---|
| `/kickoff <idea>` | Interview → SPEC.md → stack from playbook → verified scaffold |
| `/adopt <path>` | Existing codebase → as-built spec + PROGRESS + project CLAUDE.md |
| `/feature <F# or description>` | One feature: plan → failing test → build → fresh-context verify |
| `/fix <bug>` | Bug lane: reproduce → regression test → fix → review |
| `/harden [scope]` | Security audit + robustness sweep + gated fixes |
| `/ship [version]` | Release commit → release-gate workflow → checklist → tag → deploy |
| `/debug-hard <symptom>` | Structured escalation to the Fable debugger |
| `/status` | Ground-truth state report + session handoff into PROGRESS.md |
| `/retro` | Harness retrospective: observed friction → approved fixes → commits |
| `/understand [question]` | Workflow: parallel codebase mapping → architecture brief |
| `/design-panel <brief>` | Workflow: 4 designs, 3 judges, synthesized winner |
| `/feature-pipeline <features>` | Workflow: parallel build of independent features in worktrees |
| `/deep-review [scope]` | Workflow: 6-dimension review, findings adversarially verified |
| `/release-gate [context]` | Workflow: 6 parallel ship gates with evidence |

## Model routing (short form — full policy on demand: `docs/MODEL-ROUTING.md`)

Fable 5 = architecture, specs, hard bugs, review verdicts. Opus 4.8 = all real building
(default). Sonnet 5 = docs, research, executing written plans. Haiku 4.5 = mechanical
sweeps. Route by decision density, not task size. Escalate to Fable after two failed
Opus attempts; never downgrade a review gate.

## Delegation

Specialists live in `.claude/agents/`, forge-themed names with the role in parentheses:
`forge-blueprint` (planner), `forge-hammer` (implementer), `forge-quench` (reviewer),
`forge-temper` (debugger), `forge-proof` (tester), `forge-warden` (security),
`forge-prospector` (scout), `forge-etcher` (docs). Rules — full guide on demand:
`docs/ORCHESTRATION.md`

- Default to the lowest orchestration level that works; escalate on demonstrated failure.
- Subagent prompts are self-contained: paths, context, done-definition included.
- The agent that built something never verifies it — fresh context reviews.
- Demand evidence (test output, command results), never accept "looks done".

## Hard rules (apply to every session under this root)

1. **Tests are load-bearing.** Never delete, weaken, or skip a test to get green. A newly
   failing test is a finding to report, not an obstacle to remove.
2. **Evidence before claims.** Progress reports cite tool results from this session.
   Unverified work is reported as unverified.
3. **Two strikes → change approach.** Third identical attempt at a failed fix/design is
   banned — escalate (`/debug-hard`, `design-panel`, or ask).
4. **Spec sync.** Legitimate deviation from `docs/SPEC.md` updates the spec in the same
   change. PROGRESS.md checkboxes only turn `[x]` with pasted evidence.
5. **Secrets never in code or commits.** `.env` + committed `.env.example` everywhere.
6. **Simplest thing that works well.** No speculative abstraction, no unrequested
   refactors, validation only at system boundaries.

## Working in a product (`projects/<name>/`)

**Always launch sessions from the harness root** — skills, forge-agents, workflows, and
permission rules load from here and are NOT visible when Claude Code starts inside
`projects/<name>/`. In the session, make the product the working target (`cd` in the
shell); its own `CLAUDE.md` loads automatically once you read its files.

Each product has: `CLAUDE.md` (commands/conventions — trust it over guesses),
`docs/SPEC.md` (intent), `PROGRESS.md` (state + session log), `docs/adr/` (decisions).
Read `PROGRESS.md` "Next session should" before doing anything else; run the smoke test
before starting new work. When a skill's target product is ambiguous, ask instead of
guessing.

## Coexistence with the global setup

The user's global `~/.claude` has its own agent team (architect, builder, tester, ...)
and hooks — that's a separate framework. In this workspace prefer the `forge-*` agents;
never define project agents/hooks that shadow or double the global ones.

## Playbooks

Stack defaults per product type (versions as of 2026-07): `docs/playbooks/` — web-app,
static-site, api-service, cli-tool, mobile-app, desktop-app, browser-extension, library.
Verify major versions against the live ecosystem at kickoff; playbooks age.
