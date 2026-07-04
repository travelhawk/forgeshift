---
name: status
description: Project state report and session handoff - audits PROGRESS.md against reality (git, tests), reports what is done/in-flight/next with evidence, and writes the handoff so the next session starts clean. Use at session end, after milestones, or when resuming after a break.
argument-hint: "[optional: 'handoff' to force a full handoff write]"
---

# /status — Ground truth, then handoff

## 1. Audit state against reality (not against memory)

- `git status` + `git log --oneline -15`: any uncommitted work? What actually landed?
- Run the test suite: current green/red state, with names of failures.
- Diff `PROGRESS.md` against the above: features marked done — is their evidence real?
  Features in flight — what's their actual state? Fix the file where it lies.

## 2. Report

Short and grounded — every claim traceable to a command output from step 1:

- **Done since last status**: features with their evidence.
- **In flight**: exact state, what's blocking, where the work lives (branch/files).
- **Health**: tests green/red, known issues, accepted risks.
- **Next**: the 1-3 most valuable next moves, with a recommendation.

## 3. Handoff write (always at session end, or when asked)

Update `PROGRESS.md`:

- Feature checkboxes reflect verified reality.
- Session log entry: date, what happened, evidence pointers, decisions made.
- **"Next session should"**: 2-4 lines a fresh session can act on without reading this
  conversation — the concrete next step, any open decision with its options, any trap
  discovered ("don't touch X until Y").

Commit `PROGRESS.md` (and any stray uncommitted work the user wants kept — ask, don't
assume). If the session surfaced durable project facts that belong in the project's
CLAUDE.md (a new command, a new convention), add them there — tersely, and prune
anything now stale while you're in the file.
