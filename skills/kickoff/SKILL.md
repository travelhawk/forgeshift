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

`FORGE_HOME="${FORGE_HOME:-${CLAUDE_PLUGIN_ROOT:-$(forge-home 2>/dev/null || ls -d ~/.claude/plugins/cache/forge/forge/*/ | sort -V | tail -1)}}"` for harness assets; product files stay
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

**Present it without making the user open an editor:** publish the draft as an **artifact**
(Artifact tool; unavailable → link a scratchpad `.md`). Link it beside a short in-chat summary
(scope table, out-of-scope, open questions) and re-publish it on each edit.

Check the draft before you show it:

- **Feature count fits the product**: a small tool has ~3–6 features, an MVP ~8–15. V1 caps
  at ~15; the rest is phased into V2.
- **Every V1 feature carries a risk tier** per `$FORGE_HOME/docs/RISK-TIERS.md`, with the
  signal named; ties break **up**. The tiers show in the scope table so the user can adjust.
- **Done-criteria are checkable by someone who does not read the code**, and say what the
  target environment can actually prove. One it cannot prove is reported open later, never
  ticked.

**Design directions** (products with a visual surface): before finalising, propose 2–3 distinct
directions — a named mood, a palette, typography and shape language, motion feel, one
reference touchstone — with a cheap visual mock where it helps. The winner lands in the spec's
**Art direction** section and binds every builder and every visual checkpoint.

A genuinely hard architecture question (wide solution space, expensive to reverse) → offer the
`design-panel` workflow rather than guessing.

## 3. Stack

Pick the playbook from `$FORGE_HOME/docs/playbooks/` matching the product type and adapt it to
the interview constraints. No playbook fits → adapt the nearest and record the deltas in
ADR-001; any deviation from a default needs a one-line reason.

**Verify versions AND scaffold flags against the live CLIs** — playbooks age and CLIs drift.
Run `--help` on every scaffold command before using it: a removed flag turns a non-interactive
scaffold into a hang.

**Present spec + stack together for explicit approval** — the spec as its artifact link, the
stack inline. Say that approving grants the spec's **Decision policy**: the build then decides
and logs reversible calls without asking.

The spec file does not exist yet (the scaffolder needs an empty dir), so the **artifact is the
review surface at this gate** — never point at `docs/SPEC.md`. **Do not scaffold before both
are approved.**

## 4. Scaffold (order matters)

1. Run the playbook's scaffold commands non-interactively for the target dir.
2. `git init` + initial commit of the clean scaffold, if the scaffolder didn't. Add `.forge/`
   to the project `.gitignore` — local run state must never land in the product's history.
3. Write the held artifacts: `docs/SPEC.md` (approved draft), `AGENTS.md` from
   `$FORGE_HOME/templates/PROJECT-AGENTS.md` (real stack, commands, conventions) plus a
   one-line `CLAUDE.md` holding `@AGENTS.md` (Claude Code reads only that name),
   `docs/adr/001-stack.md` from `$FORGE_HOME/templates/ADR.md`.
4. `PROGRESS.md` from the template: the V1 features as F#-rows carrying their **tier +
   justification**, a health baseline, and a seeded "Next session should".
5. Wire the test runner and add one smoke test that actually runs (`app boots` / `CLI prints
   version`). Verify install, test and dev-server boot. Boot check: start it in the background,
   poll until it responds, then **kill the whole process tree** — Windows: `taskkill //F //T
   //PID <pid>` or `npx kill-port <port>`; a bare `kill` leaves node holding the port.
6. Commit: `chore: scaffold <name> (<stack summary>)`.

The scaffold ships a spec, one ADR, a PROGRESS and a project `AGENTS.md` — no other docs.

## 5. Handoff — straight into the build, same session

Report: spec location, stack + why, what was verified (with command output), the feature list.
Then offer the continuation **in this session**. No new session needed: everything the build
needs is on disk in `docs/SPEC.md` + `PROGRESS.md`.

- **Default: `/forge:build` now.** Suggest `/compact` first if the interview ran long.
- `/forge:feature F1` for a supervised first slice instead.

**Next →** `/forge:build` (default) or `/forge:feature F1`.
