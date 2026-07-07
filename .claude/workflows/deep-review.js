export const meta = {
  name: 'deep-review',
  description: 'Multi-dimension code review with adversarial verification of every finding',
  whenToUse: 'Before merging/shipping non-trivial work. Reviews the current diff by default; pass args like "all" for the whole repo or a path list to scope it. Args may also be an object {dir: "<product path>", scope: "...", priority: "<high-risk/T1 features + paths to concentrate on>"} — dir pins the target repo (required when the session did not start in the product directory); priority is an optional risk steer (see docs/RISK-TIERS.md).',
  phases: [
    { title: 'Review', detail: 'six dimensions in parallel' },
    { title: 'Verify', detail: 'ship-blocker findings attacked by 2 refuters, others by 1' },
  ],
}

// --- Target-directory contract (2026-07-06) -----------------------------------
// Workflow agents run in the SESSION's working directory — not necessarily the
// product this workflow should operate on (observed live in the 2026-07-05
// harness eval). Accept an explicit target via args {dir}, verify it before
// any work, pin every agent prompt to the verified absolute path. args may
// also arrive JSON-stringified (observed) — coerce before use.
let a = args
if (typeof a === 'string' && a.trim().startsWith('{')) { try { a = JSON.parse(a) } catch { /* keep raw string */ } }
const dirArg = a && typeof a === 'object' && typeof a.dir === 'string' && a.dir.trim() ? a.dir.trim() : null
const scopeArg = typeof a === 'string' && a.trim() ? a.trim()
  : a && typeof a === 'object' && typeof a.scope === 'string' && a.scope.trim() ? a.scope.trim() : null
const scope = scopeArg || 'the current uncommitted diff plus commits not yet on the default branch (git status / git diff / git log)'
// Optional risk steer: names the high-risk (T1) features/paths so reviewers spend their
// effort where it matters and sweep low-risk boilerplate lightly. See docs/RISK-TIERS.md.
const priority = a && typeof a === 'object' && typeof a.priority === 'string' && a.priority.trim() ? a.priority.trim() : null

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
    error: `Refusing to review ${pre.path || dirArg || 'the session working directory'}: ` +
      (!pre.exists ? 'it does not exist.'
        : pre.isControlCenter ? 'it looks like a harness/control-center repo, not a product.'
          : 'it does not hold a project (no source or manifest).') +
      ' Pass the product directory explicitly: args {dir: "<absolute path>", scope: "..."}.',
    preflight: pre,
  }
}
const TARGET = pre.path
const AT = `TARGET REPOSITORY: ${TARGET} — treat it as the current working directory. cd there at the start of ` +
  `every shell command (or use absolute paths under it) and stay within it.\n\n`
const agent0 = globalThis.agent
const agent = (p, o) => agent0(AT + p, o)

const DIMENSIONS = [
  { key: 'correctness', prompt: 'Logic bugs, off-by-ones, wrong conditionals, broken edge cases, unhandled error paths that produce wrong results.' },
  { key: 'security', prompt: 'Injection, authz/authn gaps, secrets in code, unsafe deserialization, path traversal, SSRF, exposed internals. Only real, reachable issues.' },
  { key: 'concurrency-state', prompt: 'Race conditions, stale state, missing transactions/locking, cache invalidation bugs, async ordering assumptions.' },
  { key: 'data-contracts', prompt: 'Schema/API mismatches, breaking changes for existing consumers or stored data, migration gaps, nullability violations.' },
  { key: 'tests', prompt: 'Behavior changed without test changes, tests that assert nothing, missing coverage for the risky branch just introduced.' },
  { key: 'simplify', prompt: 'Dead code introduced, needless abstraction, duplicated logic that existing helpers already cover, over-engineering vs the task.' },
]

const FINDINGS = {
  type: 'object',
  additionalProperties: false,
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['file', 'summary', 'failure_scenario', 'severity', 'confidence'],
        properties: {
          file: { type: 'string' },
          line: { type: 'integer', description: 'Best-line anchor; omit for file-level findings (missing tests, cross-file duplication)' },
          summary: { type: 'string', description: 'One-sentence statement of the defect' },
          failure_scenario: { type: 'string', description: 'Concrete inputs/state → wrong output/crash' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          confidence: { type: 'string', enum: ['certain', 'likely', 'possible'] },
        },
      },
    },
  },
}

