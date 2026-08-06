# Build Lifecycle

The loop every Forge product moves through. Skills automate the transitions; you stay at the
gates.

```
 IDEA ──► /forge:kickoff ──► SPEC + STACK + SCAFFOLD
                            │
                 ┌──────────▼──────────┐
                 │   FEATURE LOOP      │  /forge:feature (one) ·
                 │  plan → test →      │  /forge:build (whole backlog, waves of PRs) ·
                 │  build → verify     │  feature-pipeline workflow (raw batch)
                 └──────────┬──────────┘
                            │  gate: /forge:deep-review  (+ /forge:harden before exposure)
                            ▼
                        /forge:ship ──► release-gate workflow ──► deploy
                            │
                            ▼
                  feedback → /forge:next → SPEC (next version) → loop
```

## 1. Kickoff (`/forge:kickoff`)

Idea → interview → `docs/SPEC.md` → stack from a playbook → scaffolded repo with its own git
history, CLAUDE.md, and CI-ready test setup. Wide-open design questions go to the
`design-panel` workflow rather than being guessed.
**Gate: you approve spec and stack before scaffolding.**

## 2. Feature loop (`/forge:feature` / `/forge:build` / `feature-pipeline`)

One feature interactively, a raw batch in parallel worktrees, or the whole backlog via
`/forge:build` (one wave-plan approval → waves of parallel builds → one PR per feature → merge
in dependency order). Always tests-first:

1. **Plan** — smallest change meeting the done-criteria, fitting existing conventions
2. **Test** — the failing test that encodes the done-criteria
3. **Build** — implement until green
4. **Verify** — fresh-context check against the plan, never the builder grading itself

Depth branches on the feature's **risk tier** ([RISK-TIERS.md](RISK-TIERS.md)), identically in
every lane.

**Gate: no feature merges with failing or missing tests.** No exceptions "just this once". A
smoke test is the *right-sized* test for T3 — never zero tests, never a weakened one.

## 3. Review (`/forge:deep-review`)

Before anything user-facing ships, and before manual merges outside `/forge:build`'s gated
flow: six-dimension review with adversarial verification, so only CONFIRMED findings come back.
`/forge:build` fires it automatically on the integrated result (auto-integrate and local modes;
skipped in review-PRs mode and on opt-out) — confirmed critical/high fixed on the spot in
`/forge:fix` discipline, medium/low into the report. For UI products the finish also produces a
Playwright **visual walkthrough** (flow videos + screen overview; fail-soft, never a blocker).
**Gate: zero confirmed critical findings before `/forge:ship`.**

## 4. Hardening (`/forge:harden`)

Once per project before first public exposure, and after auth/payment/data-model changes.
Security audit + robustness pass (boundary validation, failure modes, secrets hygiene, rate
limiting where public).

## 5. Ship (`/forge:ship`)

Release commit (CHANGELOG + version bump) → `release-gate` workflow (static/security/docs in
parallel, then tests → build → runtime smoke) → manual checklist from
`templates/RELEASE-CHECKLIST.md` → tag, deploy, live smoke test.
**Gate: a NO-SHIP verdict blocks. Fix, don't override.**

## 6. Bugfix loop (`/forge:fix`)

Bugs skip feature ceremony: reproduce → failing regression test → smallest fix →
`forge-quench` on the diff → patch `/forge:ship` with the abbreviated manual checklist (only
the broken journey re-walked; the automated gate always runs in full). Two failed attempts →
`/forge:debug-hard`.

## 7. Feedback → next version (`/forge:next`)

Feature-shaped feedback goes into `docs/SPEC.md` as new features or revisions, not straight into
code — the spec stays the source of intent. `/forge:next` clarifies the ideas (a lighter,
spec-aware interview than kickoff), appends them as the next version's tiered features, and
hands the slice to the build under a single approval. **`/forge:kickoff` births a product,
`/forge:next` grows it, `/forge:build` is the builder both hand off to.** Bug-shaped feedback
goes to `/forge:fix`.

Cross-stage rules live in `CLAUDE.md` § Hard rules. The bolded gates above are the only points
where a skill stops and waits for you; everywhere else it runs.
