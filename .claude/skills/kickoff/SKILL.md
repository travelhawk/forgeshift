---
name: kickoff
description: Take a product idea to a scaffolded, spec'd, buildable project - structured interview, spec, stack choice from a playbook, scaffold with git and tests wired up. Use when the user wants to start a new product, app, tool, or project of any kind. For an EXISTING codebase, use /forge:adopt instead.
argument-hint: "[product idea in one or two sentences]"
disable-model-invocation: true
---

# /forge:kickoff — Idea → Spec → Stack → Scaffold

Take "$ARGUMENTS" from idea to a project ready for its first build. You interview and
orchestrate; `forge-blueprint` does the heavy thinking.

## 0. Locate

The product is created **at the current working directory** — an empty folder you started in
becomes the product root; a cwd that already holds unrelated work gets a new
`<cwd>/<kebab-slug>/`. **Confirm the path before creating anything.** An existing codebase is
`/forge:adopt`, not kickoff. **Create nothing yet** — scaffolders require an empty directory
and step 4 creates everything in order.

`FORGE_HOME="${CLAUDE_PLUGIN_ROOT:-$(forge-home 2>/dev/null || ls -d ~/.claude/plugins/cache/forge/forge/*/ | sort -V | tail -1)}"` for harness assets; product files stay
relative to the product dir.

## 1. Interview (AskUserQuestion, batched)

Interview until you could write the spec without guessing — 2–3 batched rounds, covering only
what the idea leaves open:

- Who is the user, and what is the ONE core journey?
- V1 scope: what must ship, what explicitly waits? Propose a cut and let them react.
- Type and platform; constraints (hosting, budget, auth, data sensitivity, existing accounts).
- Taste: a product they want it to feel like.

**Propose defaults in every question** — people react faster than they specify. "You decide" →
decide and record it.

If `$FORGE_HOME/references/INDEX.md` exists, read the index and pull in the *single* reference
matching this product type (that file only). No index or no match → skip silently.

## 2. Spec draft

`forge-blueprint` drafts the spec CONTENT from the interview, following
`$FORGE_HOME/templates/SPEC.md`. It returns markdown; hold it — it lands on disk in step 4.

**Present it without making the user open an editor:** write the draft to your scratchpad and
publish it as a Markdown **artifact** (minimal design — a document to read, not a designed
page; load `artifact-design` first). Link it beside a short in-chat summary (scope table,
out-of-scope, open questions) and re-publish the same artifact on each edit. No Artifact tool →
link the scratchpad file.

**Right-size the feature list.** A feature is a slice of user value (independently buildable
and testable, ~2–5 done-criteria), not one per requirement — a small tool has ~3–6, an MVP
~8–15. V1 caps at ~15; a bigger backlog is phased into V2, never padded or crammed. Fewer,
coherent features mean fewer waves and fewer subagents.

**Tag every V1 feature with a risk tier** per `$FORGE_HOME/docs/RISK-TIERS.md` — classify by
capability signal, not by the feature's noun; each tag carries a one-line justification naming
the signal that fired; ties break **up**. Show the tiers in the scope table so the user can
adjust before approving (seed, not verdict).

**Make done-criteria checkable, and honest about the environment.** 2-5 per feature, ≤25
words each, each one checkable by someone who does not read the code. "Contact list loads" is
useless; "search over name/company/email returns hits in under 300 ms at 5.000 contacts, empty
state with a create CTA" is not. Say per criterion **what the target environment can actually
prove** — one it cannot is reported open later, never ticked.

**Design directions** (products with a visual surface): before finalising, propose 2–3 distinct
directions — each a named mood in one sentence, a palette by name, typography and shape
language, motion feel, one reference touchstone. AskUserQuestion, with a cheap visual mock per
direction where it helps (aesthetics are where react-faster-than-specify applies doubly). The
winner lands in the spec's **Art direction** section and binds every builder and every visual
checkpoint. No visual surface → skip silently.

A genuinely hard architecture question (wide solution space, expensive to reverse) → offer the
`design-panel` workflow rather than guessing.

## 3. Stack

Pick the playbook from `$FORGE_HOME/docs/playbooks/` matching the product type and adapt it to
the interview constraints. No playbook fits → adapt the nearest and record the deltas in
ADR-001; any deviation from a default needs a one-line reason.

**Verify versions AND scaffold flags against the live CLIs** — playbooks age and CLIs drift.
Run `--help` on every scaffold command before using it: a removed flag turns a non-interactive
scaffold into a hang.

**Present spec + stack together for explicit approval** — the spec as its artifact link
(refreshed if it changed), the stack inline. Flag that approving grants the spec's **Decision
policy**: the build phase then decides and logs reversible calls without interrupting, so the
follow-on run is hands-off and their next required touch is the finish review.

The spec **file does not exist yet** — the scaffolder needs an empty dir, so the **artifact is
the review surface at this gate**. Link it immediately before the approval question and point
there. **Never** phrase the gate as "the spec is in `docs/SPEC.md`". **Do not scaffold before
both are approved.**

## 4. Scaffold (order matters)

1. Run the playbook's scaffold commands non-interactively for the target dir.
2. `git init` + initial commit of the clean scaffold, if the scaffolder didn't. Add `.forge/`
   to the project `.gitignore` — local run state must never land in the product's history.
3. Write the held artifacts: `docs/SPEC.md` (approved draft), `CLAUDE.md` from
   `$FORGE_HOME/templates/PROJECT-CLAUDE.md` (real stack, commands, conventions),
   `docs/adr/001-stack.md` from `$FORGE_HOME/templates/ADR.md`.
4. `PROGRESS.md` from the template: the V1 features as F#-rows carrying their **tier +
   justification**, a health baseline, and a seeded "Next session should".
5. Wire the test runner and add one smoke test that actually runs (`app boots` / `CLI prints
   version`). Verify install, test and dev-server boot. Boot check: start it in the background,
   poll until it responds, then **kill the whole process tree** — Windows: `taskkill //F //T
   //PID <pid>` or `npx kill-port <port>`; a bare `kill` leaves node holding the port.
6. Commit: `chore: scaffold <name> (<stack summary>)`.

**Keep the docs short.** The scaffold ships a spec, one ADR, a PROGRESS and a project
`CLAUDE.md` — nothing else. An ADR is for a one-way door or a genuine surprise, ≤ 15 lines. A
runbook is a checklist, not a manual. Docs are a cost like verbosity.

## 5. Handoff — straight into the build, same session

Report: spec location, stack + why, what was verified (with command output), the feature list.
Then offer the continuation **in this session** — no new session needed, because everything
the build needs is on disk in `docs/SPEC.md` + `PROGRESS.md`, not in chat context:

- **Default: `/forge:build` now.** One word and you run it. Suggest an optional `/compact`
  first if the interview ran long; the build re-reads its inputs from disk either way.
- `/forge:feature F1` for a supervised first slice instead.

**Next →** `/forge:build` (default) or `/forge:feature F1`.
