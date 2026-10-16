# Build lifecycle

```
 IDEA ──► /forge:kickoff ──► SPEC + STACK + SCAFFOLD
                            │
                 ┌──────────▼──────────┐
                 │   FEATURE LOOP      │  /forge:feature (one) ·
                 │  plan → test →      │  /forge:build (whole backlog) ·
                 │  build → verify     │  feature-pipeline (raw batch)
                 └──────────┬──────────┘
                            │  /forge:deep-review  (+ /forge:harden before exposure)
                            ▼
                        /forge:ship ──► release-gate ──► deploy
                            │
                            ▼
                  feedback → /forge:next → next version → loop
```

Bugs go to `/forge:fix`; one that survives two attempts goes to `/forge:debug-hard`.
`/forge:adopt` brings an existing repo into the loop.

## Where it stops for you

Everywhere else the skills run on their own.

| Gate | What blocks |
|---|---|
| Kickoff | Nothing is scaffolded before you approve spec and stack |
| Build | One approval of the wave plan covers the whole backlog |
| Merge | No feature merges with failing or missing tests |
| Review | Zero confirmed critical findings before `/forge:ship` |
| Ship | A NO-SHIP verdict blocks. Fix it, do not override it |
| Ship | The manual checklist (`templates/RELEASE-CHECKLIST.md`) before tag and deploy |

How each stage works is in its skill (`skills/<name>/SKILL.md`) and workflow
(`workflows/<name>.js`). Validation depth per feature: `RISK-TIERS.md`.
