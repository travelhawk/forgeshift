export const meta = {
  name: 'feature-pipeline',
  description: 'Implement independent features in parallel: plan → implement in isolated worktree → verify',
  whenToUse: 'A batch of INDEPENDENT features in a git repo with at least one commit; dependent features belong in one entry. Args: {dir: "<product path>", features: [...], context, known_failures}, or a bare array of entries. dir pins the target repo (required when the session did not start in the product). An entry is a string (tier T2 by default; "[T1] add password reset" sets it) or {feature, tier, done_criteria}. The tier sets build and verify depth (docs/RISK-TIERS.md). known_failures names the tests already red at baseline, so they are not counted as regressions. If args may not arrive intact, write the same object to feature-pipeline.input.json in the target repo root; it is read as a fallback.',
  phases: [
    { title: 'Plan', detail: 'T1 only: a self-contained brief. T2/T3 builders plan inline' },
    { title: 'Build', detail: 'implement in an isolated git worktree' },
    { title: 'Verify', detail: 'fresh-context check per tier; a sensitive surface in the diff adds a security pass' },
  ],
}

// >>> forge:args-guard — generated; edit lib/workflow-preamble.mjs, then: node scripts/sync-workflow-preamble.mjs
// Target-directory + args contract (2026-07-06; unified 2026-09-22). Two failure modes,
// both seen live in the 2026-07-05 harness eval, both from the NATIVE Workflow invocation:
// (1) workflow agents run in the SESSION's working directory — not necessarily the product
//     this workflow should operate on. So the target arrives as {dir}, is verified by the
//     preflight agent below, and every later prompt is pinned to the verified path.
// (2) args can arrive JSON-stringified. So they are coerced before anything reads them.
// `bin/forge-run.mjs` reads an args file and has neither problem, but the script file is
// identical on every host, so the guard rides along. Each workflow reads its own fields
// from `a` after this block.
let a = args
if (typeof a === 'string' && a.trim().startsWith('{')) { try { a = JSON.parse(a) } catch { /* keep raw string */ } }
const dirArg = a && typeof a === 'object' && !Array.isArray(a) && typeof a.dir === 'string' && a.dir.trim() ? a.dir.trim() : null
// <<< forge:args-guard
// forge_home: the launcher already resolved $FORGE_HOME, so the scripts dir is derived in
// code. The preflight hunt for it is only the fallback when the arg is absent.
const forgeHomeArg = a && typeof a === 'object' && !Array.isArray(a) && typeof a.forge_home === 'string' && a.forge_home.trim()
  ? a.forge_home.trim().replace(/[\\/]+$/, '') : null

let features = []
let context = ''
// Tests already failing before this batch. Its own field, so no agent takes one for a regression.
let knownRed = ''
if (Array.isArray(a)) features = a
else if (a && typeof a === 'object' && Array.isArray(a.features)) {
  features = a.features; context = a.context || ''
  knownRed = a.known_failures || a.knownRed || ''
}
// Every entry becomes {feature, tier, done_criteria}. An untagged entry is T2: it must
// never fall silently to the T3 smoke check.
const TIERS = new Set(['T1', 'T2', 'T3'])
const coerceTier = t => (t && TIERS.has(String(t).toUpperCase()) ? String(t).toUpperCase() : 'T2')
const normalize = list => list.map(f => {
  if (typeof f === 'string') {
    const s = f.trim()
    const m = s.match(/^\[(T[123])\]\s*(.+)$/i)
    return m ? { feature: m[2].trim(), tier: m[1].toUpperCase(), done_criteria: null } : { feature: s, tier: 'T2', done_criteria: null }
  }
  if (f && typeof f === 'object' && typeof f.feature === 'string') {
    return { feature: f.feature.trim(), tier: coerceTier(f.tier), done_criteria: Array.isArray(f.done_criteria) ? f.done_criteria : null }
  }
  return null
}).filter(f => f && f.feature.length)
features = normalize(features)

