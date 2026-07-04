# Release Checklist: v<X.Y.Z>

> /ship runs the automated half of this via the release-gate workflow.
> The manual half is yours.

## Automated (release-gate workflow)
- [ ] Tests: full suite green
- [ ] Static: types + lint clean
- [ ] Build: production build succeeds
- [ ] Security: no secrets in diff, no HIGH/CRITICAL prod-dep advisories, new endpoints have auth
- [ ] Docs: CHANGELOG entry exists, README commands verified, versions consistent
- [ ] Runtime: app boots and primary route responds

## Manual
- [ ] Walked the core user journey myself, on the deployed preview if one exists
- [ ] Checked the ugly paths: empty states, first-run, bad input, slow network
- [ ] Migrations: reversible, and tested against a copy of real-shaped data
- [ ] Env vars / secrets present in the deploy target — compare KEY NAMES from the
      committed .env.example against the target's config; values stay human-only
- [ ] Rollback plan exists and I know the exact command
- [ ] Monitoring/alerting will tell me if this breaks (or I accept that it won't)

## Ship
- [ ] Version bumped, tag created
- [ ] Deployed
- [ ] Post-deploy smoke test on production
- [ ] CHANGELOG/announcement done
