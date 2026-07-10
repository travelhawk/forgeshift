---
name: feature
description: Build one feature through the full quality loop - plan, failing test, implement, fresh-context verify. Use for any feature or task from the spec/PROGRESS.md, or an ad-hoc feature request during a build.
argument-hint: "[feature description or F# from the spec]"
---

# /feature — One feature through the loop

Build "$ARGUMENTS" tests-first with independent verification. One feature per
invocation; a whole backlog belongs in `/forge` (one approval, waves of parallel
builds, PR per feature) and a raw batch without PR ceremony in the `feature-pipeline`
workflow — point the user there when they list 3+ items.

## 1. Anchor

- Establish the target product first: cd into its directory (`projects/<name>/` when
  run from the harness root). Multiple products and it's ambiguous → ask.
- Find the feature in `docs/SPEC.md` / `PROGRESS.md` if it exists there; use its
  done-criteria. Ad-hoc feature → write 2-5 checkable done-criteria now and get a nod.
- **Read its risk tier** (the `T?` marker on the feature's row). Ad-hoc / untagged →
  classify it now by capability signal (`docs/RISK-TIERS.md`; ties break upward). The
  argument may override for this run — `/feature F3 as tier 1` wins over the recorded
  tag; state the tier and why you're using it. The tier sets validation depth in the
  steps below.
- Run the existing test suite first. Starting from red means fixing that first or
  explicitly recording that the red is pre-existing and unrelated.
- Note remote status (`git remote get-url origin`); a GitHub remote with `gh auth
  status` passing enables the PR flow in step 5. No remote → step 5 falls back to a
  local merge.

## 2. Plan — size it honestly

- **Small** (single file, describable diff in one sentence): plan inline, skip ceremony.
- **Medium**: show the inline plan — approach, files to touch, test plan — and proceed
  without waiting for approval; the user can interrupt.
- **Large or judgment-heavy** (new subsystem, data-model change, security-relevant):
  delegate planning to `forge-blueprint`, record the plan as `docs/features/F<#>.md` from
  `templates/FEATURE.md` (harness root), and **block on user approval** before building.
- **Integrates an external HTTP API** (a raw-`fetch` adapter behind an interface, no
  vendor SDK)? Capture the verified request/response contract *now*, at plan time —
  delegate to `forge-prospector` (it has web access) to confirm the endpoint, auth header,
  request-body shape, and the success/error signal against live vendor docs, and record it
  in the plan (or the feature doc). `forge-quench` has **no network** and cannot check
  adapter fidelity itself; the recorded contract is the spec it verifies the code against.
  Skip this and a faithful-looking-but-wrong adapter passes review (e.g. Postmark returns a
  non-zero `ErrorCode` inside an HTTP 200 — only the docs tell you that).

## 3. Build

- The feature builds on its own branch `feature/<F#-or-slug>` — **never commit a
  feature straight to main**. It integrates only through step 5's PR (or the
  local-merge fallback), and only after step 4 verification passes. Even a trivial
  one-line fix gets a branch and a PR — the PR is the review record.
- Implement per the plan — yourself for small work, via `forge-hammer` for medium+
  (give it the plan, done-criteria, and paths; it works tests-first and commits per
  green cycle). Never delete or weaken existing tests to get to green.
- **Build effort follows the tier** (orthogonal to the size sizing above): **T1** builds
  tests-first at high/xhigh effort; **T2** tests-first at high; **T3** boilerplate builds
  fast — delegate to `forge-hammer` on **Sonnet** at medium effort (well-defined
  execution), with a smoke test (compiles/renders + one happy path) as its test, not an
  exhaustive suite.

## 4. Verify (fresh context — depth follows the tier)

The verifier always sees only the result, not the build reasoning. Fix CONFIRMED
critical/high findings immediately; judge medium/low with the user if the fix isn't
obvious. Branch by risk tier (`docs/RISK-TIERS.md`):

- **T1** — `forge-quench` on the diff **and** a parallel security/adversarial pass
  (`forge-warden`, or a `deep-review` scoped to this feature's diff). The feature is done
  only when **both** pass. Verify covers the failure/edge paths, not just the happy one.
- **T2** — one `forge-quench` fresh-context pass on the diff. Core coverage; skip
  exhaustive edge-case grinding.
- **T3** — smoke check only: it builds, it renders/boots, the happy path works. No
  `forge-quench` pass. The integrated `deep-review` (in `/forge`, or `/deep-review`
  before ship) is the safety net that still sweeps T3.

**Tier overrides the cosmetic-skip allowance upward:** a T1 change never skips verify,
however small. The "cosmetic changes may skip" shortcut applies to T3 only — say so
explicitly when you take it.

## 5. Integrate — one PR per feature

Verification green (step 4) → the feature branch integrates through a PR, never a
direct push to main:

- Push the branch: `git push -u origin feature/<...>`.
- Open the PR with evidence: `gh pr create --head feature/<...> --base main
  --title ... --body-file <scratchpad file>` — body = one-line summary, the
  done-criteria as a checklist, and the step-4 verification evidence (test names +
  output, review verdict). `--head` is required; the session checkout stays on main,
  never on the feature branch.
- Leave the PR open for you to review and merge — `/feature` is the supervised lane,
  so the merge call is yours. Ask and it squash-merges for you (`gh pr merge <n>
  --squash --delete-branch`); otherwise the report hands you the PR link.
- **No GitHub remote:** offer `gh repo create --private --source .` once. Declined →
  fall back to `git merge --no-ff feature/<...>` into main (the merge commit is the
  audit trail) — still never an unreviewed fast-forward onto main.

## 6. Close

- Tick the feature in `PROGRESS.md` **only after** done-criteria are demonstrably met —
  paste the evidence (test names + output) into the session log line, and note the PR
  (`#N`, open or merged).
- Update `docs/SPEC.md` if the implementation legitimately deviated from it.
- Commit(s) are already granular from the build; ensure the final state is committed and
  the branch pushed.
- Report: what shipped, evidence, the PR link, deviations, and the natural next feature.

## Escalation

Two failed attempts at the same problem → stop grinding: `/debug-hard` for bugs,
`forge-blueprint` (or the `design-panel` workflow) for design dead-ends. A third identical
attempt is banned.
