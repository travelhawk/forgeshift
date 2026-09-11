export const meta = {
  name: 'release-gate',
  description: 'Pre-release checks: static, security, docs in parallel, then tests, build, runtime smoke in sequence - one blocking verdict',
  whenToUse: 'Before tagging/deploying a release. Run from the project root AFTER the release commit exists (CHANGELOG entry + version bump) — /ship handles that ordering. Pass optional args string with release context — or an object {dir: "<product path>", context: "..."}; dir pins the target repo (required when the session did not start in the product directory). Fails closed: a gate that does not report blocks the verdict.',
  phases: [
    { title: 'Inspect', detail: 'hygiene agent (static+docs) ∥ security agent — 2 agents' },
    { title: 'Execute', detail: 'ONE runner: tests → build → runtime in order (they share ports and build dirs)' },
    { title: 'Verdict', detail: 'aggregate; missing gate = blocker' },
  ],
}

// --- Target-directory contract (2026-07-06) -----------------------------------
// Workflow agents run in the SESSION's working directory — not necessarily the
// product to gate (observed live in the 2026-07-05 harness eval). Accept
// {dir, context}, coerce stringified args, verify the target, pin every prompt.
let a = args
if (typeof a === 'string' && a.trim().startsWith('{')) { try { a = JSON.parse(a) } catch { /* keep raw string */ } }
const dirArg = a && typeof a === 'object' && typeof a.dir === 'string' && a.dir.trim() ? a.dir.trim() : null
const ctxArg = typeof a === 'string' && a.trim() ? a.trim()
  : a && typeof a === 'object' && typeof a.context === 'string' && a.context.trim() ? a.context.trim() : null
const context = ctxArg ? `Release context: ${ctxArg}` : 'No release context provided — infer version/changes from git.'

const PREFLIGHT = {
  type: 'object', additionalProperties: false,
  required: ['path', 'exists', 'isGitRepo', 'hasCode', 'isControlCenter', 'cwdIsTarget'],
  properties: {
    path: { type: 'string', description: 'absolute path of the inspected target directory' },
    exists: { type: 'boolean' },
    isGitRepo: { type: 'boolean', description: 'target has a .git directory' },
    hasCode: { type: 'boolean', description: 'target holds a real project: source code and/or a manifest/build config (package.json, pyproject.toml, go.mod, Cargo.toml, ...)' },
    isControlCenter: { type: 'boolean', description: 'target looks like an agent harness / control-center repo rather than a product: .claude/workflows/ or .claude/agents/ present, a projects/ container dir, or a CLAUDE.md describing a harness' },
    cwdIsTarget: { type: 'boolean', description: 'the shell current working directory IS the target (compare pwd to the target path)' },
  },
}
const pre = await globalThis.agent(
  `Preflight, read-only, modify nothing. Run pwd. ${dirArg
    ? `The intended target directory is ${dirArg} — inspect it.`
    : 'No target was passed — the current working directory is the implied target; inspect it.'} ` +
  `Report per the schema: absolute target path, whether it exists, is a git repo, holds a real project, and ` +
  `whether it looks like an agent-harness/control-center repo instead of a product.`,
  { label: 'preflight:target', model: 'haiku', effort: 'low', schema: PREFLIGHT },
)
if (!pre) return { error: 'Preflight agent failed — cannot verify the target directory. Pass args {dir: "<product path>"} and retry.' }
if (!pre.exists || !pre.hasCode || pre.isControlCenter) {
  return {
    error: `Refusing to gate ${pre.path || dirArg || 'the session working directory'}: ` +
      (!pre.exists ? 'it does not exist.'
        : pre.isControlCenter ? 'it looks like a harness/control-center repo, not a product.'
          : 'it does not hold a project (no source or manifest).') +
      ' Pass the product directory explicitly: args {dir: "<absolute path>", context: "..."}.',
    preflight: pre,
  }
}
const TARGET = pre.path
const AT = `TARGET REPOSITORY: ${TARGET} — treat it as the current working directory. FIRST shell command: a ` +
  `standalone cd into it — cwd persists between commands; never chain cd with && (chained cd trips permission ` +
  `prompts). Stay within it.\n\n`