const VERDICT = {
  type: 'object',
  additionalProperties: false,
  required: ['refuted', 'reasoning'],
  properties: {
    refuted: { type: 'boolean', description: 'true if the finding is NOT a real problem' },
    reasoning: { type: 'string' },
  },
}

phase('Review')
log(`Reviewing scope: ${scope}`)
const all = await parallel(DIMENSIONS.map(d => () =>
  agent(
    `Review ${scope} in the target repository. Your single dimension: ${d.key}.\n${d.prompt}\n\n` +
    (priority ? `RISK STEER: concentrate your effort on these high-risk paths first — ${priority}. Sweep low-risk boilerplate lightly.\n\n` : '') +
    `Read the surrounding code, not just the diff — a change can be wrong only in context. ` +
    `Report every issue you find, including ones you are uncertain about — a separate verification step filters. ` +
    `Do NOT report style nits, naming preferences, or hypothetical issues with no concrete failure scenario.`,
    { label: `review:${d.key}`, phase: 'Review', effort: 'high', schema: FINDINGS },
  ),
))

// Barrier is deliberate: dedup across dimensions before paying for verification.
const seen = new Set()
const findings = []
for (const r of all.filter(Boolean)) {
  for (const f of r.findings) {
    const key = `${f.file}:${f.line ?? 'file'}:${f.summary.slice(0, 60).toLowerCase()}`
    if (!seen.has(key)) { seen.add(key); findings.push(f) }
  }
}
log(`${findings.length} unique findings across ${DIMENSIONS.length} dimensions`)
if (!findings.length) return { target: TARGET, confirmed: [], message: 'No findings survived the review pass.' }

phase('Verify')
// Refuter count scales with stakes: ship-blockers get two independent attackers,
// medium/low findings get one — same standard of proof, ~40% less verify cost.
const refuterCount = f => (f.severity === 'critical' || f.severity === 'high' ? [1, 2] : [1])
const verified = await parallel(findings.map(f => () =>
  parallel(refuterCount(f).map(n => () =>
    agent(
      `Adversarially verify this code-review finding. Your job is to REFUTE the FAILURE SCENARIO, not the ` +
      `line number: read ${f.file} (line ${f.line ?? 'unspecified — file-level finding'} is a hint, not the claim) ` +
      `plus its callers, and prove the scenario cannot happen (guarded elsewhere, unreachable input, intentional ` +
      `behavior, misread code). If after honest effort you cannot refute it, it stands. ` +
      `Default to refuted=true when the scenario is speculative.\n\nFINDING: ${JSON.stringify(f)}`,
      { label: `verify:${f.file.split(/[\\/]/).pop()}:${f.line ?? 'file'}#${n}`, phase: 'Verify', effort: 'high', schema: VERDICT },
    ),
  )).then(votes => {
    const v = votes.filter(Boolean)
    const upheld = v.filter(x => !x.refuted).length
    // ALL assigned refuters must fail to kill it. Zero valid votes = infrastructure failure, NOT a refutation.
    const verdict = v.length === 0 ? 'UNVERIFIED' : (upheld === v.length ? 'CONFIRMED' : 'REFUTED')
    return { ...f, verdict, refutations: v.map(x => x.reasoning) }
  }),
))

const done = verified.filter(Boolean)
const order = { critical: 0, high: 1, medium: 2, low: 3 }
const bySeverity = (a, b) => order[a.severity] - order[b.severity]
const confirmed = done.filter(f => f.verdict === 'CONFIRMED').sort(bySeverity)
const unverified = done.filter(f => f.verdict === 'UNVERIFIED').sort(bySeverity)
log(`${confirmed.length}/${findings.length} findings confirmed after adversarial verification` +
  (unverified.length ? `; ${unverified.length} unverified (verifier agents failed — treat as open, do not discard)` : ''))

return { target: TARGET, confirmed, unverified, rejected: done.filter(f => f.verdict === 'REFUTED').length }
