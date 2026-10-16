# Risk tiers

Every feature is tagged **T1/T2/T3** at spec time. The tag sets validation depth: a payment
webhook gets concentrated scrutiny, a read-only list gets a smoke test. This page defines how
to classify. What each tier then runs — stages, models, efforts — is code:
`workflows/feature-pipeline.js` (`buildOpts`, the verify stage). Where this page and the code
disagree, the code is right and this page is the bug.

## Classify on capability, not on the noun

Tag by what the feature can *do*, not by its label ("admin view", "API route", "CRUD"). The
one-line justification names the signal that fired.

| Signal | Fires on |
|---|---|
| **Touches money** | payments, refunds, credits, billing, payment-provider webhooks |
| **Crosses a tenant/user boundary** | any query that must be *filtered* by `tenantId`/`orgId`/owner to be correct. The filter is the boundary, so this fires even when the code looks scoped |
| **Makes an authz/authn decision** | permission checks, role gates, session/cookie handling, token issuance |
| **Accepts untrusted external input** | public endpoints, webhooks, file uploads, redirect targets |
| **Irreversible side effect** | deletes, external sends (email/SMS), state that cannot be rolled back |

**Any signal → T1. Side effects without a signal → T2. Rendering the caller's own data, or
scaffolding → T3.** Ties break upward.

**Client-only carve-out (T3):** effects confined to in-memory client state — a game loop,
canvas state, a local UI state machine — with no persistence, no network write and no signal.
T2's "side effects" means effects that outlive the tab or cross a boundary.

## What the tiers buy

| | T1 | T2 | T3 |
|---|---|---|---|
| Builder's tests | happy path + explicit failure and edge cases | happy path + top failure path | one smoke test |
| Per-feature review | functional review + security pass, both must pass | one functional review | smoke check only |
| E2E | at most one spec, only for what no other layer reaches | rarely | none |

Tier sets test *depth*, never who runs what: every builder's gate is typecheck + lint + the
tests covering its diff (`AGENTS.md` hard rules 2–3). After a T2/T3 build, in both lanes
(`feature-pipeline` and the direct `/forge:feature` loop), a cheap re-check reads the actual diff
and adds the security pass if it touched a sensitive surface. It only ever raises depth. Depth
depends on tier and diff, never on which lane built it. The `/forge:build` finish review sweeps
every tier, T1 paths first.

Tier and `/forge:feature` sizing are separate: sizing controls planning ceremony, tier controls
validation. A 5-line auth-cookie change is small but T1, and a T1 change never skips verify.

## Boundary calls

- **Admin views:** read-only, same-tenant = T3. One that mutates (delete user, change role,
  refund, toggle a flag) or reads across tenants / shows PII = **T1**.
- **"Route":** a page or server component that renders = T3. An API route handler usually
  mutates or decides authz → T2, or T1 if a signal fires.
- **CRUD:** reading the caller's own record = T3. Create/update/delete on it = T2; on money,
  permissions or another tenant's rows = T1.
- **Tenant-scoped query = T1.** A missing filter leaks foreign rows while the happy-path test
  still passes. This is the classifier's most common under-call: bump a T2/T3 seed to T1.
- **Auth email:** transactional or marketing email = T2. Password reset, magic link or email
  verification carries a credential → T1.
- Always T1: file uploads, anything that sets auth cookies or a session, secret/token handling.

## Tagging and override

The tag is plain text in the feature row, and the file wins over chat:

- `PROGRESS.md`: `- [ ] F3 — Admin user list — **T3** (read-only, same-tenant) — <done-criteria>`
- `docs/SPEC.md`: the **Risk** column, `T? (<signal>)`.

`forge-blueprint` seeds the tags at kickoff/adopt/next. Override in three places: edit the
marker on disk (durable), adjust the wave-plan table before approving `/forge:build` (per batch),
or run `/forge:feature F3 as tier 1` (per run).

T3's smoke test is the right-sized test, never a skipped one. T3 is not *individually*
reviewed, but never unreviewed: the integrated `deep-review` sweeps it before `/forge:ship`.
