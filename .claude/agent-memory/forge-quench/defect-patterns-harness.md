---
name: defect-patterns-harness
description: Recurring defect classes in the Forge harness repo itself (meta/doc drift, settings.json allowlist creep, diverged numeric thresholds across sibling skills, cross-skill run-state schema/boundary refs, eval-sim canned-preflight lag leaving new branches unexercised) — check these first when reviewing harness changes
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

5. **Model-routing changes — the four surfaces that must agree (found 2026-07-07, session-model refactor 3572f00).**
   When agent `model:` pins or workflow `agent()` model args change, cross-check FOUR spots
   or one goes stale: (a) each agent's own `description:` frontmatter (it names the tier —
   "on Fable 5" vs "on the session model"); (b) `docs/MODEL-ROUTING.md` "In this harness"
   bullets AND the routing table rows; (c) README "What's inside" specialists row +
   `docs/diagrams/command-architecture.svg` `<text>` tier labels; (d) CLAUDE.md model-routing
   short form. `model: inherit` IS valid Claude Code subagent frontmatter (documented enum
   sonnet|opus|haiku|inherit; inherit = main-conversation model) — not a defect. Workflow
   `agent()` opts take string model names ('haiku'/'sonnet'); omitting `model:` = inherit
   session. 3572f00 was clean on all four surfaces — no leftover `model: fable` pin, brand
   name F.O.R.G.E.=Fable-Orchestrated correctly preserved as non-defect.

6. **Threshold/number change — sweep sibling skills that name the same number (found 2026-07-15, /forge pipeline threshold 3+→4+).**
   When a diff raises/lowers a numeric threshold in one skill (e.g. `/forge`'s "pipeline
   fires at 4+ features, 1–3 use the direct loop"), grep the OLD number across ALL skills,
   not just the changed one. `/feature`'s SKILL.md still said "point the user to
   feature-pipeline at **3+** items" — a diverged threshold for the same "when is the
   feature-pipeline worth its overhead" question. The rationale attached to the change
   (fixed-overhead-of-the-workflow) is usually general, so any sibling that names the old
   number goes stale even if the diff didn't touch it. Also watch loose cost-summaries
   ("each wave is a feature-pipeline run") that a widened exception range makes more wrong.

7. **Cross-skill run-state (`.forge/run.json`) coherence — check schema + boundary refs (found 2026-07-15).**
   New multi-skill state files (`/forge`+`/next` write, `/resume` reads) need three checks:
   (a) every field a reader consumes is written by some writer (this diff was complete:
   baseline_sha/integration_mode/known_red/per-feature tier/branch/pr/evidence all wired);
   (b) status vocabularies — writer wrote `pending`/`merged`/`failed`, reader derived a
   richer `PR-open`/`built`/`not-started`; benign ONLY because the file is explicitly
   non-authoritative and the reader re-derives from git (if any step trusted the stored
   status to branch, this would break); (c) **boundary cross-refs** — `/forge` §0 and
   `/next` §4 claim run.json is "updated at every boundary in §4/§5", but §5 (Finish) has
   NO run.json-update step; only §4 does. A pointer to a section for behavior that section
   doesn't implement is a dangling ref, even when re-derivation masks the impact.

8. **Eval-sim canned preflight lags a new preflight-schema field → the new code branch it gates is never exercised (found 2026-07-15, worktree-script extraction).**
   `evals/sim.mjs` `preflightOK` is a frozen object (path/exists/isGitRepo/hasCode/
   isControlCenter/cwdIsTarget). When a workflow adds a preflight field that SELECTS a new
   agent-prompt branch (here `scriptsDir` → `SCRIPTS`/`WT` → the "agents call
   forge-worktree.sh" path), the sim keeps returning the old object, so `WT===null` and the
   orchestration eval only ever walks the INLINE fallback. Agent *counts* stay identical (the
   field only changes prompt TEXT, not the number of agents), so the count-based eval passes
   and looks like coverage — but the headline behavior of the change has ZERO execution. Pair
   this with a static test that also only asserts the SCRIPT side: the `deterministic
   plumbing` test checks `wt.includes('new-build'|'new-detached'|'clean')` against the SHELL
   script and `fp.match(/forge-worktree\.sh/)` against the workflow, but never asserts the
   workflow's WT-branch emits the correct subcommand *tokens*. Net: a JS-prompt-only drift
   (e.g. workflow says `newbuild`, script keeps `new-build`) ships green. Check: when a diff
   adds a preflight field that gates a prompt branch, does `preflightOK` (or a scenario
   override) set it so an eval walks the new branch, AND does a test assert the branch's
   emitted command string, not just the target script's own vocabulary?

**How to apply:** on any harness diff, grep for the old behavior's phrasing across
README.md, docs/*.md, and workflow `meta` blocks; diff settings.json entries against the
ask/deny intent, not just the deny literals. When a skill added/changed a call into a
workflow, open that workflow and grep `return` — every non-happy-path return is a
contract the skill must handle or fail-open. On model-routing diffs, grep the OLD tier
name (e.g. `fable`/`Fable`) across agents+workflows+docs+svg and confirm each hit is
either the brand name or the intended new framing.

**Verification quirk:** `node --check` on workflow scripts requires stripping the
leading `export ` (meta export) AND wrapping the body in `async function` (top-level
await/return are runtime-legal, not ESM-legal).
