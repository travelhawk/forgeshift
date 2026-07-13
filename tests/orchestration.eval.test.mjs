// Behavioral evals: EXECUTE the workflow scripts (stubbed agents) and assert
// the orchestration shape and the fail-closed quality guarantees. Unlike the
// text-invariant tests, these catch semantic regressions — e.g. a refactor that
// keeps the right strings but silently drops findings or passes dead gates.
import { test, suite } from 'node:test'
import assert from 'node:assert/strict'
import {
  loadSource, runWorkflow, SCENARIOS,
  deepReviewResponder, featurePipelineResponder, designPanelResponder, releaseGateResponder,
} from '../evals/sim.mjs'

const run = (wf, scenario, responder) =>
  runWorkflow(loadSource(`.claude/workflows/${wf}.js`), { args: SCENARIOS[scenario].args, responder })

suite('orchestration shape (agent budgets)', () => {
  test('deep-review: 12 findings cost 9 agents (1 preflight + 3 lenses + 4 refuters + 1 batch)', async () => {
    const { result, calls } = await run('deep-review', 'deep-review', deepReviewResponder())
    assert.equal(calls.length, 9)
    assert.equal(result.confirmed.length, 12, 'all findings confirmed on the happy path')
    assert.equal(calls.filter(c => c.label.startsWith('review:')).length, 3, '3 lenses')
    assert.equal(calls.filter(c => c.label === 'verify:batch').length, 1, 'one batch refuter for all med/low')
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
