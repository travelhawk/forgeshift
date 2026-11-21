---
name: defect-patterns-harness-quench
description: Recurring defect classes when reviewing forge harness diffs that move a check, a state path or an ignore rule (found 2026-11-21 on the autonomy-lean PR); check these first. Older classes live in ../forge-quench/defect-patterns-harness.md
metadata:
  type: project
---

Recurring harness defect classes, in the order they paid off (2026-11-21, autonomy-lean PR):

1. **Ignore rule widened to a shared namespace.** Moving forge state into a cross-tool folder
   (`.agents/` is also the Agent Skills repo path Codex/OpenCode read, and forge's own
   `install.mjs --project` writes `.agents/skills/forge-*`) and then ignoring the WHOLE parent
   folder (`.gitignore` at kickoff, `.git/info/exclude` via `forge-git.mjs ignore-local`) hides
   user-owned files from `git status`/`git add -A` silently. Prove it with a temp repo:
   tracked `.agents/skills/x`, run ignore-local, add a new skill, `git status` is empty.
   **Why:** exclude-file edits are invisible and outlive the run.
   **How to apply:** any ignore change → ask "does this path cover only forge-owned files?"

2. **Check moved from per-item to an aggregate later step.** When a per-feature pass is replaced
   by "goes into the finish review's priority", check (a) the data the later step needs is
   persisted in run-state (`run.json` schema) so resume/compaction keep it, (b) every lane that
   used the old check still reaches the new one — the direct-use skill wrapper
   (`skills/feature-pipeline/SKILL.md`) lagged the workflow and still promised the old pass.

3. **Precondition the flow itself makes unsatisfiable.** "Passes only when review read every
   commit since the last tag" while the same skill commits the release BEFORE the gate:
   fail-closed, but the advertised shortcut is dead. Grep the step order around any new
   precondition.

Sim probe trick: `evals/sim.mjs` exports `runWorkflow`, `featurePipelineResponder`, `SCENARIOS`;
a scratch `.mjs` importing them (file:/// URL) proves workflow verdict logic in seconds.
See also [[defect-patterns-harness]] (meta/doc drift, run-state coherence, fail-open returns).
