# F.O.R.G.E. — Fable-Orchestrated, Review-Gated Engineering

This repo is a **control center for building products**, not a product itself. Products
live in `projects/<name>/` (each its own git repo, gitignored here). Everything in this
file governs how work happens anywhere under this root.

## The loop

Idea → `/kickoff` → spec + scaffold → `/feature` loop + `/deep-review` gate — or
`/forge` for the whole backlog hands-off (one wave-plan approval → parallel waves →
PR per feature → automatic deep-review finish) → `/harden` before exposure → `/ship`.
For the **next version** of a product that already exists, `/next` is kickoff's iteration
sibling: it clarifies new ideas into tiered features and hands them to the forge flow in
one command. Details on demand: `docs/LIFECYCLE.md`

Every feature is tagged with a **risk tier** (T1/T2/T3) at spec time; build+validate
depth branches on it — T1 full loop + security pass, T2 build + one verify, T3 fast
Sonnet build + smoke test. Seeded automatically, overridable, ties break up. Full scheme:
`docs/RISK-TIERS.md`.

## Command map

Full guide with mechanics and worked examples on demand: `docs/COMMANDS.md`

| Command | What it does |
|---|---|
| `/kickoff <idea>` | New product: interview → SPEC.md → stack from playbook → verified scaffold |
| `/adopt <path>` | Existing codebase → as-built spec + PROGRESS + project CLAUDE.md |
| `/next <ideas>` | Next version of an existing product: clarify ideas → tiered features → forge builds them |
| `/feature <F# or description>` | One feature: plan → failing test → build → fresh-context verify |
| `/forge [scope]` | Whole backlog: one approval → parallel waves → PR each → merge → review finish |
| `/fix <bug>` | Bug lane: reproduce → regression test → fix → review |
| `/harden [scope]` | Security audit + robustness sweep + gated fixes |
| `/ship [version]` | Release commit → release-gate workflow → checklist → tag → deploy |
| `/debug-hard <symptom>` | Structured escalation to the hard-bug debugger (session model) |
| `/status` | Ground-truth state report + session handoff into PROGRESS.md |
| `/resume` | Resume a stalled `/forge`/`/next` run: read `.forge/run.json`, reconcile with git, state the next action |
| `/retro` | Harness retrospective: observed friction → approved fixes → commits |
| `/understand [question]` | Workflow: parallel codebase mapping → architecture brief |
| `/design-panel <brief>` | Workflow: 3 designs, 1 judge-synthesizer (wide opt-in: 4+3) |
| `/feature-pipeline <features>` | Workflow: parallel build of independent features in worktrees |
| `/deep-review [scope]` | Workflow: 3-lens review, findings adversarially verified |
| `/release-gate [context]` | Workflow: 6 ship gates in 3 agents, fail-closed verdict |

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

## Hard rules (apply to every session under this root)

1. **Tests are load-bearing — and budgeted.** Never delete, weaken, or skip a test to get
   green; a newly failing test is a finding to report, not an obstacle to remove. But
   volume is a cost bug like verbosity: cover behavior at the public surface — happy path,
   realistic failures, risky boundaries, a regression test per real bug — never a unit
   test per function or combinatorial padding.
2. **Evidence before claims.** Progress reports cite tool results from this session.
   Unverified work is reported as unverified.
3. **Two strikes → change approach.** Third identical attempt at a failed fix/design is
   banned — escalate (`/debug-hard`, `design-panel`, or ask).
4. **Spec sync.** Legitimate deviation from `docs/SPEC.md` updates the spec in the same
   change. PROGRESS.md checkboxes only turn `[x]` with pasted evidence.
5. **Secrets never in code or commits.** `.env` + committed `.env.example` everywhere.
6. **Simplest thing that works well.** No speculative abstraction, no unrequested
   refactors, validation only at system boundaries.
7. **Slim output.** Verbosity is a cost bug. Reports = tables/bullets + evidence, never
   prose restating inputs; session-log lines ≤ 2; subagent returns carry data, not
   narration; generated docs say each thing once. Context (evidence, paths, criteria)
   is never cut — only words about words.
