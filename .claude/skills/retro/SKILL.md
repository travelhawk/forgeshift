---
name: retro
description: Harness retrospective - mine the recent build work for friction (permission prompts, wrong defaults, misfiring prompts, playbook drift), propose ranked harness improvements, apply the approved ones as commits. Use after finishing a project milestone or whenever the harness felt wrong.
argument-hint: "[optional: what felt wrong, in your words]"
disable-model-invocation: true
---

# /retro — The harness improves from evidence, not theory

User's observation, if any: "$ARGUMENTS"

The harness is code; this is its feedback loop. Every change proposed here must trace
to OBSERVED friction — no speculative features, no "while we're at it".

## 1. Gather evidence

- The user's observation above — start there, it's the highest-signal input.
- PROGRESS.md session logs of recently built products: repeated manual steps, escalations,
  reverted work, "don't touch X" traps that should be playbook gotchas.
- Harness git log since the last retro: what got hot-fixed mid-build? Those patches are
  friction telling you where the design was wrong.
- Ask the user 2-3 batched questions max: where did you wait on permission prompts?
  Which agent output did you routinely edit? Which gate felt like theater?

## 2. Classify and propose (max 5, ranked by expected saved pain)

For each friction item, the fix lands in the right layer:

| Friction type | Fix layer |
|---|---|
| Permission prompt for a routine safe command | `settings.json` allowlist |
| Agent output needed the same correction twice | that agent's `.md` prompt |
| A skill step was ambiguous or wrong in practice | that `SKILL.md` |
| Stack default aged or scaffold command drifted | the playbook (+ new as-of date) |
| Model too big/small for a stage | workflow `model:`/`effort:` or agent frontmatter |
| A rule everyone kept re-explaining | CLAUDE.md (and something stale comes OUT) |

Present the ranked list with, per item: the observed evidence, the exact change, the
expected effect. Let the user approve/reject per item.

## 3. Apply

One commit per approved change with the why in the message ("retro: allow pnpm create —
kickoff prompted 3x during recipes build"). Rejected proposals get one line in the
commit body of the retro's closing commit so the next retro doesn't re-propose them.

## 4. Close

Report: changes applied, expected effect, rejected-with-reason. If a friction item
needs real redesign (not a tweak), don't botch it inline — record it and recommend a
dedicated session.

**Next →** back to product work — resume `/forge`/`/feature`, or a dedicated session for
any redesign item this retro recorded but didn't fix.
