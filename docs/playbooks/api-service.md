# Playbook: Backend API Service

_As of 2026-07. Verify major versions at kickoff — this file ages._

## Default stack

**TypeScript (default):**

| Layer | Choice | Version (2026-07) | Notes |
|---|---|---|---|
| Framework | Hono | 4.12.x | Web-standards, runs on Node/Bun/Workers/Lambda unchanged |
| Runtime | Node 24 LTS (or Bun 1.3, or Cloudflare Workers) | — | pick per deploy target |
| Validation | zod + @hono/zod-validator | — | validate at the boundary, trust inside |
| DB | Postgres (Neon) + Drizzle | — | same as web-app playbook |
| Tests | Vitest 4.x + supertest-style via hono/testing | — | |
| Docs | OpenAPI via @hono/zod-openapi | — | contract-first if consumers exist |
| Hosting | Railway (containerized, simple) / Cloudflare Workers (edge) / Fly (global, long-running) | — | |

**Python (when AI/ML is central):** FastAPI 0.138.x + uv + pydantic v2 + pytest;
deploy on Railway/Fly. **Node-only with heavy plugin needs:** Fastify 5.9.x.

## Scaffold (Hono on Node)

```bash
pnpm create hono@latest <name>   # pick nodejs (or cloudflare-workers) template
cd <name>
pnpm add zod @hono/zod-validator drizzle-orm postgres
pnpm add -D drizzle-kit vitest tsx
```

Structure: `src/routes/<resource>.ts` (one file per resource), `src/db/`,
`src/middleware/` (auth, logging, error handler), `src/index.ts` wires only.
Health endpoint `/healthz` from day one (deploy targets need it).

## Conventions

- Every route: zod-validated input → typed handler → explicit error mapping. No
  stack traces in responses; no silent 500s in logs.
- Auth as middleware applied per route-group — the default is protected; public routes
  are the explicit exception list.
- Version the API path (`/v1/`) from the first consumer onwards, not before.
- Structured JSON logs (one line per request: method, path, status, ms) — grep-able
  beats pretty.

## Deploy (Railway default)

`railway init` → `railway up`; set env vars in dashboard or `railway variables`.
Health check on `/healthz`. Postgres either Railway's own or Neon via URL.

## Gotchas

- Hono runs everywhere but your DB driver might not — `postgres` (postgres.js) works on
  Node; edge targets need Neon's HTTP driver. Decide the deploy target BEFORE writing DB
  code.
- Rate limiting is not optional on public APIs — hono middleware + a KV/Redis counter,
  from the first public deploy.
- CORS: explicit allowlist, never `*` with credentials.

## In flux (re-check at kickoff)

oRPC for typed clients; Bun as production runtime consolidating post-acquisition.
