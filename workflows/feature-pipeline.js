export const meta = {
  name: 'feature-pipeline',
  description: 'Build independent features in parallel: one agent per feature in its own worktree; T1 and sensitive diffs get a fresh security pass',
  whenToUse: 'A batch of INDEPENDENT features in a git repo with at least one commit; dependent features belong in one entry. Args: {dir: "<product path>", forge_home, features: [...], context, known_failures}. dir pins the target repo (without it the session working directory is the target). An entry is a string (tier T2 by default; "[T1] add password reset" sets it) or {feature, tier, done_criteria}. The tier sets build depth and whether a security pass follows (docs/RISK-TIERS.md). known_failures names the tests already red at baseline. If args may not arrive intact, write the same object to feature-pipeline.input.json in the target repo root; it is read as a fallback.',
  phases: [
    { title: 'Build', detail: 'one agent per feature: plans inline, tests first, commits to its own branch' },
    { title: 'Verify', detail: 'T1, or a diff its builder flags as sensitive: one fresh-context security pass. The rest is checked at the merge gate and the finish review' },
  ],
}

// >>> forge:args-guard — generated; edit lib/workflow-preamble.mjs, then: node scripts/sync-workflow-preamble.mjs
// Target-directory + args contract (2026-07-06; unified 2026-09-22). Two failure modes,
// both seen live in the 2026-07-05 harness eval, both from the NATIVE Workflow invocation:
// (1) workflow agents run in the SESSION's working directory — not necessarily the product
//     this workflow should operate on. So the target arrives as {dir}, is verified before
//     anything changes, and every later prompt is pinned to it.
// (2) args can arrive JSON-stringified. So they are coerced before anything reads them.
// `bin/forge-run.mjs` reads an args file and has neither problem, but the script file is
// identical on every host, so the guard rides along. Each workflow reads its own fields
// from `a` after this block.
let a = args
if (typeof a === 'string' && a.trim().startsWith('{')) { try { a = JSON.parse(a) } catch { /* keep raw string */ } }
const dirArg = a && typeof a === 'object' && !Array.isArray(a) && typeof a.dir === 'string' && a.dir.trim() ? a.dir.trim() : null
// <<< forge:args-guard
// forge_home: the launcher already resolved $FORGE_HOME, so the scripts dir is derived in code.
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
// never fall silently to the lightest depth.
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

// Args that did not arrive intact: read the fallback file. Only this rare path costs an agent.
if (!features.length) {
  const INPUT = {
    type: 'object', additionalProperties: false, required: ['found'],
    properties: {
      found: { type: 'boolean' },
      features: { type: 'array', items: {}, description: 'Verbatim entries: a string stays a string, an object stays an object (a stringified object loses its tier).' },
      context: { type: 'string' },
      known_failures: { type: 'string' },
    },
  }
  const inp = await globalThis.agent(
    `Read-only, modify nothing. Look for feature-pipeline.input.json in ${dirArg || 'the current working directory'}. ` +
    `If it exists, return found: true and its {features, context, known_failures}, each features entry verbatim. ` +
    `Else return found: false.`,
    { label: 'input:fallback', model: 'haiku', effort: 'low', schema: INPUT },
  )
  if (inp && inp.found && Array.isArray(inp.features)) {
    features = normalize(inp.features)
    context = inp.context || ''
    if (!knownRed) knownRed = inp.known_failures || ''
    if (features.length) log(`Inputs read from feature-pipeline.input.json (${features.length} features): args did not arrive intact`)
  }
}
if (!features.length) {
  return { error: 'feature-pipeline requires features: pass args {dir, forge_home, features, context}, or write feature-pipeline.input.json into the target repo root.' }
}

// No preflight agent: each builder checks the target as its first step and refuses a wrong
// one before it changes anything. A refusal fails that feature closed.
const TARGET = dirArg
const AT = TARGET
  ? `TARGET REPOSITORY: ${TARGET} — treat it as the current working directory. FIRST shell command: a ` +
    `standalone cd into it — cwd persists between commands; never chain cd with && (chained cd trips permission ` +
    `prompts). Stay within it (sibling worktree dirs excepted).\n\n`
  : `TARGET REPOSITORY: your current working directory (no dir was passed). Stay within it (sibling worktree ` +
    `dirs excepted).\n\n`
