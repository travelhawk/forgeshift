# Model Routing Policy

How Forge decides which Claude model runs which work. Verified against the Claude API
reference on 2026-07-05 — re-check pricing/IDs quarterly (`/claude-api` skill or
`client.models.list()`).

## The fleet

| Model | ID | Context | Max out | $/1M in | $/1M out | Role in Forge |
|---|---|---|---|---|---|---|
| Claude Fable 5 | `claude-fable-5` | 1M | 128K | $10.00 | $50.00 | **The Architect.** Deepest reasoning, longest horizon — the *recommended session model* for judgment-heavy days, when you have the quota. |
| Claude Opus 4.8 | `claude-opus-4-8` | 1M | 128K | $5.00 | $25.00 | **The Builder.** Default for all real engineering work, and the default session model when Fable is unavailable. |
| Claude Sonnet 5 | `claude-sonnet-5` | 1M | 128K | $3.00 (intro $2.00 through 2026-08-31) | $15.00 (intro $10.00) | **The Workhorse.** Well-defined parallel execution. |
| Claude Haiku 4.5 | `claude-haiku-4-5` | 200K | 64K | $1.00 | $5.00 | **The Sprinter.** Mechanical fan-out, classification. |

### The session model — the harness's top judgment tier

Judgment work does not pin Fable. It routes to the **session model** — whatever model
your interactive session runs on — so the harness never stalls when Fable is rate-limited
or unavailable. You choose the tier by choosing your session model:

- **Fable 5** when you have the quota and the day is architecture-, spec-, or hard-bug-heavy.
- **Opus 4.8** otherwise — the reliable default, always available.

The judgment subagents (`forge-blueprint`, `forge-quench`, `forge-temper`) run `model:
inherit`, and the judgment workflow stages (review dimensions, adversarial verifiers, design
judges, synthesis) omit a model pin — all of them ride the session model. Put the session on
your best available model and the whole gate layer rises with it.

## Routing table

Route by **decision density**, not by task size. A one-line change that requires judgment
(concurrency fix, API design) deserves a bigger model than a 500-line mechanical rename.

| Work | Model | Why |
|---|---|---|
| Product spec, architecture, system design | **Session model** | Errors here are the most expensive of the whole project — run the session on Fable for these |
| Technology/stack decisions with trade-offs | **Session model** | One-shot decision, long consequences |
| Hard debugging (heisenbugs, race conditions, "impossible" states) | **Session model** | Needs sustained hypothesis-driven reasoning — Fable-session day if you can |
| Adversarial review verdicts / judge panels | **Session model** | Judgment quality is the whole point of the gate; never let it fall below Opus |
| Orchestrating a large multi-agent build | **Session model** | Long-horizon coherence across many workstreams |
| Feature implementation, refactoring | **Opus 4.8** | Best coding-per-dollar at frontier quality |
| Test writing, integration work | **Opus 4.8** | Needs real engineering judgment, not just syntax |
| Security audit passes | **Opus 4.8** / session | Careful reading, moderate reasoning depth |
| UI implementation from a settled design | **Opus 4.8** | High output volume, frequent small judgments |
| Interactive daily driving (default session model) | **Opus 4.8** | Fast mode available (`/fast`) for tight loops; Fable on architecture days |
| Docs, READMEs, changelogs | **Sonnet 5** | Well-specified transformation of known content |
| Parallel subagent execution of a written plan | **Sonnet 5** | The plan carries the judgment; execution is cheap |
| Codebase mapping / subsystem reads | **Sonnet 5** | Reading and summarizing to a schema — well-defined, high volume |
| Release gates that run a command and report | **Sonnet 5** | Mechanical execution; the pass/fail aggregation is code, not the agent |
| Web research fan-out | **Sonnet 5** | Volume matters more than depth per query |
| File inventory, log scanning, mechanical sweeps | **Haiku 4.5** | Zero judgment required; 5–10x cheaper |
| Classification, triage, dedup passes | **Haiku 4.5** | Simple per-item decisions at volume |

