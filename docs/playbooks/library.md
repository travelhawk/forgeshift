# Playbook: Library / Package

_As of 2026-07. Verify major versions at kickoff — this file ages._

## Default stack (TypeScript/npm — adapt per ecosystem)

| Layer | Choice | Notes |
|---|---|---|
| Language | TypeScript, strict | types are the product's second API |
| Build | tsup (ESM + CJS dual output, .d.ts) | zero-config; ESM-only acceptable for new libs in 2026 |
| Tests | Vitest 4.x | plus type-level tests (`expectTypeOf`) for public generics |
| Versioning | changesets | semver discipline + changelog automation |
| CI | GitHub Actions: test matrix (Node 22/24/26) + publish on tag | npm provenance on |
| Docs | README-driven + typedoc only if the surface is large | |

Go: standard layout + module; Python: uv + hatchling + pytest — same principles apply.

## Scaffold

```bash
mkdir <name> && cd <name> && pnpm init
pnpm add -D typescript tsup vitest @changesets/cli
pnpm changeset init && npx tsc --init --strict
```

package.json essentials: `"type": "module"`, `exports` map (never bare `main` alone),
`files` whitelist, `sideEffects: false`, `engines.node`. Verify the built artifact
imports cleanly from BOTH `import` and `require` (if dual) in a scratch project before
v0.1.0 — broken exports maps are the #1 published-library bug.

## API design rules (the actual product)

- **The API is the spec.** Design the README's usage section FIRST, then implement to
  make it true (readme-driven development).
- Smallest surface that solves the problem: every exported symbol is a forever-contract.
  Default to not exporting.
- No runtime dependencies without a fight — each one is your users' problem too. Zero
  is the target for small libs.
- Errors: typed/named error classes, messages that say what to do, never bare strings.
- Semver honestly: breaking type changes ARE breaking changes.

## Testing

Public-API tests only (internals stay refactorable) + type tests for generics + one
"consumer smoke": a fixture project that installs the packed tarball (`pnpm pack`) and
imports it — catches exports/types/bundling breakage that unit tests never see.

## Release

`pnpm changeset` per change → CI on tag: build, test, `changeset publish` with npm
provenance. README badges last, docs verified by running every snippet.

## Gotchas

- Dual ESM/CJS is a tax — if no known consumer needs CJS, ship ESM-only and say so.
- Peer dependencies for frameworks (react, etc.), never direct deps.
- Don't bundle your dependencies into the artifact unless you know exactly why.