const agent0 = globalThis.agent
const agent = (p, o) => agent0(AT + p, o)

const CHECK = {
  type: 'object',
  additionalProperties: false,
  required: ['gate', 'status', 'evidence', 'blockers', 'warnings'],
  properties: {
    gate: { type: 'string' },
    status: { type: 'string', enum: ['pass', 'fail', 'skipped'] },
    evidence: { type: 'string', description: 'The command(s) run and the decisive output lines; for skipped, WHY it does not apply' },
    blockers: { type: 'array', items: { type: 'string' } },
    warnings: { type: 'array', items: { type: 'string' }, description: 'Non-blocking but worth knowing' },
  },
}

const INSPECT_GATES = [
  { key: 'static', task: 'Run the type checker and linter using the project\'s own commands (detect from package.json/pyproject/Makefile). status=fail on type errors or lint errors (not warnings). If the project has neither configured, status=skipped with that fact as a warning.' },
  { key: 'security', task: 'Scan the diff since the last tag (or last 20 commits if no tag) for: committed secrets/keys, new endpoints without auth checks, disabled security middleware, unsafe input handling introduced. Also run the package manager\'s audit command; only HIGH/CRITICAL advisories in production deps are blockers. No lockfile = the audit has no signal: say so as a warning and do not count it as an audit pass; never generate or synthesize a lockfile.' },
  { key: 'docs', task: 'Release hygiene by INSPECTION ONLY — do not execute installers or setup commands: CHANGELOG has an entry for this release (missing = blocker); version fields consistent across all manifests (inconsistent = blocker); README setup/run commands textually match the scripts and tooling that actually exist in the manifests (mismatch = warning, wrong/nonexistent command = blocker).' },
]

const EXECUTE_GATES = [
  { key: 'tests', task: 'Run the full test suite with the project\'s own test command. status=fail on any failing test. Report count passed/failed and the failing test names. No test command configured = status=skipped with a blocker naming the manifest and the missing script (e.g. "package.json has no test script") — the verdict treats it as blocking.' },
  { key: 'build', task: 'Run the production build command. status=fail if the build errors. Note bundle-size or output anomalies as warnings. Projects with no build step (e.g. a plain Python API): status=skipped with the reason.' },
  { key: 'runtime', task: 'Smoke-test with BOUNDED execution: start the app as a BACKGROUND process with output redirected to a log file — never as a blocking foreground command. Record the PID. Poll the primary route/command with curl --max-time 5 (or the CLI equivalent) for at most 60 seconds. Then kill the process UNCONDITIONALLY — also on failure — using a tree kill (Windows: taskkill //F //T //PID <pid>, or npx kill-port <port>); verify nothing still listens on the port. Whole gate finishes within ~3 minutes; app not responding by then = status=fail with the log tail as evidence. Libraries/packages with nothing to boot: status=skipped with the reason. Point any data the smoke run writes at a temporary location when the product offers one (env var, flag, config), otherwise delete what the run created; compare git status --porcelain --ignored before and after and report every leftover file as a warning — never claim a clean tree without that check.' },
]

const ALL_KEYS = [...INSPECT_GATES, ...EXECUTE_GATES].map(g => g.key)

const gatePrompt = g =>
  `You are the "${g.key}" release gate for the target project. ${context}\n\nTASK: ${g.task}\n\n` +
  `Be strict and honest: report exactly what the commands output. Never mark pass without having run the check. ` +
  `If a needed command does not exist, status=skipped and say what is missing.`

// One agent can run several similar gates: the schema returns one gates[] entry per
// key, and the fail-closed aggregation below still treats any missing key as a blocker.
const MULTICHECK = keys => ({
  type: 'object',
  additionalProperties: false,
  required: ['gates'],
  properties: {
    gates: {
      type: 'array',
      items: { ...CHECK, properties: { ...CHECK.properties, gate: { type: 'string', enum: keys } } },
    },
  },
})
const multiPrompt = (gates, extra) =>
  `You are running ${gates.length} release gates for the target project in ONE pass. ${context}\n\n` +
  gates.map(g => `GATE "${g.key}": ${g.task}`).join('\n\n') + `\n\n${extra ? extra + ' ' : ''}` +
  `Return exactly one gates[] entry per key (${gates.map(g => g.key).join(', ')}). Be strict and honest: report ` +
  `exactly what the commands output. Never mark a gate pass without having run its check; a needed command that ` +
  `does not exist = status=skipped with what is missing.`