## Escalation & de-escalation rules

1. **Escalate by raising the session model when work loops.** Two failed fix attempts on
   the same bug, or a review that keeps flip-flopping → switch the session to Fable 5 (if
   you have the quota) and re-run; `/forge:debug-hard` hands the full context to `forge-temper`
   on the session model. Don't burn a third attempt on the same tier.
2. **De-escalate after the plan exists.** The session model writes the spec; Sonnet-tier
   subagents execute it. Paying top-tier rates for `npm install` and boilerplate is waste.
3. **Never downgrade a gate below Opus.** Review/judge verdicts ride the session model —
   keep the session on Opus or Fable when a gate runs, never Sonnet/Haiku. A missed bug
   costs more than the tokens.
4. **Prefer one strong pass over three weak ones.** A single Opus implementation beats
   three Haiku attempts plus reconciliation.

## Fable 5 — operating notes

- **Thinking is always on.** Omit the `thinking` param in API code; a `{type: "disabled"}`
  returns 400. Control depth with `output_config.effort` (`low`…`max`).
- **Longer turns are normal.** Single hard-task requests can run many minutes. Give the
  full task spec up front in one well-specified turn; don't drip-feed.
- **Refusal fallbacks:** in API code targeting `claude-fable-5`, include
  `betas: ["server-side-fallback-2026-06-01"]` + `fallbacks: [{"model": "claude-opus-4-8"}]`
  by default — safety classifiers can false-positive on benign security-adjacent work.
- **De-prescribe prompts.** Step-by-step scaffolding written for older models *reduces*
  Fable output quality. State the goal and constraints; let it choose the steps.
- **Requires 30-day data retention** (not available under ZDR).

## Opus 4.8 — operating notes

- Default session model and default `model:` for implementation subagents.
- **Fast mode** (`/fast` in Claude Code; `speed: "fast"` + beta `fast-mode-2026-02-01` in
  API code) — same model, up to 2.5x output speed at premium pricing. Use for tight
  interactive iteration, not for batch work.
- Adaptive thinking only: `thinking: {type: "adaptive"}`. `budget_tokens`, `temperature`,
  `top_p`, `top_k` all return 400.
- Effort: `high` is the sweet spot; `xhigh` for hard coding/agentic runs; sweep rather
  than reflexively maxing.

## Effort routing (within a model)

| Effort | Use for |
|---|---|
| `low` | Mechanical subagent tasks, formatting, inventory |
| `medium` | Routine implementation with a clear plan |
| `high` | Default for real engineering work |
| `xhigh` | Hard coding/agentic runs, final review gates |
| `max` | Correctness-critical, latency-insensitive verification only |

## In this harness

- **Session model:** run interactive sessions on Opus 4.8 (or Fable 5 for architecture
  days, quota permitting). Set via the model selector / `claude --model`. This one choice
  sets the whole judgment tier — every `model: inherit` agent and every unpinned workflow
  stage rises and falls with it.
- **Subagents:** each agent file in `.claude/agents/` pins its tier via the `model:`
  frontmatter field. Blueprint/Quench/Temper (planner/reviewer/debugger) ride the session
  model (`model: inherit`) — so they are never blocked when Fable is capped and are as
  strong as your session; Hammer/Proof/Warden (implementer/tester/security) build on Opus;
  Prospector/Etcher (scout/docs) ride Sonnet.
- **Workflows:** scripts in `.claude/workflows/` pass `model:`/`effort:` per `agent()`
  call — judgment stages (review dimensions, verifiers, judges, synthesis) omit `model:`
  to inherit the session model at high/xhigh; **build stages pin `model: 'opus'`** (T1/T2
  in `feature-pipeline`) so building stays at its own tier and never rides a Fable-5
  session at 2x for boilerplate; well-defined execution (codebase maps, command-running
  gates) pins `model: 'sonnet'` at medium; preflight/inventory sweeps pin `model: 'haiku'`
  at low. Set effort explicitly; unset stages inherit the session's global effort, which
  is usually too high for mechanical work.