const agent = (p, o) => globalThis.agent(AT + p, o)
const TARGET_CHECK = `Check the target first, before you change anything: it must be a git repository with at least ` +
  `one commit, holding a product (source code or a manifest), not an agent harness (a workflows/ dir next to ` +
  `agents/forge-*.md, or a .claude-plugin/ or .codex-plugin/ manifest). If it is not, change nothing and return ` +
  `branch "" with deviations ["REFUSED: <reason>"].`

const knownRedNote = knownRed && String(knownRed).trim()
  ? `\nBASELINE (KNOWN-RED): these tests/checks already fail before this feature and are not yours to fix: ` +
    `${typeof knownRed === 'string' ? knownRed : JSON.stringify(knownRed)}. Only a NEW failure (green at ` +
    `baseline, failing now) counts against this feature.\n`
  : ''
// Worktree lifecycle is one script call when the launcher passed forge_home (WT).
// Inline git is the fallback.
const SCRIPTS = forgeHomeArg ? `${forgeHomeArg}/scripts` : null
const WT = SCRIPTS ? `bash "${SCRIPTS}/forge-worktree.sh"` : null

const buildWorktree = i => WT
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

const detachedWorktree = (i, branch) => (WT
  ? `Check out the branch in a throwaway DETACHED worktree with one command: ` +
    `${WT} new-detached sec ${i + 1} "${branch}". It prints WORKTREE=<abs path>; work there (install ` +
    `dependencies if the project needs them). When done — also on failure — cd back to the target repo and ` +
    `run: ${WT} clean "<that WORKTREE path>". Only if the script is missing or errors: git worktree prune, then ` +
    `git worktree add --detach ../wf-sec-${i + 1}-<suffix> "${branch}", removed afterwards with git ` +
    `worktree remove --force.`
  : `In the target repo run "git worktree prune", then check out the branch DETACHED at a unique sibling path: ` +
    `git worktree add --detach ../wf-sec-${i + 1}-<random suffix> "${branch}" (install dependencies there ` +
    `if the project needs them). Always remove it afterwards, also on failure: git worktree remove --force <path>.`) +
  ` If the branch cannot be checked out, return verdict fail with the error as the issue — NEVER check the ` +
  `target's main working tree or uncommitted files instead.`

const BUILD = {
  type: 'object',
  additionalProperties: false,
  required: ['branch', 'summary', 'tests_passing', 'evidence', 'deviations', 'sensitive_surfaces', 'pr_title', 'pr_body'],
  properties: {
    branch: { type: 'string', description: 'git branch name the work was committed to' },
    summary: { type: 'string' },
    tests_passing: { type: 'boolean' },
    evidence: { type: 'string', description: 'The test commands you ran here and their result, one line each' },
    deviations: { type: 'array', items: { type: 'string' }, description: 'Where and why the build deviated from a done-criterion' },
    sensitive_surfaces: { type: 'array', items: { type: 'string' }, description: 'Security-sensitive surfaces your diff touches. Empty for ordinary UI/CRUD/formatting.' },
    pr_title: { type: 'string', description: 'Imperative, <= 72 chars, NAMES THE USER-VISIBLE VALUE the feature delivers, not the internal task id — "Add password reset via email link", not "wire up F7"' },
    pr_body: { type: 'string', description: 'Markdown, sections in order: "## What & why" · "## How to review" (the 1-3 files to read first and the behavior to exercise) · "## Evidence" (the test commands and results from THIS run, verbatim) · the done-criteria as a checklist' },
  },
}

