---
name: retro
description: Harness retrospective - blockers and observed defects only, each traced to a citation and verified against the harness text before it becomes a change. Use after a run that broke, stalled, or produced a wrong result.
argument-hint: "[what broke, with the error or commit if you have it]"
---

# /forge:retro — the harness changes only where a run proved it wrong

User's observation, if any: "$ARGUMENTS"

A retro repairs **damage that already happened**. It is not a wishlist, not a design session,
and not a place for improvements that merely sound sensible. Every change that leaves this
skill carries a citation and a verification. Nothing else ships.

## 1. Admissibility — what a retro may change

Two inputs are admissible, and only these:

- **Blocker** — a run stopped or had to be rescued: a command failed, an agent looped past two
  strikes, a gate could not be satisfied, a worktree or merge broke, a session was restarted,
  work was reverted, the harness was hot-fixed mid-build to keep going.
- **Defect** — the harness produced a wrong result: an instruction that misfired, two rules
  that contradict each other, a claim reported done that was not verified, output the user had
  to correct by hand more than once.

Inadmissible, however reasonable it sounds:

| Not admissible | Where it belongs instead |
|---|---|
| A new capability, command, agent or stage | `/forge:next` on the harness repo |
| Taste or ergonomics with no failure behind it | `/forge:next`, or nowhere |
| A fix an agent (including this one) recommended, that no run exercised | dropped |
| "Best practice says", "we should probably", "it would be cleaner if" | dropped |

The owner may still want one of those. That is legitimate work — it is just a different lane.
Record it in the closing report as **routed, not applied**, and move on. Do not smuggle it in
as a retro item because it is small.

## 2. Collect evidence — a citation, or the item dies here

Sweep in this order and stop when each candidate has a locator:

1. **The user's observation** — highest signal, but ask for the artifact, not the opinion.
2. **This session's tool results** — failing commands, agent reports, per-agent `duration_ms`.
3. **`.forge/run.json` stage marks and `PROGRESS.md` session logs** — repeated manual steps,
   escalations, reverted work.
4. **Harness `git log` since the last retro** — mid-build hot-fixes mark where the design was
   wrong; a revert is the strongest evidence there is.
5. **Failed CI runs and gate output.**

Evidence is something a third party can re-open on their own:

- the exact error string **plus** the command that produced it,
- a commit SHA (hot-fix, revert, manual repair),
- a dated `PROGRESS.md` or session-log line,
- a measured number — `duration_ms`, stage wall-clock, suite runtime,
- a quote of the harness instruction that misfired.

**Measure, don't recall.** "It felt slow" is not evidence; get the numbers, group them
**parallelism-aware** (a wave costs its slowest member, not the sum) and report the split —
building vs. reviewing vs. fixing vs. gates. The biggest line item is usually not where anyone
guessed.

Record everything in one ledger before proposing anything:

| # | Symptom | Evidence (locator) | Occurrences (n=) | Class | Admitted |
|---|---|---|---|---|---|

One occurrence is admissible but ranks below anything recurring. Ask at most **2–3 batched
questions**, each asking for an artifact: which command failed, paste the error, which commit
fixed it by hand.

## 3. Verify each candidate — the gate, not a formality

Never go symptom → change. For every admitted item, all five steps, in order:

1. **Locate the cause in the harness text.** Name the file and line whose wording produced the
   behaviour. No locator means the cause may not be the harness at all — product code, model
   variance, network, a one-off. Say so and drop it.
2. **Check the rule does not already exist.** `grep` the harness for it. If it exists and was
   ignored, the defect is placement or wording — a rule nobody reads at the moment they need
   it. Fix that. Never add a second copy of a rule that is already there.
3. **Prove the change would have prevented this failure.** Replay the run against the new
   wording: an agent handed only this file, would it have done the other thing? "Probably, if
   it reads carefully" is a failed proof — the change is too weak to ship.
4. **Check the blast radius.** `grep` the touched files for the phrases `tests/harness.test.mjs`
   pins, and for other skills that quote them.
5. **State the falsifier.** Name what would show the fix did not work, observable in the next
   run. An item with no "did it work" signal is a wish wearing evidence.

Items failing step 1 or 3 are reported as **unverified — not applied**, naming what evidence
would settle it. They are not proposed and not committed.

## 4. Propose (max 5, ranked by measured pain)

| Friction | Fix layer |
|---|---|
| Permission prompt for a routine safe command | `settings.json` allowlist |
| Agent output needed the same correction twice | that agent's `.md` |
| A skill step was ambiguous or wrong in practice | that `SKILL.md` |
| Stack default aged, scaffold command drifted | the playbook (+ new as-of date) |
| Model too big/small for a stage | workflow `model:`/`effort:` or agent frontmatter |
| A rule everyone kept re-explaining | `CLAUDE.md` (and something stale comes OUT) |

Per item, in this order: **evidence locator → verified cause → the exact change → expected
effect → falsifier.** The user approves or rejects each. A proposal presented without its
locator is not ready to be approved.

## 5. Apply — generalize first

Changes land in the local install (`FORGE_HOME="${CLAUDE_PLUGIN_ROOT:-$(forge-home 2>/dev/null || ls -d ~/.claude/plugins/cache/forge/forge/*/ | sort -V | tail -1)}"`), so
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

Suite green before any commit (hard rule 11), one commit per approved change with the evidence
in the message ("retro: allow pnpm create — kickoff prompted 3x during recipes build").
Rejected and unverified items get one line each in the closing commit body so the next retro
does not re-propose them.

**A marketplace-cache install has no repo** — apply the edits anyway, and say plainly that the
next plugin update overwrites them, which makes the §6 PR the only durable path. Its
git-dependent tests cannot pass in a cache; note them as environmental rather than "fixing"
them.

## 6. Propose upstream (ask — this is the swarm loop)

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
5. `gh pr create` with the evidence per change (locator → verified cause → change → expected
   effect → falsifier; rejected and unverified items listed). `gh` missing or unauthenticated →
   report the manual steps, never fail silently.
6. **Never merge it.** Report the PR URL and move on.

On no: the local changes stand; note that they are local-only and, on a cache install, will not
survive a plugin update.

## 7. Close

Report four buckets, never fewer:

| Bucket | What it says |
|---|---|
| Applied | the change, its evidence locator, expected effect, falsifier |
| Rejected | the item and the user's reason |
| Unverified — not applied | the symptom and what evidence would settle it |
| Routed, not applied | wishes and new capabilities, sent to `/forge:next` |

Then the upstream outcome (PR URL, declined, or not applicable). A friction item that needs
real redesign rather than a tweak gets recorded and a dedicated session recommended — do not
botch it inline.

**Next →** back to product work, or a dedicated session for any redesign item recorded here.
