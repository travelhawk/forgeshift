export const meta = {
  name: 'feature-pipeline',
  description: 'Implement independent features in parallel: plan → implement in isolated worktree → verify',
  whenToUse: 'A batch of INDEPENDENT features/tasks from a spec, in a git repo with at least one commit. Pass args as an array of feature strings, or an object {dir: "<product path>", features: [...], context: "shared context"} — dir pins the target repo (required when the session did not start in the product directory). If args does not arrive intact (a known runtime failure mode), write the same {features, context} object to feature-pipeline.input.json in the target repo root before invoking; it is read as a fallback and should be deleted after the run. Dependent features belong in one entry.',
  phases: [
    { title: 'Plan', detail: 'per-feature implementation plan + test plan' },
    { title: 'Build', detail: 'implement in isolated git worktree' },
    { title: 'Verify', detail: 'fresh-context check against the plan, tests run' },
  ],
}

// --- Target-directory + input contract (2026-07-06) ----------------------------
// Two failure modes observed live in the 2026-07-05 harness eval:
// (1) Workflow agents run in the SESSION's working directory — not necessarily
//     the product repo. Accept {dir}, verify it, pin every prompt to it.
// (2) Workflow args can arrive mangled (an object reached the script as a
//     non-object → the old guard errored with 0 agents run). Coerce stringified
//     args, and fall back to feature-pipeline.input.json in the target repo.
let a = args
if (typeof a === 'string' && a.trim().startsWith('{')) { try { a = JSON.parse(a) } catch { /* keep raw string */ } }
const dirArg = a && typeof a === 'object' && !Array.isArray(a) && typeof a.dir === 'string' && a.dir.trim() ? a.dir.trim() : null

let features = []
let context = ''
if (Array.isArray(a)) features = a
else if (a && typeof a === 'object' && Array.isArray(a.features)) { features = a.features; context = a.context || '' }
// Coerce non-string entries so no stage receives '[object Object]'.
const normalize = list => list.map(f => typeof f === 'string' ? f.trim() : JSON.stringify(f)).filter(f => f && f.length)
features = normalize(features)

const PREFLIGHT = {
  type: 'object', additionalProperties: false,
  required: ['path', 'exists', 'isGitRepo', 'hasCode', 'isControlCenter', 'cwdIsTarget'],
  properties: {
    path: { type: 'string', description: 'absolute path of the inspected target directory' },
    exists: { type: 'boolean' },
    isGitRepo: { type: 'boolean', description: 'target has a .git directory with at least one commit' },
    hasCode: { type: 'boolean', description: 'target holds a real project: source code and/or a manifest/build config (package.json, pyproject.toml, go.mod, Cargo.toml, ...)' },
    isControlCenter: { type: 'boolean', description: 'target looks like an agent harness / control-center repo rather than a product: .claude/workflows/ or .claude/agents/ present, a projects/ container dir, or a CLAUDE.md describing a harness' },
    cwdIsTarget: { type: 'boolean', description: 'the shell current working directory IS the target (compare pwd to the target path)' },
    input: {
      type: 'object', additionalProperties: false,
      description: 'ONLY if feature-pipeline.input.json exists in the target root: its parsed content',
      properties: {
        features: { type: 'array', items: { type: 'string' } },
        context: { type: 'string' },
      },
    },
  },
}
const pre = await globalThis.agent(
  `Preflight, read-only, modify nothing. Run pwd. ${dirArg
    ? `The intended target directory is ${dirArg} — inspect it.`
    : 'No target was passed — the current working directory is the implied target; inspect it.'} ` +
  `Report per the schema: absolute target path, whether it exists, is a git repo with at least one commit, ` +
  `holds a real project, and whether it looks like an agent-harness/control-center repo instead of a product. ` +
  `Additionally: if a file feature-pipeline.input.json exists in the target root, read it and return its ` +
  `{features, context} content in the input field (features as an array of strings, verbatim).`,
  { label: 'preflight:target', model: 'haiku', effort: 'low', schema: PREFLIGHT },
)
if (!pre) return { error: 'Preflight agent failed — cannot verify the target directory. Pass args {dir: "<product path>", features: [...]} and retry.' }
if (!pre.exists || !pre.hasCode || pre.isControlCenter || !pre.isGitRepo) {
  return {
    error: `Refusing to run against ${pre.path || dirArg || 'the session working directory'}: ` +
      (!pre.exists ? 'it does not exist.'
        : pre.isControlCenter ? 'it looks like a harness/control-center repo, not a product.'
          : !pre.isGitRepo ? 'it is not a git repository with a commit (worktree isolation needs one).'
            : 'it does not hold a project (no source or manifest).') +
      ' Pass the product directory explicitly: args {dir: "<absolute path>", features: [...]}.',
    preflight: pre,
  }
}
if (!features.length && pre.input && Array.isArray(pre.input.features)) {
  features = normalize(pre.input.features)
  context = pre.input.context || ''
  if (features.length) log(`Inputs read from feature-pipeline.input.json (${features.length} features) — args did not arrive intact`)
}
if (!features.length) {
  return { error: 'feature-pipeline requires features: pass args ["feature 1", ...] / {dir, features, context}, or write feature-pipeline.input.json into the target repo root.', preflight: pre }
}
const TARGET = pre.path
const AT = `TARGET REPOSITORY: ${TARGET} — treat it as the current working directory. cd there at the start of ` +
  `every shell command (or use absolute paths under it) and stay within it (sibling worktree dirs excepted).\n\n`
