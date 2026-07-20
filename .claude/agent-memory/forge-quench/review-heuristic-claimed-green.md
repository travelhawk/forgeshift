---
name: review-heuristic-claimed-green
description: Always re-run a claimed-green suite and reconcile the TEST COUNT, not just the exit line — a test file that fails to load reports as one "Failed Suite" with a bare SyntaxError and its tests silently vanish from the total
metadata:
  type: feedback
---

When a task hands you "the suite was green at <sha> (N files / M passed)" as settled
context, **re-run it and reconcile M**. A drop in the passed-count with no named failing
test is the tell that a whole test file never loaded.

**Why:** found 2026-07-20 in the forgekit-saas F19 stripper verify. Claimed 62 files /
350 passed; observed 61 passed + 1 *failed suite* / 334 passed. The 16 missing tests were
a file that never executed a single assertion. Vitest reports a load failure as `FAIL
<file> [ <file> ]` + a bare `SyntaxError: Invalid or unexpected token` with **no stack, no
line, and no location in the JSON reporter either** — it looks like one trivial failure,
not like 16 tests of a T1 feature going dark.

**Mechanism worth remembering (product-agnostic):** a `.mjs`/`.js` script with a leading
`#!/usr/bin/env node` shebang that is *also imported by a test* breaks under Vite's SSR
transform. Vite hoists the ESM import/export rewrites **above** the shebang, so `#!` lands
mid-file and V8 rejects it (hashbang is only legal at offset 0). `node --check` passes and
`esbuild.transformSync` passes — only the vite SSR pipeline fails, so the obvious syntax
probes all come back clean and mislead the diagnosis. Reproduce by dumping
`server.transformRequest(file, {ssr:true}).code` and running `node --check` on the output.

**How to apply:**
- Reconcile counts before trusting any "already green" premise; treat a bare unlocated
  SyntaxError as "a file did not load", not "a test failed".
- Beware a *misdiagnosed prior fix* in the log (here a commit removed a U+200B "that broke
  esbuild parse") — it can make a still-red state look already-handled. Verify the fix
  actually cleared the symptom rather than assuming the commit message.
- **A verify pipeline that deletes artifacts before testing cannot catch defects in
  them.** The stripper self-erased the broken test file, so its own
  typecheck/test/build gate went green on the cut while the template suite stayed red.
  Whenever a tool's verify runs on a *reduced* tree, check the full tree separately.

Related: [[review-heuristic-scan-surface-gap]], [[defect-patterns-harness]].
