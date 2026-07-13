---
name: ship
description: Release gate and deploy - prepares the release commit (CHANGELOG, version bump), runs the automated release-gate workflow, walks the manual checklist, then tags and deploys per the project playbook.
argument-hint: "[version or release note, e.g. v0.2.0 first public beta]"
disable-model-invocation: true
---

# /ship — Prepare, gate, release

Ship "$ARGUMENTS" (or infer the next semver from the changes if not given).

## 0. Locate

Ensure the shell working directory is the PRODUCT root (the directory with the
manifest/package.json), typically `projects/<name>/` — the gates run real commands
there. Ambiguous which product? Ask.

## 1. Prepare the release commit (before any gate — the gate checks these)

1. CHANGELOG entry for this version: user-visible effects, not implementation notes
   (`forge-etcher` if it's more than a few lines). No CHANGELOG file yet (first
   release)? Create it now.
2. Bump the version consistently across all manifests.
3. Commit: `release: <version>`.

## 2. Automated gate

Run the `release-gate` workflow (Workflow tool, `{name: "release-gate", args: "<version
+ change summary>"}`). It runs static/security/docs checks in parallel, then
tests → build → runtime smoke sequentially, each returning evidence, and fails closed
(a gate that doesn't report blocks).

**NO-SHIP verdict blocks the release. Fix the blockers and re-run; never override.**
If a gate was `skipped` because the project lacks the tooling (no linter configured),
decide with the user: add the tooling now, or accept and record the gap in PROGRESS.md.
A skipped TESTS gate is never acceptable — that means wrong directory or a broken
test setup; fix it.

## 3. Manual gate

Walk the user through the manual half of `templates/RELEASE-CHECKLIST.md` (harness
root) — core journey walked by a human, ugly paths, migrations reversible, rollback
command known. These need human eyes; don't self-certify them.

Env vars in the deploy target: compare **key names only** — read the committed
`.env.example` for the expected list and ask the user to confirm those keys exist in
the deploy target. Never read actual `.env` values (denied by permissions, and rightly
so). Copy the filled checklist to `docs/releases/<version>.md`.

## 3b. Release kit (user-facing products — apps, SaaS, sites)

Store/listing assets into `docs/release-kit/<version>/` per `templates/RELEASE-KIT.md`
(harness root). Libraries/CLIs/APIs: skip, say so. Unchanged since last release →
copy forward, refresh "What's new" + changed screens only. Run both in parallel:

- **Texts** — `forge-etcher` from `docs/SPEC.md` + CHANGELOG: name, subtitle/short
  description, long description, keywords, what's-new — within store char limits,
  one set per shipped language. Web: OG title/description + landing copy.
- **Images** — `forge-proof` from the RUNNING app (reuse the walkthrough machinery
  from `/forge` §5b where present): screenshots at store sizes, feature graphic /
  OG image. Real data on screen, never lorem.

**Store-distributed products (mobile/desktop stores): an incomplete kit blocks the
release** — the submission literally requires it. Web products: kit is default-on,
gaps are report notes, not blockers.

## 4. Release

1. Tag `v<version>`.
2. Deploy per the deploy section of the matching playbook (`docs/playbooks/<type>.md`,
   harness root) or the project CLAUDE.md deploy command. First deploy ever → follow
   the playbook's first-deploy setup and record every manual step in the project docs.
3. Post-deploy smoke test against the LIVE deployment (the release-gate smoke was
   local): primary route/command responds, no error storm in logs.

## 5. Close

Report: version, gate evidence summary, release-kit location (or why skipped),
deploy URL/artifact, post-deploy check result. Add the release to PROGRESS.md session
log. If anything was skipped or accepted as a gap, it's in the report — plainly, not
in a footnote.
