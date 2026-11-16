export const meta = {
  name: 'design-panel',
  description: 'Generate N independent design approaches, score them with a judge panel, synthesize the winner',
  whenToUse: 'Architecture or design decisions where the solution space is wide and a wrong pick is expensive: system design, data model, API shape, major refactor strategy. Pass the design brief (problem, constraints, context) as args — or an object {dir: "<product path>", brief: "...", panel: "wide"}; dir pins the target repo (required when the session did not start in the product directory). Default is the LEAN panel (3 designers + 1 judge-synthesizer); pass panel: "wide" only for the most expensive decisions (4 designers, 3 voting judges, separate synthesis). If args does not arrive intact, write the brief to design-panel.input.md in the target repo root before invoking; it is read as a fallback.',
  phases: [
    { title: 'Design', detail: 'independent designers, different priors (3 lean / 4 wide)' },
    { title: 'Judge', detail: 'lean: 1 judge scores AND synthesizes; wide: 3 judges vote' },
    { title: 'Synthesize', detail: 'wide mode only: separate synthesis of winner + grafted ideas' },
  ],
}

// >>> forge:args-guard — generated; edit lib/workflow-preamble.mjs, then: node scripts/sync-workflow-preamble.mjs
// Target-directory + args contract (2026-07-06; unified 2026-09-22). Two failure modes,
// both seen live in the 2026-07-05 harness eval, both from the NATIVE Workflow invocation:
// (1) workflow agents run in the SESSION's working directory — not necessarily the product
//     this workflow should operate on. So the target arrives as {dir} and every prompt is
//     pinned to it (AT). There is no preflight agent: the first agents check the target
//     themselves (TARGET_CHECK) and refuse a wrong one before anything changes.
// (2) args can arrive JSON-stringified. So they are coerced before anything reads them.
// `bin/forge-run.mjs` reads an args file and has neither problem, but the script file is
// identical on every host, so the guard rides along. Each workflow reads its own fields
// from `a` after this block.
let a = args
if (typeof a === 'string' && a.trim().startsWith('{')) { try { a = JSON.parse(a) } catch { /* keep raw string */ } }
const dirArg = a && typeof a === 'object' && !Array.isArray(a) && typeof a.dir === 'string' && a.dir.trim() ? a.dir.trim() : null
const TARGET = dirArg
const AT = TARGET
  ? `TARGET REPOSITORY: ${TARGET} — treat it as the current working directory. FIRST shell command: a ` +
    `standalone cd into it — cwd persists between commands; never chain cd with && (chained cd trips permission ` +
    `prompts). Stay within it (sibling worktree dirs excepted).\n\n`
  : `TARGET REPOSITORY: your current working directory (no dir was passed). Stay within it (sibling worktree ` +
    `dirs excepted).\n\n`
const TARGET_CHECK = `Check the target first, before you change anything: it must exist and hold a product ` +
  `(source code or a manifest), not an agent harness (a workflows/ dir next to agents/forge-*.md, or a ` +
  `.claude-plugin/ or .codex-plugin/ manifest). If it does not, do nothing else and return refused with the reason. `
// <<< forge:args-guard
// The brief itself falls back to design-panel.input.md in the target root when args did
// not carry it (read below, only then).
let brief = typeof a === 'string' && a.trim() ? a.trim()
  : a && typeof a === 'object' && typeof a.brief === 'string' && a.brief.trim() ? a.brief.trim() : null
// Lean by default: 3 designers + 1 judge-synthesizer (4 agents).
// panel: 'wide' opts into the full 4-designer / 3-judge / separate-synthesis panel.
const wide = !!(a && typeof a === 'object' && a.panel === 'wide')

