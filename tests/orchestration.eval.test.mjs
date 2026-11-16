// Behavioral evals: EXECUTE the workflow scripts (stubbed agents) and assert
// the orchestration shape and the fail-closed quality guarantees. Unlike the
// text-invariant tests, these catch semantic regressions — e.g. a refactor that
// keeps the right strings but silently drops findings or passes dead gates.
import { test, suite } from 'node:test'
import assert from 'node:assert/strict'
import {
  loadSource, runWorkflow, SCENARIOS, CASES,
  deepReviewResponder, featurePipelineResponder, designPanelResponder, releaseGateResponder,
} from '../evals/sim.mjs'

const run = (wf, scenario, responder) =>
  runWorkflow(loadSource(`workflows/${wf}.js`), { args: SCENARIOS[scenario].args, responder })

suite('orchestration shape (agent budgets)', () => {
  test('deep-review: 12 findings cost 9 agents (3 lenses + 1 cluster + 4 refuters + 1 batch, no preflight)', async () => {
    const prompts = {}
    const base = deepReviewResponder()
    const { result, calls } = await run('deep-review', 'deep-review', (p, o) => { prompts[o.label] = p; return base(p, o) })
    assert.equal(calls.length, 9)
    for (const l of ['review:bugs', 'review:boundaries', 'review:craft']) assert.match(prompts[l], /Check the target first/, `${l} checks the target`)
    assert.equal(calls.filter(c => c.label === 'cluster:root-cause').length, 1, 'one Sonnet cluster pass')
    assert.equal(result.confirmed.length, 12, 'all findings confirmed on the happy path')
    assert.equal(calls.filter(c => c.label.startsWith('review:')).length, 3, '3 lenses')
    assert.equal(calls.filter(c => c.label === 'verify:batch').length, 1, 'one batch refuter for all med/low')
  })

  test('deep-review depth:quick -> one reviewer for all lenses, one refuter for every finding', async () => {
    const src = loadSource('workflows/deep-review.js')
    const twelve = deepReviewResponder()(null, { label: 'review:bugs' }).findings
      .concat(deepReviewResponder()(null, { label: 'review:boundaries' }).findings, deepReviewResponder()(null, { label: 'review:craft' }).findings)
    const prompts = {}
    const base = deepReviewResponder({ 'review:all': { findings: twelve } })
    const { result, calls } = await runWorkflow(src, {
      args: { ...SCENARIOS['deep-review'].args, depth: 'quick' },
      responder: (p, o) => { prompts[o.label] = p; return base(p, o) },
    })
    assert.deepEqual(calls.map(c => c.label), ['review:all', 'verify:batch'], 'two agents: no cluster pass, no single refuters')
    assert.equal(calls[1].effort, 'high', 'the one refuter judges crit/high too, so it runs at high effort')
    assert.match(prompts['verify:batch'], /bar to dismiss is HIGH/, 'crit/high keep the high dismissal bar')
    assert.equal(result.confirmed.length, 12)
    // A missing verdict stays open, never refuted.
    const dead = await runWorkflow(src, {
      args: { ...SCENARIOS['deep-review'].args, depth: 'quick' },
      responder: deepReviewResponder({ 'review:all': { findings: twelve }, 'verify:batch': null }),
    })
    assert.equal(dead.result.unverified.length, 12)
  })

  test('deep-review: all reviewers refusing the target is a run-level error', async () => {
    const { result } = await run('deep-review', 'deep-review', deepReviewResponder({
      'review:bugs': { refused: 'harness repo', findings: [] }, 'review:boundaries': { refused: 'harness repo', findings: [] },
      'review:craft': { refused: 'harness repo', findings: [] },
    }))
    assert.match(result.error, /Refusing to review .*harness repo/)
  })

  test('deep-review mode:integration -> ONE seam lens instead of three, verify unchanged', async () => {
    const src = loadSource('workflows/deep-review.js')
    const { result, calls } = await runWorkflow(src, {
      args: { ...SCENARIOS['deep-review'].args, mode: 'integration' },
      responder: deepReviewResponder(),
    })
    assert.ok(!result.error, 'integration mode runs clean')
    const lenses = calls.filter(c => c.label.startsWith('review:'))
    assert.equal(lenses.length, 1, 'exactly one review lens in integration mode')
    assert.equal(lenses[0].label, 'review:integration')
    // Default stays the full review — same args without mode still runs 3 lenses.
    const full = await runWorkflow(src, { args: SCENARIOS['deep-review'].args, responder: deepReviewResponder() })
    assert.equal(full.calls.filter(c => c.label.startsWith('review:')).length, 3, 'omitting mode keeps the 3-lens default')
  })

  test('feature-pipeline: 6 mixed-tier features -> 6 builders + 2 T1 security passes, nothing else', async () => {
    const { result, calls } = await run('feature-pipeline', 'feature-pipeline', featurePipelineResponder())
    assert.equal(calls.length, 8, 'no preflight, no plan, no per-feature verify agent')
    assert.equal(calls.filter(c => c.label.startsWith('build:')).length, 6)
    assert.equal(calls.filter(c => c.label.startsWith('security:')).length, 2, 'security pass only for T1')
    assert.equal(result.passed.length, 6)
    const t3builds = calls.filter(c => c.label.startsWith('build:') && c.model === 'sonnet')
    assert.equal(t3builds.length, 2, 'T3 builds on Sonnet')
  })

  test('feature-pipeline: a builder-flagged sensitive surface adds a security pass, fail-closed', async () => {
    const built = n => ({ branch: `feature/wf-${n}-sim`, summary: 's', tests_passing: true, evidence: 'e', deviations: [], pr_title: 't', pr_body: 'b' })
    const flagged = n => ({ ...built(n), sensitive_surfaces: ['raw SQL in src/x.js'] })
    // Feature 3 (T2) and feature 5 (T3) flag a surface: 2 T1 passes + 2 escalations.
    const hit = await run('feature-pipeline', 'feature-pipeline',
      featurePipelineResponder({ 'build:3': flagged(3), 'build:5': flagged(5) }))
    assert.equal(hit.calls.filter(c => c.label.startsWith('security:')).length, 4)
    assert.equal(hit.result.passed.filter(p => p.escalated).length, 2, 'both escalations are reported')
    assert.deepEqual(hit.result.passed.find(p => p.feature === 'export').security_surfaces, ['raw SQL in src/x.js'])
    // The security pass fails: the feature fails, even though its builder's tests passed.
    const blocked = await run('feature-pipeline', 'feature-pipeline', featurePipelineResponder({
      'build:3': flagged(3), 'security:3': { verdict: 'fail', issues: ['injection'], evidence: 'e' },
    }))
    assert.equal(blocked.result.passed.length, 5)
    assert.equal(blocked.result.failed[0].feature, 'export', 'a failed security pass blocks the feature')
    assert.deepEqual(blocked.result.failed[0].issues, ['injection'])
    // Red tests: the feature fails at once, no security pass is spent on it.
    const red = await run('feature-pipeline', 'feature-pipeline',
      featurePipelineResponder({ 'build:3': { ...flagged(3), tests_passing: false, deviations: ['parser broken'] } }))
    assert.equal(red.calls.filter(c => c.label.startsWith('security:')).length, 2, 'T1 only')
    assert.ok(red.result.failed[0].issues.includes('parser broken'))
  })

  test('feature-pipeline: builders check the target themselves; all refusing is a run-level error', async () => {
    const seen = []
    const base = featurePipelineResponder()
    await runWorkflow(loadSource('workflows/feature-pipeline.js'), {
      args: SCENARIOS['feature-pipeline'].args, responder: (p, o) => { seen.push(p); return base(p, o) },
    })
    assert.ok(seen.every(p => /FIRST shell command: a standalone cd/.test(p)), 'every agent is pinned to the target')
    assert.match(seen[0], /Check the target first, before you change anything/)
    const refused = { branch: '', summary: '', tests_passing: false, evidence: '', deviations: ['REFUSED: not a git repository'], sensitive_surfaces: [], pr_title: '', pr_body: '' }
    const { result, calls } = await run('feature-pipeline', 'feature-pipeline', featurePipelineResponder({ 'build:': refused }))
    assert.match(result.error, /Refusing to run against .*REFUSED: not a git repository/)
    assert.ok(!calls.some(c => c.label.startsWith('security:')), 'nothing is verified on a refused target')
  })

  test('design-panel: lean = 4 agents, wide = 8 (no preflight)', async () => {
    const lean = await run('design-panel', 'design-panel', designPanelResponder())
    assert.equal(lean.calls.length, 4)
    assert.ok(lean.result.design, 'lean run produces the final document')
    const wide = await run('design-panel', 'design-panel-wide', designPanelResponder())
    assert.equal(wide.calls.length, 8)
    assert.ok(wide.result.design)
  })

  test('design-panel: a lost brief is read from the input file; all designers refusing is an error', async () => {
    const src = loadSource('workflows/design-panel.js')
    const fromFile = await runWorkflow(src, {
      args: { dir: SCENARIOS['design-panel'].args.dir },
      responder: designPanelResponder({ 'input:fallback': { brief: 'design the sync engine' } }),
    })
    assert.equal(fromFile.calls[0].label, 'input:fallback')
    assert.ok(fromFile.result.design, 'the panel runs on the brief from the file')
    const refused = { refused: 'harness repo', summary: '', components: [], data_flow: '', tradeoffs: [], risks: [], effort_estimate: '' }
    const r = await run('design-panel', 'design-panel', designPanelResponder({ 'design:simplest': refused, 'design:ops-first': refused, 'design:user-first': refused }))
    assert.match(r.result.error, /Refusing to run against .*harness repo/)
  })

  test('release-gate: 6 gates in 3 agents, SHIP on all-pass (no preflight)', async () => {
    const { result, calls } = await run('release-gate', 'release-gate', releaseGateResponder())
    assert.equal(calls.length, 3)
    assert.equal(result.verdict, 'SHIP')
    assert.equal(result.gates.length, 6, 'all six gates reported evidence')
  })
})