8. **Harness changes run the regression suite.** `npm test` (harness root) green before
   any commit that touches skills/agents/workflows/docs; new invariants get a test.
9. **Deterministic work is a script, never an agent turn.** Git plumbing, worktree
   lifecycle, PR assembly, running the suite, version bumps — anything with a single
   correct answer — lives in `scripts/` (or a command a skill runs directly), never a
   probabilistic agent told to run raw commands. It is cheaper *and* it deletes a failure
   class. Reviewers are read-only: they run tests and git-reads, never mutate tracked files.

## Working in a product (`projects/<name>/`)

Products don't have to live in `projects/` — `/adopt <absolute path>` brings any repo
on disk under the harness; skills take the product by path, workflows by `dir` arg.
`projects/` is the default home, not a requirement.

**Always launch sessions from the harness root** — skills, forge-agents, workflows, and
permission rules load from here and are NOT visible when Claude Code starts inside
`projects/<name>/`. In the session, make the product the working target (`cd` in the
shell); its own `CLAUDE.md` loads automatically once you read its files.

**Workflows do NOT follow your shell `cd`** — their agents run in the directory the
session was started from. Always pass the product explicitly:
`args: {dir: "<absolute product path>", ...}`. Every workflow preflight-verifies the
target and refuses a directory that doesn't look like the product (e.g. this harness
root). If args arrive mangled (known runtime bug), `feature-pipeline` and
`design-panel` fall back to `feature-pipeline.input.json` / `design-panel.input.md`
in the product root — write the file before invoking, delete it after.

**Invoke workflows by `scriptPath`, not `name`.** On this machine, `Workflow({name:
"feature-pipeline"})` fails the permission check with "script contains control
characters" whenever the checked-out `.claude/workflows/*.js` has CRLF line endings
(git's `core.autocrlf` on Windows). `.gitattributes` now pins those files to `eol=lf`,
but the reliable call is `Workflow({scriptPath: "<abs>/.claude/workflows/<wf>.js",
args: {...}})` — it bypasses the name→script resolution that trips the check. The
input-file fallback still applies for mangled args.

Each product has: `CLAUDE.md` (commands/conventions — trust it over guesses),
`docs/SPEC.md` (intent), `PROGRESS.md` (state + session log), `docs/adr/` (decisions).
Read `PROGRESS.md` "Next session should" before doing anything else; run the smoke test
before starting new work. When a skill's target product is ambiguous, ask instead of
guessing.

**Run state.** `/forge` and `/next` write `.forge/run.json` in the product at each
wave/feature boundary (baseline SHA, integration mode, per-feature status/branch/PR/
evidence, next action). `/resume` reads it to recover a run that died mid-way. It is
gitignored in the product and is an *accelerator over git*, never a source of truth — git
branches + `PROGRESS.md` stay authoritative, so a missing or stale file only costs a
reconcile, never a break.

## Coexistence with the global setup

The user's global `~/.claude` has its own agent team (architect, builder, tester, ...)
and hooks — that's a separate framework. In this workspace prefer the `forge-*` agents;
never define project agents/hooks that shadow or double the global ones.

## Playbooks

Stack defaults per product type (versions as of 2026-07): `docs/playbooks/` — web-app,
static-site, api-service, cli-tool, mobile-app, desktop-app, browser-extension, library.
Verify major versions against the live ecosystem at kickoff; playbooks age.

## References (private, opt-in)

`references/` (harness root, **gitignored** — content stays local for now) holds your own
reusable, product-type reference playbooks: checklists and conventions too specific or
private for the shared `docs/playbooks/` (e.g. a landing-page must-have list — Impressum,
Datenschutzerklärung, i18n, your layout). Playbooks are shared generic stack defaults;
references are your private domain knowledge. Consumed **selectively, at intake only**
(`/kickoff`, `/next`, `/adopt`): the skill reads `references/INDEX.md` (one line per
reference), pulls in the *single* matching file, and folds it into the spec. It is never
loaded into every agent — build/verify agents get the relevant bits from the spec and the
per-feature brief, not from `references/`. Absent or no match → skipped silently. The
mechanism is tracked here; the reference files are not.
