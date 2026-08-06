# Model Routing Policy

Depth behind `CLAUDE.md` § Model routing. Verified against the Claude API reference on
2026-07-05 — re-check pricing/IDs quarterly (`/claude-api` skill or `client.models.list()`).

## The fleet

| Model | ID | Context | Max out | $/1M in | $/1M out | Role in Forge |
|---|---|---|---|---|---|---|
| Claude Fable 5 | `claude-fable-5` | 1M | 128K | $10.00 | $50.00 | **The Architect.** Deepest reasoning, longest horizon — the *recommended session model* for judgment-heavy days, when you have the quota. |
| Claude Opus 4.8 | `claude-opus-4-8` | 1M | 128K | $5.00 | $25.00 | **The Builder.** Default for all real engineering work, and the default session model when Fable is unavailable. |
| Claude Sonnet 5 | `claude-sonnet-5` | 1M | 128K | $3.00 (intro $2.00 through 2026-08-31) | $15.00 (intro $10.00) | **The Workhorse.** Well-defined parallel execution. |
| Claude Haiku 4.5 | `claude-haiku-4-5` | 200K | 64K | $1.00 | $5.00 | **The Sprinter.** Mechanical fan-out, classification. |

**The session model** is the harness's top judgment tier: judgment routes to *whatever model
your interactive session runs on*, never a pinned Fable, so gates keep working when Fable is
capped. Run the session on **Fable 5** for architecture-, spec-, or hard-bug-heavy days,
**Opus 4.8** otherwise. Raise the session and the whole gate layer rises with it.

## Routing table

| Work | Model | Why |
|---|---|---|
| Product spec, architecture, system design | **Session model** | Errors here are the project's most expensive — Fable if you can |
| Technology/stack decisions with trade-offs | **Session model** | One-shot decision, long consequences |
| Hard debugging (heisenbugs, races, "impossible" states) | **Session model** | Sustained hypothesis-driven reasoning |
| Adversarial review verdicts / judge panels | **Session model** | Judgment quality is the whole point of the gate; never below Opus |
| Orchestrating a large multi-agent build | **Session model** | Long-horizon coherence across workstreams |
| Feature implementation, refactoring | **Opus 4.8** | Best coding-per-dollar at frontier quality |
| Test writing, integration work | **Opus 4.8** | Real engineering judgment, not just syntax |
| Security audit passes | **Opus 4.8** / session | Careful reading, moderate reasoning depth |
| UI implementation from a settled design | **Opus 4.8** | High output volume, frequent small judgments |
| Interactive daily driving (default session) | **Opus 4.8** | `/fast` for tight loops; Fable on architecture days |
| Docs, READMEs, changelogs | **Sonnet 5** | Well-specified transformation of known content |
| Parallel subagent execution of a written plan | **Sonnet 5** | The plan carries the judgment |
| Codebase mapping / subsystem reads | **Sonnet 5** | Reading and summarizing to a schema, high volume |
| Release gates that run a command and report | **Sonnet 5** | Mechanical; the pass/fail aggregation is code |
| Web research fan-out | **Sonnet 5** | Volume matters more than depth per query |
| File inventory, log scanning, mechanical sweeps | **Haiku 4.5** | Zero judgment; 5–10x cheaper |
| Classification, triage, dedup passes | **Haiku 4.5** | Simple per-item decisions at volume |

**De-escalate after the plan exists** — the session model writes the spec, Sonnet-tier agents
execute it. **Prefer one strong pass over three weak ones**; a single Opus implementation beats
three Haiku attempts plus reconciliation.

## Operating notes (the parts that return 400)

**Fable 5** — thinking is always on: omit the `thinking` param, `{type: "disabled"}` returns
400; control depth with `output_config.effort` (`low`…`max`). Long turns are normal — give the
full spec in one well-specified turn, don't drip-feed. In API code default to
`betas: ["server-side-fallback-2026-06-01"]` + `fallbacks: [{"model": "claude-opus-4-8"}]`;
safety classifiers false-positive on benign security-adjacent work. **De-prescribe prompts** —
step-by-step scaffolding written for older models *reduces* Fable output quality. Requires
30-day data retention (unavailable under ZDR).

**Opus 4.8** — adaptive thinking only (`thinking: {type: "adaptive"}`); `budget_tokens`,
`temperature`, `top_p`, `top_k` all return 400. **Fast mode** (`/fast`; `speed: "fast"` + beta
`fast-mode-2026-02-01`) is the same model at up to 2.5x output speed and premium pricing —
interactive iteration only, never batch.

## Effort routing (within a model)

| Effort | Use for |
|---|---|
| `low` | Mechanical subagent tasks, formatting, inventory |
| `medium` | Routine implementation with a clear plan |
| `high` | Default for real engineering work |
| `xhigh` | Hard coding/agentic runs, final review gates |
| `max` | Correctness-critical, latency-insensitive verification only |

Sweep effort rather than reflexively maxing.

## Where the pins live

- **Subagents:** `model:` in each `.claude/agents/*.md`. Blueprint/Quench/Temper ride the session
  (`model: inherit`) — never blocked when Fable is capped, and as strong as your session;
  Hammer/Proof/Warden pin Opus; Prospector/Etcher ride Sonnet.
- **Workflows:** `model:`/`effort:` per `agent()` call. Judgment stages (review dimensions,
  verifiers, judges, synthesis) omit `model:` to inherit the session at high/xhigh;
  **build stages pin `model: 'opus'`** (T1/T2 in `feature-pipeline`)
  so building never rides a Fable-5 session at 2x for boilerplate; well-defined execution
  (codebase maps, command-running gates) pins `model: 'sonnet'` at medium; preflight/inventory
  pins `model: 'haiku'` at low. Set effort explicitly — unset stages inherit the session's
  global effort, usually too high for mechanical work.
