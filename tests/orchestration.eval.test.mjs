// Behavioral evals: EXECUTE the workflow scripts (stubbed agents) and assert
// the orchestration shape and the fail-closed quality guarantees. Unlike the
// text-invariant tests, these catch semantic regressions — e.g. a refactor that
// keeps the right strings but silently drops findings or passes dead gates.
import { test, suite } from 'node:test'
import assert from 'node:assert/strict'
import {
  loadSource, runWorkflow, SCENARIOS, preflightWithScripts, preflightOK,
  deepReviewResponder, featurePipelineResponder, designPanelResponder, releaseGateResponder,
} from '../evals/sim.mjs'

const run = (wf, scenario, responder) =>
  runWorkflow(loadSource(`.claude/workflows/${wf}.js`), { args: SCENARIOS[scenario].args, responder })

suite('orchestration shape (agent budgets)', () => {
  test('deep-review: 12 findings cost 10 agents (1 preflight + 3 lenses + 1 cluster + 4 refuters + 1 batch)', async () => {
    const { result, calls } = await run('deep-review', 'deep-review', deepReviewResponder())
    assert.equal(calls.length, 10)
    assert.equal(calls.filter(c => c.label === 'cluster:root-cause').length, 1, 'one Sonnet cluster pass')
    assert.equal(result.confirmed.length, 12, 'all findings confirmed on the happy path')
    assert.equal(calls.filter(c => c.label.startsWith('review:')).length, 3, '3 lenses')
    assert.equal(calls.filter(c => c.label === 'verify:batch').length, 1, 'one batch refuter for all med/low')
  })

  test('deep-review mode:integration -> ONE seam lens instead of three, verify unchanged', async () => {
    const src = loadSource('.claude/workflows/deep-review.js')
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

  test('feature-pipeline: 6 mixed-tier features -> 4 plan agents (T3 skips), 6 builds', async () => {
    const { result, calls } = await run('feature-pipeline', 'feature-pipeline', featurePipelineResponder())
    assert.equal(calls.filter(c => c.label.startsWith('plan:')).length, 4, 'T1/T2 planned, T3 not')
    assert.equal(calls.filter(c => c.label.startsWith('build:')).length, 6)
    assert.equal(calls.filter(c => c.label.startsWith('security:')).length, 2, 'security pass only for T1')
    assert.equal(result.passed.length, 6)
    const t3builds = calls.filter(c => c.label.startsWith('build:') && c.model === 'sonnet')
    assert.equal(t3builds.length, 2, 'T3 builds on Sonnet')
  })

  test('feature-pipeline: the forge-worktree.sh (WT) branch preserves orchestration shape', async () => {
    // The default preflight (cwdIsTarget:true, no scriptsDir) only ever walks the inline-git
    // fallback, so the change's headline path — agents calling forge-worktree.sh — was
    // unexercised. This forces the WT branch (script present, cwd != target) and asserts it
    // is orchestration-equivalent: same agents, same passes, no crash on the new prompts.
    const { result, calls } = await run('feature-pipeline', 'feature-pipeline',
      featurePipelineResponder({ preflight: preflightWithScripts }))
    assert.equal(calls.filter(c => c.label.startsWith('plan:')).length, 4, 'T1/T2 planned, T3 not')
    assert.equal(calls.filter(c => c.label.startsWith('build:')).length, 6)
    assert.equal(calls.filter(c => c.label.startsWith('security:')).length, 2, 'security pass only for T1')
    assert.equal(result.passed.length, 6, 'WT branch builds + verifies all 6, same as the fallback path')
  })

  test('design-panel: lean = 5 agents, wide = 9', async () => {
    const lean = await run('design-panel', 'design-panel', designPanelResponder())
    assert.equal(lean.calls.length, 5)
    assert.ok(lean.result.design, 'lean run produces the final document')
    const wide = await run('design-panel', 'design-panel-wide', designPanelResponder())
    assert.equal(wide.calls.length, 9)
    assert.ok(wide.result.design)
  })

  test('release-gate: 6 gates in 4 agents, SHIP on all-pass', async () => {
    const { result, calls } = await run('release-gate', 'release-gate', releaseGateResponder())
    assert.equal(calls.length, 4)
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
    const base = featurePipelineResponder()
    const { result } = await run('feature-pipeline', 'feature-pipeline', (p, o) => {
      const r = base(p, o)
      if (o.label === 'verify:1') return { ...r, verdict: 'fail', issues: ['404 path crashes the server'] }
      return r
    })
    assert.equal(result.failed.length, 1)
    const f = result.failed[0]
    assert.equal(f.tier, 'T1')
    assert.equal(f.evidence, 'e | security: e', 'verifier + security evidence kept')
    assert.deepEqual(f.security, { verdict: 'pass', evidence: 'e' }, 'security verdict reported separately')
    assert.equal(f.pr_body, 'b')
    assert.ok(result.passed.every(x => 'security' in x), 'passed entries carry the field too (null for T2/T3)')
  })

  test('feature-pipeline: forge_home arg pins the worktree script without a preflight hunt', async () => {
    const prompts = []
    const base = featurePipelineResponder({ preflight: { ...preflightWithScripts, scriptsDir: '' } })
    const src = loadSource('.claude/workflows/feature-pipeline.js')
    const { result } = await runWorkflow(src, {
      args: { ...SCENARIOS['feature-pipeline'].args, forge_home: 'T:/harness/' },
      responder: (p, o) => { prompts.push([o.label, p]); return base(p, o) },
    })
    assert.equal(result.passed.length, 6)
    const pre = prompts.find(([l]) => l === 'preflight:target')[1]
    assert.match(pre, /scriptsDir: return an empty string/, 'preflight told not to hunt for the script')
    const build = prompts.find(([l]) => l === 'build:1')[1]
    assert.match(build, /bash "T:\/harness\/scripts\/forge-worktree\.sh" new-build 1/, 'builder calls the script under forge_home (trailing slash stripped)')
  })

  test('feature-pipeline: runtime isolation follows the pwd line, not the preflight boolean', async () => {
    const src = loadSource('.claude/workflows/feature-pipeline.js')
    const firstBuild = async pre => {
      const prompts = []
      const base = featurePipelineResponder({ preflight: pre })
      await runWorkflow(src, { args: SCENARIOS['feature-pipeline'].args, responder: (p, o) => { prompts.push([o.label, p]); return base(p, o) } })
      return prompts.find(([l]) => l === 'build:1')[1]
    }
    // Haiku said "cwd is the target" but pwd shows another directory: no runtime clone.
    const wrongTrue = await firstBuild({ ...preflightOK, cwdIsTarget: true, cwd: '/d/somewhere/else' })
    assert.match(wrongTrue, /Work in an ISOLATED git worktree you create yourself/, 'pwd mismatch overrides a wrong true')
    // pwd matches the target in MSYS form while Haiku said false: runtime isolation is used.
    const wrongFalse = await firstBuild({ ...preflightOK, cwdIsTarget: false, cwd: '/t/fake-product/' })
    assert.match(wrongFalse, /You are in an ISOLATED git worktree/, 'MSYS-form pwd equal to the target enables runtime isolation')
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
