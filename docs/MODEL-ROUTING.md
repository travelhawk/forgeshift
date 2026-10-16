# Model Routing Policy

Depth behind `AGENTS.md` § Model routing. Prices and IDs verified 2026-10-16 against the
Claude API reference and the OpenAI pricing page — re-check quarterly; names age fast.

## Tiers first, models second

Routing is by **tier**. Files on disk name a tier by its Claude alias, because the native
Claude Code runtime reads those tokens; every other host maps the tier itself (`HOSTS.md`).

| On disk | Tier | Job | Claude | OpenAI (Codex) | $/1M in / out |
|---|---|---|---|---|---|
| `inherit` | **judge** | specs, architecture, review verdicts, hard bugs | the session model — **Opus 5.5** | the session model — **gpt-6-sol** | $4 / $20 · $2 / $10 |
| `opus` | **build** | all real building | **Opus 5.5** | **gpt-6-sol** | $4 / $20 · $2 / $10 |
| `sonnet` | **execute** | docs, research, written plans, command-running gates | **Sonnet 5.5** | **gpt-6-sol**, lower effort | $2 / $10 · $2 / $10 |
| `haiku` | **sweep** | preflight, inventory, classification | **Haiku 5.5** | **gpt-6-luna** | $0.10 / $0.50 |

**Top tier — opt-in, never a default.** Claude **Fable 5.1** and OpenAI **gpt-6-astra** cost
$10 / $50, 2.5x Opus 5.5 and 5x Sol. Nothing in forge pins them. Raise the *session* to the
top tier only for work that already failed on the default session — a bug that survived
`/forge:debug-hard`, a review that keeps flip-flopping — or for one hard one-way-door
decision. Then drop back. Opus 5.5 at its default effort matches the previous top tier on
most coding and review work at a fraction of the cost.

Off Claude, forge ships no model names: they differ per account. Until you map them in
`~/.forge/config.json`, every tier runs your host default and the tiers differ by effort
only — correct, but the sweep tier then costs Sol prices instead of Luna's. Map at least
`sweep`. `forge-run hosts` shows the current mapping and warns about unmapped tiers.

## Routing table

| Work | Tier | Why |
|---|---|---|
| Product spec, architecture, stack decisions | judge | Errors here are the project's most expensive |
| Adversarial review verdicts, judge panels | judge | Judgment is the whole point of the gate; never below build |
| Hard debugging, orchestrating a large build | judge | Sustained, long-horizon reasoning |
| Feature implementation, tests, integration, security passes | build | Real engineering judgment at volume |
| Docs, research fan-out, codebase maps, executing a written plan | execute | The brief carries the judgment |
| Release gates that run a command and report | execute | The pass/fail aggregation is code |
| Preflight, file inventory, log scans, triage, dedup | sweep | Per-item decisions at volume; 20–40x cheaper |

**De-escalate after the plan exists.** The judge writes the brief, cheaper tiers execute it.
**One strong pass beats three weak ones.** **Before adding a model to a cascade, try the same
model at lower effort** — on current models lower effort often matches the previous
generation's highest, and one model keeps one prompt cache.

## Effort (within a model)

Opus 5.5, Haiku 5.5 and the Sol models default to `medium`; Sonnet 5.5 and Fable 5.1 to
`high`. (`gpt-6.1-sol` is the same price as `gpt-6-sol` but needs an API key in Codex.)
Level names do not mean the same depth across models, so forge **sets effort explicitly on
every stage** — an unset stage inherits the session's, usually too high for mechanical work.

| Effort | Use for |
|---|---|
| `low` | Preflight, inventory, classification, mechanical edits |
| `medium` | Routine building from a brief (T2/T3), plan agents, written-plan execution |
| `high` | High-risk building (T1), review dimensions, verifiers, security passes |
| `xhigh` | Final review gates, hard debugging, one-way-door judging |
| `max` | Only where a measured gain shows at `xhigh` |

At `xhigh`/`max`, long deliverables can be drafted twice — once in thinking, once in the
reply. Write long documents at `high`. Lower effort before prompting for brevity.

## Prompting current models

Current Claude and GPT-6 models follow instructions closely and literally. What worked
as scaffolding for older models now costs quality:

- **Goal, constraints, done-criteria, how to verify.** Not a step script — keep numbered
  steps only where order is the contract. Name forbidden surfaces and known traps.
- **Say each rule once, in the one place it applies.** Repetition and `CRITICAL`/`MUST`
  boosters make the model reconcile wordings or over-trigger; keep strong words for true
  invariants. Two rules that conflict make GPT-6 models stop and ask — resolve the conflict.
- **Context the task needs, not the context that fits.** Scope-box every brief.
- **Evidence over claims.** Ask for the command and its output. At low effort Sonnet 5.5 and
  Haiku 5.5 can report a change done without running a check — demand a real one.
- **No anti-laziness or "think step by step" prose.** Effort is the depth control.

## API operating notes (the parts that return 400)

- **Opus 5.5 / Sonnet 5.5 / Fable 5.1:** thinking is always adaptive. `budget_tokens`,
  `temperature`/`top_p`/`top_k`, assistant prefill and forced `tool_choice` (`any`/`tool`)
  all return 400 — use `auto` + `strict: true`, or structured outputs. On Opus 5.5,
  `thinking: {type: "disabled"}` is also a 400: lower effort instead. Sonnet 5.5's lowest
  setting is `{type: "between_tools"}`, effort `high` or below. Size `max_tokens` for the
  thinking plus the reply.
- **Refusals:** check `stop_reason: "refusal"` before reading content; opt into
  `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`) on Fable 5.1, Opus 5.5 and
  Sonnet 5.5 API code.
- **GPT-6 (Responses API):** effort via `reasoning.effort`; Astra and 6.1 Sol have no
  `none`; drop `temperature`/`top_p` whenever reasoning is on.

## Where the pins live

- **Subagents:** `model:` and `effort:` in each `agents/*.md`. Blueprint/Quench/Temper ride
  the session (`model: inherit`) — as strong as your session, never blocked when a top model
  is capped; Hammer/Proof/Warden pin the build tier; Prospector/Etcher ride execute.
- **Workflows:** `model:`/`effort:` per `agent()` call. Judgment stages (review dimensions,
  verifiers, judges, synthesis) omit `model:` to inherit the session;
  **build stages pin `model: 'opus'`** (T1/T2 in `feature-pipeline`) so building never rides
  a top-tier session; written-plan execution and command-running gates pin
  `model: 'sonnet'`; preflight and inventory pin `model: 'haiku'` at `low`.
