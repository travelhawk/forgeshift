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
   - `docs/diagrams/*.svg` — the command-architecture diagram hand-lists every skill
     and workflow in `<text>` nodes; new commands get added to tables but not the SVG
     (confirmed 2026-07-07: /forge added everywhere except the SVG skill inventory)
   Found 2026-07-05: refuter count made severity-dependent but "2 refuters" survived in
   deep-review.js meta and README principle 4; new template added without updating the
   README templates row.

3. **New-skill internal contradictions (found 2026-07-07, /forge).** When a skill adds
   an autonomous multi-phase loop, check three spots against each other:
   - a baseline *exception* granted in step 0 (e.g. "pre-existing red recorded in
     PROGRESS.md is OK") vs an absolute mid-run gate ("red suite → stop") — the
     exception dies at the first gate that doesn't carve it out;
   - option validity conditions at an approval gate vs the partitioning logic that
     produced the options (overlap-based waves vs dependency-only wording);
   - normative gate sentences in docs/LIFECYCLE.md ("before anything merges to main")
     vs what the new skill actually automates — hard rule 4 (spec sync) makes this
     drift a defect, not a nit.

2. **settings.json allowlist creep via /retro.** New allow entries are motivated by real
   friction but tend to be scoped wider than the motivating use. Audit each new entry
   against two axes: (a) the ask-list pattern that all network egress (git push, gh,
   deploy CLIs) prompts — e.g. `curl *` broke it; (b) the local-data-loss class — git
   reset/restore/clean deliberately absent from allow, so entries like `git checkout *`
   / `git switch *` reopen silent `checkout -- .` / `--discard-changes` data loss.
   Note: `node *`/`python *`/`npx *` already grant arbitrary exec, so judge new entries
   by *accident probability for a well-meaning agent*, not raw capability.

4. **Skill-consumes-workflow-return, error path unhandled (fail-open gate; found 2026-07-07, /forge finish step).**
   When a skill fires a workflow and then reads named fields off the return
   (`confirmed`, `unverified`, ...), enumerate ALL of that workflow's top-level
   `return` statements — not just the happy path. Workflows here fail closed by
   returning `{error: ...}` (preflight agent flaked, target refused as a
   control-center, args mangled) and ALSO have early returns that omit fields
   (deep-review.js line 126: zero-findings returns `{confirmed:[]}` with NO
   `unverified`). If the skill has no branch for the error return, an LLM driver
   keys off absent fields → "nothing to fix, nothing ship-blocking" → emits a
   ship-ready verdict though the gate never actually ran. Section 4 of /forge gets
   this right ("a workflow-level error return is a stop condition"); the finish
   step (section 5) forgot to. Check: does the skill treat a workflow `{error}`
   return as ship-blocking, and does any field it reads have an early-return path
   that drops it?

**How to apply:** on any harness diff, grep for the old behavior's phrasing across
README.md, docs/*.md, and workflow `meta` blocks; diff settings.json entries against the
ask/deny intent, not just the deny literals. When a skill added/changed a call into a
workflow, open that workflow and grep `return` — every non-happy-path return is a
contract the skill must handle or fail-open.

**Verification quirk:** `node --check` on workflow scripts requires stripping the
leading `export ` (meta export) AND wrapping the body in `async function` (top-level
await/return are runtime-legal, not ESM-legal).
