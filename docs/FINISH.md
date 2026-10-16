# Finish deliverables — visual walkthrough & documentation pass

The `/forge:build` finish loads this page only when a branch fires: a UI product for the
walkthrough, any completed run for the docs pass. Both run on a completed, green, integrated
result (not in review-PRs mode, where nothing is merged). Both are deliverables, never stop
conditions: a failure is a note in the run report, never a block on `/forge:ship`.

## Visual walkthrough (UI products only)

Delegate to `forge-proof`. Brief: the product path, the dev-server command from the product
`AGENTS.md`, the core journey and shipped features from `docs/SPEC.md`.

Done means:
- one Playwright video (`.webm`) per main user flow in `docs/walkthroughs/videos/` — one flow
  per journey, not per click; a flow it cannot drive is listed as skipped with the reason
- a screenshot of every distinct screen in `docs/walkthroughs/screens/`, plus one contact
  sheet `docs/walkthroughs/overview.png`
- screenshots and the overview committed; the videos folder gitignored unless the product
  already commits media
- the dev server killed by process tree (`AGENTS.md` hard rule 4)

No runnable web UI (CLI, API, library) → report "no UI to capture" and stop.

## Documentation pass (`forge-etcher`)

Nothing else in the build loop owns the README, so a scaffold ships with its generator's
boilerplate unless this pass replaces it. Delegate to `forge-etcher`. Brief: the product path,
`docs/SPEC.md`, `PROGRESS.md`, the manifest scripts.

Done means:
- `README.md` describes the shipped product: what it does, how to start, the real scripts,
  honest known gaps from `PROGRESS.md`. Every command it documents was run in this session;
  anything that cannot be run here (a live deploy, a paid API) is marked unverified.
- committed docs that the run made wrong (setup, env vars, commands) are fixed. No new docs —
  CHANGELOG and release texts belong to `/forge:ship`.
- one commit on the integrated branch: `docs: README + docs sync (/forge:build finish)`.