suite('2026-09-11 eval fixes (behaviour)', () => {
  test('deep-review: clustering merges same-root-cause findings -> fewer refuters, sightings kept', async () => {
    // ids 0-1 (critical) are one defect, 2-3 (high) another; the 8 med/low stay separate.
    const merge = { clusters: [{ ids: [0, 1] }, { ids: [2, 3] }, ...[4, 5, 6, 7, 8, 9, 10, 11].map(id => ({ ids: [id] }))] }
    const { result, calls } = await run('deep-review', 'deep-review', deepReviewResponder({ 'cluster:root-cause': merge }))
    assert.equal(calls.filter(c => c.label.startsWith('verify:') && c.label !== 'verify:batch').length, 2, '2 refuters instead of 4')
    assert.equal(result.confirmed.length, 10, '10 root causes reported, not 12 lines')
    const merged = result.confirmed.filter(f => f.also_reported)
    assert.equal(merged.length, 2)
    assert.ok(merged.every(f => f.also_reported.length === 1), 'each merged finding lists its other sighting')
  })

  test('deep-review: dead or invalid cluster pass falls back to verifying every finding', async () => {
    const dead = await run('deep-review', 'deep-review', deepReviewResponder({ 'cluster:root-cause': null }))
    assert.equal(dead.result.confirmed.length, 12, 'nothing lost when the cluster agent dies')
    assert.equal(dead.calls.filter(c => c.label.startsWith('verify:') && c.label !== 'verify:batch').length, 4)
    const bad = await run('deep-review', 'deep-review', deepReviewResponder({ 'cluster:root-cause': { clusters: [{ ids: [0, 0, 1] }] } }))
    assert.equal(bad.result.confirmed.length, 12, 'an invalid grouping (missing/duplicate ids) is ignored')
  })

  test('deep-review: cluster severity is the highest of its members', async () => {
    const merge = { clusters: [{ ids: [11, 0] }, ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(id => ({ ids: [id] }))] }
    const { result } = await run('deep-review', 'deep-review', deepReviewResponder({ 'cluster:root-cause': merge }))
    const rep = result.confirmed.find(f => f.file === 'src/f11.js')
    assert.equal(rep.severity, 'critical', 'a low sighting merged with a critical one is reported critical')
  })

  test('feature-pipeline: a failed T1 feature still reports evidence and its security verdict', async () => {
    const { result } = await run('feature-pipeline', 'feature-pipeline', featurePipelineResponder({
      'security:1': { verdict: 'fail', issues: ['viewer can delete'], evidence: 'tried delete as viewer' },
    }))
    assert.equal(result.failed.length, 1)
    const f = result.failed[0]
    assert.equal(f.tier, 'T1')
    assert.deepEqual(f.issues, ['viewer can delete'])
    assert.equal(f.evidence, 'e | security: tried delete as viewer', 'builder + security evidence kept')
    assert.deepEqual(f.security, { verdict: 'fail', evidence: 'tried delete as viewer' }, 'security verdict reported separately')
    assert.equal(f.pr_body, 'b', 'the write-up survives a fail')
    assert.ok(result.passed.every(x => 'security' in x), 'passed entries carry the field too (null for T2/T3)')
  })

  test('feature-pipeline: forge_home arg pins the worktree script; without it, inline git', async () => {
    const prompts = []
    const base = featurePipelineResponder()
    const src = loadSource('workflows/feature-pipeline.js')
    const { result } = await runWorkflow(src, {
      args: { ...SCENARIOS['feature-pipeline'].args, forge_home: 'T:/harness/' },
      responder: (p, o) => { prompts.push([o.label, p]); return base(p, o) },
    })
    assert.equal(result.passed.length, 6)
    const build = prompts.find(([l]) => l === 'build:1')[1]
    assert.match(build, /bash "T:\/harness\/scripts\/forge-worktree\.sh" new-build 1/, 'builder calls the script under forge_home (trailing slash stripped)')
    const sec = prompts.find(([l]) => l === 'security:1')[1]
    assert.match(sec, /forge-worktree\.sh" new-detached sec 1/, 'the security pass checks out the branch detached')
    const plain = []
    await runWorkflow(src, { args: SCENARIOS['feature-pipeline'].args, responder: (p, o) => { plain.push([o.label, p]); return base(p, o) } })
    assert.match(plain.find(([l]) => l === 'build:1')[1], /Work in an ISOLATED git worktree you create yourself/)
  })

  test('feature-pipeline: args lost in transit are read from the input file, at the cost of one agent', async () => {
    const file = { found: true, features: [{ feature: 'auth', tier: 'T1', done_criteria: ['d'] }, 'plain'], context: 'c' }
    const { result, calls } = await runWorkflow(loadSource('workflows/feature-pipeline.js'), {
      args: { dir: SCENARIOS['feature-pipeline'].args.dir }, responder: featurePipelineResponder({ 'input:fallback': file }),
    })
    assert.equal(calls[0].label, 'input:fallback')
    assert.equal(calls[0].model, 'haiku')
    assert.equal(result.passed.length, 2)
    assert.deepEqual(result.passed.map(p => p.tier), ['T1', 'T2'], 'the object keeps its tier, the string defaults to T2')
  })

  test('release-gate: a skipped tests gate yields a blocker that cites the gate evidence', async () => {
    const base = releaseGateResponder()
    const { result } = await run('release-gate', 'release-gate', (p, o) => {
      const r = base(p, o)
      if (o.label === 'gate:tests+build+runtime') r.gates[0] = { ...r.gates[0], status: 'skipped', evidence: 'package.json has no test script' }
      return r
    })
    assert.equal(result.verdict, 'NO-SHIP')
    assert.ok(result.blockers.some(b => b.startsWith('[tests]') && b.includes('skipped: package.json has no test script')), result.blockers.join(' | '))
  })
})

suite('fail-closed behavior (quality kept under agent death)', () => {
  test('feature-pipeline: a build that committed no branch fails before any verifier runs', async () => {
    // Observed live (Codex, 2026-09-21): the sandbox blocked .git, the builder left files
    // uncommitted and reported branch "", and the smoke check passed the main tree instead.
    const { result, calls } = await run('feature-pipeline', 'feature-pipeline', featurePipelineResponder({
      'build:1': { branch: '', summary: 's', tests_passing: true, evidence: '', deviations: ['Sandbox denied .git writes'], sensitive_surfaces: [], pr_title: '', pr_body: '' },
    }))
    const f = result.failed.find(x => x.issues.some(i => /no feature\/wf-\* branch/.test(i)))
    assert.ok(f, JSON.stringify(result.failed))
    assert.ok(f.issues.includes('Sandbox denied .git writes'), "the builder's own reason is kept")
    assert.ok(!calls.some(c => /^(verify|smoke|security):1$/.test(c.label)), 'no verifier is sent to check the wrong tree')
    assert.equal(result.passed.length, 5, 'the other features are unaffected')
  })

  test('deep-review: dead batch refuter -> med/low UNVERIFIED, never silently confirmed', async () => {
    const { result } = await run('deep-review', 'deep-review',
      deepReviewResponder({ 'verify:batch': null }))
    assert.equal(result.confirmed.length, 4, 'crit/high still individually confirmed')
    assert.equal(result.unverified.length, 8, 'all med/low held open')
  })

  test('deep-review: batch verdict missing an id -> that finding stays open', async () => {
    const base = deepReviewResponder()
    const { result } = await run('deep-review', 'deep-review', (p, o) => {
      const r = base(p, o)
      if (o.label === 'verify:batch') r.verdicts = r.verdicts.slice(1) // drop one id
      return r
    })
    assert.equal(result.unverified.length, 1, 'missing verdict = open, not refuted')
  })

  test('feature-pipeline: dead T1 security pass sinks the feature', async () => {
    const { result } = await run('feature-pipeline', 'feature-pipeline',
      featurePipelineResponder({ 'security:': null }))
    assert.equal(result.passed.length, 4, 'T2/T3 unaffected')
    assert.equal(result.failed.length, 2, 'both T1 features fail closed')
    assert.ok(result.failed.every(f => f.issues.join(' ').includes('security pass')), 'reason recorded')
  })

  test('release-gate: dead execute runner -> NO-SHIP with tests/build/runtime as blockers', async () => {
    const { result } = await run('release-gate', 'release-gate',
      releaseGateResponder({ 'gate:tests+build+runtime': null }))
    assert.equal(result.verdict, 'NO-SHIP')
    for (const k of ['tests', 'build', 'runtime']) assert.ok(result.missing.includes(k), `${k} reported missing`)
  })

  test('release-gate: a fail from inside a merged gate agent still blocks', async () => {
    const base = releaseGateResponder()
    const { result } = await run('release-gate', 'release-gate', (p, o) => {
      const r = base(p, o)
      if (o.label === 'gate:tests+build+runtime') r.gates[0] = { ...r.gates[0], status: 'fail', blockers: ['2 tests failing'] }
      return r
    })
    assert.equal(result.verdict, 'NO-SHIP')
    assert.ok(result.blockers.some(b => b.includes('2 tests failing')))
  })
})

suite('model routing (every simulated agent call)', () => {
  // Every stage sets its effort (an unset one inherits the session's, usually too high), none
  // runs at max, and nothing names a model outside the four tier aliases (the top tier is
  // opt-in through the session, never pinned in a script).
  for (const c of CASES) {
    test(`${c.scenario}: explicit effort below max, tier aliases only`, async () => {
      const { calls } = await run(c.wf, c.scenario, SCENARIOS[c.scenario].responder())
      assert.ok(calls.length > 0)
      for (const k of calls) {
        assert.notEqual(k.effort, 'inherit', `${k.label}: effort set explicitly`)
        assert.notEqual(k.effort, 'max', `${k.label}: no stage pinned to max`)
        assert.ok(['inherit', 'opus', 'sonnet', 'haiku'].includes(k.model), `${k.label}: model "${k.model}" is a tier alias`)
      }
    })
  }
})
