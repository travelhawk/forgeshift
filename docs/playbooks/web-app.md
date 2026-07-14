# Playbook: Full-Stack Web App / SaaS

_As of 2026-07. Verify major versions at kickoff — this file ages._

## Default stack

| Layer | Choice | Version (2026-07) | Notes |
|---|---|---|---|
| Framework | Next.js (App Router) | 16.2.x LTS | Turbopack default for dev+build; opt-in "Cache Components" (`'use cache'`) |
| Language | TypeScript | bundled | strict mode on |
| Styling | Tailwind CSS | 4.3.x | v4 config-in-CSS |
| Components | shadcn/ui | CLI v4 | namespaced registries; agent-friendly (has MCP) |
| DB | Postgres via Neon (DB-only) or Supabase (want bundled auth/storage/realtime) | — | Neon: branching + scale-to-zero |
| ORM | Drizzle | 1.0-beta (prod-proven) | Prisma 7 equally fine if you prefer studio/abstraction |
| Auth | better-auth | 1.6.x | the successor path blessed by the Auth.js team; Clerk if hosted B2C speed > cost |
| API layer | Server Actions + route handlers | — | add tRPC only when a second client (mobile) or heavy client-side querying appears |
| Tests | Vitest 4.x + Playwright 1.61.x | — | Vitest 5 is beta — pin 4 |
| Package manager | pnpm 11.x | — | Bun 1.3 acceptable for greenfield speed |
| Hosting | Vercel | — | Railway/Fly if serverless bills or long-running work bite |

## Scaffold

```bash
# All scaffold commands MUST run non-interactively — if one prompts, its flags have
# drifted; check the CLI's current --help before fighting it.
pnpm dlx create-next-app@latest <name> --ts --app --tailwind --eslint --turbopack --use-pnpm --src-dir --import-alias "@/*" --yes
cd <name>
pnpm dlx shadcn@latest init -d
pnpm add drizzle-orm postgres && pnpm add -D drizzle-kit
pnpm add better-auth
pnpm add -D vitest @vitejs/plugin-react playwright @playwright/test
```

Then: `src/db/` (schema + queries — all DB access through here), `src/lib/auth.ts`
(better-auth setup), `.env.example` committed with every var the app reads,
`drizzle.config.ts`, one Vitest smoke test + one Playwright test that boots the app and
loads `/`.

## Conventions that prevent agent-built-app rot

- Server Components by default; `"use client"` only where interactivity demands it.
- Mutations via Server Actions with input validation (zod) at the boundary.
- One `src/db/queries/` module per entity — no inline SQL/ORM calls in routes/components.
- Auth checks in a single middleware/helper — never per-page copy-paste.
- Env access through one typed `src/lib/env.ts` that fails fast on missing vars.

## Deploy (Vercel)

First deploy: `vercel link` → set env vars (`vercel env add`) → `vercel --prod`.
Preview deploys per branch are automatic once the repo is connected. DB migrations run
via `drizzle-kit migrate` in CI/predeploy — never auto-push schema from dev against prod.

## Gotchas

- Next 16 caching is opt-in — don't cargo-cult Next 14/15 `revalidate` patterns; use
  `'use cache'` deliberately or skip caching until it's needed.
- better-auth needs its schema migrated into your DB — run its generator against
  Drizzle before first login attempt.
- Neon scale-to-zero cold starts (~500ms) are fine for side projects; disable for
  latency-sensitive prod.
- Playwright in CI needs `npx playwright install --with-deps chromium` — bake into CI
  config at scaffold time, not first-failure time.
- Killing the dev server on Windows: a bare `kill` hits the pnpm wrapper and leaves
  node.exe holding port 3000 — use `taskkill //F //T //PID <pid>` or `npx kill-port 3000`.
- `create-next-app`'s default `.gitignore` has `.env*`, which silently swallows your
  committed `.env.example` (a hard-rule-5 artifact). After scaffold, append
  `!.env.example` and confirm `git status` shows the file staged. (as of 2026-07)
- `create-next-app` does NOT `git init` inside a subdirectory that sits under a parent
  repo (e.g. `projects/<name>/` in the harness — `projects/` is gitignored, so the tool
  sees the parent repo and skips init). Verify with `git rev-parse --show-toplevel`
  inside the product; if it points at the parent, run `git init -b main` + initial
  commit before building. (as of 2026-07)

## In flux (re-check at kickoff)

Vitest 5 (beta now), Drizzle 1.0 stable release, oRPC as tRPC alternative, Bun-vs-pnpm
consolidation after the Anthropic-Bun acquisition.
