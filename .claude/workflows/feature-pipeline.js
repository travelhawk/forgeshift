export const meta = {
  name: 'feature-pipeline',
  description: 'Implement independent features in parallel: plan → implement in isolated worktree → verify',
  whenToUse: 'A batch of INDEPENDENT features/tasks from a spec, in a git repo with at least one commit. Pass args as an array of feature entries, or an object {dir: "<product path>", features: [...], context: "shared context"} — dir pins the target repo (required when the session did not start in the product directory). A feature entry is a string (defaults to risk tier T2; a bare string may carry a bracketed marker like "[T1] add password reset") or an object {feature, tier, done_criteria} — the tier (T1/T2/T3) sets build model/effort and verify depth (T1 verify + security pass, T2 one verify, T3 smoke-only on Sonnet; see docs/RISK-TIERS.md). Pass known_failures (string) when the repo starts from a recorded known-red baseline — it is threaded verbatim to every builder/verifier so a pre-existing failure is not mistaken for a regression. If args does not arrive intact (a known runtime failure mode), write the same {features, context, known_failures} object to feature-pipeline.input.json in the target repo root before invoking; it is read as a fallback and should be deleted after the run. Dependent features belong in one entry.',
  phases: [
    { title: 'Plan', detail: 'per-feature self-contained brief (T1/T2 only — T3 builds direct, no plan agent)' },
    { title: 'Build', detail: 'implement in isolated git worktree' },
    { title: 'Verify', detail: 'diff re-check may escalate T2/T3 to a security pass, then fresh-context check against the plan, tests run' },
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
// Known-red baseline: tests already failing before this batch. Threaded to every
// verifier as a first-class field (NOT buried in context, where the plan agent may
// distill it away) so a pre-existing failure is never mistaken for a regression.
let knownRed = ''
if (Array.isArray(a)) features = a
else if (a && typeof a === 'object' && Array.isArray(a.features)) {
  features = a.features; context = a.context || ''
  knownRed = a.known_failures || a.knownRed || ''
}
// A feature entry is a plain string or {feature, tier, done_criteria}. Normalize every
// entry to {feature, tier, done_criteria}. The tier (T1/T2/T3) drives build model/effort
// and verify depth (see docs/RISK-TIERS.md). Default is T2 (a real verify pass): an
// untagged entry must never fall silently to T3 smoke-only. A bare string may carry an
// explicit bracketed marker, e.g. "[T1] add password reset".
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
    isControlCenter: { type: 'boolean', description: 'target looks like an agent harness / control-center repo rather than a product: .claude/workflows/ or .claude/agents/ present, a .claude-plugin/plugin.json, or a CLAUDE.md describing a harness' },
    cwdIsTarget: { type: 'boolean', description: 'the shell current working directory IS the target (compare pwd to the target path)' },
    scriptsDir: { type: 'string', description: 'Absolute path (in the shell\'s own path format, as `pwd` prints it) of a directory containing forge-worktree.sh, if reachable: resolve the forge plugin home with `forge-home` (on PATH when the plugin is enabled) or $CLAUDE_PLUGIN_ROOT and check for scripts/forge-worktree.sh there; failing that, under the current working directory. Its containing dir if found, else an empty string. Lets the build/verify agents call one deterministic script instead of hand-running git worktree plumbing.' },
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
  `Also locate the worktree helper: run \`forge-home\` (a plugin binary on PATH; fall back to $CLAUDE_PLUGIN_ROOT, ` +
  `then to pwd) and check whether scripts/forge-worktree.sh exists under the directory it prints. If so return ` +
  `its containing directory's absolute path (as pwd prints it) in scriptsDir, else an empty string. ` +
  `Additionally: if a file feature-pipeline.input.json exists in the target root, read it and return its ` +
  `{features, context, known_failures} content in the input field. CRITICAL: return each features entry EXACTLY as it appears ` +
  `in the JSON — if an entry is an object {feature, tier, done_criteria}, return the OBJECT unchanged; do NOT ` +
  `stringify or flatten it. Stringifying an object entry silently drops its risk tier (a T1 feature would lose ` +
  `its security pass). Preserve strings as strings and objects as objects, verbatim.`,
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
// Runtime worktree isolation clones the SESSION's repo — only correct when the
// session cwd IS the target. Otherwise the builder manages its own worktree of
// the target repo (same semantics: isolated tree, fresh branch, branch survives).
const runtimeIsolation = pre.cwdIsTarget

// Known-red baseline preamble, appended to every builder/verifier prompt. Without it a
// verifier that runs the full suite and hits a pre-existing failure fails the feature —
// the exact false-negative /forge's "stop on NEW failures, not on the known red" rule
// exists to prevent. Empty string when no baseline red was passed (the common case).
const knownRedNote = knownRed && String(knownRed).trim()
  ? `\nBASELINE (KNOWN-RED): these tests/checks are ALREADY failing before this feature and are NOT yours to fix: ` +
    `${typeof knownRed === 'string' ? knownRed : JSON.stringify(knownRed)}. A pre-existing failure among them is NOT ` +
    `a regression — only a NEW failure (something green at baseline now failing) fails this feature. Do not touch ` +
    `unrelated red; do not report it as your break.\n`
  : ''
// git worktree lifecycle + unique-suffix generation is deterministic shell work that
// used to be handed to the build/verify agents as a git tutorial they ran by hand (a
// failure source AND ~40% of each prompt). When the harness ships forge-worktree.sh and
// the runtime is NOT isolating the build for us, agents call that one script instead; the
// shell owns correctness and the entropy the workflow runtime cannot generate. WT is the
// `bash "<path>"` prefix, or null → agents fall back to inline git (unchanged behavior).
const SCRIPTS = pre.scriptsDir && typeof pre.scriptsDir === 'string' && pre.scriptsDir.trim() ? pre.scriptsDir.trim() : null
const WT = SCRIPTS ? `bash "${SCRIPTS}/forge-worktree.sh"` : null

const buildWorktree = i => runtimeIsolation
  ? `You are in an ISOLATED git worktree — create and commit your work to a FRESH branch named ` +
    `feature/wf-${i + 1}-<suffix>, where <suffix> is a short random alphanumeric string you generate ` +
    `(collision-proof across runs). Never reuse an existing feature/wf-* branch. Report the exact branch name.`
  : WT
    ? `Create your ISOLATED worktree with ONE command from the target repo (the script owns the unique ` +
      `branch + path, the prune, and the entropy — do NOT hand-roll git or invent a suffix):\n` +
      `  ${WT} new-build ${i + 1}\n` +
      `It prints BRANCH=<branch> and WORKTREE=<abs path>. cd into that WORKTREE path and do ALL work there ` +
      `(install dependencies there first if the project needs them); report BRANCH as the exact branch name. ` +
      `When done — always, also on failure — cd back to the target repo and run: ${WT} clean "<the WORKTREE path>" ` +
      `(the branch survives). Only if that script is missing or errors, fall back to git worktree add ` +
      `../wf-build-${i + 1}-<suffix> -b feature/wf-${i + 1}-<suffix> yourself.`
    : `Work in an ISOLATED git worktree you create yourself: from the target repo run git worktree add ` +
      `../wf-build-${i + 1}-<suffix> -b feature/wf-${i + 1}-<suffix> (sibling of the repo dir), where <suffix> is ` +
      `a short random alphanumeric string you generate (collision-proof across runs). Never reuse an existing ` +
      `feature/wf-* branch. Do ALL work inside that worktree (install dependencies there first if the project ` +
      `needs them). Report the exact branch name. When done — always, also on failure — remove the worktree from ` +
      `the main repo (git worktree remove --force <path>); the branch survives.`

const detachedWorktree = (role, i, branch) => WT
  ? `Check out the branch in a throwaway DETACHED worktree with ONE command (the script prunes, picks a ` +
    `unique path, and checks it out): ${WT} new-detached ${role} ${i + 1} "${branch}". It prints ` +
    `WORKTREE=<abs path>; cd there and work (install dependencies there first if the project needs them). When ` +
    `done — always, even on failure — cd back to the target repo and run: ${WT} clean "<that WORKTREE path>". ` +
    `Only if the script is missing or errors, fall back to: git worktree prune, then git worktree add --detach ` +
    `../wf-${role}-${i + 1}-<suffix> "${branch}", removed afterwards with git worktree remove --force.`
  : `In the target repo run "git worktree prune", then check out the branch DETACHED at a unique sibling path: ` +
    `git worktree add --detach ../wf-${role}-${i + 1}-<random suffix> "${branch}" (install dependencies in the ` +
    `worktree first if the project needs them). Afterwards ALWAYS remove the temp worktree, also on failure: ` +
    `git worktree remove --force <path>.`

// The PLAN is the per-feature BRIEF: produced once by the plan agent (which already
// reads the code), it is the ONLY context the downstream builder + verifier get. One
// cheap extraction here replaces N expensive re-reads of the full spec/architecture/
// memory by every downstream agent. So it must be self-contained: besides the plan
// proper, it carries the exact conventions the feature must match and the applicable
// pitfalls/lessons — the feature-relevant slice, distilled from the shared context and
// the code, not the whole corpus re-read downstream.
const PLAN = {
  type: 'object',
  additionalProperties: false,
  required: ['approach', 'files_to_touch', 'conventions', 'pitfalls', 'test_plan', 'done_criteria'],
  properties: {
    approach: { type: 'string' },
    files_to_touch: { type: 'array', items: { type: 'string' } },
    conventions: { type: 'string', description: 'The specific existing patterns, helpers, and naming/style THIS feature must follow — distilled from the code the plan agent read, so the builder need not re-derive them. Name concrete files + symbols, not generic advice.' },
    pitfalls: { type: 'array', items: { type: 'string' }, description: 'The applicable gotchas/lessons for THIS feature only (from the shared context and the code) — the relevant subset, not every lesson. Empty array if none apply.' },
    test_plan: { type: 'string', description: 'Which tests to write first and what they assert. Behavior-level through the public surface: happy path + realistic failures + the risky boundary — a handful, not a unit test per function' },
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
  required: ['verdict', 'issues', 'pr_title', 'pr_body', 'evidence'],
  properties: {
    verdict: { type: 'string', enum: ['pass', 'fail'] },
    issues: { type: 'array', items: { type: 'string' } },
    pr_title: { type: 'string', description: 'Ready-to-use PR title: imperative, <= 72 chars, NAMES THE USER-VISIBLE VALUE the feature delivers, not the internal task id — "Add password reset via email link", not "wire up F7"' },
    pr_body: { type: 'string', description: 'Ready-to-use PR body markdown, sections in order: "## What & why" · "## How to review" (the 1-3 files/paths to read first and the behavior to exercise) · "## Evidence" (the test command(s) and result from THIS verification run, verbatim — never trimmed) · done-criteria as a checklist. On a fail verdict: what is broken instead' },
    evidence: { type: 'string', description: 'Test command(s) the verifier ran and a one-line result summary — from this verification run, not the builder report' },
  },
}

// T1 features get a second, parallel security pass alongside the functional verify.
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

// Tier → build effort/model. T3 boilerplate builds fast on Sonnet (well-defined
// execution); T1/T2 PIN Opus — building is Opus's tier (docs/MODEL-ROUTING.md: "Opus =
// all real building", and forge-hammer pins model: opus). Pinning keeps builds off the
// session model, so a Fable-5 session day doesn't pay 2x for boilerplate and builds stay
// at Opus quality when the session runs below it. Build-tier escalation on looping work
// goes through /debug-hard (session model), never a bigger build model here.
const buildOpts = t => (t === 'T3' ? { model: 'sonnet', effort: 'medium' } : { model: 'opus', effort: t === 'T1' ? 'xhigh' : 'high' })
// Combine a T1 feature's functional + security verdicts. Fail-closed: a missing or
// failed security pass sinks the feature (it retries), it does not pass on silence.
const combineT1 = (fn, sec) => {
  if (!fn) return null // functional verify died → feature drops to the failed bucket
  const secPass = sec && sec.verdict === 'pass'
  const secIssues = sec ? (sec.verdict === 'fail' ? sec.issues : []) : ['security pass agent failed — treat as unverified, do not merge']
  return {
    verdict: fn.verdict === 'pass' && secPass ? 'pass' : 'fail',
    issues: [...(fn.issues || []), ...secIssues],
    pr_title: fn.pr_title,
    pr_body: fn.pr_body,
    evidence: `${fn.evidence}${sec ? ` | security: ${sec.evidence}` : ' | security pass did not complete'}`,
  }
}

// Post-build security re-check. The tier is seeded from the feature DESCRIPTION at plan
// time; the actual built diff can touch a security-sensitive surface the seed under-
// budgeted (a "T2 add profile page" that quietly added a tenant query, a T3 that parsed a
// webhook). A cheap Haiku pass over the real diff catches that and raises verify depth to
// include the adversarial security pass — it NEVER lowers depth. T1 already runs security,
// so it is skipped there.
const RECHECK = {
  type: 'object', additionalProperties: false,
  required: ['sensitive', 'surfaces', 'rationale'],
  properties: {
    sensitive: { type: 'boolean', description: 'true ONLY if the built diff touches a real, reachable security-sensitive surface the seeded tier did not budget a security pass for — not for ordinary UI/CRUD/formatting' },
    surfaces: { type: 'array', items: { type: 'string' }, description: 'the concrete sensitive surface(s) found in the diff (empty when sensitive is false)' },
    rationale: { type: 'string', description: 'one line: why this does or does not warrant a security pass' },
  },
}

// The adversarial security pass — used by T1 always, and by any T2/T3 the re-check escalated.
const securityCheck = (i, branch, feature, doneCriteria, pitfalls, escalatedFrom) => agent(
  `Adversarial SECURITY verification` +
  (escalatedFrom
    ? ` — this ${escalatedFrom} feature was ESCALATED to a security pass because its built diff touches a security-sensitive surface its seeded tier did not budget for. `
    : ` of a HIGH-RISK (T1) feature. `) +
  `${detachedWorktree('sec', i, branch)} Hunt ONLY for real, reachable ` +
  `vulnerabilities in the diff and the code it touches: broken or missing authz/authn, tenant/user-boundary ` +
  `escapes (cross-tenant read or write), injection, secrets committed to code, unsafe deserialization, ` +
  `path traversal / SSRF on external input, missing signature or idempotency checks on webhooks, session/token ` +
  `handling flaws. Verdict 'fail' with the concrete attack path if you find one; 'pass' only after an honest ` +
  `look that found none.\n\nFEATURE: ${feature}\nDONE CRITERIA:\n${JSON.stringify(doneCriteria)}\n` +
  `KNOWN PITFALLS FROM THE BRIEF (probe these first):\n${JSON.stringify(pitfalls || [])}`,
  { label: `security:${i + 1}`, phase: 'Verify', effort: 'high', schema: SECCHECK },
)

const results = await pipeline(
  features,
  // 1. Plan — T1/T2 get a plan agent that distills the brief. T3 boilerplate gets a
  //    SYNTHETIC brief at zero agent cost: the Sonnet builder plans inline while
  //    building, which is right-sized for well-defined boilerplate (one fewer agent
  //    per T3 feature; the shared context rides along as its conventions).
  (f, _, i) => f.tier === 'T3'
    ? {
        approach: 'T3 direct build — no separate plan agent; plan inline while building.',
        files_to_touch: [],
        conventions: context || 'Match the style and patterns of the files you touch.',
        pitfalls: [],
        test_plan: 'Smoke test: builds/renders + one happy path. Do not over-specify.',
        done_criteria: f.done_criteria || [f.feature],
      }
    : agent(
    `Plan the implementation of this feature in the target repository, and return it as a ` +
    `SELF-CONTAINED per-feature brief. Read the relevant existing code first; the plan must ` +
    `fit existing conventions.\n\nFEATURE: ${f.feature}\n` +
    `RISK TIER: ${f.tier} — drives how much validation it gets downstream.\n` +
    (f.done_criteria ? `DONE CRITERIA (authoritative — plan to meet exactly these):\n${JSON.stringify(f.done_criteria)}\n` : '') +
    (context ? `SHARED CONTEXT (spec summary, conventions, lessons — distill only the slice THIS feature needs):\n${context}\n` : '') +
    `\nThe brief you return is the ONLY context the downstream builder and verifier receive — they will NOT ` +
    `re-open the full spec, architecture, or memory. So it must stand alone: in "conventions" capture the exact ` +
    `existing helpers/patterns/naming this feature must match (name concrete files + symbols); in "pitfalls" list ` +
    `only the gotchas/lessons that apply to THIS feature (the relevant subset — empty if none). ` +
    `Tests-first: the test plan is not optional. Keep the plan minimal — no speculative abstractions.`,
    { label: `plan:${i + 1}`, phase: 'Plan', effort: f.tier === 'T1' ? 'high' : 'medium', schema: PLAN },
  ),
  // 2. Build — isolated worktree; model/effort follow the tier (T3 → Sonnet/medium).
  (plan, f, i) => plan && agent(
    `Implement this feature following the plan.\n` + buildWorktree(i) + `\n` +
    `\nFEATURE: ${f.feature}\nRISK TIER: ${f.tier}\n` +
    `BRIEF — your complete context. ` +
    (f.tier === 'T3'
      ? `This T3 brief is deliberately thin: plan inline as you build, read the files you touch to match their ` +
        `style, and keep the test at smoke size (builds/renders + one happy path). `
      : `The plan agent already distilled the spec, conventions, and lessons relevant to THIS feature into it; ` +
        `read the specific files in files_to_touch and their tests to match style. `) +
    `Do NOT re-open the full spec, architecture, or memory. Follow "conventions", heed "pitfalls":\n` +
    `${JSON.stringify(plan, null, 2)}\n\n` +
    `Order of work: write the tests from the test plan first, watch them fail, implement until they pass, ` +
    `run the project's full relevant test suite. Match existing code style exactly. ` + knownRedNote +
    `If the plan turns out wrong mid-build, fix the approach and record it in deviations — do not ship a broken plan. ` +
    `Commit with a clear message before finishing. INTEGRATION BOUNDARY: commit to your feature branch only — ` +
    `do NOT git push, do NOT create or edit pull requests, do NOT merge. The orchestrator owns all integration ` +
    `(push → evidence-verified PR → merge) so the audit trail stays single-sourced.`,
    { label: `build:${i + 1}`, phase: 'Build', schema: BUILD, ...buildOpts(f.tier), ...(runtimeIsolation ? { isolation: 'worktree' } : {}) },
  ).then(b => b && { plan, build: b }),
  // 3. Security re-check — cheap Haiku pass over the BUILT diff, for T2/T3 only (T1
  //    already runs security). Catches a seeded tier that under-budgeted a sensitive
  //    surface the description didn't reveal; sets r.secEscalated so verify adds a
  //    security pass. Raises depth only, never lowers it. Fail-open on a dead re-check
  //    (keep the seeded tier) — this is a safety NET over the tier, not the primary gate.
  (r, f, i) => {
    if (!r) return null
    if (f.tier === 'T1') return { ...r, secEscalated: false, recheckSurfaces: [] }
    return agent(
      `Security tier re-check, READ-ONLY — do not check out, modify, or run anything. Inspect only the diff this ` +
      `feature added: from the target repo run \`git diff --merge-base HEAD ${r.build.branch}\`. This feature was ` +
      `seeded ${f.tier}, which gets NO security pass. Decide whether the diff touches a real, reachable security-` +
      `sensitive surface that warrants one: authn/authz, a tenant/user data boundary, raw SQL or shell/eval, secret ` +
      `or token handling, a webhook or external-input parser, file-path/URL handling from user input, or crypto. ` +
      `Return sensitive=true ONLY for such a surface actually present in the diff — never for ordinary UI/CRUD/` +
      `formatting/styling. Name the concrete surface(s).\n\nFEATURE: ${f.feature}`,
      { label: `tier-recheck:${i + 1}`, phase: 'Verify', model: 'haiku', effort: 'low', schema: RECHECK },
    ).then(rc => ({ ...r, secEscalated: !!(rc && rc.sensitive), recheckSurfaces: rc && rc.sensitive ? (rc.surfaces || []) : [] }))
  },
  // 4. Verify — depth follows the (possibly escalated) tier: T1 functional + parallel
  //    security; T2 one functional pass; T3 smoke-only on Sonnet. A T2/T3 the step-3
  //    re-check flagged (r.secEscalated) additionally gets the security pass, combined
  //    fail-closed exactly like T1. See docs/RISK-TIERS.md.
  (r, f, i) => {
    if (!r) return null
    const branch = r.build.branch
    const done = r.plan.done_criteria
    // Attach the escalation trail to every result so the orchestrator can surface it.
    const tag = check => ({ feature: f.feature, tier: f.tier, escalated: !!r.secEscalated, surfaces: r.recheckSurfaces || [], ...r, check })

    const funcPrompt =
      `Fresh-context verification. ${detachedWorktree('verify', i, branch)} ` +
      `Verify the feature against its done-criteria in that worktree. ` +
      `Run the tests yourself — do not trust the builder's report. ` +
      `If a test fails, re-run just that test once before concluding — a failure that clears on the re-run is flaky: ` +
      `note it in the evidence, do NOT fail the feature on it. ` +
      (f.tier === 'T1'
        ? `This is a HIGH-RISK (T1) feature: exercise the failure and edge paths, not just the happy one. `
        : `Cover the happy path and the top failure path; skip exhaustive edge-case grinding (T2). `) +
      `\n\n` +
      `Besides the verdict, return a ready-to-use PR title (imperative, <= 72 chars) and PR body ` +
      `(markdown: what & why, the done-criteria as a checklist, the test evidence YOU produced in this run), ` +
      `plus the evidence summary itself. On a fail verdict the body states what is broken instead. ` +
      `INTEGRATION BOUNDARY: return the PR title/body as DATA — do NOT git push, do NOT run gh, do NOT open a PR ` +
      `or merge yourself; the orchestrator creates the PR from what you return.\n\n` +
      `The brief's done-criteria and pitfalls below are your spec — verify against them; you need not re-open ` +
      `the full spec or architecture.\n` + knownRedNote +
      `FEATURE: ${f.feature}\nDONE CRITERIA:\n${JSON.stringify(done)}\n` +
      `PITFALLS TO PROBE:\n${JSON.stringify(r.plan.pitfalls || [])}\nBUILDER REPORT:\n${JSON.stringify(r.build)}`

    const funcThunk = eff => () => agent(funcPrompt, { label: `verify:${i + 1}`, phase: 'Verify', effort: eff, schema: CHECK })
    const smokeThunk = () => agent(
      `Smoke check ONLY — low-risk (T3) feature; do NOT do a deep or security review. ` +
      `${detachedWorktree('smoke', i, branch)} Confirm exactly three things: (1) it builds/compiles, (2) it ` +
      `renders/boots without error, (3) the happy path works (run the smoke test the builder wrote). Fail ONLY on a real ` +
      `build/render/happy-path break — not on style, edge cases, or missing depth (out of scope for T3). ` +
      `If a check fails, re-run it once before concluding — a failure that clears on the re-run is flaky: note it, do not fail on it. ` +
      `Return the verdict, a ready-to-use PR title + body (what & why, done-criteria checklist, the smoke evidence ` +
      `YOU produced), and the evidence summary.\n` + knownRedNote + `\n` +
      `FEATURE: ${f.feature}\nDONE CRITERIA:\n${JSON.stringify(done)}\nBUILDER REPORT:\n${JSON.stringify(r.build)}`,
      { label: `smoke:${i + 1}`, phase: 'Verify', model: 'sonnet', effort: 'medium', schema: CHECK },
    )

    // T1 — functional + adversarial security in parallel; both must pass.
    if (f.tier === 'T1') {
      return parallel([funcThunk('high'), () => securityCheck(i, branch, f.feature, done, r.plan.pitfalls, null)])
        .then(([fn, sec]) => tag(combineT1(fn, sec)))
    }

    // Escalated T2/T3 — the tier's own check AND a security pass, combined fail-closed.
    if (r.secEscalated) {
      const own = f.tier === 'T3' ? smokeThunk : funcThunk('medium')
      return parallel([own, () => securityCheck(i, branch, f.feature, done, r.plan.pitfalls, f.tier)])
        .then(([fn, sec]) => tag(combineT1(fn, sec)))
    }

    // Un-escalated: the tier's normal single pass.
    if (f.tier === 'T3') return smokeThunk().then(tag)
    return funcThunk('medium')().then(tag)
  },
)

// Index-aligned: features whose plan/build stage died must not vanish from the report.
const lost = features
  .map((f, i) => (!results[i] ? { feature: f.feature, tier: f.tier, branch: null, issues: ['plan or build stage failed before verification'] } : null))
  .filter(Boolean)

const done = results.filter(Boolean)
const passed = done.filter(r => r.check && r.check.verdict === 'pass')
const escalated = done.filter(r => r.escalated)
log(`${passed.length}/${features.length} features passed verification` +
  (escalated.length ? `; ${escalated.length} auto-escalated to a security pass by the diff re-check` : '') +
  (lost.length ? `; ${lost.length} lost before verification` : ''))

// Actual output-token spend this run (Workflow budget API), so the orchestrator can report
// real cost against the gate's "5–30x" estimate instead of leaving it a guess.
const spend = (typeof budget !== 'undefined' && budget && typeof budget.spent === 'function')
  ? { output_tokens: budget.spent(), target: budget.total ?? null }
  : null
if (spend) log(`spend: ${Math.round(spend.output_tokens / 1000)}k output tokens` + (spend.target ? ` of a ${Math.round(spend.target / 1000)}k target` : ''))

return {
  target: TARGET,
  spend,
  passed: passed.map(r => ({ feature: r.feature, tier: r.tier, escalated: !!r.escalated, security_surfaces: r.surfaces || [], branch: r.build.branch, summary: r.build.summary, pr_title: r.check.pr_title, pr_body: r.check.pr_body, evidence: r.check.evidence })),
  failed: [
    ...done.filter(r => !r.check || r.check.verdict === 'fail')
      .map(r => ({ feature: r.feature, tier: r.tier, escalated: !!r.escalated, security_surfaces: r.surfaces || [], branch: r.build && r.build.branch, issues: r.check ? r.check.issues : ['verification agent failed'] })),
    ...lost,
  ],
  note: 'Branches are unmerged. Review and merge in the main session: git merge --no-ff <branch> per feature, resolving conflicts in merge order of least → most files touched, then RUN THE FULL SUITE ON THE MERGED RESULT — each branch was verified in isolation; the merged whole has not been tested by any agent. When driven by /forge, the skill handles push → PR → merge per its approved integration mode instead. Delete feature-pipeline.input.json if it was used. If the run was interrupted: git worktree prune, then inspect feature/wf-* branches for committed work before deleting any.',
}
