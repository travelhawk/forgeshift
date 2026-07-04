---
name: kickoff
description: Take a product idea to a scaffolded, spec'd, buildable project - structured interview, spec, stack choice from a playbook, scaffold with git and tests wired up. Use when the user wants to start a new product, app, tool, or project of any kind. For an EXISTING codebase, use /adopt instead.
argument-hint: "[product idea in one or two sentences]"
disable-model-invocation: true
---

# /kickoff — Idea → Spec → Stack → Scaffold

Take "$ARGUMENTS" from idea to a project that is ready for its first `/feature`.
You are the interviewer and orchestrator; delegate heavy thinking to `forge-planner`.

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

## 2. Spec draft

Have `forge-planner` draft the spec CONTENT from the interview, following
`templates/SPEC.md` (harness root). The planner returns markdown — it does not write
files; hold the draft, it lands on disk in step 4. Present the summary — scope table,
out-of-scope list, open questions — and iterate until the user approves.

If a genuinely hard architecture question surfaced (wide solution space, expensive to
reverse), offer to run the `design-panel` workflow on it instead of guessing.

## 3. Stack

Pick the playbook from `docs/playbooks/` (harness root) matching the product type and
adapt it to the interview constraints. No playbook fits (bot, worker, something else)?
Adapt the nearest one and record the deltas in ADR-001. Deviations from a playbook
default need a one-line reason. Verify with a quick web search that no major version
shifted since the playbook's as-of date.

**Present spec + stack together for explicit approval. Do not scaffold before the user
approves both** (this is the LIFECYCLE stage-1 gate).

## 4. Scaffold (order matters)

1. Run the playbook's scaffold commands — they create `projects/<slug>/` themselves and
   must run non-interactively (use the playbook's flag sets; if a prompt appears, the
   CLI's flags have drifted — check its current --help).
2. `git init` + initial commit of the clean scaffold (if the scaffolder didn't).
3. NOW write the held artifacts into the project: `docs/SPEC.md` (approved draft),
   `CLAUDE.md` from `templates/PROJECT-CLAUDE.md` (filled with the real stack, commands,
   conventions), `docs/adr/001-stack.md` from `templates/ADR.md`.
4. Create `PROGRESS.md`: the V1 feature list from the spec as `- [ ] F# — <name> —
   <done-criteria>` lines, a "Session log" section, and a seeded **"Next session
   should"** line pointing at the suggested first `/feature`.
5. Wire the test runner per playbook and add one smoke test that actually runs
   (`app boots` / `CLI prints version`). Verify: install, test, dev-server boot — all
   green. Boot check: start the dev server in the background, poll the URL until it
   responds, then kill the whole process tree — on Windows `taskkill //F //T //PID <pid>`
   or `npx kill-port <port>`; a bare `kill` leaves node.exe holding the port.
6. Commit: `chore: scaffold <name> (<stack summary>)`.

## 5. Handoff

Report: spec location, stack + why, what was verified (with command output), the
feature list, and the suggested first `/feature`. Recommend a fresh session **started
from the harness root** (that's where the skills, agents, and workflows load from),
with the product directory as the working target.
