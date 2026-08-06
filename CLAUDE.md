# F.O.R.G.E. — operating manual

You are running inside a **product**, not inside this plugin repo. Two roots, never confuse
them:

- **Harness assets** (templates, playbooks, workflow scripts):
  `FORGE_HOME="${CLAUDE_PLUGIN_ROOT:-$(forge-home)}"`, then `$FORGE_HOME/<path>`.
- **Product files** (`docs/SPEC.md`, `PROGRESS.md`, the product's own `CLAUDE.md`): relative
  to the product directory.

## The loop

Idea → `/forge:kickoff` → spec + scaffold → `/forge:feature` loop + `/forge:deep-review` — or
`/forge:build` for the whole backlog hands-off → `/forge:harden` before exposure → `/forge:ship`.
`/forge:next` is kickoff's iteration sibling for a product that already exists.
Details: `docs/LIFECYCLE.md`

Every feature carries a **risk tier** (T1/T2/T3) set at spec time; validation depth branches
on it, identically in every lane. Full scheme: `docs/RISK-TIERS.md`

## Commands

Mechanics and worked examples: `docs/COMMANDS.md`

| Command | What it does |
|---|---|
| `/forge:kickoff <idea>` | New product: interview → SPEC.md → stack from playbook → verified scaffold |
| `/forge:adopt <path>` | Existing codebase → as-built spec + PROGRESS + project CLAUDE.md |
| `/forge:next <ideas>` | Next version: clarify ideas → tiered features → build them |
| `/forge:feature <F#>` | One feature: plan → failing test → build → fresh-context verify |
| `/forge:build [scope]` | Whole backlog: one approval → parallel waves → merge → review finish |
| `/forge:fix <bug>` | Reproduce → regression test → fix → review |
| `/forge:harden [scope]` | Security audit + robustness sweep + gated fixes |
| `/forge:ship [version]` | Release commit → release-gate → checklist → tag → deploy |
| `/forge:debug-hard <symptom>` | Escalation to the hard-bug debugger |
| `/forge:status` · `/forge:resume` | Ground-truth report · recover a stalled run |
| `/forge:retro` | Harness retrospective: observed friction → approved fixes |
| `/forge:understand` · `/forge:design-panel` · `/forge:feature-pipeline` · `/forge:deep-review` · `/forge:release-gate` | Workflows |

## Model routing (full policy: `docs/MODEL-ROUTING.md`)

Judgment — architecture, specs, hard bugs, review verdicts — rides the **session model**
(agents run `model: inherit`), so gates keep working when Fable is capped. Opus = all real
building. Sonnet = docs, research, executing written plans, command-running gates. Haiku =
mechanical sweeps. Route by decision density, not task size. When work loops, raise the
session model and re-run rather than burning a third same-tier attempt. Never downgrade a
review gate below Opus.

## Delegation (full guide: `docs/ORCHESTRATION.md`)

Specialists in `.claude/agents/`: `forge-blueprint` (planner), `forge-hammer` (implementer),
`forge-quench` (reviewer), `forge-temper` (debugger), `forge-proof` (tester), `forge-warden`
(security), `forge-prospector` (scout), `forge-etcher` (docs).

- Lowest orchestration level that works; escalate on demonstrated failure.
- Subagent prompts are **self-contained** (paths, context, done-definition) and
  **scope-boxed**: Scope-box every subagent to the slice it needs, plus an explicit
  do-NOT-read line. Mappers are the exception.
- **Brief the contract, not the procedure.** State done-criteria, forbidden surfaces, and the
  traps you already know. Prescribing steps to a model that can see the code you can't is how
  a brief ships a wrong instruction — and an agent that follows it loses more time than one
  that had to think. Tell agents to override a prescribed step and say so.
- Parallel agents get **isolated worktrees**. Two agents in one tree is a merge conflict with
  extra steps.
- The agent that built something never verifies it. Demand evidence, never "looks done".

## Hard rules (every `/forge:*` command, every repo)

1. **Tests are load-bearing — and budgeted.** Never delete, weaken or skip a test to get
   green; a newly failing test is a finding, not an obstacle. But volume is a cost bug: cover
   behavior at the public surface — happy path, realistic failures, risky boundaries, a
   regression test per real bug — never a unit test per function.
2. **E2E is the expensive tier.** At most one spec per feature, often none — only for what no
   other layer can reach. Written after the feature works, never e2e-first. It runs **once per
   merge gate**, not per agent and not only at the end of a backlog: e2e is where wiring bugs
   live, and a wave's worth is far cheaper to repair than a whole product's.
3. **A feature agent's gate is typecheck + lint + the tests covering its diff.** The full suite
   belongs to the merge gate. Running it from inside a feature agent starves its siblings and
   proves nothing its own files didn't.
4. **Leave no process behind.** Whatever an agent starts — dev server, watcher, database — it
   kills by process tree before reporting; helpers close handles in teardown. Leaked workers
   don't fail anything, they silently halve the machine for everyone after.
5. **Evidence before claims.** Reports cite tool results from this session. Unverified work is
   reported unverified — and a criterion the environment cannot prove is reported **open**,
   never ticked.
6. **Two strikes → change approach.** A third identical attempt is banned; escalate.
7. **Spec sync.** Legitimate deviation from `docs/SPEC.md` updates the spec in the same change.
   PROGRESS.md checkboxes turn `[x]` only with pasted evidence.
8. **Secrets never in code or commits.** `.env` + committed `.env.example`.
9. **Simplest thing that works.** No speculative abstraction, no unrequested refactors,
   validation only at boundaries.
10. **Slim output.** Verbosity is a cost bug, and so are docs. Reports are tables and evidence, never
    prose restating inputs. An ADR is for a one-way door or a genuine surprise — ≤ 15 lines,
    not a diary. Context is never cut; only words about words.
11. **Harness changes run the regression suite.** `npm test` green in the plugin repo before
    any commit touching skills/agents/workflows/docs; new invariants get a test. PRs also
    face the CI eval gate (`npm run eval:gate`): quality may not drop vs the merge-base,
    cost may not jump past budget — `docs/EVALS.md`. Every merge to main must grow the
    plugin version (installed plugins update by it): bump deliberately with
    `node scripts/bump-version.mjs minor|major` when warranted; CI patch-bumps any PR
    that lands without one.
12. **Deterministic work is a script, never an agent turn.** Git plumbing, worktree lifecycle,
    PR assembly, version bumps — anything with one correct answer — lives in
    `$FORGE_HOME/scripts/`. It is cheaper *and* deletes a failure class. Reviewers are
    read-only.

## Working in a product

Start the session **in your product**; its `CLAUDE.md` auto-loads once you read its files.
Products are their own git repos. Read `PROGRESS.md` → "Next session should" before anything
else. Ambiguous target → ask.

**Workflows do NOT follow your shell `cd`** — always pass `args: {dir: "<absolute product
path>"}`. **Invoke by `scriptPath`, not `name`**: `Workflow({scriptPath:
"$FORGE_HOME/.claude/workflows/<wf>.js", args: {dir, ...}})` — name resolution can fail the
permission check on CRLF and can corrupt args. If args arrive mangled, `feature-pipeline` and
`design-panel` fall back to an input file in the product root; write it before invoking,
delete it after.

**Run state.** `/forge:build` and `/forge:next` write `.forge/run.json` (gitignored) at each
wave boundary; `/forge:resume` reads it. It accelerates recovery — git and `PROGRESS.md` stay
authoritative, so staleness costs a reconcile, never a break.

**Coexistence.** The user's global `~/.claude` has its own agents and hooks. Forge is
namespaced (`/forge:*`, `forge-*`) and must not shadow or duplicate them.

## Playbooks and references

`docs/playbooks/` — stack defaults per product type (web-app, static-site, api-service,
cli-tool, mobile-app, desktop-app, browser-extension, library). **Verify major versions and
scaffold flags at kickoff; playbooks age and CLIs drift.**

`references/` (gitignored, local) holds private product-type reference playbooks. Consumed
**at intake only** (`kickoff`/`next`/`adopt`): read `INDEX.md`, pull in the *single* matching
file, fold it into the spec. Never loaded into build agents. Absent or no match → skip
silently.
