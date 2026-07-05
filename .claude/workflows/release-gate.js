export const meta = {
  name: 'release-gate',
  description: 'Pre-release checks: static, security, docs in parallel, then tests, build, runtime smoke in sequence - one blocking verdict',
  whenToUse: 'Before tagging/deploying a release. Run from the project root AFTER the release commit exists (CHANGELOG entry + version bump) — /ship handles that ordering. Pass optional args string with release context. Fails closed: a gate that does not report blocks the verdict.',
  phases: [
    { title: 'Inspect', detail: 'static, security, docs — read-mostly, parallel' },
    { title: 'Execute', detail: 'tests → build → runtime, sequential (they share ports and build dirs)' },
    { title: 'Verdict', detail: 'aggregate; missing gate = blocker' },
  ],
}

const context = typeof args === 'string' && args.trim() ? `Release context: ${args.trim()}` : 'No release context provided — infer version/changes from git.'

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
  { key: 'security', task: 'Scan the diff since the last tag (or last 20 commits if no tag) for: committed secrets/keys, new endpoints without auth checks, disabled security middleware, unsafe input handling introduced. Also run the package manager\'s audit command; only HIGH/CRITICAL advisories in production deps are blockers.' },
  { key: 'docs', task: 'Release hygiene by INSPECTION ONLY — do not execute installers or setup commands: CHANGELOG has an entry for this release (missing = blocker); version fields consistent across all manifests (inconsistent = blocker); README setup/run commands textually match the scripts and tooling that actually exist in the manifests (mismatch = warning, wrong/nonexistent command = blocker).' },
]

const EXECUTE_GATES = [
  { key: 'tests', task: 'Run the full test suite with the project\'s own test command. status=fail on any failing test. Report count passed/failed and the failing test names. No test command configured = status=skipped (the verdict treats that as blocking).' },
  { key: 'build', task: 'Run the production build command. status=fail if the build errors. Note bundle-size or output anomalies as warnings. Projects with no build step (e.g. a plain Python API): status=skipped with the reason.' },
  { key: 'runtime', task: 'Smoke-test with BOUNDED execution: start the app as a BACKGROUND process with output redirected to a log file — never as a blocking foreground command. Record the PID. Poll the primary route/command with curl --max-time 5 (or the CLI equivalent) for at most 60 seconds. Then kill the process UNCONDITIONALLY — also on failure — using a tree kill (Windows: taskkill //F //T //PID <pid>, or npx kill-port <port>); verify nothing still listens on the port. Whole gate finishes within ~3 minutes; app not responding by then = status=fail with the log tail as evidence. Libraries/packages with nothing to boot: status=skipped with the reason.' },
]

const ALL_KEYS = [...INSPECT_GATES, ...EXECUTE_GATES].map(g => g.key)

const gatePrompt = g =>
  `You are the "${g.key}" release gate for the project at the current working directory. ${context}\n\nTASK: ${g.task}\n\n` +
  `Be strict and honest: report exactly what the commands output. Never mark pass without having run the check. ` +
  `If a needed command does not exist, status=skipped and say what is missing.`

phase('Inspect')
log('Running static, security, docs in parallel')
// Gates run commands and report — mechanical work; only the security read needs depth.
const gateEffort = k => (k === 'security' ? 'high' : 'medium')
const inspect = await parallel(INSPECT_GATES.map(g => () =>
  agent(gatePrompt(g), { label: `gate:${g.key}`, phase: 'Inspect', effort: gateEffort(g.key), schema: CHECK }).then(r => r && { ...r, gate: g.key }),
))

phase('Execute')
const execute = []
for (const g of EXECUTE_GATES) {
  log(`Running ${g.key} gate`)
  const r = await agent(gatePrompt(g), { label: `gate:${g.key}`, phase: 'Execute', effort: 'medium', schema: CHECK })
  execute.push(r && { ...r, gate: g.key })
}

phase('Verdict')
const results = [...inspect, ...execute].filter(Boolean)
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
  blockers.push('[tests] no passing test-suite evidence (failed, skipped, or missing) — verify cwd is the project root and a test command exists')
}

const ship = failed.length === 0 && blockers.length === 0
log(ship ? 'VERDICT: SHIP' : `VERDICT: NO-SHIP — ${failed.length} failed gates, ${blockers.length} blockers`)

return {
  verdict: ship ? 'SHIP' : 'NO-SHIP',
  gates: results.map(r => ({ gate: r.gate, status: r.status, evidence: r.evidence })),
  blockers,
  warnings,
  skipped: skipped.map(r => r.gate),
  missing,
}
