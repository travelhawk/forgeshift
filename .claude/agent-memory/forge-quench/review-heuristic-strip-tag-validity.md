---
name: review-heuristic-strip-tag-validity
description: Reviewing line-tag "strippable" transforms — the drift guard checks tag PLACEMENT, not that the stripped output still parses; strip every variant and syntax-check
metadata:
  type: feedback
---

When a change makes a config/source file "strippable" by tagging lines with a removal marker
(e.g. `// fk:<module>`) so a cutter deletes them per buyer choice: the drift guard almost
always verifies tag PLACEMENT (every sensitive token/specifier sits on a tagged line) but NOT
that the post-strip output is still valid syntax. A tag placed on a structurally load-bearing
line — one that closes a paren/bracket/ternary or is required for balance — silently breaks the
stripped file when removed.

**Why:** Seen in F19 (forgekit strip). `eslint.config.mjs` line `: []), // fk:jobs` closed a
`...(MODULES.engine ? [...] : [])` ternary; the runtime `MODULES.engine ?` guard already made the
block inert after a jobs cut, so the tag was superfluous AND harmful — stripping `jobs` (or the
`lean` bundle = all modules) deleted the closing line and orphaned the spread paren → SyntaxError.
No gate caught it: the seams guard only checks specifiers-are-tagged, `tsc` excludes `.mjs`, Next 16
doesn't lint at build, the strip's own verify never runs eslint, and the token-based residue scan
finds no `fk:`/fingerprint tokens in broken JS. It ships to the buyer.

**How to apply:** For any "strippable via line-tags" diff, don't trust the headline cut. Apply the
real transform for EVERY module/variant and bundle (not just the one the plan exercised) and
`node --check` / compile each output. Then walk the gate chain and confirm which gate would actually
catch a broken-but-token-clean output — usually none does. A tag on a line that isn't a
self-contained statement/property is the red flag. Related: [[review-heuristic-scan-surface-gap]]
(same machinery — guard teeth vs. guard coverage), [[stale-example-var-load-bearing]].
