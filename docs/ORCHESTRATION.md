# Orchestration Guide

When to work solo, when to delegate to a subagent, when to fan out a workflow.
Wrong-sizing the orchestration is the most common harness failure: over-orchestration
burns tokens and coherence; under-orchestration caps quality on wide work.

## The ladder

| Level | Tool | Use when | Cost |
|---|---|---|---|
| 0 | Main session, solo | Single-file edits, questions, anything with tight feedback | 1x |
| 1 | One subagent (`.claude/agents/`) | A bounded task with a clean interface: "review this diff", "research X", "write the tests for Y" | ~1-2x |
| 2 | Parallel subagents | 2-5 independent bounded tasks | n× but wall-clock ÷n |
| 3 | Workflow (`.claude/workflows/`) | Deterministic multi-stage fan-out: review-verify chains, judge panels, batch feature builds | 5-30x |

**Default down, not up.** If unsure between two levels, pick the lower one. Escalate when
the lower level demonstrably fails (missed findings, serial slog through independent work).

## When workflows earn their cost

- **Adversarial verification** (`deep-review`) — findings are only trustworthy after
  independent refutation attempts; that's inherently multi-agent.
- **Wide independent work** (`feature-pipeline`, `understand`) — N independent items,
  each fits one context window, no shared mutable state (worktrees isolate the rest).
- **Wide decision spaces** (`design-panel`) — independent designers with different priors
  beat one design iterated, because iteration anchors on the first idea.
- **Trust-but-verify gates** (`release-gate`) — parallel checks where each agent must
  actually run commands and report evidence.

## When workflows are the wrong tool

- Sequential work where step N+1 depends on N's judgment — keep it in the main session
  where the context lives.
- Tasks needing your taste every few minutes (UI polish, copy) — feedback latency kills
  the fan-out advantage.
- Anything touching shared mutable state without worktree isolation.
- Small stuff. A 20-line fix does not need a judge panel.

## Workflow target contract (added 2026-07-06, after the harness eval)

Workflow agents inherit the **session's start directory**, not your shell `cd` — a
session started from the harness root (or any parent) would otherwise run its agents
against the wrong repository (observed live). Three rules, enforced in all five
workflows:

1. **Pass the target explicitly:** `args: {dir: "<absolute product path>", ...}`
   combined with the workflow's own inputs (`scope`, `brief`, `features`/`context`,
   `focus`, release `context`).
2. **Preflight guard:** a cheap Haiku agent verifies the target exists, holds a real
   project, and is not a harness/control-center repo (feature-pipeline additionally
   requires a git repo) — otherwise the workflow refuses before any real work. The
   verified absolute path is pinned into every agent prompt and echoed in the result.
3. **Args can arrive mangled** (observed: an object reached a script as a non-object).
   All workflows coerce JSON-stringified args; `feature-pipeline` and `design-panel`
   additionally read `feature-pipeline.input.json` / `design-panel.input.md` from the
   target root as a fallback — write the file before invoking, delete it after.

Also: `feature-pipeline` branches are verified **in isolation** — after merging, run
the full suite on the merged result in the main session before calling the batch done
(the merged whole has not been tested by any agent; integration breaks surface here).

## Subagent contract (applies to every delegation)

1. **Self-contained prompt.** The subagent sees none of your conversation. Paths, context,
   constraints, and the definition of done go in the prompt.
2. **Demand evidence, not vibes.** "Run the tests and paste the failing names", not "check
   if tests pass".
3. **Fresh context for verification.** The agent that built something never verifies it —
   builders grade themselves generously. `feature-pipeline` bakes this in.
4. **Right-size the model.** Judgment-heavy → session model (Fable/Opus); building → Opus;
   well-specified execution → Sonnet; mechanical → Haiku. See docs/MODEL-ROUTING.md.
5. **One retry, then rethink.** A subagent that failed twice on the same prompt will fail
   a third time. Change the decomposition instead.
6. **Distill once, don't re-read N times.** When several agents work the same feature
   (plan → build → verify), the plan agent — which already reads the code — emits a
   self-contained *brief*: the acceptance criteria plus the specific files, conventions,
   and applicable pitfalls this feature touches. Downstream agents read that ~2k brief,
   not the full spec + architecture + all of memory. One cheap extraction replaces N
   expensive re-reads. `feature-pipeline`'s PLAN object is this brief.
7. **Return data, not essays.** A subagent's final message is a return value, not a
   status update: findings, paths, evidence, verdicts — no narration of the journey.
   Prefer schemas (structured output) wherever a downstream step consumes the result.

## When a workflow dies mid-run

Rate limits, sleep, crashes — mid-run death is normal, plan for it:

1. **Findings/read-only workflows** (`understand`, `deep-review`, `design-panel`,
   `release-gate`): nothing to clean up; partial results may still be in the run output.
   Re-run, optionally scoped to what's missing.
2. **`feature-pipeline`**: work survives as `feature/wf-*` branches (commits live in the
   shared .git — worktree removal never deletes branches). Recovery: `git worktree list`
   → `git worktree prune` (clears stale records that block future `worktree add`) →
   inspect each `feature/wf-*` branch for committed work BEFORE deleting anything →
   re-invoke the workflow with only the unfinished features.
3. Workflows can also be resumed: the run output names a script path and run ID —
   re-invoking with `resumeFromRunId` replays completed agents from cache.

## Context hygiene (why this all matters)

Long sessions rot: stale file reads, dead plans, contradictory decisions accumulate.
Fan-out is also a context strategy — subagents get clean context and return only
conclusions. Corollaries:

- Push bulk reading (logs, big files, sweeps) into subagents; keep the main session for
  decisions.
- After a big milestone, `/status` writes state to disk so the next session starts clean
  instead of inheriting rot.
- The spec and CLAUDE.md files are the durable memory; conversations are scratch.
