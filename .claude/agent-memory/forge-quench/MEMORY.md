# Memory Index

<!-- Project-specific memory is kept local-only (see .gitignore). This shared index
     lists only harness-level, product-agnostic memory. -->

- [Harness defect patterns](defect-patterns-harness.md) — meta/doc drift after behavior changes; settings.json allowlist creep; node --check quirk for workflow scripts
- [Encoding-sanitize review heuristic](review-heuristic-encoding-sanitize.md) — probe an external lib's real failure set; don't trust a spec-derived drop-set or a single-value test
- [Claimed-green review heuristic](review-heuristic-claimed-green.md) — re-run and reconcile the test COUNT; a non-loading test file hides as one bare SyntaxError (shebang + vite SSR)
- [Scan-surface gap heuristic](review-heuristic-scan-surface-gap.md) — prove a drift guard's teeth AND enumerate its file walk; import-shaped detectors miss bare-string references
- [Strip-tag validity heuristic](review-heuristic-strip-tag-validity.md) — line-tag "strippable" transforms: guard checks tag placement, not output syntax; strip EVERY variant + node --check, no gate catches broken-but-token-clean output
