# Risk-Tiered Validation

Not every feature deserves the same validation. A payment webhook and a read-only admin
list both went through the identical plan → test → build → fresh-context-verify loop —
thorough, but slow and expensive on boilerplate, and no *concentrated* scrutiny on the
dangerous 20%. Risk tiers fix that: each feature is tagged **T1/T2/T3** at spec time, and
the build+validate orchestration branches on the tag instead of running one fixed loop.

The tag is **seeded** by auto-classification and is **plain text in the feature row** —
you audit and override it (see [Override](#override)).

## Classify on capability, not on the noun

Risk is not a property of a feature's label ("admin view", "API route", "CRUD"). It is a
property of what the feature can *do*. Tag by **capability signal** — and the one-line
justification cites *which signal fired*, so the tag is auditable.

| Signal | Fires on |
|---|---|
| **Touches money** | payments, refunds, credits, billing, payment-provider webhooks |
| **Crosses a tenant/user boundary** | any query that must be *filtered* by `tenantId`/`orgId`/owner to be correct — list, search, get-by-id across a multi-row tenant-scoped table. The filter **is** the boundary, so this fires even when the code looks correctly scoped; a silently-missing filter leaks other tenants' rows |
| **Makes an authz/authn decision** | permission checks, role gates, session/cookie handling, token issuance |
| **Accepts untrusted external input** | public/unauthenticated endpoints, webhooks, file uploads, redirect targets |
| **Irreversible / hard-to-reverse side effect** | deletes, external sends (email/SMS), state that cannot be rolled back |

**Any signal fires → Tier 1. Side effects but no signal → Tier 2. Render of the caller's
own already-owned data, or scaffolding → Tier 3.** Ties break **upward** — when unsure,
the higher tier. (A *filter-dependent tenant query* is not "own data" — it's T1; see the
boundary calls below.)

## The tiers

| | **T1 — high-risk** | **T2 — medium-risk** | **T3 — low-risk** |
|---|---|---|---|
| **Qualifies** | any capability signal: auth/session, payments/webhooks, permission checks, filter-dependent tenant/owner queries, untrusted external input, irreversible sends | side effects without a signal: business-logic API route handlers, own-record mutations, transactional/marketing email | render of the caller's own/already-owned data, UI components, page/server components, CRUD *scaffolding* |
| **Plan** | `forge-blueprint`, failure paths in the done-criteria | inline or blueprint, tests-first for core behavior | fast: inline generate |
| **Build** | `forge-hammer`, Opus/session, effort **xhigh**, tests-first | `forge-hammer`, Opus/session, effort **high** | **Sonnet**, effort **medium** |
| **Per-feature verify** | `forge-quench` (session model) **+ a parallel security/adversarial pass**; feature passes only if both pass | `forge-quench` (session model), **one** pass, medium effort | **smoke check only** (Haiku/Sonnet: builds / renders / one happy-path assertion). **No `forge-quench`.** |
| **Tests** | full suite + explicit edge/failure cases | happy path + top failure path | a smoke test as the done-criteria's test |
| **In `/forge` finish** | **priority scope** of the integrated `deep-review` (full 6 dimensions, 2 refuters) | swept by the integrated `deep-review` | swept at reduced refuter cost, not individually pre-reviewed |

`build → Sonnet` for T3 is the existing routing policy, not a new rule: well-defined
boilerplate execution is exactly Sonnet's tier ([MODEL-ROUTING.md](MODEL-ROUTING.md)).
Risk tier and `/feature`'s small/medium/large **sizing** are orthogonal: sizing controls
*planning ceremony*, tier controls *validation depth*. A 5-line auth-cookie change is
*small* but **T1** — and tier overrides the "cosmetic changes may skip verify" allowance
**upward** (a T1 change never skips verify, however tiny).

## Boundary calls (where the obvious label misleads)

- **Admin views are not uniformly low-risk.** A read-only admin view of *same-tenant*
  data is T3. One that **mutates** (delete user, change role, issue refund, toggle a flag)
  or **reads across tenants / shows PII** is **T1** — a forgotten tenant filter in an
  admin list is the cross-tenant-leak class.
- **"Route" conflates two things.** A page / server component that renders = **T3**. An
  API **route handler** (`app/api/**/route.ts`) runs server-side and usually mutates or
  makes an authz decision → **T2**, or **T1** if a signal fires.
- **CRUD: the R is not the CUD.** Rendering the caller's own record + pure scaffolding =
  T3. A read/list that *queries a tenant-scoped table* is **T1** (next bullet).
  Create/Update/Delete on the caller's own record = **T2**; on money / permissions /
  another tenant's rows = **T1**.
- **A tenant-scoped *query* is T1 — a rendered own-record is not.** The moment a feature
  runs a query that must be filtered by `tenantId`/`orgId`/owner to be correct (list,
  search, get-by-id across a multi-row tenant table), that filter *is* the security
  boundary: a silently-missing one leaks other tenants' rows, and the happy-path test
  passes anyway — it asserts *your* row is present, never that foreign rows are absent.
  That earns the security pass → **T1**. Rendering data the caller already owns (their own
  settings/dashboard, no filter-dependent query) stays **T3**. This is the auto-classifier's
  most common under-call, confirmed by eval: when the seed tag says T2/T3 on a
  filter-dependent tenant query, treat it as a tie and bump to **T1**.
- **Auth email is not "email sending."** Transactional/marketing email = T2. But a
  password-reset / magic-link / email-verification message is part of the **auth flow** —
  the token is a credential → **T1**.
- Also always T1: **file uploads** (path traversal / SSRF), anything **setting auth
  cookies / a session**, and **secret / token handling**.

## Tagging

The tag lives in the feature row — the source of truth the skills already read:

- **PROGRESS.md:** `- [ ] F3 — Admin user list — **T3** (read-only, same-tenant, no mutations) — <done-criteria>`
- **docs/SPEC.md** V1 table: a **Risk** column holding `T? (<one-line justification>)`.
- **docs/features/F<#>.md** (large features): a `## Risk tier` line.

`/kickoff` (and `/adopt`) seed the tags via `forge-blueprint` at spec time, each with a
one-line justification naming the signal. Auto-classification only *seeds* — the file is
authoritative.

## Override

Auto-classification will miss context you have. Three override points, coarsest to finest:

1. **Durable:** edit the `T?` marker (and its justification) in `PROGRESS.md` / `SPEC.md`.
   Whatever is written wins — state on disk, not in chat.
2. **Per batch, at the gate:** the `/forge` wave-plan table shows every feature's tier +
   justification. Adjust tiers there before you approve; the approval covers the change.
3. **Per run:** `/feature F3 as tier 1` (or `as tier 3`) in the argument overrides the
   recorded tag for that single run.

## Guardrails (why this is right-sizing, not a hole in the gates)

Harness Hard Rule #1 — *never delete, weaken, or skip a test to get green* — still holds.
T3's "smoke-test only" is compatible because a boilerplate feature's *appropriate* test
**is** a smoke test; we right-size the test, we do not skip a warranted one. Two
guardrails keep that honest:

1. **Ties classify up.** Doubt → higher tier. A feature that *might* touch a boundary is
   treated as if it does.
2. **The final integrated `deep-review` in `/forge` sweeps all tiers.** T3 is "not
   *individually* pre-reviewed," never "unreviewed." A high-risk feature misclassified to
   T3 is still caught at the finish gate before `/ship`.

Without these two, tiering would be a hole in "gates that gate." With them, it is
right-sizing.
