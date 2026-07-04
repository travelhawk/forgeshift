# Build Lifecycle

The loop every product built with Forge moves through. Skills automate the transitions;
you stay at the decision points.

```
 IDEA ──► /kickoff ──► SPEC + STACK + SCAFFOLD
                            │
                 ┌──────────▼──────────┐
                 │   FEATURE LOOP      │  /feature (one) or
                 │  plan → test →      │  feature-pipeline workflow (batch)
                 │  build → verify     │
                 └──────────┬──────────┘
                            │  gate: /deep-review  (+ /harden before exposure)
                            ▼
                        /ship ──► release-gate workflow ──► deploy
                            │
                            ▼
                     feedback → back into SPEC → loop
```

## Stages & gates

### 1. Kickoff (`/kickoff`)
Idea → interview → `docs/SPEC.md` → stack choice from a playbook → scaffolded repo with
its own git history, CLAUDE.md, and CI-ready test setup. **Gate: you approve the spec and
stack before scaffolding.** For wide-open design questions, kickoff runs the
`design-panel` workflow instead of guessing.

### 2. Feature loop (`/feature` / `feature-pipeline`)
One feature at a time interactively, or a batch of independent features in parallel
worktrees. Always tests-first:

1. **Plan** — smallest change that meets the done-criteria, fitting existing conventions
2. **Test** — write the failing test that encodes the done-criteria
3. **Build** — implement until green, full suite still green
4. **Verify** — fresh-context check against the plan (not the builder grading itself)

**Gate: no feature merges with failing or missing tests.** No exceptions "just this once".

### 3. Review (`/deep-review`)
Before anything user-facing merges to main: six-dimension review with adversarial
verification. Only CONFIRMED findings come back — fix criticals/highs, judge the rest.
**Gate: zero confirmed critical findings.**

### 4. Hardening (`/harden`)
Once per project before first public exposure, and after auth/payment/data-model changes.
Security audit + robustness pass (input validation at boundaries, failure modes, secrets
hygiene, rate limiting where public).

### 5. Ship (`/ship`)
Prepares the release commit (CHANGELOG + version bump) → runs the `release-gate`
workflow (static/security/docs parallel, then tests → build → runtime smoke) → manual
checklist from `templates/RELEASE-CHECKLIST.md` → tag, deploy, live smoke test.
**Gate: NO-SHIP verdict blocks. Fix, don't override.**

### 6. Bugfix loop (`/fix`)
Production bugs and broken behavior skip feature ceremony: reproduce → regression test
that fails → smallest fix → `forge-reviewer` on the diff → patch `/ship` with the
abbreviated manual checklist (only the broken journey re-walked; the automated gate
always runs in full). Bugs that survive two attempts escalate to `/debug-hard`.

### 7. Feedback
Feature-shaped feedback goes back into `docs/SPEC.md` as new features or revisions —
not straight into code. The spec stays the source of intent. Bug-shaped feedback goes
to `/fix` directly.

## Rules that hold across all stages

- **Spec drift is a bug.** When implementation legitimately deviates, update the spec in
  the same change.
- **Decisions get ADRs.** Anything you'd have to re-explain in 3 months →
  `docs/adr/NNN-*.md` from `templates/ADR.md`.
- **Commit granularity = one reviewable idea.** Agents commit after each green
  test-build cycle, not one mega-commit per session.
- **Escalate stuck work, don't grind.** Two failed attempts at the same problem → change
  the approach: `/debug-hard` (Fable), `design-panel`, or ask the user. Third identical
  attempt is banned.
- **You are the product owner.** Agents propose, verify, and build; scope and taste calls
  stay with you. Skills pause at the gates marked above.
