# Feature: <name> (F<#> from SPEC.md)

> Working document for one feature. /forge:feature instantiates it at docs/features/F<#>.md
> for LARGE features only; small and medium features keep the plan in the conversation.
> Archive or delete after merge.

## Risk tier
<T1 / T2 / T3> — <one-line justification: the capability signal that set it>. Determines
how much validation this feature gets. See docs/RISK-TIERS.md.

## Goal
<What the user can do after this ships that they couldn't before. One paragraph.>

## Done criteria (checkable)
- [ ] <observable behavior 1>
- [ ] <observable behavior 2>
- [ ] Tests cover the happy path and the top failure path
- [ ] No regression in existing test suite

## Plan
- Approach: <how, in 3-6 lines>
- Files to touch: <list>
- Test plan: <which tests first, what they assert>

## Risks / open questions
- <anything that could invalidate the plan>

## Log
<Deviations from plan, discovered constraints, decisions made mid-build. Append-only.>
