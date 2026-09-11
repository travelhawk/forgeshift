---
name: review-heuristic-workflow-pin-tests
description: GH Actions shape-pin tests must assert the fragile preconditions (fetch-depth, concurrency, permissions), not just the feature's visible tokens
metadata:
  type: feedback
---

When a regression test pins a GitHub Actions workflow by regex (the only option — CI YAML
can't execute locally), check it asserts the lines whose *removal silently disables* the
feature, not just the lines that advertise it.

**Why:** version-bump.yml review (2026-08-07): the pin test matched `branches: [main]`,
`contents: write`, `github.event.before`, `[skip ci]` — but not `fetch-depth: 0`. On a
default shallow checkout, `git show $BEFORE_SHA:file` fails ("bad object"), the guard reads
previous='' and concludes "version already moved", and the auto-bump never fires again —
suite stays green. The most load-bearing line is usually an option on a `uses:` step, not
the feature's own tokens.

**How to apply:** for every workflow pin test, ask: which checkout/concurrency/permission
option does the run step's logic depend on? Demand a match for each. Related: a script's
default-argument branch used by the workflow but not by the test — prove it by copying the
script + fixture tree into the scratchpad and running argument-less (running in-repo would
mutate a tracked file; reviewers are read-only). See [[review-heuristic-scan-surface-gap]]
for the general "guard exists but its reach is unproven" family.