const agent0 = globalThis.agent
const agent = (p, o) => agent0(AT + p, o)
// Runtime worktree isolation clones the SESSION's repo — only correct when the
// session cwd IS the target. Otherwise the builder manages its own worktree of
// the target repo (same semantics: isolated tree, fresh branch, branch survives).
const runtimeIsolation = pre.cwdIsTarget

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
    `Plan the implementation of this feature in the target repository. Read the relevant ` +
    `existing code first; the plan must fit existing conventions.\n\nFEATURE: ${f}\n` +
    (context ? `SHARED CONTEXT:\n${context}\n` : '') +
    `\nTests-first: the test plan is not optional. Keep the plan minimal — no speculative abstractions.`,
    { label: `plan:${i + 1}`, phase: 'Plan', effort: 'high', schema: PLAN },
  ),
  (plan, f, i) => plan && agent(
    (runtimeIsolation
      ? `Implement this feature following the plan. You are in an ISOLATED git worktree — create and commit your work to a ` +
        `FRESH branch named feature/wf-${i + 1}-<suffix>, where <suffix> is a short random alphanumeric string you generate ` +
        `(collision-proof across runs). Never reuse an existing feature/wf-* branch. Report the exact branch name.\n`
      : `Implement this feature following the plan, in an ISOLATED git worktree you create yourself: from the target repo run ` +
        `git worktree add ../wf-build-${i + 1}-<suffix> -b feature/wf-${i + 1}-<suffix> (sibling of the repo dir), where <suffix> is a short ` +
        `random alphanumeric string you generate (collision-proof across runs). Never reuse an existing feature/wf-* branch. ` +
        `Do ALL work inside that worktree (install dependencies there first if the project needs them). Report the exact branch ` +
        `name. When done — always, also on failure — remove the worktree from the main repo (git worktree remove --force <path>); the branch survives.\n`) +
    `\nFEATURE: ${f}\n` +
    (context ? `SHARED CONTEXT:\n${context}\n` : '') +
    `PLAN:\n${JSON.stringify(plan, null, 2)}\n\n` +
    `Order of work: write the tests from the test plan first, watch them fail, implement until they pass, ` +
    `run the project's full relevant test suite. Match existing code style exactly. ` +
    `If the plan turns out wrong mid-build, fix the approach and record it in deviations — do not ship a broken plan. ` +
    `Commit with a clear message before finishing.`,
    { label: `build:${i + 1}`, phase: 'Build', effort: 'high', schema: BUILD, ...(runtimeIsolation ? { isolation: 'worktree' } : {}) },
  ).then(b => b && { plan, build: b }),
  (r, f, i) => r && agent(
    `Fresh-context verification. In the target repository: first run "git worktree prune" ` +
    `(clears stale worktree records from earlier runs), then check out the branch DETACHED in a temporary worktree at a ` +
    `unique path: git worktree add --detach ../wf-verify-${i + 1}-<random suffix> ${r.build.branch}. ` +
    `Verify the feature against its done-criteria there (install dependencies in the worktree first if the project needs them). ` +
    `Run the tests yourself — do not trust the builder's report. ` +
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
  target: TARGET,
  passed: passed.map(r => ({ feature: r.feature, branch: r.build.branch, summary: r.build.summary })),
  failed: [
    ...done.filter(r => !r.check || r.check.verdict === 'fail')
      .map(r => ({ feature: r.feature, branch: r.build && r.build.branch, issues: r.check ? r.check.issues : ['verification agent failed'] })),
    ...lost,
  ],
  note: 'Branches are unmerged. Review and merge in the main session: git merge --no-ff <branch> per feature, resolving conflicts in merge order of least → most files touched, then RUN THE FULL SUITE ON THE MERGED RESULT — each branch was verified in isolation; the merged whole has not been tested by any agent. Delete feature-pipeline.input.json if it was used. If the run was interrupted: git worktree prune, then inspect feature/wf-* branches for committed work before deleting any.',
}
