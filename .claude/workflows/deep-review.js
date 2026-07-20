export const meta = {
  name: 'deep-review',
  description: 'Multi-dimension code review with adversarial verification of every finding',
  whenToUse: 'Before merging/shipping non-trivial work. Reviews the current diff by default; pass args like "all" for the whole repo or a path list to scope it. Args may also be an object {dir: "<product path>", scope: "...", priority: "<high-risk/T1 features + paths to concentrate on>"} — dir pins the target repo (required when the session did not start in the product directory); priority is an optional risk steer (see docs/RISK-TIERS.md).',
  phases: [
    { title: 'Review', detail: 'three merged lenses in parallel: bugs, boundaries, craft' },
    { title: 'Verify', detail: 'crit/high refuted individually, all medium/low by one batch refuter' },
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
const AT = `TARGET REPOSITORY: ${TARGET} — treat it as the current working directory. FIRST shell command: a ` +
  `standalone cd into it — cwd persists between commands; never chain cd with && (chained cd trips permission ` +
  `prompts). Stay within it.\n\n`
const agent0 = globalThis.agent
const agent = (p, o) => agent0(AT + p, o)

// Three merged lenses, not six single-topic reviewers: past ~3 genuinely different
// priors the findings overlap and the extra agents mostly pay to rediscover them.
// Each lens still reads with fresh context; related topics share one reader.
const DIMENSIONS = [
  { key: 'bugs', prompt: 'Correctness and state. Logic bugs, off-by-ones, wrong conditionals, broken edge cases, unhandled error paths that produce wrong results; race conditions, stale state, missing transactions/locking, cache invalidation bugs, async ordering assumptions.' },
  { key: 'boundaries', prompt: 'Security and contracts. Injection, authz/authn gaps, secrets in code, unsafe deserialization, path traversal, SSRF, exposed internals (only real, reachable issues); schema/API mismatches, breaking changes for existing consumers or stored data, migration gaps, nullability violations.' },
  { key: 'craft', prompt: 'Tests and simplicity. Behavior changed without test changes, tests that assert nothing, missing coverage for the risky branch just introduced; dead code, needless abstraction, duplicated logic that existing helpers already cover, over-engineering vs the task.' },
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
    `CONTEXT BUDGET: the scope, the files it touches, their direct callers and tests — nothing more. ` +
    `Do NOT read the full spec, PROGRESS, ADRs, docs, or unrelated modules; everything you need is in ` +
    `the scope and the code around it. ` +
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
// Refute cost scales with stakes: each ship-blocker (critical/high) gets its own
// refuter agent; ALL medium/low findings are refuted by ONE batch agent in a single
// pass. Fail-closed either way: a missing verdict is UNVERIFIED, never a free pass.
const indexed = findings.map((f, id) => ({ ...f, id }))
const blockerF = indexed.filter(f => f.severity === 'critical' || f.severity === 'high')
const restF = indexed.filter(f => f.severity !== 'critical' && f.severity !== 'high')

const BATCH = {
  type: 'object',
  additionalProperties: false,
  required: ['verdicts'],
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'refuted', 'reasoning'],
        properties: {
          id: { type: 'integer', description: 'the id of the finding being judged' },
          refuted: { type: 'boolean', description: 'true if the finding is NOT a real problem' },
          reasoning: { type: 'string' },
        },
      },
    },
  },
}

const toVerdict = (f, v) => ({ ...f, verdict: v ? (v.refuted ? 'REFUTED' : 'CONFIRMED') : 'UNVERIFIED', refutations: v ? [v.reasoning] : [] })

const tasks = blockerF.map(f => () =>
  agent(
    `Adversarially verify this HIGH-STAKES (critical/high) code-review finding. Your job is to test the FAILURE ` +
    `SCENARIO, not the line number: read ${f.file} (line ${f.line ?? 'unspecified — file-level finding'} is a hint, ` +
    `not the claim) plus its callers, and try to prove the scenario cannot happen (guarded elsewhere, unreachable ` +
    `input, intentional behavior, misread code). Because this is a ship-blocker, the bar to dismiss it is HIGH: ` +
    `refuted=true ONLY when you can affirmatively show the scenario is impossible or already guarded. Do NOT default ` +
    `to refuted on a merely speculative or hard-to-reach scenario — when you cannot prove it safe, it STANDS ` +
    `(refuted=false). A wrongly-dismissed critical is worse than a false alarm the human triages.\n\nFINDING: ${JSON.stringify(f)}`,
    { label: `verify:${f.file.split(/[\\/]/).pop()}:${f.line ?? 'file'}`, phase: 'Verify', effort: 'high', schema: VERDICT },
  ).then(v => toVerdict(f, v)),
)
if (restF.length) {
  tasks.push(() => agent(
    `Adversarially verify these ${restF.length} code-review findings (all medium/low severity) in ONE pass. ` +
    `For EACH finding, by its id: read its file (the line is a hint, not the claim) plus callers, and try to ` +
    `prove the failure scenario cannot happen (guarded elsewhere, unreachable input, intentional behavior, ` +
    `misread code). refuted=true when you can refute it or the scenario is speculative; refuted=false only if ` +
    `after honest effort it stands. Return exactly one verdict per id — a missing id counts as open, never as ` +
    `refuted.\n\nFINDINGS:\n${JSON.stringify(restF, null, 2)}`,
    { label: 'verify:batch', phase: 'Verify', effort: 'medium', schema: BATCH },
  ).then(b => ({ __batch: b })))
}

const out = (await parallel(tasks)).filter(Boolean)
const singles = out.filter(x => !('__batch' in x))
const singleIds = new Set(singles.map(s => s.id))
for (const f of blockerF) if (!singleIds.has(f.id)) singles.push({ ...f, verdict: 'UNVERIFIED', refutations: [] })
const batchRes = out.find(x => '__batch' in x)
const bmap = new Map()
if (batchRes && batchRes.__batch) for (const v of batchRes.__batch.verdicts) bmap.set(v.id, v)
const batched = restF.map(f => toVerdict(f, bmap.get(f.id)))

const done = [...singles, ...batched]
const order = { critical: 0, high: 1, medium: 2, low: 3 }
const bySeverity = (a, b) => order[a.severity] - order[b.severity]
const confirmed = done.filter(f => f.verdict === 'CONFIRMED').sort(bySeverity)
const unverified = done.filter(f => f.verdict === 'UNVERIFIED').sort(bySeverity)
// A refuted critical/high was a ship-blocker killed by a single refuter — surface it
// with the refutation reasoning (not just a count) so the human can spot-check the
// dismissal. Medium/low refutations stay a bare count (low stakes, high volume).
const rejectedBlockers = done
  .filter(f => f.verdict === 'REFUTED' && (f.severity === 'critical' || f.severity === 'high'))
  .sort(bySeverity)
  .map(f => ({ file: f.file, line: f.line, severity: f.severity, summary: f.summary, failure_scenario: f.failure_scenario, refutation: (f.refutations || [])[0] || '' }))
log(`${confirmed.length}/${findings.length} findings confirmed after adversarial verification` +
  (unverified.length ? `; ${unverified.length} unverified (verifier agents failed — treat as open, do not discard)` : '') +
  (rejectedBlockers.length ? `; ${rejectedBlockers.length} crit/high refuted — spot-check the dismissals` : ''))

return { target: TARGET, confirmed, unverified, rejectedBlockers, rejected: done.filter(f => f.verdict === 'REFUTED').length }
