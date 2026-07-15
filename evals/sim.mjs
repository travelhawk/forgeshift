// Orchestration simulator: executes a workflow script with stubbed agent()
// calls that return schema-valid canned data and record what was requested.
// Lets us eval orchestration shape (agent count, prompt volume, fail-closed
// behavior) deterministically, at any git revision, without spawning real agents.
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const ROOT = fileURLToPath(new URL('..', import.meta.url))
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

// Source at HEAD (rev = null → working tree) or any git revision.
export function loadSource(relPath, rev = null) {
  if (!rev) return readFileSync(new URL(`../${relPath}`, import.meta.url), 'utf8')
  return execFileSync('git', ['show', `${rev}:${relPath}`], { encoding: 'utf8', cwd: ROOT })
}

// Run a workflow script body with the API stubbed. responder(prompt, opts) is
// the fake model: return a schema-valid object, or null to simulate agent death.
export async function runWorkflow(src, { args, responder }) {
  const calls = []
  const agentStub = async (prompt, opts = {}) => {
    calls.push({
      label: opts.label || '', model: opts.model || 'inherit',
      effort: opts.effort || 'inherit', chars: prompt.length,
    })
    return responder(prompt, opts)
  }
  const parallel = async thunks => {
    const out = []
    for (const t of thunks) { try { out.push(await t()) } catch { out.push(null) } }
    return out
  }
  const pipeline = async (items, ...stages) => {
    const out = []
    for (let i = 0; i < items.length; i++) {
      let acc = items[i], dead = false
      for (const s of stages) {
        try { acc = await s(acc, items[i], i) } catch { dead = true; break }
      }
      out.push(dead ? null : acc)
    }
    return out
  }
  const body = src.replace(/^export\s+const\s+meta/m, 'const meta')
  const fn = new AsyncFunction('args', 'budget', 'parallel', 'pipeline', 'phase', 'log', 'workflow', body)
  const prevAgent = globalThis.agent
  globalThis.agent = agentStub
  try {
    const result = await fn(
      args, { total: null, spent: () => 0, remaining: () => Infinity },
      parallel, pipeline, () => {}, () => {}, async () => null,
    )
    return { result, calls }
  } finally {
    if (prevAgent === undefined) delete globalThis.agent
    else globalThis.agent = prevAgent
  }
}

// --- canned data -------------------------------------------------------------
export const DIR = 'T:/fake-product'
export const preflightOK = {
  path: DIR, exists: true, isGitRepo: true, hasCode: true,
  isControlCenter: false, cwdIsTarget: true,
}
// Variant: session cwd is NOT the target AND the harness ships forge-worktree.sh, so
// feature-pipeline takes the script-call (WT) branch of buildWorktree/detachedWorktree
// instead of inline git. Same orchestration shape — lets an eval walk the script path the
// default preflightOK (cwdIsTarget: true, no scriptsDir) never exercises.
export const preflightWithScripts = {
  ...preflightOK, cwdIsTarget: false, scriptsDir: 'T:/harness/scripts',
}

// 12-finding pool: ids 0-3 ship-blocking (critical/high), 4-11 medium/low.
export const FINDINGS_POOL = Array.from({ length: 12 }, (_, i) => ({
  file: `src/f${i}.js`, line: i + 1, summary: `finding ${i}`,
  failure_scenario: 'input X -> wrong output', confidence: 'likely',
  severity: i < 2 ? 'critical' : i < 4 ? 'high' : i < 8 ? 'medium' : 'low',
}))
// Same pool split for the old 6-dimension review and the new 3-lens review.
const LENS_MAP = {
  correctness: FINDINGS_POOL.slice(0, 2), security: FINDINGS_POOL.slice(2, 4),
  'concurrency-state': FINDINGS_POOL.slice(4, 6), 'data-contracts': FINDINGS_POOL.slice(6, 8),
  tests: FINDINGS_POOL.slice(8, 10), simplify: FINDINGS_POOL.slice(10, 12),
  bugs: FINDINGS_POOL.slice(0, 4), boundaries: FINDINGS_POOL.slice(4, 8), craft: FINDINGS_POOL.slice(8, 12),
}

