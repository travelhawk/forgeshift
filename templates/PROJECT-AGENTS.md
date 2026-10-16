# <Product name>

<!-- Template: copied into each product by /forge:kickoff, then FILLED with real values.
     Delete every placeholder and this comment. Keep the whole file under ~120 lines;
     apply the pruning test to every line: "would removing this cause mistakes?" -->

<One sentence: what this product is.> Spec: `docs/SPEC.md` (intent, scope,
done-criteria). State: `PROGRESS.md` (feature list + session log). Decisions:
`docs/adr/`.

## Session start

1. Read `PROGRESS.md` — especially "Next session should".
2. Run the smoke test: `<command>` — green before new work starts.
3. One feature per session unless features are trivially small.

## Commands

```
<pkg> install          # deps
<pkg> run dev          # dev server → http://localhost:<port>
<pkg> test             # full suite — the merge gate runs it; a feature runs its own tests
<pkg> run typecheck    # <or note: covered by build>
<pkg> run lint
<pkg> run build        # production build
<deploy command>       # deploy (target: <where>)
```

## Stack

<framework> · <db + ORM> · <auth> · <hosting> · <test runners>. Versions: the manifest.
Rationale: `docs/adr/001-stack.md`.

## Conventions (only the ones that differ from framework defaults)

- <e.g. server components by default; "use client" only for interactivity>
- <e.g. DB access only through src/db/queries/ — never raw client in routes>
- <e.g. all times UTC in DB, localized at render>

## Quality gates (from Forge)

- Never weaken a test to pass it. Evidence before "done" claims.
- A feature's gate: typecheck + lint + the tests covering its diff. The full suite is the merge gate.
- Medium+ changes get fresh-context review (`forge-quench`) before merge.
- The code is the truth for how; `docs/SPEC.md` changes only when what the user gets changes.
- Two failed attempts → escalate, don't grind.

## Gotchas

<Traps discovered while building — the section that saves future sessions. Prune
ruthlessly; stale gotchas are worse than none.>
