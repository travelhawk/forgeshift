// Before/after orchestration evals: run each changed workflow at a baseline git
// revision and at HEAD on the SAME scenario, compare agents spawned and prompt
// volume. Usage: npm run eval [-- <baselineRev>]   (default: pre-optimization rev)
import { loadSource, runWorkflow, SCENARIOS } from './sim.mjs'

const BASELINE = process.argv[2] || '9156741' // last commit before the optimization series
const CASES = [
  { wf: 'deep-review', scenario: 'deep-review', note: '12 findings (4 crit/high, 8 med/low)' },
  { wf: 'feature-pipeline', scenario: 'feature-pipeline', note: '6 features: 2xT1 2xT2 2xT3' },
  { wf: 'design-panel', scenario: 'design-panel', note: 'default panel' },
  { wf: 'design-panel', scenario: 'design-panel-wide', note: 'panel: wide' },
  { wf: 'release-gate', scenario: 'release-gate', note: 'standard release' },
]

const runAt = async (wf, scenario, rev) => {
  const { args, responder } = SCENARIOS[scenario]
  const src = loadSource(`.claude/workflows/${wf}.js`, rev)
  const { result, calls } = await runWorkflow(src, { args, responder: responder() })
  if (result && result.error) throw new Error(`${wf}@${rev || 'HEAD'} returned error: ${result.error}`)
  return { agents: calls.length, kchars: Math.round(calls.reduce((s, c) => s + c.chars, 0) / 1000) }
}

console.log(`Baseline: ${BASELINE}  vs  HEAD (working tree)\n`)
const rows = []
for (const c of CASES) {
  const before = await runAt(c.wf, c.scenario, BASELINE)
  const after = await runAt(c.wf, c.scenario, null)
  const pct = ({ before: b, after: a }) =>
    a === b ? '=' : a < b ? `${Math.round((1 - a / b) * 100)}% less` : `${Math.round((a / b - 1) * 100)}% more`
  rows.push({
    scenario: `${c.scenario} (${c.note})`,
    'agents before': before.agents, 'agents after': after.agents,
    'agents Δ': pct({ before: before.agents, after: after.agents }),
    'prompt-kchars before': before.kchars, 'prompt-kchars after': after.kchars,
    'prompt Δ': pct({ before: before.kchars, after: after.kchars }),
  })
}
console.table(rows)
const t = k => rows.reduce((s, r) => s + r[k], 0)
console.log(`TOTAL agents: ${t('agents before')} -> ${t('agents after')} ` +
  `(${Math.round((1 - t('agents after') / t('agents before')) * 100)}% less), ` +
  `prompt volume: ${t('prompt-kchars before')}k -> ${t('prompt-kchars after')}k chars`)
