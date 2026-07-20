---
name: review-heuristic-scan-surface-gap
description: When reviewing a static-analysis drift guard, prove its teeth AND enumerate its scanned surface — a guard with real teeth still misses everything outside its file walk (root configs, scripts/, e2e/)
metadata:
  type: feedback
---

A repo-scanning guard test (fingerprint scan, drift guard, boundary lint) has **two**
independent failure modes. Reviewing only the first is how a hardened guard still ships a
hole.

1. **Do the checks fire?** Plant a real violation and confirm RED naming the offender.
   Do it in a *copy* of the tree, never the reviewed worktree — `tar` the repo minus
   `node_modules` into scratchpad and junction `node_modules` back
   (`cmd //c mklink //J <copy>/node_modules <repo>/node_modules`); remove the junction
   afterwards with `cmd //c rmdir` (NOT `rm -rf`, which would recurse into the real one).
2. **What does it scan?** Re-implement the guard's file-collection in a throwaway node
   script and probe candidate paths against it. Guards typically walk `src/` + `docs/`
   plus a hand-listed `ROOT_FILES` array — so `eslint.config.mjs`, `next.config.ts`,
   `vitest.config.ts`, `drizzle.config.ts`, `scripts/`, `e2e/`, `templates/` are blind.

**Why:** found 2026-07-20 in forgekit-saas F19. All three newly-added checks had genuine
teeth against the real tree, but `eslint.config.mjs` was outside the walk entirely and
carried live module-path references that survived a module-off cut. A companion residue
scanner *did* read the file yet missed it too, because its detector only extracted
import/require *forms* (`from "x"`, `import("x")`) while the reference was a bare array
string (`"!@/lib/billing"`). Two independent gaps converging on one miss.

**How to apply:** for every fingerprint/tag a guard hunts, ask "in what *syntactic form*
can this token legitimately appear?" — bare strings in config arrays, glob patterns,
`files:` override selectors, and doc-path references in error messages are all real forms
that import-shaped detectors skip. Also check whether the guard's manifest has an
escape-hatch list for exactly these (e.g. a `fingerprints: []` field) that is sitting
empty and therefore doing nothing.

Related: [[review-heuristic-claimed-green]], [[stale-example-var-load-bearing]].
