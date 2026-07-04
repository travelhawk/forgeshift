export const meta = {
  name: 'design-panel',
  description: 'Generate N independent design approaches, score them with a judge panel, synthesize the winner',
  whenToUse: 'Architecture or design decisions where the solution space is wide and a wrong pick is expensive: system design, data model, API shape, major refactor strategy. Pass the design brief (problem, constraints, context) as args.',
  phases: [
    { title: 'Design', detail: '4 independent designers, different priors' },
    { title: 'Judge', detail: '3 judges score all designs' },
    { title: 'Synthesize', detail: 'winner + grafted ideas from runners-up' },
  ],
}

const brief = typeof args === 'string' && args.trim() ? args.trim() : null
if (!brief) {
  return { error: 'design-panel requires the design brief as args (problem, constraints, context).' }
}

const ANGLES = [
  { key: 'simplest', prior: 'Radical simplicity. The least machinery that fully solves the problem. Boring technology. You lose points for every moving part.' },
  { key: 'evolution', prior: 'Long-term evolution. Optimize for how the system changes over 2 years: extension points where change is likely, hard walls where it is not.' },
  { key: 'ops-first', prior: 'Operations and failure first. Design from the failure modes backwards: what breaks, how you notice, how you recover, how you debug at 3am.' },
  { key: 'user-first', prior: 'User experience first. Work backwards from the ideal user-facing behavior (latency, offline, error states) and let that dictate the architecture.' },
]

const DESIGN = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'components', 'data_flow', 'tradeoffs', 'risks', 'effort_estimate'],
  properties: {
    summary: { type: 'string', description: '3-6 sentence pitch of the approach' },
    components: { type: 'array', items: { type: 'string' }, description: 'Component — responsibility, one per entry' },
    data_flow: { type: 'string' },
    tradeoffs: { type: 'array', items: { type: 'string' }, description: 'What this approach deliberately sacrifices' },
    risks: { type: 'array', items: { type: 'string' } },
    effort_estimate: { type: 'string', description: 'Rough build effort and the long pole' },
  },
}

phase('Design')
log('4 designers working the brief independently')
const designs = (await parallel(ANGLES.map(a => () =>
  agent(
    `You are designing a solution. Explore the current repository in the working directory for real context (existing code, stack, conventions) before designing.\n\n` +
    `BRIEF:\n${brief}\n\nYOUR DESIGN PRIOR — commit to it fully; other designers cover other priors:\n${a.prior}\n\n` +
    `Produce a complete, concrete design. Name real technologies and real modules, not placeholders.`,
    { label: `design:${a.key}`, phase: 'Design', effort: 'high', schema: DESIGN },
  ).then(d => d && { key: a.key, ...d }),
))).filter(Boolean)

if (designs.length < 2) {
  return { error: 'Fewer than 2 designs produced — cannot run a meaningful panel.', designs }
}

// Built after the Design phase so `best` is constrained to designs that actually exist.
const designKeys = designs.map(d => d.key)
const SCORE = {
  type: 'object',
  additionalProperties: false,
  required: ['scores', 'best', 'reasoning'],
  properties: {
    scores: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['design', 'fitness', 'simplicity', 'risk', 'total'],
        properties: {
          design: { type: 'string', enum: designKeys },
          fitness: { type: 'integer', description: '0-10: solves the actual problem within constraints' },
          simplicity: { type: 'integer', description: '0-10: least concept count / operational surface' },
          risk: { type: 'integer', description: '0-10 where 10 = lowest risk' },
          total: { type: 'integer' },
        },
      },
    },
    best: { type: 'string', enum: designKeys, description: 'key of the winning design' },
    reasoning: { type: 'string' },
  },
}

phase('Judge')
const verdicts = (await parallel([0, 1, 2].map(i => () =>
  agent(
    `You are judge ${i + 1} of 3 on a design panel. Score every design against the brief. ` +
    `Be adversarial: probe each design for the failure that would kill it. Explore the repository ` +
    `if you need ground truth about the existing system.\n\nBRIEF:\n${brief}\n\nDESIGNS:\n${JSON.stringify(designs, null, 2)}`,
    { label: `judge:${i + 1}`, phase: 'Judge', model: 'fable', effort: 'high', schema: SCORE },
  ),
))).filter(Boolean)

if (!verdicts.length) {
  return { error: 'All judges failed — no panel verdict possible. Designs returned for manual judging.', designs }
}

const tally = {}
for (const v of verdicts) tally[v.best] = (tally[v.best] || 0) + 1
const maxVotes = Math.max(...Object.values(tally))
const top = Object.keys(tally).filter(k => tally[k] === maxVotes)

let winnerKey = top[0]
let tied = false
if (top.length > 1) {
  // Vote tie → break by summed judge totals; if that ties too, tell the synthesizer honestly.
  const sums = {}
  for (const k of top) {
    sums[k] = verdicts.reduce((s, v) => s + ((v.scores.find(x => x.design === k) || {}).total || 0), 0)
  }
  const ranked = Object.entries(sums).sort((a, b) => b[1] - a[1])
  winnerKey = ranked[0][0]
  tied = ranked.length > 1 && ranked[0][1] === ranked[1][1]
}
log(tied
  ? `Panel tied between ${top.join(' and ')} — synthesizer will resolve`
  : `Panel verdict: ${winnerKey} (${tally[winnerKey]}/${verdicts.length} judges)`)

phase('Synthesize')
const verdictLine = tied
  ? `The panel TIED between ${top.join(' and ')} — weigh their judge reasoning and pick, stating why.`
  : `The design panel picked "${winnerKey}".`
const final = await agent(
  `${verdictLine} Write the final design document in markdown:\n\n` +
  `BRIEF:\n${brief}\n\nALL DESIGNS:\n${JSON.stringify(designs, null, 2)}\n\nJUDGE VERDICTS:\n${JSON.stringify(verdicts, null, 2)}\n\n` +
  `Base the document on the winning design, but graft in specific superior ideas from the runners-up where judges flagged them. ` +
  `Address the judges' strongest criticisms of the winner explicitly (mitigate or accept with rationale). ` +
  `Structure: Context → Decision → Architecture → Components → Data flow → Failure handling → Rejected alternatives (one line each, why) → Build plan (ordered).`,
  { label: 'synthesize:final', model: 'fable', effort: 'xhigh' },
)

if (!final) {
  return { error: 'Synthesis agent failed — winner and raw materials returned for manual synthesis.', winner: winnerKey, tied, tally, designs, verdicts }
}

return { design: final, winner: winnerKey, tied, tally, designs, verdicts }
