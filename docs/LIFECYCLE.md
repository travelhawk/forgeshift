# Build lifecycle

```
 IDEA ──► /forge:kickoff ──► SPEC + STACK + SCAFFOLD
                            │
                 ┌──────────▼──────────┐
                 │   BUILD             │  /forge:feature (one focused task) ·
                 │  plan → test →      │  /forge:build (whole backlog) ·
                 │  build → verify     │  feature-pipeline (raw batch)
                 └──────────┬──────────┘
                            │  deep-review (inside build) · /forge:harden before exposure
                            ▼
                    DELIVER: one PR (or few) ──► human merge
                            │
                            ▼
                        /forge:ship ──► release-gate ──► deploy
                            │
                            ▼
                  feedback → /forge:next → next version → loop
```

Bugs go to `/forge:fix`; one that survives two attempts goes to `/forge:debug-hard`.
`/forge:adopt` brings an existing repo into the loop.

## Concepts — four different things

| | Is | Lives in |
|---|---|---|
| **Feature** | A capability the user notices. Sets the done-criteria and the risk tier. | `docs/SPEC.md`, the tracker row |
| **Work package** | A technically coherent unit of implementation: one builder, one branch. A feature is one or more; a package can serve several small features. | `.forge/run.json`, the branch |
| **Wave** | An execution grouping: packages that can run in parallel. Absent when nothing is parallel. | `.forge/run.json` |
| **PR** | A meaningful change a reviewer can judge on its own. | GitHub |

None implies another. Features and waves never open PRs; they land on an integration branch
inside the run. Only **delivery** opens PRs.

## Phases

| Phase | Done when | Where |
|---|---|---|
| 1 Kickoff | Outcome and acceptance criteria are clear; questions asked once, batched, only for what the context leaves open | `kickoff`, `next` §1, `feature` §1 |
| 2 Planning | Work packages and order known; no more decomposition than needed; issues only if the work outlives the run | `build` §1, `feature` §2 |
| 3 Build | Packages implemented, tests first, gate = typecheck + lint + tests of the diff | `build` §3, `feature` §3 |
| 4 Verification | Full suite on the integrated result, risk-based review, criteria checked, findings fixed | merge gate, `build` §5, `feature` §4 |
| 5 Delivery | PR boundaries decided, PR(s) open with evidence, CI green, completion report | `build` §5d, `feature` §5 |

A run moves through the phases without asking. Phase 2 → 3 is not a checkpoint.

## Who does the work

The session agent runs every phase and does the work itself: the spec, the plan, the
build, the walkthrough, the README, the CHANGELOG, the release checks. A subagent costs a
fresh read of the code, so it is spent only where a fresh context buys something:

| Reason | Where | Small product | Large product |
|---|---|---|---|
| **Independent check** — the builder never judges its own work | finish review; T1 security pass; harden audit | quick review (2) + audit if exposed (1) | full review (~9) + one pass per T1 feature + audit (1) |
| **Real parallelism** | builders of independent features | none: built in order | one per parallel feature |
| **Context protection** | anything that would flood the session | the session's call | the session's call |

Everything else is inline, and the session decides when to delegate; no skill forces a
specialist on it. A small product (about 6 features or fewer, code that fits the session's
context) thus needs 2–3 subagents from kickoff to ship. The same autonomy holds for
questions: the user is asked only at the approval boundaries below.

## PR boundaries

One run, one delivery branch, **one PR by default**. Never one PR per feature by default.
Split only when a reviewer is better served: the diff is too big to review as one (the
product's own limit first; about 800 changed lines without lockfiles and generated files
otherwise), a part is independently releasable or has to roll out first (a schema
migration), a part touches files that need another person's approval and the rest does not,
or a part is high-risk and deserves its own review. Split by reviewable concern, not by
feature. Group parts with a build dependency in one PR; a stacked PR is a last resort.
Delivery PRs target the repo's default branch, never another feature's branch. The
`/forge:feature` lane is the one exception to "features never open PRs": a focused task is
one change, so it is one PR.

PR text, branch names, commit style and review expectations come from the product's own
`AGENTS.md`, `.github/pull_request_template.md` and the team playbook it names — see
`AGENTS.md` § Standards. This page adds none.

## Approval boundaries

Everything else runs on its own. An agent may analyze, plan, change code, create branches,
commits and PRs, run checks, review and fix its own work, and prepare deploy artifacts.

| A human approves | Example |
|---|---|
| A material change to a product or business requirement | A scope cut, a new user-visible promise, a changed done-criterion |
| An irreversible or destructive action | Dropping data, rewriting history, deleting a repo or a branch with unmerged work |
| A merge into a protected branch | Every delivery PR; with no remote there is no protection |
| Scope and stack of a new product | `/forge:kickoff` asks once, before scaffolding |
| A production deploy | `/forge:ship` stays manual |
| A decision reserved for a customer or stakeholder | A licence choice, a legal text, a vendor |

A one-way door found mid-run stops the run and batches the question. No approval for phase transitions,
status, or reversible technical choices; those are decided and logged. How each
stage works is in its skill (`skills/<name>/SKILL.md`) and workflow (`workflows/<name>.js`).
Validation depth per feature: `RISK-TIERS.md`.

| Gate | What blocks |
|---|---|
| Merge gate | No feature integrates with failing or missing tests |
| Review | Zero confirmed critical findings before `/forge:ship` |
| Ship | A NO-SHIP verdict blocks. Fix it, do not override it |
| Ship | The manual checklist (`templates/RELEASE-CHECKLIST.md`) before tag and deploy |
