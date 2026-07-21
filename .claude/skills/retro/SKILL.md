---
name: retro
description: Harness retrospective - mine the recent build work for friction (permission prompts, wrong defaults, misfiring prompts, playbook drift), propose ranked harness improvements, apply the approved ones locally, then offer to propose them upstream as a PR (the maintainer decides what merges). Use after finishing a project milestone or whenever the harness felt wrong.
argument-hint: "[optional: what felt wrong, in your words]"
disable-model-invocation: true
---

# /forge:retro — The harness improves from evidence, not theory

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

## 3. Apply (locally first)

Changes land in the local plugin install — `FORGE_HOME="${CLAUDE_PLUGIN_ROOT:-$(forge-home)}"`
— so THIS machine benefits immediately, before any upstream review. When `$FORGE_HOME` is a
git clone: one commit per approved change with the why in the message ("retro: allow pnpm
create — kickoff prompted 3x during recipes build"), suite green first per hard rule 8
(`npm test` there, when runnable). A marketplace-cache install has no repo — apply the edits
anyway and say plainly that the next plugin update will overwrite them, which makes the §4
PR the only durable path. Rejected proposals get one line in the closing commit body (or
the PR body) so the next retro doesn't re-propose them.

## 4. Propose upstream (ask — this is the swarm loop)

Forge improves as a swarm: every user's retro fixes their own install, and the good fixes
flow back as PRs — the repo owner alone decides what merges. Informed consent, so after
applying, show BEFORE asking — in one short block:

- **Exactly what would be sent:** the diff of the approved changes (file list + changes)
  and the draft PR body. This is ALL that leaves the machine — never the session, the
  product code, or anything else.
- **Where it goes and who reads it:** the upstream repo URL and its maintainer — plus
  anyone with access to that repo. Evidence lines cite the user's own build friction and
  can name their product; **offer to redact product-identifying details** before sending.
- **What gets created:** collaborators push a branch to the upstream; anyone else gets a
  fork `<their-login>/<repo>` created in **their own GitHub account** (server-side, free,
  private if the upstream is private, persists until they delete it). Requires a logged-in
  `gh`; the maintainer merges or declines — sending guarantees nothing.

Then ask ONE explicit question: **"Propose these changes upstream as a PR?"** Never skip
the question, never assume yes.

On yes:

1. Resolve the upstream: `git -C "$FORGE_HOME" remote get-url origin` (no remote or no
   repo → ask the user for the repo URL once).
2. **Base the branch on the remote, not on local state** — a stale or diverged local clone
   must not poison the PR: `git fetch origin`, then `git checkout -b retro/<slug>
   origin/<default-branch>` and re-apply the approved changes there (cherry-pick the §3
   commits, or re-edit). On a cache install, clone the remote into the scratchpad and apply
   the same edits in that clone.
3. Suite green in the PR working tree (`npm ci && npm test`) before pushing — hard rule 8.
4. Push the branch — collaborators push to the upstream directly. **Push rejected (not a
   collaborator)? Fork, don't stop:** `gh repo fork <upstream> --remote=true` (server-side,
   idempotent — reuses an existing fork), push the branch to the fork, and open the PR
   cross-repo: `gh pr create --repo <upstream> --head <your-login>:<branch>`. A private
   upstream can only be forked by users with read access and only if the maintainer has
   enabled "Allow forking" — if the fork call is rejected for that reason, say so and name
   that setting instead of retrying.
5. `gh pr create` with the evidence per change in the body (friction observed → exact
   change → expected effect; rejected proposals listed). `gh` missing or unauthenticated →
   report the manual push + PR steps instead of failing silently.
6. **Never merge it.** The PR is a proposal; the maintainer reviews and decides. Report the
   PR URL and move on.

On no: the local changes stand; note in the report that they are local-only (and on a cache
install won't survive a plugin update).

## 5. Close

Report: changes applied, expected effect, rejected-with-reason, and the upstream outcome
(PR URL, declined, or not applicable). If a friction item needs real redesign (not a
tweak), don't botch it inline — record it and recommend a dedicated session.

**Next →** back to product work — resume `/forge:build`/`/forge:feature`, or a dedicated session for
any redesign item this retro recorded but didn't fix.