const PREFLIGHT = {
  type: 'object', additionalProperties: false,
  required: ['path', 'exists', 'isGitRepo', 'hasCode', 'isControlCenter', 'cwdIsTarget'],
  properties: {
    path: { type: 'string', description: 'absolute path of the inspected target directory' },
    exists: { type: 'boolean' },
    isGitRepo: { type: 'boolean', description: 'target has a .git directory with at least one commit' },
    hasCode: { type: 'boolean', description: 'target holds a real project: source code and/or a manifest/build config (package.json, pyproject.toml, go.mod, Cargo.toml, ...)' },
    isControlCenter: { type: 'boolean', description: 'target is an agent harness / control-center repo rather than a product: agent-orchestration scripts in workflows/ next to agents/forge-*.md, a .claude-plugin/ or .codex-plugin/ manifest, a legacy .claude/workflows/ dir, a projects/ container dir, or an AGENTS.md/CLAUDE.md describing a harness. A product that only has forge installed into it (.agents/skills, .codex/agents, .opencode) is NOT one' },
    cwdIsTarget: { type: 'boolean', description: 'the shell current working directory IS the target (compare pwd to the target path)' },
    cwd: { type: 'string', description: 'the exact line pwd printed, verbatim' },
    scriptsDir: { type: 'string', description: 'Absolute path (as `pwd` prints it) of a directory containing forge-worktree.sh, if reachable: resolve the forge plugin home with `forge-home` or $CLAUDE_PLUGIN_ROOT and check for scripts/forge-worktree.sh there; failing that, under the current working directory. Else an empty string.' },
    input: {
      type: 'object', additionalProperties: false,
      description: 'ONLY if feature-pipeline.input.json exists in the target root: its parsed content',
      properties: {
        features: { type: 'array', items: {}, description: 'Verbatim entries — each is EITHER a string OR a {feature, tier, done_criteria} object; return each EXACTLY as found (object stays an object — never stringified, or its tier is silently lost).' },
        context: { type: 'string' },
        known_failures: { type: 'string', description: 'ONLY if present in the file: the recorded known-red baseline, verbatim' },
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
  `Return the exact pwd output in cwd. ` +
  (forgeHomeArg
    ? `scriptsDir: return an empty string (the scripts location is already known). `
    : `Also locate the worktree helper: run \`forge-home\` (a plugin binary on PATH; fall back to $CLAUDE_PLUGIN_ROOT, ` +
      `then to pwd) and check whether scripts/forge-worktree.sh exists under the directory it prints. If so return ` +
      `its containing directory's absolute path (as pwd prints it) in scriptsDir, else an empty string. `) +
  `Additionally: if a file feature-pipeline.input.json exists in the target root, read it and return its ` +
  `{features, context, known_failures} content in the input field. Return each features entry verbatim: strings ` +
  `stay strings, objects stay objects — a stringified object loses its risk tier.`,
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
  if (!knownRed) knownRed = pre.input.known_failures || ''
  if (features.length) log(`Inputs read from feature-pipeline.input.json (${features.length} features) — args did not arrive intact`)
}
if (!features.length) {
  return { error: 'feature-pipeline requires features: pass args ["feature 1", ...] / {dir, features, context}, or write feature-pipeline.input.json into the target repo root.', preflight: pre }
}
const TARGET = pre.path
const AT = `TARGET REPOSITORY: ${TARGET} — treat it as the current working directory. FIRST shell command: a ` +
  `standalone cd into it — cwd persists between commands; never chain cd with && (chained cd trips permission ` +
  `prompts). Stay within it (sibling worktree dirs excepted).\n\n`
const agent0 = globalThis.agent
const agent = (p, o) => agent0(AT + p, o)
// A runtime-isolated builder starts INSIDE its own worktree. The cd line above would walk
// it back into the shared main tree, so it gets this preamble instead.
const agentIsolated = (p, o) => agent0(`TARGET REPOSITORY: ${TARGET}. You are running in an isolated git ` +
  `worktree of it — your current directory. Stay there: do NOT cd into the target path, that is the shared ` +
  `main tree other agents rely on.\n\n` + p, o)
// Runtime worktree isolation clones the SESSION's repo, so it is only correct when the
// session cwd IS the target. Decided here from the raw pwd line, not by the preflight
// model: a wrong `true` would clone the wrong repo.
const normPath = p => String(p || '').trim().replace(/\\/g, '/').replace(/^\/([a-zA-Z])(\/|$)/, '$1:/').replace(/\/+$/, '').toLowerCase()
const runtimeIsolation = typeof pre.cwd === 'string' && pre.cwd.trim()
  ? normPath(pre.cwd) === normPath(TARGET)
  : !!pre.cwdIsTarget

const knownRedNote = knownRed && String(knownRed).trim()
  ? `\nBASELINE (KNOWN-RED): these tests/checks already fail before this feature and are not yours to fix: ` +
    `${typeof knownRed === 'string' ? knownRed : JSON.stringify(knownRed)}. Only a NEW failure (green at ` +
    `baseline, failing now) counts against this feature.\n`
  : ''
// Worktree lifecycle is one script call when the harness ships forge-worktree.sh (WT).
// Inline git is the fallback.
const SCRIPTS = forgeHomeArg
  ? `${forgeHomeArg}/scripts`
  : pre.scriptsDir && typeof pre.scriptsDir === 'string' && pre.scriptsDir.trim() ? pre.scriptsDir.trim() : null
const WT = SCRIPTS ? `bash "${SCRIPTS}/forge-worktree.sh"` : null

const buildWorktree = i => runtimeIsolation
  ? `You are in an ISOLATED git worktree. Commit your work to a FRESH branch named feature/wf-${i + 1}-<suffix>, ` +
    `<suffix> being a short random alphanumeric string you generate. Never reuse an existing feature/wf-* ` +
    `branch. Report the exact branch name.`
  : WT
    ? `Create your ISOLATED worktree with one command from the target repo:\n` +
      `  ${WT} new-build ${i + 1}\n` +
      `It prints BRANCH=<branch> and WORKTREE=<abs path>. Do ALL work in that WORKTREE (install dependencies ` +
      `there if the project needs them) and report BRANCH as the exact branch name. When done — also on ` +
      `failure — cd back to the target repo and run: ${WT} clean "<the WORKTREE path>" (the branch survives). ` +
      `Only if the script is missing or errors: git worktree add ../wf-build-${i + 1}-<suffix> -b ` +
      `feature/wf-${i + 1}-<suffix> yourself.`
    : `Work in an ISOLATED git worktree you create yourself: from the target repo run git worktree add ` +
      `../wf-build-${i + 1}-<suffix> -b feature/wf-${i + 1}-<suffix>, <suffix> being a short random alphanumeric ` +
      `string you generate. Never reuse an existing feature/wf-* branch. Do ALL work in that worktree (install ` +
      `dependencies there if the project needs them). Report the exact branch name. When done — also on ` +
      `failure — remove the worktree from the main repo (git worktree remove --force <path>); the branch survives.`

const NO_FALLBACK = ` If the branch cannot be checked out, return verdict fail with the error as the issue — ` +
  `NEVER verify the target's main working tree or uncommitted files instead.`
const detachedWorktree = (role, i, branch) => WT
  ? `Check out the branch in a throwaway DETACHED worktree with one command: ` +
    `${WT} new-detached ${role} ${i + 1} "${branch}". It prints WORKTREE=<abs path>; work there (install ` +
    `dependencies if the project needs them). When done — also on failure — cd back to the target repo and ` +
    `run: ${WT} clean "<that WORKTREE path>". Only if the script is missing or errors: git worktree prune, then ` +
    `git worktree add --detach ../wf-${role}-${i + 1}-<suffix> "${branch}", removed afterwards with git ` +
    `worktree remove --force.` + NO_FALLBACK
  : `In the target repo run "git worktree prune", then check out the branch DETACHED at a unique sibling path: ` +
    `git worktree add --detach ../wf-${role}-${i + 1}-<random suffix> "${branch}" (install dependencies there ` +
    `if the project needs them). Always remove it afterwards, also on failure: git worktree remove --force <path>.` +
    NO_FALLBACK

// The plan is a T1 feature's brief: one agent reads the code and distills the slice the
// builder and both verifiers need, so none of them re-reads the full spec.
const PLAN = {
  type: 'object',
  additionalProperties: false,
  required: ['approach', 'files_to_touch', 'conventions', 'pitfalls', 'test_plan', 'done_criteria'],
  properties: {
    approach: { type: 'string' },
    files_to_touch: { type: 'array', items: { type: 'string' } },
    conventions: { type: 'string', description: 'The existing patterns, helpers and naming THIS feature must follow. Name concrete files and symbols, not generic advice.' },
    pitfalls: { type: 'array', items: { type: 'string' }, description: 'The gotchas that apply to THIS feature only. Empty if none.' },
    test_plan: { type: 'string', description: 'Which tests to write first and what they assert. Behavior through the public surface: happy path, realistic failures, the risky boundary — a handful, not a unit test per function' },
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
    deviations: { type: 'array', items: { type: 'string' }, description: 'Where and why the build deviated from the plan or a done-criterion' },
  },
}

const CHECK = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'issues', 'pr_title', 'pr_body', 'evidence', 'sensitive_surfaces'],
  properties: {
    verdict: { type: 'string', enum: ['pass', 'fail'] },
    issues: { type: 'array', items: { type: 'string' } },
    pr_title: { type: 'string', description: 'Imperative, <= 72 chars, NAMES THE USER-VISIBLE VALUE the feature delivers, not the internal task id — "Add password reset via email link", not "wire up F7"' },
    pr_body: { type: 'string', description: 'Markdown, sections in order: "## What & why" · "## How to review" (the 1-3 files to read first and the behavior to exercise) · "## Evidence" (the test commands and results from THIS run, verbatim) · the done-criteria as a checklist. On a fail verdict: what is broken instead' },
    evidence: { type: 'string', description: 'The test commands this verification ran and a one-line result — not the builder report' },
    sensitive_surfaces: { type: 'array', items: { type: 'string' }, description: 'Security-sensitive surfaces the feature diff touches. Empty for ordinary UI/CRUD/formatting.' },
  },
}

const SECCHECK = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'issues', 'evidence'],
  properties: {
    verdict: { type: 'string', enum: ['pass', 'fail'] },
    issues: { type: 'array', items: { type: 'string' }, description: 'Each: the concrete, reachable attack path' },
    evidence: { type: 'string', description: 'What was inspected and the result' },
  },
}

