---
name: kickoff
description: Take a product idea to a scaffolded, spec'd, buildable project - structured interview, spec, stack choice from a playbook, scaffold with git and tests wired up. Use when the user wants to start a new product, app, tool, or project of any kind. For an EXISTING codebase, use /adopt instead.
argument-hint: "[product idea in one or two sentences]"
disable-model-invocation: true
---

# /kickoff — Idea → Spec → Stack → Scaffold

Take "$ARGUMENTS" from idea to a project that is ready for its first `/feature`.
You are the interviewer and orchestrator; delegate heavy thinking to `forge-blueprint`.

## 0. Locate

New projects go in `projects/<kebab-case-slug>/` under the harness root. If the user
points at an existing codebase, stop — that's `/adopt`, not kickoff. **Do not create
the project directory or any file in it yet** — scaffolders require an empty or
nonexistent directory (step 4 creates everything, in order).

## 1. Interview (AskUserQuestion, batched)

Interview until you could write the spec without guessing. Cover, in 2-3 batched rounds,
only what the idea leaves open:

- Who is the user and what is the ONE core journey?
- V1 scope: what must ship, what explicitly waits? (propose a cut, let them react)
- Type & platform: web app / SaaS / API / CLI / mobile / desktop / extension / library?
- Constraints: hosting preferences, budget sensitivity, auth needs, data sensitivity,
  existing accounts (Vercel, Supabase, ...)?
- Taste: any product they want it to feel like?

Propose defaults in every question — the user reacts faster than they specify.
If the user says "du entscheidest" / "you decide", decide and record the decision.

**Pull in a reference if one fits.** If `references/INDEX.md` exists (harness root), read
the index and pull in the *single* reference matching this product type — read only that
file, not the folder — and let its must-haves shape the interview and spec (a landing-page
reference, say, reminds you to confirm Impressum, Datenschutzerklärung, i18n). No index or
no match → skip silently. See `CLAUDE.md` → References.

## 2. Spec draft

Have `forge-blueprint` draft the spec CONTENT from the interview, following
`templates/SPEC.md` (harness root). The planner returns markdown — it does not write
files; hold the draft, it lands on disk in step 4.

**Present it for review without making the user open an editor.** Render the held draft
as an **artifact**: write the markdown to your scratchpad and publish it with the Artifact
tool (Markdown, minimal design — it's a document to read, not a designed page; load
`artifact-design` first). Put the artifact link in chat beside a short in-chat summary
(scope table, out-of-scope, open questions), and **re-publish the same artifact on each
edit** as you iterate to approval. Artifact tool unavailable → link the scratchpad `.md`
instead. Either way the user reviews the full spec in place and reacts in chat.

**Right-size the feature list.** A feature is a slice of user value (independently
buildable + testable, ~2-5 done-criteria), not one-per-requirement — a small tool has
~3-6, a typical MVP ~8-15. A V1 phase caps at ~15; a bigger backlog gets phased into V2
rather than padded or crammed (see `forge-blueprint`'s granularity rule). Fewer, coherent
features mean fewer `/forge` waves and subagents.

**Tag each V1 feature with a risk tier** (fills the spec table's Risk column). Blueprint
classifies by *capability signal, not the feature's noun* — apply the scheme in
`docs/RISK-TIERS.md` (T1 = any signal fires: money, tenant-boundary / filter-dependent
query, authz/authn, untrusted input, irreversible send; T2 = side effects without a
signal; T3 = own-data render / scaffolding), don't restate it here. Each tag carries a
one-line justification naming the signal that fired; ties break **upward**. Present the
tiers in the scope table — the user adjusts any before approving (seed, not verdict).

If a genuinely hard architecture question surfaced (wide solution space, expensive to
reverse), offer to run the `design-panel` workflow on it instead of guessing.

## 3. Stack

Pick the playbook from `docs/playbooks/` (harness root) matching the product type and
adapt it to the interview constraints. No playbook fits (bot, worker, something else)?
Adapt the nearest one and record the deltas in ADR-001. Deviations from a playbook
default need a one-line reason. Verify with a quick web search that no major version
shifted since the playbook's as-of date.

**Present spec + stack together for explicit approval** — the spec as its rendered
artifact/link (from §2, refreshed if it changed since), the stack inline. Flag that the
spec carries a **Decision policy** (`templates/SPEC.md`): approving it grants the build
phase authority to decide-and-log reversible calls without interrupting, so the follow-on
`/forge` runs hands-off. Their next required touch is the finish review, not mid-build.

The spec **file does not exist yet** — the scaffolder needs an empty dir, so `docs/SPEC.md`
is written only in step 4 *on approval*. Therefore the **artifact is the review surface at
this gate**: link it immediately before the approval question and word the question to
point there (e.g. "review the full spec in the artifact above"). **Never** phrase the gate
as "the spec lands in / is in `docs/SPEC.md`" — that file isn't created until the user
approves, so it's not something they can open to review now. **Do not scaffold before the
user approves both** (this is the LIFECYCLE stage-1 gate).

## 4. Scaffold (order matters)

1. Run the playbook's scaffold commands — they create `projects/<slug>/` themselves and
   must run non-interactively (use the playbook's flag sets; if a prompt appears, the
   CLI's flags have drifted — check its current --help).
2. `git init` + initial commit of the clean scaffold (if the scaffolder didn't). Add
   `.forge/` to the project `.gitignore` — the local-only run-state `/forge` writes for
   `/resume` (see CLAUDE.md → run state); it must never land in the product's history.
3. NOW write the held artifacts into the project: `docs/SPEC.md` (approved draft),
   `CLAUDE.md` from `templates/PROJECT-CLAUDE.md` (filled with the real stack, commands,
   conventions), `docs/adr/001-stack.md` from `templates/ADR.md`.
4. Create `PROGRESS.md` from `templates/PROGRESS.md` (harness root): the V1 feature
   list from the spec as F#-rows — each carrying its **risk tier + justification** from
   the spec table — a health baseline, and a seeded **"Next session should"** line
   pointing at the suggested first `/feature`.
5. Wire the test runner per playbook and add one smoke test that actually runs
   (`app boots` / `CLI prints version`). Verify: install, test, dev-server boot — all
   green. Boot check: start the dev server in the background, poll the URL until it
   responds, then kill the whole process tree — on Windows `taskkill //F //T //PID <pid>`
   or `npx kill-port <port>`; a bare `kill` leaves node.exe holding the port.
6. Commit: `chore: scaffold <name> (<stack summary>)`.

## 5. Handoff — straight into the build, same session

Report: spec location, stack + why, what was verified (with command output), the
feature list, and offer the continuation **in this session** — no new session needed
(this one started at the harness root, so skills/agents/workflows are loaded, and
everything the build needs lives on disk in `docs/SPEC.md` + `PROGRESS.md`, not in
chat context):

- **Default offer: `/forge` now.** One word from the user ("forge" / "build it")
  and you run the forge flow directly. If the interview ran long, suggest an
  optional `/compact` first — auto-compaction covers it either way, since `/forge`
  re-reads all its inputs from disk.
- **`/feature F1`** for a supervised first slice instead.

Only when the session did NOT start at the harness root (skills would be missing):
recommend a fresh session from the harness root with the product as working target.