// A brief lost in transit: read the fallback file. Only this rare path costs an agent.
if (!brief) {
  const inp = await globalThis.agent(
    `Read-only, modify nothing. Look for design-panel.input.md in ${TARGET || 'the current working directory'}. ` +
    `If it exists, return its full content verbatim in brief; else return an empty string.`,
    { label: 'input:fallback', model: 'haiku', effort: 'low', schema: { type: 'object', additionalProperties: false, required: ['brief'], properties: { brief: { type: 'string' } } } },
  )
  if (inp && inp.brief && inp.brief.trim()) {
    brief = inp.brief.trim()
    log('Brief read from design-panel.input.md — args did not arrive intact')
  }
}
if (!brief) {
  return { error: 'design-panel requires the design brief: pass it as args (string or {dir, brief}), or write design-panel.input.md into the target repo root.' }
}
// Each designer checks the target first (TARGET_CHECK, from the guard); all refusing is a
// run-level error. Designers only read, so a wrong target costs tokens, never changes.
const agent0 = globalThis.agent
const agent = (p, o) => agent0(AT + p, o)
const spend = () => (typeof budget !== 'undefined' && budget && typeof budget.spent === 'function')
  ? { output_tokens: budget.spent(), target: budget.total ?? null }
  : null

const ANGLES = [
  { key: 'simplest', prior: 'Radical simplicity. The least machinery that fully solves the problem. Boring technology. You lose points for every moving part.' },
  { key: 'evolution', prior: 'Long-term evolution. Optimize for how the system changes over 2 years: extension points where change is likely, hard walls where it is not.' },
  { key: 'ops-first', prior: 'Operations and failure first. Design from the failure modes backwards: what breaks, how you notice, how you recover, how you debug at 3am.' },
  { key: 'user-first', prior: 'User experience first. Work backwards from the ideal user-facing behavior (latency, offline, error states) and let that dictate the architecture.' },
]
// Lean drops 'evolution' — the judge's rubric still scores long-term risk, and the
// simplicity prior already fights the overbuilding that evolution-thinking invites.
const angles = wide ? ANGLES : ANGLES.filter(x => x.key !== 'evolution')

// The final document is read by the product owner first and the builder second, so the
// decision block leads and every one-way door is a named approval, not an implied spec row
// (2026-09-11 eval: a good design buried the decision under panel context and folded two
// new public flags in silently).
const DOC_STRUCTURE =
  `Structure, in this order: Decision (FIRST — the owner's block: what the user gets, in the product's own ` +
  `vocabulary, then a "Needs approval" list of every one-way door — including any public surface the design adds ` +
  `beyond the brief: a new flag, env var, endpoint, file format, or dependency — never folded into the spec silently) ` +
  `→ Context → Architecture → Components → Data flow → Failure handling → Deviations from the brief (each named, ` +
  `with why; "none" if none) → Rejected alternatives (one line each, why) → Build plan (ordered).`

const DESIGN = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'components', 'data_flow', 'tradeoffs', 'risks', 'effort_estimate'],
  properties: {
    refused: { type: 'string', description: 'ONLY when the target check failed: the reason. Fill the other fields with empty values.' },
    summary: { type: 'string', description: '3-6 sentence pitch of the approach' },
    components: { type: 'array', items: { type: 'string' }, description: 'Component — responsibility, one per entry' },
    data_flow: { type: 'string' },
    tradeoffs: { type: 'array', items: { type: 'string' }, description: 'What this approach deliberately sacrifices' },
    risks: { type: 'array', items: { type: 'string' } },
    effort_estimate: { type: 'string', description: 'Rough build effort and the long pole' },
  },
}

phase('Design')
log(`${angles.length} designers working the brief independently (${wide ? 'wide' : 'lean'} panel)`)
const designs = (await parallel(angles.map(a2 => () =>
  agent(
    TARGET_CHECK + `You are designing a solution. Ground yourself in the target repository first, but SCOPE-BOXED: ` +
    `the manifest/stack config, the modules the brief touches, and one representative example of the ` +
    `existing conventions — do NOT crawl the whole tree, the full spec, or docs beyond what the brief names.\n\n` +
    `BRIEF:\n${brief}\n\nYOUR DESIGN PRIOR — commit to it fully; other designers cover other priors:\n${a2.prior}\n\n` +
    `Produce a complete, concrete design. Name real technologies and real modules, not placeholders.`,
    { label: `design:${a2.key}`, phase: 'Design', effort: 'high', schema: DESIGN },
  ).then(d => d && { key: a2.key, ...d }),
))).filter(Boolean)

