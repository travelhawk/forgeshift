---
name: defect-patterns-harness
description: Recurring defect classes in the Forge harness repo itself (meta/doc drift, settings.json allowlist creep) — check these first when reviewing harness changes
metadata:
  type: project
---

Recurring defect patterns when the diff target is the harness repo itself (not a product):

1. **Self-description drift.** Workflow behavior changes leave stale claims in:
   - the workflow's own `meta.phases[].detail` strings (top of each `.claude/workflows/*.js`)
   - README "Design principles" bullets and the "What's inside" inventory table
   - `docs/MODEL-ROUTING.md` "In this harness" normative claims about what workflows pass
   Found 2026-07-05: refuter count made severity-dependent but "2 refuters" survived in
   deep-review.js meta and README principle 4; new template added without updating the
   README templates row.

2. **settings.json allowlist creep via /retro.** New allow entries are motivated by real
   friction but tend to be scoped wider than the motivating use. Audit each new entry
   against two axes: (a) the ask-list pattern that all network egress (git push, gh,
   deploy CLIs) prompts — e.g. `curl *` broke it; (b) the local-data-loss class — git
   reset/restore/clean deliberately absent from allow, so entries like `git checkout *`
   / `git switch *` reopen silent `checkout -- .` / `--discard-changes` data loss.
   Note: `node *`/`python *`/`npx *` already grant arbitrary exec, so judge new entries
   by *accident probability for a well-meaning agent*, not raw capability.

**How to apply:** on any harness diff, grep for the old behavior's phrasing across
README.md, docs/*.md, and workflow `meta` blocks; diff settings.json entries against the
ask/deny intent, not just the deny literals.

**Verification quirk:** `node --check` on workflow scripts requires stripping the
leading `export ` (meta export) AND wrapping the body in `async function` (top-level
await/return are runtime-legal, not ESM-legal).