// T3 builds on the execute tier. T1/T2 PIN the build tier, so a top-tier session never
// pays its price for building (docs/MODEL-ROUTING.md).
const buildOpts = t => (t === 'T3' ? { model: 'sonnet', effort: 'medium' } : { model: 'opus', effort: t === 'T1' ? 'high' : 'medium' })
const TEST_DEPTH = {
  T1: 'happy path plus explicit failure and edge cases',
  T2: 'happy path plus the top failure path',
  T3: 'one smoke test: it builds/renders and the happy path works',
}
// Functional + security verdicts, fail-closed: a missing or failed security pass sinks
// the feature. It never passes on silence.
const combine = (fn, sec) => {
  if (!fn) return null
  const secPass = sec && sec.verdict === 'pass'
  const secIssues = sec ? (sec.verdict === 'fail' ? sec.issues : []) : ['security pass agent failed — treat as unverified, do not merge']
  return {
    ...fn,
    verdict: fn.verdict === 'pass' && secPass ? 'pass' : 'fail',
    issues: [...(fn.issues || []), ...secIssues],
    evidence: `${fn.evidence}${sec ? ` | security: ${sec.evidence}` : ' | security pass did not complete'}`,
    security: sec ? { verdict: sec.verdict, evidence: sec.evidence } : { verdict: 'missing', evidence: 'security pass agent failed' },
  }
}