const refusals = designs.filter(d => d.refused)
if (designs.length && refusals.length === designs.length) {
  return { error: `Refusing to run against ${TARGET || 'the session working directory'}: ${refusals[0].refused}. Pass the product directory explicitly: args {dir: "<absolute path>", brief: "..."}.` }
}
designs.splice(0, designs.length, ...designs.filter(d => !d.refused))
if (designs.length < 2) {
  return { target: TARGET, error: 'Fewer than 2 designs produced — cannot run a meaningful panel.', designs }
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

// --- LEAN panel (default): one judge scores adversarially AND writes the final
// document in the same pass — one agent, two tasks. Runs at xhigh on the session
// model; the wide path below (3 voting judges + separate synthesis) is for the
// decisions expensive enough to pay for redundancy.
if (!wide) {
  const LEANVERDICT = {
    ...SCORE,
    required: [...SCORE.required, 'design_doc'],
    properties: {
      ...SCORE.properties,
      design_doc: { type: 'string', description: 'The final design document, markdown' },
    },
  }
  phase('Judge')
  const one = await agent(
    `You are the single adversarial judge AND synthesizer of a design panel. First score every design against ` +
    `the brief (fitness, simplicity, risk — probe each design for the failure that would kill it; touch the ` +
    `target repository only to spot-check specific claims, not to explore). Then write the FINAL design document in design_doc: base it on ` +
    `your winning design, graft in specific superior ideas from the runners-up, and address your own strongest ` +
    `criticism of the winner explicitly (mitigate or accept with rationale). ` +
    DOC_STRUCTURE + `\n\n` +
    `BRIEF:\n${brief}\n\nDESIGNS:\n${JSON.stringify(designs, null, 2)}`,
    { label: 'judge+synthesize', phase: 'Judge', effort: 'xhigh', schema: LEANVERDICT },
  )
  if (!one) {
    return { target: TARGET, error: 'Judge-synthesizer failed — designs returned for manual judging.', designs }
  }
  log(`Lean panel verdict: ${one.best}`)
  return {
    target: TARGET, design: one.design_doc, winner: one.best, tied: false,
    tally: { [one.best]: 1 }, designs,
    verdicts: [{ scores: one.scores, best: one.best, reasoning: one.reasoning }],
    spend: spend(),
  }
}

phase('Judge')
const verdicts = (await parallel([0, 1, 2].map(i => () =>
  agent(
    `You are judge ${i + 1} of 3 on a design panel. Score every design against the brief. ` +
    `Be adversarial: probe each design for the failure that would kill it. Touch the target repository ` +
    `only to spot-check specific claims about the existing system — not to explore.\n\nBRIEF:\n${brief}\n\nDESIGNS:\n${JSON.stringify(designs, null, 2)}`,
    { label: `judge:${i + 1}`, phase: 'Judge', effort: 'high', schema: SCORE },
  ),
))).filter(Boolean)

if (!verdicts.length) {
  return { target: TARGET, error: 'All judges failed — no panel verdict possible. Designs returned for manual judging.', designs }
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
  const ranked = Object.entries(sums).sort((a2, b) => b[1] - a2[1])
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
  DOC_STRUCTURE,
  // The judges already decided; this stage writes a long document, which xhigh drafts twice.
  { label: 'synthesize:final', effort: 'high' },
)

if (!final) {
  return { target: TARGET, error: 'Synthesis agent failed — winner and raw materials returned for manual synthesis.', winner: winnerKey, tied, tally, designs, verdicts }
}

return { target: TARGET, design: final, winner: winnerKey, tied, tally, designs, verdicts, spend: spend() }