phase('Inspect')
log('2 inspectors: hygiene (static+docs, Sonnet) ∥ security (session model)')
// Hygiene gates are well-defined command-running → one Sonnet agent covers both.
// Only the security read needs real judgment (reason about the diff for reachable
// vulns) → its own session-model agent. Aggregation (fail-closed) is code, not agents.
const [hygiene, security] = await parallel([
  () => agent(multiPrompt(INSPECT_GATES.filter(g => g.key !== 'security')),
    { label: 'gate:static+docs', phase: 'Inspect', model: 'sonnet', effort: 'medium', schema: MULTICHECK(['static', 'docs']) }),
  () => agent(gatePrompt(INSPECT_GATES.find(g => g.key === 'security')),
    { label: 'gate:security', phase: 'Inspect', effort: 'high', schema: CHECK }).then(r => r && { ...r, gate: 'security' }),
])

phase('Execute')
log('1 runner: tests → build → runtime in order')
// These were always sequential (shared ports/build dirs) — one agent runs all three
// and reports each separately; three agents here was pure re-contexting overhead.
const exec = await agent(
  multiPrompt(EXECUTE_GATES, 'Run the gates STRICTLY IN THIS ORDER: tests, build, runtime. An earlier failure does not skip the later gates — attempt and report every gate honestly.'),
  { label: 'gate:tests+build+runtime', phase: 'Execute', model: 'sonnet', effort: 'medium', schema: MULTICHECK(['tests', 'build', 'runtime']) },
)

phase('Verdict')
const results = [
  ...(hygiene ? hygiene.gates : []),
  security,
  ...(exec ? exec.gates : []),
].filter(Boolean)
const failed = results.filter(r => r.status === 'fail')
const skipped = results.filter(r => r.status === 'skipped')
const blockers = results.flatMap(r => r.blockers.map(b => `[${r.gate}] ${b}`))
const warnings = results.flatMap(r => r.warnings.map(w => `[${r.gate}] ${w}`))

// Fail closed: a gate that never reported is a blocker, not a free pass.
const missing = ALL_KEYS.filter(k => !results.some(r => r.gate === k))
for (const k of missing) blockers.push(`[${k}] gate agent failed to report — no evidence`)

// Tests demand positive evidence: skipped tests (wrong cwd, no test command) never ship.
const testsGate = results.find(r => r.gate === 'tests')
const testsPassed = !!testsGate && testsGate.status === 'pass'
if (!testsPassed && !blockers.some(b => b.startsWith('[tests]'))) {
  // Cite the gate's own evidence so the blocker names the concrete gap (no test script,
  // wrong root, failing suite) instead of a generic template line.
  blockers.push(`[tests] no passing test-suite evidence — ${testsGate
    ? `${testsGate.status}: ${String(testsGate.evidence || '').slice(0, 240)}`
    : 'the tests gate did not report'}; a release needs a green suite run from the project root`)
}

const ship = failed.length === 0 && blockers.length === 0
log(ship ? 'VERDICT: SHIP' : `VERDICT: NO-SHIP — ${failed.length} failed gates, ${blockers.length} blockers`)

const spend = (typeof budget !== 'undefined' && budget && typeof budget.spent === 'function')
  ? { output_tokens: budget.spent(), target: budget.total ?? null }
  : null

return {
  target: TARGET,
  spend,
  verdict: ship ? 'SHIP' : 'NO-SHIP',
  gates: results.map(r => ({ gate: r.gate, status: r.status, evidence: r.evidence })),
  blockers,
  warnings,
  skipped: skipped.map(r => r.gate),
  missing,
}