const SECCHECK = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'issues', 'evidence'],
  properties: {
    verdict: { type: 'string', enum: ['pass', 'fail'] },
    issues: { type: 'array', items: { type: 'string' }, description: 'Each: the concrete, reachable attack path or the criterion that does not hold' },
    evidence: { type: 'string', description: 'What was inspected and run, and the result' },
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

// The one fresh-context pass per feature: always for T1, and for a T2/T3 whose builder
// named a sensitive surface. The tier came from the description; the diff is the truth.
const securityCheck = (i, branch, f, surfaces) => agent(
  `Fresh-context SECURITY verification` +
  (surfaces
    ? ` of a feature whose diff touches a security-sensitive surface its risk tier did not budget for: ${JSON.stringify(surfaces)}. `
    : ` of a HIGH-RISK (T1) feature. `) +
  `You did not build it; the builder's report is a claim, not evidence. ${detachedWorktree(i, branch)} ` +
  `Read the diff (git diff --merge-base HEAD "${branch}" from the target repo) and the code it touches. Hunt ` +
  `for real, reachable vulnerabilities: broken or missing authz/authn, tenant/user-boundary escapes, data the ` +
  `caller must not see, injection, secrets in code, unsafe deserialization, path traversal / SSRF on external ` +
  `input, missing signature or idempotency checks on webhooks, session/token handling flaws. ` +
  (surfaces ? '' : `Also prove the done-criteria on their failure and edge paths with quick checks of your own; a ` +
    `criterion that does not hold is a fail. `) +
  `Verdict 'fail' with the concrete attack path or broken criterion; 'pass' only after an honest look that ` +
  `found none. If a test fails, re-run just that test once: a failure that clears is flaky — note it, do not ` +
  `fail on it.\n` + knownRedNote +
  `\nFEATURE: ${f.feature}\nDONE CRITERIA:\n${JSON.stringify(f.done_criteria || [f.feature])}`,
  { label: `security:${i + 1}`, phase: 'Verify', effort: 'high', schema: SECCHECK },
)

const results = await pipeline(
  features,
  // 1. Build — one agent per feature, in its own worktree. It plans inline: the build
  //    tier reads the code anyway, and a separate plan agent would read it twice.
  (f, _, i) => agent(
    `Build this feature and commit it.\n${TARGET_CHECK}\n${buildWorktree(i)}\n` +
    `\nFEATURE: ${f.feature}\nRISK TIER: ${f.tier}\nDONE CRITERIA:\n${JSON.stringify(f.done_criteria || [f.feature])}\n` +
    (context ? `SHARED CONTEXT:\n${context}\n` : '') +
    `\nRead the code you touch and its tests, plan inline, match what is there. Do NOT re-open the full spec, ` +
    `architecture or memory. ` +
    (f.tier === 'T1'
      ? `HIGH RISK: before coding, list who must NOT be able to do what, and the failure paths; test each. `
      : '') +
    `Tests first, watched failing, then implement until they pass. Test depth for ${f.tier}: ${TEST_DEPTH[f.tier]} ` +
    `— behavior through the public surface, not a unit test per function. Your gate is typecheck, lint and the ` +
    `tests covering YOUR diff — not the full suite (it belongs to the merge gate and starves sibling builds). ` +
    `tests_passing is true only for a test run you executed here; a syntax check or a runner that failed to ` +
    `start does not count. Do NOT tick PROGRESS.md or any tracker checkbox — the merge step ticks them with ` +
    `evidence. ` + knownRedNote +
    `If a done-criterion proves wrong or contradictory, pick the reading that fits the code and record it in ` +
    `deviations. Commit to your feature branch only: no push, no PR, no merge.\n\n` +
    `Return the PR title and body as DATA; the orchestrator opens the PR. EVIDENCE RULE: a done-criterion you ` +
    `could not prove with a test here stays OPEN in the body's checklist with the reason — never ticked. ` +
    (f.tier === 'T1'
      ? `sensitive_surfaces: leave it empty, a security pass follows anyway.`
      : `sensitive_surfaces: after committing, read your own diff (git diff --merge-base HEAD <your branch>) and ` +
        `name each security-sensitive surface in it — authn/authz, a tenant or user data boundary, raw SQL or ` +
        `shell/eval, secret or token handling, a webhook or external-input parser, file paths or URLs from user ` +
        `input, crypto, output another program interprets. Name it even when you handled it well: naming only ` +
        `buys a second look.`),
    { label: `build:${i + 1}`, phase: 'Build', schema: BUILD, ...buildOpts(f.tier) },
  ),
  // 2. Verify — the builder's own tests gate every feature. T1, and a T2/T3 that named a
  //    sensitive surface, add one fresh security pass, combined fail-closed.
  (b, f, i) => {
    if (!b) return null
    const surfaces = f.tier === 'T1' ? [] : (Array.isArray(b.sensitive_surfaces) ? b.sensitive_surfaces : [])
    const row = (verdict, issues, sec) => ({
      feature: f.feature, tier: f.tier, build: b, surfaces,
      escalated: f.tier !== 'T1' && !!sec,
      refused: (b.deviations || []).some(d => /^REFUSED:/.test(d)),
      check: {
        verdict, issues,
        evidence: `${b.evidence || ''}${sec ? ` | security: ${sec.evidence}` : ''}`,
        security: sec ? { verdict: sec.verdict, evidence: sec.evidence } : null,
      },
    })
    // No committed branch = nothing to check. A pass sent anyway would check whatever
    // sits uncommitted in the target tree.
    if (!/^feature\/wf-\S+$/.test(b.branch || '')) {
      return row('fail', [`builder reported no feature/wf-* branch (got "${b.branch || ''}"): the work was not committed`, ...(b.deviations || [])])
    }
    if (!b.tests_passing) return row('fail', ['the builder could not get its tests green', ...(b.deviations || [])])
    if (f.tier !== 'T1' && !surfaces.length) return row('pass', [])
    return securityCheck(i, b.branch, f, f.tier === 'T1' ? null : surfaces).then(sec => sec
      ? row(sec.verdict === 'pass' ? 'pass' : 'fail', sec.verdict === 'pass' ? [] : sec.issues, sec)
      // Fail-closed: a security pass that did not complete never passes on silence.
      : row('fail', ['security pass agent failed — treat as unverified, do not merge'], { verdict: 'missing', evidence: 'security pass agent failed' }))
  },
)

// Index-aligned: a feature whose build died must not vanish from the report.
const lost = features
  .map((f, i) => (!results[i] ? { feature: f.feature, tier: f.tier, branch: null, issues: ['build agent failed'] } : null))
  .filter(Boolean)
const done = results.filter(Boolean)

if (!done.length) {
  return { error: 'No build agent reported back: the host may be down or the target unreachable. Nothing was verified.', failed: lost }
}
if (done.every(r => r.refused)) {
  return { error: `Refusing to run against ${TARGET || 'the session working directory'}: ${done[0].build.deviations.find(d => /^REFUSED:/.test(d))}. Pass the product directory explicitly: args {dir: "<absolute path>", features: [...]}.` }
}

const passed = done.filter(r => r.check.verdict === 'pass')
const escalated = done.filter(r => r.escalated)
log(`${passed.length}/${features.length} features passed` +
  (escalated.length ? `; ${escalated.length} got a security pass for a sensitive surface in the diff` : '') +
  (lost.length ? `; ${lost.length} lost before verification` : ''))

// Actual output-token spend, so the orchestrator reports real cost against its estimate.
const spend = (typeof budget !== 'undefined' && budget && typeof budget.spent === 'function')
  ? { output_tokens: budget.spent(), target: budget.total ?? null }
  : null
if (spend) log(`spend: ${Math.round(spend.output_tokens / 1000)}k output tokens` + (spend.target ? ` of a ${Math.round(spend.target / 1000)}k target` : ''))

const out = r => ({ feature: r.feature, tier: r.tier, escalated: r.escalated, security_surfaces: r.surfaces, branch: r.build.branch, summary: r.build.summary, pr_title: r.build.pr_title, pr_body: r.build.pr_body, evidence: r.check.evidence, security: r.check.security })
return {
  target: TARGET,
  spend,
  passed: passed.map(out),
  // A failed feature keeps its evidence and write-up: whoever decides the next step needs
  // what was proven, not only what broke.
  failed: [...done.filter(r => r.check.verdict !== 'pass').map(r => ({ ...out(r), issues: r.check.issues })), ...lost],
  note: 'Branches are unmerged. Each was tested by its builder; T1 and flagged diffs also got a fresh security pass. Merge them, then run the full suite on the merged result: no agent has tested the whole. /forge:build does the integration and the finish review. Delete feature-pipeline.input.json if it was used. After an interrupted run: git worktree prune, then check feature/wf-* branches for committed work before deleting any.',
}
