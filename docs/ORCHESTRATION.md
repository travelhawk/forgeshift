# Orchestration Guide

Depth behind `AGENTS.md` § Delegation. Wrong-sizing the orchestration is the most common
harness failure: over-orchestration burns tokens and coherence, under-orchestration caps
quality on wide work.

The ladder is host-neutral. "Subagent" means your host's own mechanism (Claude's Agent tool,
a Codex subagent, OpenCode's task tool); "Workflow" means the native Workflow tool on Claude
Code and `bin/forge-run.mjs` everywhere else — `HOSTS.md`.

## The ladder

| Level | Tool | Use when | Cost |
|---|---|---|---|
| 0 | Main session, solo | Single-file edits, questions, anything with tight feedback | 1x |
| 1 | One subagent (`agents/`) | A bounded task with a clean interface: "review this diff", "research X", "write the tests for Y" | ~1-2x |
| 2 | Parallel subagents | 2-5 independent bounded tasks | n× but wall-clock ÷n |
| 3 | Workflow (`workflows/`) | Deterministic multi-stage fan-out: review-verify chains, judge panels, batch feature builds | 5-30x |

## When workflows earn their cost

- **Adversarial verification** (`deep-review`) — findings are trustworthy only after independent
  refutation; inherently multi-agent.
- **Wide independent work** (`feature-pipeline`) — 3+ independent items, each fitting one context
  window, no shared mutable state. Below 3, `/forge:build`'s small-wave lane is the same shape at
  level 0–2: two parallel worktree subagents under identical tier gates. The engine earns its
  overhead only once prose bookkeeping would juggle 3+ branches and verifies at once. (Codebase
  *mapping* is wide-independent too, but `/forge:understand` is a **skill** — no fail-closed
  gate, no code-only aggregation.)
- **Wide decision spaces** (`design-panel`) — independent designers with different priors beat
  one design iterated; iteration anchors on the first idea.
- **Trust-but-verify gates** (`release-gate`) — parallel checks that must run commands and report
  evidence.

**Wrong tool for:** sequential work where step N+1 depends on N's judgment · tasks needing your
taste every few minutes · shared mutable state without worktree isolation · a 20-line fix.

## Workflow target contract

Workflow agents start in the session's start directory, not in your shell `cd`. Pass the
product explicitly: `args: {dir: "<absolute product path>", ...}`. The path is pinned into each
agent prompt, and a missing, empty or harness repo is refused before anything changes: the
first agents of every workflow check the target themselves. No workflow spends an agent on a
preflight. Arg coercion and the target check live in `lib/workflow-preamble.mjs`; the
input-file fallback, which costs an agent only when args were lost, in `feature-pipeline.js`
and `design-panel.js`.

`feature-pipeline` tests each branch in isolation, so the merged whole is tested by no
agent. Run the full suite on the merged result before calling the batch done. Re-run a NEW
failure once, targeted: it reproduces → stop the run; it clears → log it as flaky and go on.

## Subagent contract

`AGENTS.md` § Delegation states the rules. What they cost to get wrong:

1. **Brief the contract, not the procedure.** A subtly wrong prescribed step costs more than
   none: the agent follows it, notices, then undoes it. One retry, then change the
   decomposition, not the wording. Ask for data, not essays.
2. **Isolated worktrees for parallel agents** (`isolation: "worktree"`, or
   `scripts/forge-worktree.sh`). Two agents in one tree is a merge conflict with extra steps.
   Remove the worktrees before linting the merged result, or `lint` traverses a second copy of
   the source.
3. **Every hand-off re-reads the code.** A plan agent, a builder and a verifier for one
   feature read the same files three times. Measured (2026-11, two features with precise
   criteria): one session matched the per-feature plan → build → verify chain on hidden tests
   at a quarter of the tokens. So one agent per feature plans inline, and fresh context is
   spent on the checks a builder cannot do on itself: T1 security and the finish review.
   The review itself scales the same way. On a ~200-line diff with six seeded bugs,
   `deep-review` with `depth: "quick"` (one reviewer, one refuter) found 6/6 in two runs;
   the full review (9 agents) found 6/6 and 5/6, at three times the tokens.
4. **Scope-box the context.** Name what to read (diff, brief, specific files + their
   callers/tests) AND what not to (full spec, PROGRESS, ADRs, memory, unrelated modules).
   "Explore for context" without bounds is a token leak: N subagents each crawling the repo
   re-pay the same reading N times. Exceptions where the broad read *is* the job: mappers
   (`/forge:understand`) and `forge-warden`'s project audit under `/forge:harden` — its
   per-feature pass is diff-scoped like any reviewer's.
5. **Standalone `cd`, never chained.** One bare `cd <target>` first (cwd persists), then plain
   commands. `cd X && git ...` triggers a permission prompt on every call — chained `cd`
   bypasses the allow rules plain commands match.

## When a workflow dies mid-run

1. **Read-only workflows** (`deep-review`, `design-panel`, `release-gate`): nothing to clean up;
   partial results may be in the run output. Re-run, optionally scoped to what's missing.
   (`/forge:understand` likewise — its per-subsystem map files on disk are the salvage.)
2. **`feature-pipeline`**: work survives as `feature/wf-*` branches (commits live in the shared
   .git; worktree removal never deletes branches). `git worktree list` → `git worktree prune`
   (clears stale records that block future `worktree add`) → inspect each `feature/wf-*` branch
   for committed work BEFORE deleting anything → re-invoke with only the unfinished features.
3. Or resume: the run output names a script path and run ID; re-invoking with `resumeFromRunId`
   replays completed agents from cache.

## Context hygiene

Long sessions rot. Fan-out is also a context strategy — subagents get clean context and return
only conclusions. Push bulk reading (logs, big files, sweeps) into subagents and keep the main
session for decisions; after a milestone `/forge:status` writes state to disk so the next
session starts clean. Specs and AGENTS.md files are the durable memory; conversations are scratch.
