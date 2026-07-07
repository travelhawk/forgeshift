# Spec: <product / feature name>

> One spec per product at `docs/SPEC.md` in the project. The spec is the contract between
> you and the agents — everything a builder needs to work autonomously, nothing more.
> Update it when reality diverges; a stale spec is worse than none.

## Problem
<Who has what problem. One paragraph. If you can't write this, stop and validate the
problem first — talk to users, or run /validation-engine:validation-cockpit if that
plugin is installed.>

## Solution in one sentence
<The product in ≤ 25 words.>

## Users & core journey
- Primary user: <who>
- Core journey: <the ONE path that must be flawless, step by step>

## Scope

### V1 — must ship
Each row is a slice of user value (independently buildable + testable, ~2-5 done-criteria),
not one-per-requirement. Right-size to the project: small tool ~3-6, MVP ~8-15; a V1 caps
at ~15 — phase a bigger backlog into a V2 section below rather than padding or cramming.
Risk = validation tier T1/T2/T3 + why (the capability signal). Seeded at kickoff,
overridable. See docs/RISK-TIERS.md.

| # | Feature | Risk | Done means |
|---|---|---|---|
| F1 | <feature> | T? (<why>) | <checkable statement> |
| F2 | <feature> | T? (<why>) | <checkable statement> |

### Explicitly out of scope (V1)
- <thing people will ask about — and why it waits>

## Non-functional requirements
- Performance: <e.g. p95 page load < 1.5s; only list what you'll actually check>
- Security: <auth model, data sensitivity, compliance constraints>
- Platforms: <browsers/devices/OS actually supported>

## Stack
<Filled at kickoff from the matching playbook in docs/playbooks/. Name exact choices:
framework + version, DB, auth, hosting, package manager.>

## Data model (sketch)
<Entities and relationships. Enough to start; the code is the source of truth after that.>

## Key decisions
| Decision | Choice | Why | Revisit when |
|---|---|---|---|
| <e.g. auth provider> | <choice> | <one line> | <trigger> |

## Open questions
- [ ] <question> — owner: <you/agent>, blocking: <F#/no>
