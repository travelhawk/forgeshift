# Evals — the merge bar for harness changes

Every PR (retro proposals from real usage included) is checked by CI
(`.github/workflows/evals.yml`). Improvement or neutral stays green; a
measurable regression turns the eval-gate check red. To make red actually
block the merge button, mark both checks required in branch protection —
until then the verdict is advisory and the maintainer enforces it. Everything
is deterministic and offline — workflows run in the orchestration simulator
(`evals/sim.mjs`) with stubbed agents, so a full run costs seconds and zero
tokens, and fork PRs need no secrets.

## What CI runs

| Job | What | When |
|---|---|---|
| `regression` | `npm test` — the full invariant + behavioral suite at HEAD | every PR, every push to main |
| `eval-gate` | `evals/gate.mjs` — replays every scenario in `CASES` (evals/sim.mjs) at the **merge-base** and at the **PR head**, compares | every PR |

## The bar (gate verdicts)

| Signal | Verdict |
|---|---|
| Any quality metric drops (findings confirmed, features passed, SHIP verdict, design doc) | **fail** |
| A scenario errors or its workflow is missing at HEAD | **fail** |
| Total agents or prompt volume rises past +30% vs merge-base | **fail** |
| CLAUDE.md (always-loaded) grows > +2500 bytes AND > +20% | **fail** |
| Any smaller cost/prose increase | warn (listed, not blocking) |
| Baseline incomparable (new workflow, old result shape) | warn — absolute suite still applies |
| Quality up, cost down, prose slimmer | listed as improvements |

Thresholds live in `THRESHOLDS` (evals/gate.mjs); the verdict logic is pinned
by `tests/eval-gate.test.mjs`.

## Run locally

```bash
npm test              # absolute suite
npm run eval:gate     # gate vs merge-base with origin/main (or: -- --base <rev>)
npm run eval          # human before/after table vs a fixed baseline rev
```

## Known limits (by design — know them, don't rediscover them)

- **The gate rides PRs only.** A direct push to main runs just `npm test`, and
  whatever lands becomes the next PR's baseline — the ratchet resets. Keep main
  PR-only (branch protection).
- **Two PRs gated against the same base can stack past a budget** (each +20%,
  merged +40%). GitHub's "require branches to be up to date" or a merge queue
  closes this.
- **CI runs the PR's own gate code.** A PR touching `evals/` or `.github/` can
  re-tune the bar it is judged by — review those diffs by hand; they are never
  routine.

## Adding coverage

New workflow or new guarantee → add a scenario/responder to `evals/sim.mjs`,
register it in `CASES` with its quality extractor, and pin any new verdict
semantics in `tests/eval-gate.test.mjs`. A workflow deleted on purpose must
drop its case in the same PR — the gate fails on a case whose workflow is
missing at HEAD.