// --- responders (work for both the old and new workflow revisions) ------------
export const deepReviewResponder = (overrides = {}) => (prompt, opts) => {
  const l = opts.label || ''
  if (l in overrides) return overrides[l]
  if (l.startsWith('preflight')) return preflightOK
  if (l.startsWith('review:')) return { findings: LENS_MAP[l.slice(7)] || [] }
  if (l === 'verify:batch') {
    const ids = [...new Set([...prompt.matchAll(/"id":\s*(\d+)/g)].map(m => +m[1]))]
    return { verdicts: ids.map(id => ({ id, refuted: false, reasoning: 'stands' })) }
  }
  if (l.startsWith('verify:')) return { refuted: false, reasoning: 'stands' }
  return null
}

export const featurePipelineResponder = (overrides = {}) => (prompt, opts) => {
  const l = opts.label || ''
  for (const k of Object.keys(overrides)) if (l.startsWith(k)) return overrides[k]
  if (l.startsWith('preflight')) return preflightOK
  if (l.startsWith('plan:')) return {
    approach: 'a', files_to_touch: ['src/x.js'], conventions: 'c', pitfalls: [],
    test_plan: 't', done_criteria: ['d1'],
  }
  if (l.startsWith('build:')) return { branch: `feature/wf-${l.slice(6)}-sim`, summary: 's', tests_passing: true, deviations: [] }
  if (l.startsWith('verify:') || l.startsWith('smoke:')) return { verdict: 'pass', issues: [], pr_title: 't', pr_body: 'b', evidence: 'e' }
  if (l.startsWith('security:')) return { verdict: 'pass', issues: [], evidence: 'e' }
  return null
}

export const designPanelResponder = (overrides = {}) => (prompt, opts) => {
  const l = opts.label || ''
  if (l in overrides) return overrides[l]
  if (l.startsWith('preflight')) return preflightOK
  if (l.startsWith('design:')) return {
    summary: 's', components: ['c'], data_flow: 'd', tradeoffs: ['t'], risks: ['r'], effort_estimate: 'e',
  }
  if (l === 'judge+synthesize') return {
    scores: [{ design: 'simplest', fitness: 8, simplicity: 8, risk: 7, total: 23 }],
    best: 'simplest', reasoning: 'r', design_doc: '# Final design',
  }
  if (l.startsWith('judge:')) return {
    scores: [{ design: 'simplest', fitness: 8, simplicity: 8, risk: 7, total: 23 }],
    best: 'simplest', reasoning: 'r',
  }
  if (l === 'synthesize:final') return '# Final design'
  return null
}

export const releaseGateResponder = (overrides = {}) => (prompt, opts) => {
  const l = opts.label || ''
  if (l in overrides) return overrides[l]
  if (l.startsWith('preflight')) return preflightOK
  if (l.startsWith('gate:')) {
    const keys = l.slice(5).split('+')
    const check = k => ({ gate: k, status: 'pass', evidence: 'cmd -> ok', blockers: [], warnings: [] })
    return keys.length > 1 ? { gates: keys.map(check) } : check(keys[0])
  }
  return null
}

// Standard scenario args (6-feature mixed-tier batch for the pipeline).
export const SCENARIOS = {
  'deep-review': { args: { dir: DIR, scope: 'the last merge diff' }, responder: deepReviewResponder },
  'feature-pipeline': {
    args: {
      dir: DIR,
      features: [
        { feature: 'auth', tier: 'T1', done_criteria: ['d'] }, { feature: 'billing', tier: 'T1', done_criteria: ['d'] },
        { feature: 'export', tier: 'T2', done_criteria: ['d'] }, { feature: 'import', tier: 'T2', done_criteria: ['d'] },
        { feature: 'landing', tier: 'T3', done_criteria: ['d'] }, { feature: 'settings-ui', tier: 'T3', done_criteria: ['d'] },
      ],
      context: 'spec summary here',
    },
    responder: featurePipelineResponder,
  },
  'design-panel': { args: { dir: DIR, brief: 'design the sync engine' }, responder: designPanelResponder },
  'design-panel-wide': { args: { dir: DIR, brief: 'design the sync engine', panel: 'wide' }, responder: designPanelResponder },
  'release-gate': { args: { dir: DIR, context: 'v1.0.0' }, responder: releaseGateResponder },
}
