---
name: retro
description: Harness retrospective - turn observed friction from real builds into approved, committed changes to the skills, agents, playbooks and rules. Use after a build run that felt wrong, or periodically.
argument-hint: "[what felt wrong, if anything]"
---

# /forge:retro — the harness improves from evidence, not theory

User's observation, if any: "$ARGUMENTS"

Every change proposed here traces to **observed** friction. No speculative features, no
"while we're at it".

## 1. Gather evidence

- **The user's observation is the highest-signal input** — start there.
- **Measure, don't recall.** If the complaint is about time, get real numbers before proposing
  anything: per-agent `duration_ms` from this session's subagent results, `.forge/run.json`
  stage marks, suite runtimes. Group them **parallelism-aware** (a wave's cost is its slowest
  member, not the sum) and report the split — building vs. reviewing vs. fixing vs. gates. A
  retro that answers "where did the time go" with an impression is worthless; the biggest
  single line item is usually not where anyone guessed.
- `PROGRESS.md` session logs: repeated manual steps, escalations, reverted work, traps that
  should be playbook gotchas.
- Harness git log since the last retro: what got hot-fixed mid-build? Those patches mark where
  the design was wrong.
- Ask **2–3 batched questions max**: where did you wait on permission prompts, which agent
  output did you routinely edit, which gate felt like theater.

## 2. Classify and propose (max 5, ranked by expected saved pain)

| Friction | Fix layer |
|---|---|
| Permission prompt for a routine safe command | `settings.json` allowlist |
| Agent output needed the same correction twice | that agent's `.md` |
| A skill step was ambiguous or wrong in practice | that `SKILL.md` |
| Stack default aged, scaffold command drifted | the playbook (+ new as-of date) |
| Model too big/small for a stage | workflow `model:`/`effort:` or agent frontmatter |
| A rule everyone kept re-explaining | `CLAUDE.md` (and something stale comes OUT) |

Per item: the observed evidence, the exact change, the expected effect. The user approves or
rejects each.

## 3. Apply — generalize first

Changes land in the local install (`FORGE_HOME="${CLAUDE_PLUGIN_ROOT:-$(forge-home)}"`), so
this machine benefits immediately.

**The harness is product-agnostic. The evidence never is.** Every lesson arrives wearing the
clothes of the product that produced it — a framework, a database, a language, a domain noun.
Strip them:

- **Name the mechanism, not the instance.** "Leaked test workers starve later waves" is a rule;
  "kill orphaned vitest workers" is a note about one product's toolchain.
- **A trap belongs in the harness only if it recurs across products.** One that is real but
  specific to a stack belongs in that **playbook**; one specific to a single product belongs in
  **that product's** `CLAUDE.md`, not here. Ask per item: would this still be true for a CLI
  tool in Rust? No → it is not a harness change.
- **Grep before you commit.** Search the files you touched for the product's name, its
  framework, its libraries and its domain vocabulary. Playbooks are the one place stack names
  legitimately live.
- Keep the *number* that made the case (a measured duration, a failure count) — numbers are
  evidence, and evidence is what stops the next retro re-litigating this one.

**Cut prose, never contracts.** `tests/harness.test.mjs` pins exact phrases because they encode
contracts. Rewording one breaks its test — that is the test doing its job, not a nuisance.
Restore the phrase; do not relax the regex, and never delete a test to get green (hard rule 1).
A pinned phrase must also survive line-wrapping: a regex with a literal space does not match
across a newline.

Suite green before any commit (hard rule 11), one commit per approved change with the why in
the message ("retro: allow pnpm create — kickoff prompted 3x during recipes build"). Rejected
proposals get one line in the closing commit body so the next retro does not re-propose them.

**A marketplace-cache install has no repo** — apply the edits anyway, and say plainly that the
next plugin update overwrites them, which makes the §4 PR the only durable path. Its
git-dependent tests cannot pass in a cache; note them as environmental rather than "fixing"
them.

## 4. Propose upstream (ask — this is the swarm loop)

Forge improves as a swarm: each user's retro fixes their own install, the good fixes flow back
as PRs, the repo owner decides what merges. **Informed consent — show before asking:**

- **Exactly what would be sent:** the diff of the approved changes and the draft PR body. This
  is ALL that leaves the machine — never the session, never product code. Evidence lines can
  name the user's product; **offer to redact product-identifying details**.
- **Where it goes:** the upstream repo URL and its maintainer, plus anyone with repo access.
- **What gets created:** collaborators push a branch upstream; anyone else gets a fork
  `<their-login>/<repo>` created in **their own GitHub account** (server-side, free, private if
  the upstream is, and it persists until they delete it). Requires a logged-in `gh`. The
  maintainer merges or declines — sending guarantees nothing.

Then ask ONE explicit question: **"Propose these changes upstream as a PR?"** Never skip it,
never assume yes.

On yes:

1. Resolve the upstream (`git -C "$FORGE_HOME" remote get-url origin`; no repo → ask once).
2. **Base the branch on the remote, not on local state** — `git fetch origin`, then
   `git checkout -b retro/<slug> origin/<default-branch>`, and re-apply the changes there. On a
   cache install, clone the remote into the scratchpad and apply the edits in that clone.
3. `npm ci && npm test` green in the PR tree before pushing (hard rule 11) — this is also where
   the git-dependent tests finally run for real. Run `npm run eval:gate` too: upstream CI
   re-runs both, and a measured regression (quality down, cost past budget — `docs/EVALS.md`)
   arrives as a red check the maintainer will not merge.
4. Push. **Rejected because you are not a collaborator? Fork, don't stop:**
   `gh repo fork <upstream> --remote=true` (idempotent), push there, and
   `gh pr create --repo <upstream> --head <your-login>:<branch>`. A private upstream can only be
   forked with read access and if "Allow forking" is enabled — say so rather than retrying.
5. `gh pr create` with evidence per change (friction → change → expected effect; rejected items
   listed). `gh` missing or unauthenticated → report the manual steps, never fail silently.
6. **Never merge it.** Report the PR URL and move on.

On no: the local changes stand; note that they are local-only and, on a cache install, will not
survive a plugin update.

## 5. Close

Report: changes applied, expected effect, rejected-with-reason, upstream outcome (PR URL,
declined, or not applicable). A friction item that needs real redesign rather than a tweak gets
recorded and a dedicated session recommended — do not botch it inline.

**Next →** back to product work, or a dedicated session for any redesign item recorded here.
