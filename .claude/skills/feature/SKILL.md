---
name: feature
description: Build one feature through the full quality loop - plan, failing test, implement, fresh-context verify. Use for any feature or task from the spec/PROGRESS.md, or an ad-hoc feature request during a build.
argument-hint: "[feature description or F# from the spec]"
---

# /forge:feature — One feature through the loop

Build "$ARGUMENTS" tests-first with independent verification. One feature per invocation; a
whole backlog belongs in `/forge:build`, and a raw batch of (3+) independent items in the
`feature-pipeline` workflow — point the user there when they list several.

## 1. Anchor

- Establish the target product (normally the directory you launched `claude` in; ambiguous →
  ask, then `cd`).
- Find the feature in `docs/SPEC.md` / `PROGRESS.md` and use its done-criteria. Ad-hoc →
  write 2–5 checkable ones now and get a nod.
- **Read its risk tier** (`T?` on the feature's row). Untagged → classify by capability
  signal (`FORGE_HOME="${CLAUDE_PLUGIN_ROOT:-$(forge-home 2>/dev/null || ls -d ~/.claude/plugins/cache/forge/forge/*/ | sort -V | tail -1)}"`, then
  `$FORGE_HOME/docs/RISK-TIERS.md`; ties up). `/forge:feature F3 as tier 1` overrides for this
  run — state the tier you're using and why.
- Run the suite. Starting red means fixing it first, or recording explicitly that the red is
  pre-existing and unrelated.
- Note remote status; a GitHub remote with `gh auth status` passing enables step 5's PR flow.

## 2. Plan — size it honestly

- **Small** (one file, diff describable in a sentence): plan inline, skip ceremony.
- **Medium**: show the inline plan and proceed without waiting; the user can interrupt.
- **Large or judgment-heavy** (new subsystem, data-model change, security-relevant): delegate
  to `forge-blueprint`, record it as `docs/features/F<#>.md` from
  `$FORGE_HOME/templates/FEATURE.md`, present it as an artifact/link, and **block on approval**.
- **Integrates an external HTTP API?** Capture the verified request/response contract *now* —
  delegate to `forge-prospector` (it has web access) to confirm endpoint, auth header, body
  shape and the success/error signal against live vendor docs. `forge-quench` has no network;
  the recorded contract is the only spec it can verify the adapter against. Skip this and a
  faithful-looking-but-wrong adapter passes review (Postmark returns a non-zero `ErrorCode`
  inside an HTTP 200 — only the docs tell you that).

## 3. Build

- Own branch `feature/<F#-or-slug>` — **never commit a feature straight to main**. Even a
  one-line fix gets a branch; the PR is the review record.
- Implement yourself for small work, via `forge-hammer` for medium+ (give it the plan,
  done-criteria and paths). **Effort follows the tier:** T1 tests-first at high/xhigh, T2
  tests-first at high, T3 fast on **Sonnet** at medium with a smoke test as its test.
- **The gate while building is `typecheck`, `lint` and the tests covering the diff** — not the
  full suite on every cycle. Full suite and e2e run once, at step 4, before integration.
- **E2E: at most one spec for this feature, often none** — only for what no other layer can
  reach. Written after the feature works, never e2e-first.

## 4. Verify (fresh context — depth follows the tier)

The verifier sees only the result, never the build reasoning. Run the **full suite and the
e2e suite here**, before integrating. Fix CONFIRMED critical/high immediately; judge
medium/low with the user if the fix isn't obvious.

**Post-build tier re-check (T2/T3):** the tier was seeded from the feature's *description*;
the built diff is the truth. A cheap Haiku pass reads `git diff --merge-base HEAD <branch>`
and escalates to the T1 security pass if the diff touched a tenant-scoped query, an
external-input parser, token/secret handling, authn/authz, or raw SQL/shell.
Raises depth only, never lowers it.

- **T1** — `forge-quench` on the diff **and** a parallel security pass (`forge-warden`, or a
  `deep-review` scoped to this diff). Done only when both pass; verify covers failure paths.
  **Scope the review to the diff** — an unscoped audit over the surrounding subsystem can cost
  more than the feature took to build.
- **T2** — one `forge-quench` pass on the diff. Core coverage, no edge-case grinding.
- **T3** — smoke check only: builds, renders, happy path. No `forge-quench`; the integrated
  `deep-review` before ship is the net that sweeps T3.

A T1 change never skips verify, however small. The cosmetic-skip shortcut is T3-only — say so
when you take it.

## 5. Integrate — one PR per feature

- `git push -u origin feature/<...>`, then `gh pr create --head feature/<...> --base main
  --body-file <scratchpad>` — body = summary, done-criteria checklist, step-4 evidence.
  `--head` is required so the session checkout stays on main.
- Leave the PR open; this is the supervised lane, the merge call is the user's. Ask and it
  squash-merges (`gh pr merge <n> --squash --delete-branch`).
- **No remote:** offer `gh repo create --private --source .` once; declined → `git merge
  --no-ff` (the merge commit is the audit trail). Never an unreviewed fast-forward onto main.

## 6. Close

- Tick `PROGRESS.md` **only** with pasted evidence, and note the PR. Report anything the
  environment could not prove as **open**, never ticked.
- Update `docs/SPEC.md` if the implementation legitimately deviated.
- Report: what shipped, evidence, PR link, deviations, next feature.
- **Next →** one command. Never `/forge:ship` while verification is red.

## Escalation

Two failed attempts at the same problem → stop grinding: `/forge:debug-hard` for bugs,
`forge-blueprint` or `design-panel` for design dead-ends. A third identical attempt is banned.
