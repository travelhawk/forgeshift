// The merge bar itself is load-bearing: these tests pin the gate's verdict
// semantics (quality drop blocks, cost jump blocks, incomparable baseline
// warns, HEAD breakage blocks) against synthetic metrics, plus one live
// collection at HEAD so the collector stays wired to the real workflows.
import { test, suite } from 'node:test'
import assert from 'node:assert/strict'
import { compare, collectMetrics, THRESHOLDS } from '../evals/gate.mjs'
import { CASES } from '../evals/sim.mjs'

// A clean, all-comparable metrics fixture covering every case in CASES.
const fixture = () => ({
  scenarios: Object.fromEntries(CASES.map(c => [c.scenario, {
    agents: 10, chars: 50_000,
    quality: [{ metric: 'q', value: 5, better: 'higher' }],
  }])),
  prose: { claudeMd: 12_000, harnessMd: 100_000 },
})
const clone = m => structuredClone(m)
const first = CASES[0].scenario

suite('eval gate: verdict semantics', () => {
  test('identical base and head -> pass, no failures, no warnings', () => {
    const base = fixture()
    const r = compare(base, clone(base))
    assert.equal(r.verdict, 'pass')
    assert.deepEqual(r.failures, [])
    assert.deepEqual(r.warnings, [])
  })

  test('a quality metric moving the wrong way blocks', () => {
    const base = fixture(), head = clone(base)
    head.scenarios[first].quality = [{ metric: 'q', value: 4, better: 'higher' }]
    const r = compare(base, head)
    assert.equal(r.verdict, 'fail')
    assert.ok(r.failures.some(f => f.includes('regressed 5 -> 4')), r.failures.join('; '))
  })

  test('a lower-is-better metric rising blocks', () => {
    const base = fixture(), head = clone(base)
    base.scenarios[first].quality = [{ metric: 'open', value: 0, better: 'lower' }]
    head.scenarios[first].quality = [{ metric: 'open', value: 3, better: 'lower' }]
    assert.equal(compare(base, head).verdict, 'fail')
  })

  test('quality improving + cost dropping -> pass with improvements recorded', () => {
    const base = fixture(), head = clone(base)
    head.scenarios[first].quality = [{ metric: 'q', value: 6, better: 'higher' }]
    head.scenarios[first].agents = 8
    const r = compare(base, head)
    assert.equal(r.verdict, 'pass')
    assert.ok(r.improvements.some(i => i.includes('improved 5 -> 6')))
    assert.ok(r.improvements.some(i => i.includes('agents 10 -> 8')))
  })

  test('total cost up beyond the budget blocks; a small rise only warns', () => {
    const base = fixture(), heavy = clone(base)
    for (const s of Object.values(heavy.scenarios)) s.agents = Math.ceil(10 * (1 + THRESHOLDS.costUpFrac) + 1)
    assert.equal(compare(base, heavy).verdict, 'fail')
    const mild = clone(base)
    mild.scenarios[first].agents = 11 // ~2% total
    const r = compare(base, mild)
    assert.equal(r.verdict, 'pass')
    assert.ok(r.warnings.some(w => w.includes('agents 10 -> 11')))
  })

  test('HEAD run broken or workflow missing at HEAD blocks', () => {
    const base = fixture()
    const broken = clone(base)
    broken.scenarios[first] = { error: 'boom' }
    assert.equal(compare(base, broken).verdict, 'fail')
    const gone = clone(base)
    gone.scenarios[first] = { missing: true }
    const r = compare(base, gone)
    assert.equal(r.verdict, 'fail')
    assert.ok(r.failures.some(f => f.includes('drop its case from evals/sim.mjs')))
  })

  test('incomparable baseline warns instead of blocking (fail-open on base only)', () => {
    const head = fixture()
    const newWf = clone(head)
    newWf.scenarios[first] = { missing: true }
    const r1 = compare(newWf, head)
    assert.equal(r1.verdict, 'pass')
    assert.ok(r1.warnings.some(w => w.includes('new at HEAD')))
    const brokenBase = clone(head)
    brokenBase.scenarios[first] = { error: 'old shape' }
    const r2 = compare(brokenBase, head)
    assert.equal(r2.verdict, 'pass')
    assert.ok(r2.warnings.some(w => w.includes('baseline run incomparable')))
  })

  test('quality extractor failing at HEAD blocks; failing only at base warns (fail-closed head, fail-open base)', () => {
    const base = fixture()
    const headNull = clone(base)
    headNull.scenarios[first].quality = null
    const r1 = compare(base, headNull)
    assert.equal(r1.verdict, 'fail')
    assert.ok(r1.failures.some(f => f.includes('quality extractor failed on the HEAD result')))
    const baseNull = clone(base)
    baseNull.scenarios[first].quality = null
    const r2 = compare(baseNull, base)
    assert.equal(r2.verdict, 'pass')
    assert.ok(r2.warnings.some(w => w.includes('baseline quality shape incomparable')))
  })

  test('every CASES quality extractor survives sparse result shapes (missing keys compare as 0, never null out)', () => {
    for (const c of CASES) assert.doesNotThrow(() => c.quality({}), `${c.scenario} extractor on {}`)
    // deep-review's zero-findings return omits `unverified` — all-findings-lost
    // must measure as 12 -> 0 (a blocking regression), not as an unreadable shape.
    const dr = CASES.find(c => c.scenario === 'deep-review')
    const q = dr.quality({ target: 't', confirmed: [], message: 'no findings' })
    assert.deepEqual(q.map(x => x.value), [0, 0])
  })

  test('CLAUDE.md budget is a compound bar: EITHER clause alone (bytes-only or %-only) never blocks', () => {
    // > +2500 bytes but only +6% — must pass with a warning.
    const bigBase = fixture()
    bigBase.prose.claudeMd = 50_000
    const bytesOnly = clone(bigBase)
    bytesOnly.prose.claudeMd = 53_000
    const r1 = compare(bigBase, bytesOnly)
    assert.equal(r1.verdict, 'pass', r1.failures.join('; '))
    assert.ok(r1.warnings.some(w => w.includes('CLAUDE.md grew')))
    // +30% but only +1500 bytes — must pass with a warning.
    const smallBase = fixture()
    smallBase.prose.claudeMd = 5_000
    const fracOnly = clone(smallBase)
    fracOnly.prose.claudeMd = 6_500
    const r2 = compare(smallBase, fracOnly)
    assert.equal(r2.verdict, 'pass', r2.failures.join('; '))
    assert.ok(r2.warnings.some(w => w.includes('CLAUDE.md grew')))
  })

  test('CLAUDE.md ballooning blocks; modest growth only warns; shrinking is an improvement', () => {
    const base = fixture()
    const bloated = clone(base)
    bloated.prose.claudeMd = base.prose.claudeMd + THRESHOLDS.claudeMdUpChars + 1000 // also > +20%
    assert.equal(compare(base, bloated).verdict, 'fail')
    const modest = clone(base)
    modest.prose.claudeMd += 300
    const r = compare(base, modest)
    assert.equal(r.verdict, 'pass')
    assert.ok(r.warnings.some(w => w.includes('CLAUDE.md grew')))
    const slim = clone(base)
    slim.prose.claudeMd -= 500
    assert.ok(compare(base, slim).improvements.some(i => i.includes('CLAUDE.md shrank')))
  })
})

suite('eval gate: live collection', () => {
  test('collectMetrics(HEAD working tree): every scenario runs clean with quality data', async () => {
    const m = await collectMetrics(null)
    for (const c of CASES) {
      const s = m.scenarios[c.scenario]
      assert.ok(s && !s.missing && !s.error, `${c.scenario}: ${s && s.error}`)
      assert.ok(s.agents > 0 && s.chars > 0, `${c.scenario} recorded cost`)
      assert.ok(Array.isArray(s.quality) && s.quality.length > 0, `${c.scenario} recorded quality`)
    }
    assert.ok(m.prose.claudeMd > 1000, 'CLAUDE.md size collected')
    assert.ok(m.prose.harnessMd > 10_000, 'skills+agents prose collected')
    // Self-compare must be perfectly clean — the gate never flags a no-op PR.
    const r = compare(m, structuredClone(m))
    assert.equal(r.verdict, 'pass')
    assert.deepEqual(r.failures, [])
    assert.deepEqual(r.warnings, [])
  })
})
