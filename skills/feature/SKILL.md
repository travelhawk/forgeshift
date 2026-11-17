---
name: feature
description: Build one feature through the quality loop - failing test, implement, full suite, and a fresh-context security pass where the risk calls for it. Use for any feature or task from the spec/PROGRESS.md, or an ad-hoc feature request during a build.
argument-hint: "[feature description or F# from the spec]"
---

# /forge:feature — One feature through the loop

Build "$ARGUMENTS" tests-first. This is also the **focused task** lane: a task in plain words
goes context → plan → build → verify → PR with no backlog, no issue and no spec row needed.
You own the outcome, and nothing waits for a human until the PR is open. One feature per
invocation; a whole backlog belongs in `/forge:build`, and a raw batch of
(3+) independent items in the `feature-pipeline` workflow — point the user there when they
list several.

## 1. Anchor

- Establish the target product (ambiguous → ask, then `cd`).
- Find the feature in `docs/SPEC.md` / `PROGRESS.md` and use its done-criteria. Ad-hoc →
  write 2–5 checkable ones now, state them, and go on. A criterion you had to guess at the
  product level (not a technical one) is the one thing worth a question.
- **Read its risk tier** (`T?` on the feature's row). Untagged → classify it:
  `FORGE_HOME="${FORGE_HOME:-${CLAUDE_PLUGIN_ROOT:-$(forge-home 2>/dev/null || ls -d ~/.claude/plugins/cache/forge/forge/*/ | sort -V | tail -1)}}"`, then
  `$FORGE_HOME/docs/RISK-TIERS.md`; ties up. `/forge:feature F3 as tier 1` overrides for this
  run. State the tier you use and why.
- Run the suite. A red start is fixed first, or recorded as pre-existing and unrelated.

## 2. Plan — as much as the feature needs

- **Small or clear** (the done-criteria say what to build): no separate plan. Whoever builds
  reads the code and plans inline.
- **T1, a new subsystem or a data-model change**: delegate the plan to `forge-blueprint` (or
  write it yourself on the session model), record it as `docs/features/F<#>.md` from
  `$FORGE_HOME/templates/FEATURE.md` and **build on it**. It stops for the user only if it
  contains a one-way door or changes what the user gets (`docs/LIFECYCLE.md` § Approval
  boundaries); a reversible design call is decided and logged.
- **Integrates an external HTTP API?** Have `forge-prospector` confirm endpoint, auth header,
  body shape and the success/error signal against the live vendor docs, and record that
  contract. Reviewers have no network: the recorded contract is all they can check the
  adapter against. Some APIs report failure inside an HTTP 200.

## 3. Build

- Own branch `feature/<F#-or-slug>` — **never commit a feature straight to main**.
- Build it yourself when it is small, else via `forge-hammer` with the done-criteria, the
  paths and the plan if there is one. T3 builds on the execute tier with a smoke test as its
  test.
- **The gate while building is `typecheck`, `lint` and the tests covering the diff.** The full
  suite and e2e run once, in step 4.
- **E2E: at most one spec, often none** — only for what no other layer can reach, written
  after the feature works.

## 4. Verify — fresh context only where the builder cannot check itself

Run the **full suite and the e2e suite here**, before integrating. That is the check for
every tier.

- **T1** — add one fresh-context pass (`forge-warden`) on the diff: security, plus the
  done-criteria on their failure paths. Done only when it passes. A T1 change never skips it,
  however small.
- **T2/T3** — no per-feature review. The `deep-review` before ship reads every line.

**The diff can raise the tier.** The tier came from the feature's description; the diff is
the truth. Read `git diff --merge-base HEAD <branch>` and name any sensitive surface in it:
authn/authz, a tenant-scoped query, an external-input parser, token/secret handling, raw SQL
or shell, output another program interprets. A named surface adds the T1 pass.
Raises depth only, never lowers it.

Fix CONFIRMED critical/high now. Medium/low: fix the cheap ones, list the rest in the PR
body; the user is not asked to triage.

## 5. Deliver — one PR for this task

One feature or task is one PR by definition here; whether a larger change should split is
`docs/LIFECYCLE.md` § PR boundaries. Text and conventions come from the product's own
standards (`AGENTS.md` § Standards).

- `git push -u origin feature/<...>`, then `gh pr create --head feature/<...> --base main
  --body-file <scratchpad>` — body = summary, done-criteria checklist, step-4 evidence.
  `--head` keeps the session checkout on main. Wait for the required checks and fix red ones.
- Leave the PR open: the merge into a protected branch is the user's call. On their word it
  squash-merges (`gh pr merge <n> --squash --delete-branch`).
- **No remote:** offer `gh repo create --private --source .` once; declined → `git merge
  --no-ff`. Never an unreviewed fast-forward onto main.

## 6. Close

- Tick `PROGRESS.md` **only** with pasted evidence, and note the PR. A focused task with no
  tracker row has nothing to tick: the PR body is the record. What the environment
  could not prove is reported **open**, never ticked.
- Update `docs/SPEC.md` only if what the user gets changed.
- Report: what shipped, evidence, PR link, deviations.
- **Next →** one command. Never `/forge:ship` while verification is red.

## Escalation

Two failed attempts at the same problem → stop: `/forge:debug-hard` for bugs, `forge-blueprint`
or `design-panel` for design dead-ends. A third identical attempt is banned.