// The adversarial security pass: always for T1, and for a T2/T3 whose diff touched a
// sensitive surface.
const securityCheck = (i, branch, feature, doneCriteria, pitfalls, surfaces) => agent(
  `Adversarial SECURITY verification` +
  (surfaces
    ? ` of a feature whose diff touches a security-sensitive surface its risk tier did not budget for: ${JSON.stringify(surfaces)}. `
    : ` of a HIGH-RISK (T1) feature. `) +
  `${detachedWorktree('sec', i, branch)} Hunt ONLY for real, reachable ` +
  `vulnerabilities in the diff and the code it touches: broken or missing authz/authn, tenant/user-boundary ` +
  `escapes, injection, secrets in code, unsafe deserialization, path traversal / SSRF on external input, ` +
  `missing signature or idempotency checks on webhooks, session/token handling flaws. Verdict 'fail' with the ` +
  `concrete attack path if you find one; 'pass' only after an honest ` +
  `look that found none.\n` + knownRedNote + `\nFEATURE: ${feature}\nDONE CRITERIA:\n${JSON.stringify(doneCriteria)}\n` +
  `KNOWN PITFALLS (probe these first):\n${JSON.stringify(pitfalls || [])}`,
  { label: `security:${i + 1}`, phase: 'Verify', effort: 'high', schema: SECCHECK },
)

