# F.O.R.G.E. — Fable-Orchestrated, Review-Gated Engineering

F.O.R.G.E. is a **Claude Code plugin** for building software products from idea to shipped,
with quality gates that gate. This repo is the plugin's source; installed once (globally),
its `/forge:*` commands drive products that live in **any folder** — you run `claude` inside
your product, not inside this repo. This file is the operating manual those commands run
under; it ships with the plugin, and when you develop the plugin itself it also auto-loads
as this repo's own `CLAUDE.md`.

**Harness assets** (templates, playbooks, references, workflow scripts) ship with the
plugin, not the product. A skill running from some other product resolves their home with
`FORGE_HOME="${CLAUDE_PLUGIN_ROOT:-$(forge-home)}"` and reads `$FORGE_HOME/<path>`; product
files (`docs/SPEC.md`, `PROGRESS.md`, the product's own `CLAUDE.md`) always stay relative to
the product. `forge-home` is on the Bash `PATH` whenever the plugin is enabled.

## The loop

Idea → `/forge:kickoff` → spec + scaffold → `/forge:feature` loop + `/forge:deep-review` gate — or
`/forge:build` for the whole backlog hands-off (one wave-plan approval → parallel waves →
PR per feature → automatic deep-review finish) → `/forge:harden` before exposure → `/forge:ship`.
For the **next version** of a product that already exists, `/forge:next` is kickoff's iteration
sibling: it clarifies new ideas into tiered features and hands them to the forge flow in
one command. Details on demand: `docs/LIFECYCLE.md`

Every feature is tagged with a **risk tier** (T1/T2/T3) at spec time; build+validate
depth branches on it — T1 full loop + security pass, T2 build + one verify, T3 fast
Sonnet build + smoke test. Seeded automatically, overridable, ties break up. The tier
contract is the quality gate and holds in **every** lane — `feature-pipeline` is the
scripted fan-out for waves of 3+, the small-wave lane runs the same gates via parallel
subagents. Full scheme: `docs/RISK-TIERS.md`.

## Command map

Full guide with mechanics and worked examples on demand: `docs/COMMANDS.md`

| Command | What it does |
|---|---|
| `/forge:kickoff <idea>` | New product: interview → SPEC.md → stack from playbook → verified scaffold |
| `/forge:adopt <path>` | Existing codebase → as-built spec + PROGRESS + project CLAUDE.md |
| `/forge:next <ideas>` | Next version of an existing product: clarify ideas → tiered features → forge builds them |
| `/forge:feature <F# or description>` | One feature: plan → failing test → build → fresh-context verify |
| `/forge:build [scope]` | Whole backlog: one approval → parallel waves → PR each → merge → review finish |
| `/forge:fix <bug>` | Bug lane: reproduce → regression test → fix → review |
| `/forge:harden [scope]` | Security audit + robustness sweep + gated fixes |
| `/forge:ship [version]` | Release commit → release-gate workflow → checklist → tag → deploy |
| `/forge:debug-hard <symptom>` | Structured escalation to the hard-bug debugger (session model) |
| `/forge:status` | Ground-truth state report + session handoff into PROGRESS.md |
| `/forge:resume` | Resume a stalled `/forge:build`/`/forge:next` run: read `.forge/run.json`, reconcile with git, state the next action |
| `/forge:retro` | Harness retrospective: observed friction → approved fixes → commits |
| `/forge:understand [question]` | Skill: parallel codebase mapping → architecture brief |
| `/forge:design-panel <brief>` | Workflow: 3 designs, 1 judge-synthesizer (wide opt-in: 4+3) |
| `/forge:feature-pipeline <features>` | Workflow: parallel build of independent features in worktrees |
| `/forge:deep-review [scope]` | Workflow: 3-lens review, findings adversarially verified |
| `/forge:release-gate [context]` | Workflow: 6 ship gates in 3 agents, fail-closed verdict |

## Model routing (short form — full policy on demand: `docs/MODEL-ROUTING.md`)

Judgment (architecture, specs, hard bugs, review verdicts) rides the **session model** —
agents run `model: inherit`, so the tier is whatever you run the session on: Fable 5 for
architecture days (quota permitting), else Opus 4.8. This keeps gates working when Fable
is capped. Opus 4.8 = all real building. Sonnet 5 = docs, research, executing written
plans, codebase maps, command-running gates. Haiku 4.5 = mechanical sweeps/preflight.
Route by decision density, not task size. When work loops, raise the session model (to
Fable) and re-run rather than burning a third same-tier attempt; never downgrade a review
gate below Opus.

## Delegation

Specialists live in `.claude/agents/`, forge-themed names with the role in parentheses:
`forge-blueprint` (planner), `forge-hammer` (implementer), `forge-quench` (reviewer),
`forge-temper` (debugger), `forge-proof` (tester), `forge-warden` (security),
`forge-prospector` (scout), `forge-etcher` (docs). Rules — full guide on demand:
`docs/ORCHESTRATION.md`

- Default to the lowest orchestration level that works; escalate on demonstrated failure.
- Subagent prompts are self-contained: paths, context, done-definition included.
- **Scope-box every subagent**: it gets the slice it needs (diff, brief, named files +
  their callers/tests) and an explicit do-NOT-read line — never "read the spec/memory/
  docs" wholesale. Mappers (`understand`) are the deliberate exception.
- The agent that built something never verifies it — fresh context reviews.
- Demand evidence (test output, command results), never accept "looks done".

## Hard rules (apply to every `/forge:*` command, in whatever repo it runs)

1. **Tests are load-bearing — and budgeted.** Never delete, weaken, or skip a test to get
   green; a newly failing test is a finding to report, not an obstacle to remove. But
   volume is a cost bug like verbosity: cover behavior at the public surface — happy path,
   realistic failures, risky boundaries, a regression test per real bug — never a unit
   test per function or combinatorial padding.
2. **Evidence before claims.** Progress reports cite tool results from this session.
   Unverified work is reported as unverified.
3. **Two strikes → change approach.** Third identical attempt at a failed fix/design is
   banned — escalate (`/forge:debug-hard`, `design-panel`, or ask).
4. **Spec sync.** Legitimate deviation from `docs/SPEC.md` updates the spec in the same
   change. PROGRESS.md checkboxes only turn `[x]` with pasted evidence.
5. **Secrets never in code or commits.** `.env` + committed `.env.example` everywhere.
6. **Simplest thing that works well.** No speculative abstraction, no unrequested
   refactors, validation only at system boundaries.
7. **Slim output.** Verbosity is a cost bug. Reports = tables/bullets + evidence, never
   prose restating inputs; session-log lines ≤ 2; subagent returns carry data, not
   narration; generated docs say each thing once. Context (evidence, paths, criteria)
   is never cut — only words about words.
8. **Harness changes run the regression suite.** `npm test` in the plugin repo green before
   any commit that touches skills/agents/workflows/docs; new invariants get a test. PRs
   additionally face the CI eval gate (`npm run eval:gate`): quality metrics may not drop
   vs the merge-base, cost may not jump past budget — `docs/EVALS.md`.
9. **Deterministic work is a script, never an agent turn.** Git plumbing, worktree
   lifecycle, PR assembly, running the suite, version bumps — anything with a single
   correct answer — lives in `$FORGE_HOME/scripts/` (or a command a skill runs directly),
   never a probabilistic agent told to run raw commands. It is cheaper *and* it deletes a
   failure class. Reviewers are read-only: they run tests and git-reads, never mutate
   tracked files.

## Working in a product (any folder)

Because forge is installed as a plugin, its skills, agents, and `/forge:*` commands are
available in **every** session, whatever directory you launched `claude` in. Start the
session **in your product** and make it the working target — the product's own `CLAUDE.md`
auto-loads once you read its files. Products are their own git repos; `/forge:adopt <path>`
brings any existing repo under the lifecycle. There is no `projects/` container and no
"start from the harness root" rule any more — that was the pre-plugin workspace model.

**Workflows do NOT follow your shell `cd`** — their agents run in the session's start
directory. Always pass the product explicitly: `args: {dir: "<absolute product path>",
...}`. Every workflow preflight-verifies the target and refuses a directory that doesn't
look like the product (e.g. the forge plugin repo itself). If args arrive mangled (known
runtime bug), `feature-pipeline` and `design-panel` fall back to
`feature-pipeline.input.json` / `design-panel.input.md` in the product root — write the file
before invoking, delete it after.

**Invoke workflows by `scriptPath`, not `name`.** Build the path from the plugin home:
`FORGE_HOME="${CLAUDE_PLUGIN_ROOT:-$(forge-home)}"`, then `Workflow({scriptPath:
"$FORGE_HOME/.claude/workflows/<wf>.js", args: {dir, ...}})`. Name-based invocation is
unreliable — a `Workflow({name: ...})` call can fail the permission check on "script
contains control characters" when the resolved script has CRLF endings, and the approval
dialog can corrupt the args; scriptPath bypasses that resolution. `.gitattributes` pins the
workflow files to `eol=lf`. The input-file fallback still applies for mangled args.

Each product has: `CLAUDE.md` (commands/conventions — trust it over guesses),
`docs/SPEC.md` (intent), `PROGRESS.md` (state + session log), `docs/adr/` (decisions).
Read `PROGRESS.md` "Next session should" before doing anything else; run the smoke test
before starting new work. When a skill's target product is ambiguous, ask instead of
guessing.

**Run state.** `/forge:build` and `/forge:next` write `.forge/run.json` in the product at
each wave/feature boundary (baseline SHA, integration mode, per-feature status/branch/PR/
evidence, next action). `/forge:resume` reads it to recover a run that died mid-way. It is
gitignored in the product and is an *accelerator over git*, never a source of truth — git
branches + `PROGRESS.md` stay authoritative, so a missing or stale file only costs a
reconcile, never a break.

## Coexistence with the global setup

The user's global `~/.claude` has its own agent team (architect, builder, tester, ...)
and hooks — a separate framework. Forge is namespaced: its commands are `/forge:*` and its
agents `forge-*`, so the plugin coexists with that setup without shadowing it. Prefer the
`forge-*` agents inside forge commands; never add project agents/hooks that double the
global ones.

## Playbooks

Stack defaults per product type (versions as of 2026-07): `docs/playbooks/` — web-app,
static-site, api-service, cli-tool, mobile-app, desktop-app, browser-extension, library.
Verify major versions against the live ecosystem at kickoff; playbooks age.

## References (private, opt-in)

`references/` (in the plugin repo, **gitignored** — content stays local for now) holds your
own reusable, product-type reference playbooks: checklists and conventions too specific or
private for the shared `docs/playbooks/` (e.g. a landing-page must-have list — Impressum,
Datenschutzerklärung, i18n, your layout). Playbooks are shared generic stack defaults;
references are your private domain knowledge. Consumed **selectively, at intake only**
(`/forge:kickoff`, `/forge:next`, `/forge:adopt`): the skill reads `$FORGE_HOME/references/INDEX.md`
(one line per reference), pulls in the *single* matching file, and folds it into the spec.
It is never
loaded into every agent — build/verify agents get the relevant bits from the spec and the
per-feature brief, not from `references/`. Absent or no match → skipped silently. The
mechanism is tracked here; the reference files are not.
