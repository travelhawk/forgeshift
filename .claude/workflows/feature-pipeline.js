export const meta = {
  name: 'feature-pipeline',
  description: 'Implement independent features in parallel: plan → implement in isolated worktree → verify',
  whenToUse: 'A batch of INDEPENDENT features/tasks from a spec, in a git repo with at least one commit. Pass args as an array of feature strings, or an object {features: [...], context: "shared context"}. Dependent features belong in one entry.',
  phases: [
    { title: 'Plan', detail: 'per-feature implementation plan + test plan' },
    { title: 'Build', detail: 'implement in isolated git worktree' },
    { title: 'Verify', detail: 'fresh-context check against the plan, tests run' },
  ],
}

let features = []
let context = ''
if (Array.isArray(args)) features = args
else if (args && Array.isArray(args.features)) { features = args.features; context = args.context || '' }
// Coerce non-string entries so no stage receives '[object Object]'.
features = features.map(f => typeof f === 'string' ? f.trim() : JSON.stringify(f)).filter(f => f && f.length)
if (!features.length) {
  return { error: 'feature-pipeline requires args: ["feature 1", ...] or {features: [...], context: "..."}' }
}

const PLAN = {
  type: 'object',
  additionalProperties: false,
  required: ['approach', 'files_to_touch', 'test_plan', 'done_criteria'],
  properties: {
    approach: { type: 'string' },
    files_to_touch: { type: 'array', items: { type: 'string' } },
    test_plan: { type: 'string', description: 'Which tests to write first and what they assert' },
    done_criteria: { type: 'array', items: { type: 'string' }, description: 'Checkable statements that define done' },
  },
}

const BUILD = {
  type: 'object',
  additionalProperties: false,
  required: ['branch', 'summary', 'tests_passing', 'deviations'],
  properties: {
    branch: { type: 'string', description: 'git branch name the work was committed to' },
    summary: { type: 'string' },
    tests_passing: { type: 'boolean' },
    deviations: { type: 'array', items: { type: 'string' }, description: 'Where and why the build deviated from the plan' },
  },
}

const CHECK = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'issues'],
  properties: {
    verdict: { type: 'string', enum: ['pass', 'fail'] },
    issues: { type: 'array', items: { type: 'string' } },
  },
}

const results = await pipeline(
  features,
  (f, _, i) => agent(
    `Plan the implementation of this feature in the repository at the current working directory. Read the relevant ` +
    `existing code first; the plan must fit existing conventions.\n\nFEATURE: ${f}\n` +
    (context ? `SHARED CONTEXT:\n${context}\n` : '') +
    `\nTests-first: the test plan is not optional. Keep the plan minimal — no speculative abstractions.`,
    { label: `plan:${i + 1}`, phase: 'Plan', effort: 'high', schema: PLAN },
  ),
  (plan, f, i) => plan && agent(
    `Implement this feature following the plan. You are in an ISOLATED git worktree — create and commit your work to a ` +
    `FRESH branch named feature/wf-${i + 1}-<suffix>, where <suffix> is a short random alphanumeric string you generate ` +
    `(collision-proof across runs). Never reuse an existing feature/wf-* branch. Report the exact branch name.\n\nFEATURE: ${f}\n` +
    (context ? `SHARED CONTEXT:\n${context}\n` : '') +
    `PLAN:\n${JSON.stringify(plan, null, 2)}\n\n` +
    `Order of work: write the tests from the test plan first, watch them fail, implement until they pass, ` +
    `run the project's full relevant test suite. Match existing code style exactly. ` +
    `If the plan turns out wrong mid-build, fix the approach and record it in deviations — do not ship a broken plan. ` +
    `Commit with a clear message before finishing.`,
    { label: `build:${i + 1}`, phase: 'Build', isolation: 'worktree', effort: 'high', schema: BUILD },
  ).then(b => b && { plan, build: b }),
  (r, f, i) => r && agent(
    `Fresh-context verification. In the repository at the current working directory: first run "git worktree prune" ` +
    `(clears stale worktree records from earlier runs), then check out the branch DETACHED in a temporary worktree at a ` +
    `unique path: git worktree add --detach ../wf-verify-${i + 1}-<random suffix> ${r.build.branch}. ` +
    `Verify the feature against its done-criteria there. Run the tests yourself — do not trust the builder's report. ` +
    `Afterwards ALWAYS remove the temp worktree, also on failure: git worktree remove --force <path>.\n\n` +
    `FEATURE: ${f}\nDONE CRITERIA:\n${JSON.stringify(r.plan.done_criteria)}\nBUILDER REPORT:\n${JSON.stringify(r.build)}`,
    { label: `verify:${i + 1}`, phase: 'Verify', effort: 'medium', schema: CHECK },
  ).then(c => ({ feature: f, ...r, check: c })),
)

// Index-aligned: features whose plan/build stage died must not vanish from the report.
const lost = features
  .map((f, i) => (!results[i] ? { feature: f, branch: null, issues: ['plan or build stage failed before verification'] } : null))
  .filter(Boolean)

const done = results.filter(Boolean)
const passed = done.filter(r => r.check && r.check.verdict === 'pass')
log(`${passed.length}/${features.length} features passed verification` + (lost.length ? `; ${lost.length} lost before verification` : ''))

return {
  passed: passed.map(r => ({ feature: r.feature, branch: r.build.branch, summary: r.build.summary })),
  failed: [
    ...done.filter(r => !r.check || r.check.verdict === 'fail')
      .map(r => ({ feature: r.feature, branch: r.build && r.build.branch, issues: r.check ? r.check.issues : ['verification agent failed'] })),
    ...lost,
  ],
  note: 'Branches are unmerged. Review and merge in the main session: git merge --no-ff <branch> per feature, resolving conflicts in merge order of least → most files touched. If the run was interrupted: git worktree prune, then inspect feature/wf-* branches for committed work before deleting any.',
}