// What every verifier returns besides its verdict. A T2/T3 verifier also names the
// sensitive surfaces in the built diff: the tier came from the feature's description,
// the diff is the truth. A named surface adds the security pass. Depth only rises.
const VERIFY_RETURN = (tier, branch) =>
  `Return the verdict with a ready-to-use PR title and body, as DATA: no git push, no gh, no PR, no merge — ` +
  `the orchestrator opens it. EVIDENCE RULE: a done-criterion you could not prove here (an untested fallback, ` +
  `an external program, a manual step) stays OPEN in the checklist with the reason — never ticked. ` +
  (tier === 'T1'
    ? `sensitive_surfaces: leave it empty, a security pass runs alongside you.`
    : `sensitive_surfaces: read the diff this feature added (from the target repo: git diff --merge-base HEAD ` +
      `"${branch}") and name each security-sensitive surface in it — authn/authz, a tenant or user data ` +
      `boundary, raw SQL or shell/eval, secret or token handling, a webhook or external-input parser, file ` +
      `paths or URLs from user input, crypto. Empty for ordinary UI/CRUD/formatting. Only name it: a separate ` +
      `security pass reviews what you name.`) + `\n`

const results = await pipeline(
  features,
  // 1. Plan — T1 only. T2/T3 hand the builder the contract (done-criteria + shared
  //    context) and it plans inline: the build tier reads the code anyway.
  (f, _, i) => f.tier !== 'T1'
    ? { direct: true, pitfalls: [], done_criteria: f.done_criteria || [f.feature] }
    : agent(
      `Plan this HIGH-RISK (T1) feature and return a self-contained brief. Read the relevant code first; the ` +
      `plan must fit what is there.\n\nFEATURE: ${f.feature}\n` +
      (f.done_criteria ? `DONE CRITERIA (authoritative — plan to meet exactly these):\n${JSON.stringify(f.done_criteria)}\n` : '') +
      (context ? `SHARED CONTEXT (distill only the slice this feature needs):\n${context}\n` : '') +
      `\nThe builder and the verifiers get this brief and nothing else, so it must stand alone. Tests first. ` +
      `Keep it minimal — no speculative abstractions.`,
      { label: `plan:${i + 1}`, phase: 'Plan', effort: 'high', schema: PLAN },
    ),
  // 2. Build — isolated worktree; model and effort follow the tier.
  (plan, f, i) => plan && (runtimeIsolation ? agentIsolated : agent)(
    `Build this feature and commit it.\n` + buildWorktree(i) + `\n` +
    `\nFEATURE: ${f.feature}\nRISK TIER: ${f.tier}\nDONE CRITERIA:\n${JSON.stringify(plan.done_criteria)}\n` +
    (plan.direct
      ? (context ? `SHARED CONTEXT:\n${context}\n` : '') +
        `There is no separate plan: read the code you touch and its tests, plan inline, match what is there. `
      : `PLAN — your brief. It already holds the conventions and lessons for this feature; read files_to_touch ` +
        `and their tests to match style:\n${JSON.stringify(plan, null, 2)}\n`) +
    `Do NOT re-open the full spec, architecture or memory.\n\n` +
    `Tests first, watched failing, then implement until they pass. Test depth for ${f.tier}: ${TEST_DEPTH[f.tier]} ` +
    `— behavior through the public surface, not a unit test per function. Your gate is typecheck, lint and the ` +
    `tests covering YOUR diff — not the full suite (it belongs to the merge gate and starves sibling builds). ` +
    `tests_passing is true only for a test run you executed here; a syntax check or a runner that failed to ` +
    `start does not count. Do NOT tick PROGRESS.md or any tracker checkbox — the merge step ticks them with ` +
    `evidence. ` + knownRedNote +
    `If the plan or a done-criterion proves wrong, fix the approach and record it in deviations. Commit to your ` +
    `feature branch only: no push, no PR, no merge.`,
    { label: `build:${i + 1}`, phase: 'Build', schema: BUILD, ...buildOpts(f.tier), ...(runtimeIsolation ? { isolation: 'worktree' } : {}) },
  ).then(b => b && { plan, build: b }),
  // 3. Verify — T1: functional + security in parallel. T2: one functional pass. T3: a
  //    smoke check on the execute tier. A T2/T3 that passes and names a sensitive surface
  //    gets the security pass too, combined fail-closed like T1.
  (r, f, i) => {
    if (!r) return null
    const branch = r.build.branch
    const done = r.plan.done_criteria
    const pitfalls = r.plan.pitfalls || []
    const tag = (check, surfaces = []) => ({ feature: f.feature, tier: f.tier, escalated: f.tier !== 'T1' && !!(check && check.security), surfaces, ...r, check })
    // No committed branch = nothing to verify. A verifier sent anyway would check
    // whatever sits uncommitted in the target tree.
    if (!/^feature\/wf-\S+$/.test(branch || '')) {
      return tag({
        verdict: 'fail', pr_title: '', pr_body: '', evidence: 'none — the builder committed nothing',
        issues: [`builder reported no feature/wf-* branch (got "${branch || ''}"): the work was not committed`, ...(r.build.deviations || [])],
      })
    }
    const facts = `\nFEATURE: ${f.feature}\nDONE CRITERIA:\n${JSON.stringify(done)}\n` +
      `PITFALLS TO PROBE:\n${JSON.stringify(pitfalls)}\nBUILDER REPORT:\n${JSON.stringify(r.build)}`

    const verify = f.tier === 'T3'
      ? () => agent(
        `Smoke check of a low-risk (T3) feature — no deep review. ${detachedWorktree('smoke', i, branch)} ` +
        `Confirm three things: it builds, it renders/boots without error, and the happy path works (run the ` +
        `builder's smoke test). Fail only on a real break there — not on style, edge cases or missing depth. ` +
        `If a check fails, re-run it once: a failure that clears is flaky — note it, do not fail on it.\n\n` +
        VERIFY_RETURN(f.tier, branch) + knownRedNote + facts,
        { label: `smoke:${i + 1}`, phase: 'Verify', model: 'sonnet', effort: 'medium', schema: CHECK },
      )
      : () => agent(
        `Fresh-context verification of a ${f.tier} feature. ${detachedWorktree('verify', i, branch)} ` +
        `Verify it against its done-criteria there. Run typecheck, lint and the tests covering this feature's ` +
        `diff yourself — the builder's report is a claim, not evidence; the full suite belongs to the merge ` +
        `gate. If a test fails, re-run just that test once: a failure that clears is flaky — note it in the ` +
        `evidence, do not fail the feature on it. ` +
        (f.tier === 'T1'
          ? `Exercise the failure and edge paths, not only the happy one.`
          : `Cover the happy path and the top failure path; skip exhaustive edge cases.`) + `\n\n` +
        VERIFY_RETURN(f.tier, branch) + knownRedNote + facts,
        { label: `verify:${i + 1}`, phase: 'Verify', effort: f.tier === 'T1' ? 'high' : 'medium', schema: CHECK },
      )

    if (f.tier === 'T1') {
      return parallel([verify, () => securityCheck(i, branch, f.feature, done, pitfalls, null)])
        .then(([fn, sec]) => tag(combine(fn, sec)))
    }
    return verify().then(own => {
      const surfaces = (own && Array.isArray(own.sensitive_surfaces) && own.sensitive_surfaces) || []
      // A failed verify goes back for a fix first; the security pass runs on the verify that passes.
      if (!own || own.verdict !== 'pass' || !surfaces.length) return tag(own, surfaces)
      return securityCheck(i, branch, f.feature, done, pitfalls, surfaces).then(sec => tag(combine(own, sec), surfaces))
    })
  },
)

