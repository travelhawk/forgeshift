# Finish deliverables — visual walkthrough & documentation pass

The `/forge:build` finish (SKILL.md §5b/§5c) pulls this playbook in **only when its branch
fires** — a UI product for the walkthrough, any completed run for the docs pass — so the
skill's hot path stays lean and this detail loads on demand. Both are **deliverables, never
stop conditions**: any failure is a note in the run report, never a block on
ready-for-`/forge:ship`. Both run only on a completed, green, integrated result
(auto-integrate and local modes; skipped in review-PRs mode — nothing is merged to run).

## Visual walkthrough (UI products only)

Delegate to `forge-proof` with the product path, the dev-server command (product
`CLAUDE.md`), and the core journey + shipped features from `docs/SPEC.md`:

1. **Applicability.** No runnable web UI (CLI, API, library) → report "no UI to capture"
   and stop. UI present → ensure Playwright is available (`npx playwright install
   chromium` if missing; the web-app playbook already ships it).
2. **Run the app.** Start the dev server in the background, poll until it responds; kill
   the whole process tree at the end — Windows: `taskkill //F //T //PID <pid>` or
   `npx kill-port <port>` (a bare kill leaks node.exe holding the port).
3. **Videos of the main user flows.** Derive the flows from the spec's core journey plus
   the shipped features — one flow per journey, not one per click. A Playwright script
   drives each flow end-to-end with `recordVideo` → one `.webm` per flow in
   `docs/walkthroughs/videos/`. A flow that can't be driven (auth/seed not available) is
   recorded as skipped with the reason; partial capture still ships what it got.
4. **Overview image of all screens.** Screenshot every distinct screen/route into
   `docs/walkthroughs/screens/`, then assemble ONE contact-sheet
   `docs/walkthroughs/overview.png` (ImageMagick `montage`, or lay the shots into an HTML
   grid and screenshot that).
5. **Artifacts.** Commit the small, review-friendly ones (`overview.png`, the
   screenshots); add `docs/walkthroughs/videos/` to the product `.gitignore` (videos are
   large binaries) — they stay on disk and are linked in the report. Follow the product's
   own convention if it already commits media.

## Documentation pass (`forge-etcher`)

`/forge:build` builds features from the spec and reviews code — nothing in that loop owns
the README, so a scaffolded product ships with boilerplate (`create-next-app`'s
"bootstrapped with…" page, a bare `cargo`/`poetry` stub) unless this step replaces it.
Delegate to `forge-etcher` with the product path, `docs/SPEC.md`, `PROGRESS.md`, and the
actual `package.json`/manifest scripts:

1. **README.** Rewrite (or create) `README.md` from the SHIPPED reality — what the product
   is and does, the architecture in brief (link `docs/adr/`), the real stack, getting
   started, the actual scripts, honest limitations/known-gaps drawn from PROGRESS (do not
   oversell), and a one-line-per-module project map. Replace any scaffolder boilerplate
   outright. **Verify every command it documents by running it** (`install`, `test`,
   `typecheck`, `build` at minimum) — a README that documents a command that fails is a
   lie (hard rule 2). State anything unverifiable in-session (a live deploy, a paid API)
   as such rather than claiming it.
2. **Docs sync.** If the run changed commands, env vars, or setup that a committed doc
   (`README`, a `docs/` getting-started, `.env.example` prose) now contradicts, fix the
   drift in the same pass. Do NOT invent new docs beyond the README — CHANGELOG and
   release/listing texts belong to `/forge:ship`, not here.
3. **Commit** the docs (small, review-friendly) directly on the integrated branch —
   `docs: README + docs sync (/forge:build finish)` — like the walkthrough artifacts. In
   auto-integrate mode a docs-only commit needs no PR; push it with the finish.
