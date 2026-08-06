# Risk-Tiered Validation

Every feature is tagged **T1/T2/T3** at spec time and validation depth branches on the tag. A
payment webhook and a read-only admin list do not deserve the same loop: one loop for both is
slow on boilerplate and leaves no *concentrated* scrutiny for the dangerous 20%. The tag is
**seeded** by auto-classification and is **plain text in the feature row** — you audit and
override it (see [Override](#override)).

## Classify on capability, not on the noun

Risk is a property not of a feature's label ("admin view", "API route", "CRUD") but of what the
feature can *do*. Tag by **capability signal**; the one-line justification cites *which signal
fired*, so the tag is auditable.

| Signal | Fires on |
|---|---|
| **Touches money** | payments, refunds, credits, billing, payment-provider webhooks |
| **Crosses a tenant/user boundary** | any query that must be *filtered* by `tenantId`/`orgId`/owner to be correct — list, search, get-by-id across a multi-row tenant-scoped table. The filter **is** the boundary, so this fires even when the code looks correctly scoped; a silently-missing filter leaks other tenants' rows |
| **Makes an authz/authn decision** | permission checks, role gates, session/cookie handling, token issuance |
| **Accepts untrusted external input** | public/unauthenticated endpoints, webhooks, file uploads, redirect targets |
| **Irreversible / hard-to-reverse side effect** | deletes, external sends (email/SMS), state that cannot be rolled back |

**Any signal fires → T1. Side effects but no signal → T2. Render of the caller's own
already-owned data, or scaffolding → T3.** Ties break **upward**.

**Client-only carve-out (T3):** side effects confined to in-memory client state — a game
simulation, canvas/animation state, a local UI state machine — with no persistence beyond the
user's device, no network write, and no security signal are **T3**, not T2. "State-mutating"
alone is not a signal; T2's "side effects" means effects that outlive the tab or cross a boundary.

## The tiers

| | **T1 — high-risk** | **T2 — medium-risk** | **T3 — low-risk** |
|---|---|---|---|
| **Qualifies** | any capability signal: auth/session, payments/webhooks, permission checks, filter-dependent tenant/owner queries, untrusted external input, irreversible sends | side effects without a signal: business-logic API route handlers, own-record mutations, transactional/marketing email | render of the caller's own/already-owned data, UI components, page/server components, CRUD *scaffolding* |
| **Plan** | `forge-blueprint`, failure paths in the done-criteria | inline or blueprint, tests-first for core behavior | fast: inline generate |
| **Build** | `forge-hammer`, **Opus** (pinned), effort **xhigh**, tests-first | `forge-hammer`, **Opus** (pinned), effort **high** | **Sonnet**, effort **medium** |
| **Tests the builder writes** | behavior tests at the public surface: happy path + explicit failure and edge cases | happy path + top failure path | one smoke test as the done-criteria's test |
| **E2E** | at most **one** spec, and only for what no other layer can reach; written after the feature works | rarely — same bar | none |
| **Per-feature verify** | `forge-quench` (session model) **+ a parallel security pass**, both scoped to the diff; the feature passes only if both pass | `forge-quench` (session model), **one** pass, medium effort | **smoke check only** (Haiku/Sonnet: builds / renders / one happy-path assertion). **No `forge-quench`.** |
| **In `/forge:build` finish** | **priority scope** of the integrated `deep-review` (full 6 dimensions, 2 refuters) | swept by the integrated `deep-review` | swept at reduced refuter cost, not individually pre-reviewed |

**Tier sets test *depth*, never *who runs what*.** At every tier the build agent's own gate is
`typecheck` + `lint` + the tests covering its diff. The full suite and the single e2e run
belong to the merge gate, once per wave (`CLAUDE.md` hard rules 2–3). A T1 feature is not a
licence for its agent to run the whole suite.

**The seeded tier is a pre-build guess — the built diff gets a second look.** After a T2/T3
feature is built, in **both lanes** (the `feature-pipeline` re-check stage and the direct
`/forge:feature` / small-wave loop), a cheap Haiku pass reads its actual diff
(`git diff --merge-base`) and **escalates** it to the adversarial security pass if it touched a
sensitive surface the seed under-budgeted (a tenant query, a webhook parser, token handling) —
combined fail-closed like a T1. It only ever *raises* depth, and is skipped for T1, which runs
security already. Gate depth depends on a feature's tier and its diff,
never on which lane built it.

Tier and `/forge:feature`'s small/medium/large **sizing** are orthogonal: sizing controls
*planning ceremony*, tier controls *validation depth*. A 5-line auth-cookie change is *small*
but **T1** — and tier overrides the "cosmetic changes may skip verify" allowance **upward**: a
T1 change never skips verify, however tiny. (`build → Sonnet` for T3 is existing routing policy
— [MODEL-ROUTING.md](MODEL-ROUTING.md).)

## Verification cost rules (added after the forgedefense retro, 2026-07-21)

- **Chained features share reviews.** Sequentially-chained entries get ONE consolidated
  `forge-quench` per ~3 links (and one at the chain's end) over the combined diff — not a fresh
  reviewer per link. A HIGH found late in a segment still lands pre-merge of that segment.
- **Reviews are scoped to the diff**, not to the surrounding subsystem. An unscoped consolidated
  audit over a three-feature auth chain measured 2 h 57 min — longer than building it.
- **The reviewer does not re-run the gate suite.** `forge-quench` spot-runs the unit suite; it
  re-runs typecheck/build/e2e only when the diff gives a concrete reason to distrust the
  builder's pasted evidence (build config touched, e2e specs changed). On the forgedefense run,
  per-feature reviewers re-running every gate cost ~40% of total review time while never once
  contradicting the builder's evidence.

## Boundary calls (where the obvious label misleads)

- **Admin views are not uniformly low-risk.** Read-only, *same-tenant* = T3. One that **mutates**
  (delete user, change role, issue refund, toggle a flag) or **reads across tenants / shows
  PII** = **T1** — a forgotten tenant filter in an admin list is the cross-tenant-leak class.
- **"Route" conflates two things.** A page / server component that renders = **T3**. An API
  **route handler** (`app/api/**/route.ts`) runs server-side and usually mutates or makes an
  authz decision → **T2**, or **T1** if a signal fires.
- **CRUD: the R is not the CUD.** Rendering the caller's own record + pure scaffolding = T3.
  Create/Update/Delete on the caller's own record = **T2**; on money / permissions / another
  tenant's rows = **T1**.
- **A tenant-scoped *query* is T1 — a rendered own-record is not.** The moment a feature runs a
  query that must be filtered by `tenantId`/`orgId`/owner to be correct, that filter *is* the
  security boundary: a missing one leaks other tenants' rows and the happy-path test still
  passes, because it asserts *your* row is present, never that foreign rows are absent. This is
  the auto-classifier's most common under-call, confirmed by eval: a seed tag of T2/T3 on a
  filter-dependent tenant query is a tie — bump to **T1**.
- **Auth email is not "email sending."** Transactional/marketing email = T2. A password-reset /
  magic-link / email-verification message carries a credential → **T1**.
- Also always T1: **file uploads** (path traversal / SSRF), anything **setting auth cookies / a
  session**, and **secret / token handling**.

## Tagging

The tag lives in the feature row — the source of truth the skills already read:

- **PROGRESS.md:** `- [ ] F3 — Admin user list — **T3** (read-only, same-tenant, no mutations) — <done-criteria>`
- **docs/SPEC.md** V1 table: a **Risk** column holding `T? (<one-line justification>)`.
- **docs/features/F<#>.md** (large features): a `## Risk tier` line.

`/forge:kickoff` and `/forge:adopt` seed the tags via `forge-blueprint` at spec time, each with
a one-line justification naming the signal. Auto-classification only *seeds*; the file is
authoritative.

## Override

Three override points, coarsest to finest:

1. **Durable:** edit the `T?` marker (and its justification) in `PROGRESS.md` / `SPEC.md`.
   Whatever is written wins — state on disk, not in chat.
2. **Per batch, at the gate:** the `/forge:build` wave-plan table shows every feature's tier +
   justification. Adjust before you approve; the approval covers the change.
3. **Per run:** `/forge:feature F3 as tier 1` (or `as tier 3`) overrides the recorded tag for
   that single run.

## Why this is right-sizing, not a hole in the gates

Hard rule 1 still holds: T3's "smoke-test only" right-sizes a warranted test, it never skips
one — a boilerplate feature's *appropriate* test **is** a smoke test. T3 is "not *individually*
pre-reviewed", never "unreviewed": ties classify up, and the integrated `deep-review` sweeps
every tier, so a high-risk feature misclassified to T3 is still caught before `/forge:ship`.