// Index-aligned: a feature whose plan or build died must not vanish from the report.
const lost = features
  .map((f, i) => (!results[i] ? { feature: f.feature, tier: f.tier, branch: null, issues: ['plan or build stage failed before verification'] } : null))
  .filter(Boolean)

const done = results.filter(Boolean)
const passed = done.filter(r => r.check && r.check.verdict === 'pass')
const escalated = done.filter(r => r.escalated)
log(`${passed.length}/${features.length} features passed verification` +
  (escalated.length ? `; ${escalated.length} got a security pass for a sensitive surface in the diff` : '') +
  (lost.length ? `; ${lost.length} lost before verification` : ''))

// Actual output-token spend, so the orchestrator reports real cost against its estimate.
const spend = (typeof budget !== 'undefined' && budget && typeof budget.spent === 'function')
  ? { output_tokens: budget.spent(), target: budget.total ?? null }
  : null
if (spend) log(`spend: ${Math.round(spend.output_tokens / 1000)}k output tokens` + (spend.target ? ` of a ${Math.round(spend.target / 1000)}k target` : ''))

return {
  target: TARGET,
  spend,
  passed: passed.map(r => ({ feature: r.feature, tier: r.tier, escalated: !!r.escalated, security_surfaces: r.surfaces || [], branch: r.build.branch, summary: r.build.summary, pr_title: r.check.pr_title, pr_body: r.check.pr_body, evidence: r.check.evidence, security: r.check.security || null })),
  failed: [
    // A failed feature keeps its evidence, write-up and security verdict: whoever decides
    // the next step needs what was proven, not only what broke.
    ...done.filter(r => !r.check || r.check.verdict === 'fail')
      .map(r => ({ feature: r.feature, tier: r.tier, escalated: !!r.escalated, security_surfaces: r.surfaces || [], branch: r.build && r.build.branch, issues: r.check ? r.check.issues : ['verification agent failed'], evidence: r.check ? r.check.evidence : null, pr_body: r.check ? r.check.pr_body : null, security: (r.check && r.check.security) || null })),
    ...lost,
  ],
  note: 'Branches are unmerged and were verified in isolation. Merge them, then run the full suite on the merged result: no agent has tested the whole. /forge:build does the integration itself. Delete feature-pipeline.input.json if it was used. After an interrupted run: git worktree prune, then check feature/wf-* branches for committed work before deleting any.',
}
