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

// --- Target-directory + input contract (2026-07-06) ----------------------------
// Workflow agents run in the SESSION's working directory — not necessarily the
// product this workflow should explore (observed live in the 2026-07-05 harness
// eval), and args can arrive mangled (also observed). Accept {dir, brief},
// coerce stringified args, verify the target, fall back to
// design-panel.input.md in the target root for the brief.
let a = args
if (typeof a === 'string' && a.trim().startsWith('{')) { try { a = JSON.parse(a) } catch { /* keep raw string */ } }
const dirArg = a && typeof a === 'object' && typeof a.dir === 'string' && a.dir.trim() ? a.dir.trim() : null
let brief = typeof a === 'string' && a.trim() ? a.trim()
  : a && typeof a === 'object' && typeof a.brief === 'string' && a.brief.trim() ? a.brief.trim() : null
// Lean by default: 3 designers + 1 judge-synthesizer (5 agents incl. preflight).
// panel: 'wide' opts into the full 4-designer / 3-judge / separate-synthesis panel.
const wide = !!(a && typeof a === 'object' && a.panel === 'wide')

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
    briefFile: { type: 'string', description: 'ONLY if design-panel.input.md exists in the target root: its full content, verbatim' },
  },
}
const pre = await globalThis.agent(
  `Preflight, read-only, modify nothing. Run pwd. ${dirArg
    ? `The intended target directory is ${dirArg} — inspect it.`
    : 'No target was passed — the current working directory is the implied target; inspect it.'} ` +
  `Report per the schema: absolute target path, whether it exists, is a git repo, holds a real project, and ` +
  `whether it looks like an agent-harness/control-center repo instead of a product. Additionally: if a file ` +
  `design-panel.input.md exists in the target root, return its full content verbatim in briefFile.`,
  { label: 'preflight:target', model: 'haiku', effort: 'low', schema: PREFLIGHT },
)
if (!pre) return { error: 'Preflight agent failed — cannot verify the target directory. Pass args {dir: "<product path>", brief: "..."} and retry.' }
if (!pre.exists || !pre.hasCode || pre.isControlCenter) {
  return {
    error: `Refusing to run against ${pre.path || dirArg || 'the session working directory'}: ` +
      (!pre.exists ? 'it does not exist.'
        : pre.isControlCenter ? 'it looks like a harness/control-center repo, not a product.'
          : 'it does not hold a project (no source or manifest).') +
      ' Pass the product directory explicitly: args {dir: "<absolute path>", brief: "..."}.',
    preflight: pre,
  }
}
if (!brief && pre.briefFile && pre.briefFile.trim()) {
  brief = pre.briefFile.trim()
  log('Brief read from design-panel.input.md — args did not arrive intact')
}
if (!brief) {
  return { error: 'design-panel requires the design brief: pass it as args (string or {dir, brief}), or write design-panel.input.md into the target repo root.', preflight: pre }
}
const TARGET = pre.path
const AT = `TARGET REPOSITORY: ${TARGET} — treat it as the current working directory. FIRST shell command: a ` +
  `standalone cd into it — cwd persists between commands; never chain cd with && (chained cd trips permission ` +
  `prompts). Stay within it.\n\n`
const agent0 = globalThis.agent
const agent = (p, o) => agent0(AT + p, o)

const ANGLES = [
  { key: 'simplest', prior: 'Radical simplicity. The least machinery that fully solves the problem. Boring technology. You lose points for every moving part.' },
  { key: 'evolution', prior: 'Long-term evolution. Optimize for how the system changes over 2 years: extension points where change is likely, hard walls where it is not.' },
  { key: 'ops-first', prior: 'Operations and failure first. Design from the failure modes backwards: what breaks, how you notice, how you recover, how you debug at 3am.' },
  { key: 'user-first', prior: 'User experience first. Work backwards from the ideal user-facing behavior (latency, offline, error states) and let that dictate the architecture.' },
]
// Lean drops 'evolution' — the judge's rubric still scores long-term risk, and the
// simplicity prior already fights the overbuilding that evolution-thinking invites.
const angles = wide ? ANGLES : ANGLES.filter(x => x.key !== 'evolution')

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
log(`${angles.length} designers working the brief independently (${wide ? 'wide' : 'lean'} panel)`)
const designs = (await parallel(angles.map(a2 => () =>
  agent(
    `You are designing a solution. Ground yourself in the target repository first, but SCOPE-BOXED: ` +
    `the manifest/stack config, the modules the brief touches, and one representative example of the ` +
    `existing conventions — do NOT crawl the whole tree, the full spec, or docs beyond what the brief names.\n\n` +
    `BRIEF:\n${brief}\n\nYOUR DESIGN PRIOR — commit to it fully; other designers cover other priors:\n${a2.prior}\n\n` +
    `Produce a complete, concrete design. Name real technologies and real modules, not placeholders.`,
    { label: `design:${a2.key}`, phase: 'Design', effort: 'high', schema: DESIGN },
  ).then(d => d && { key: a2.key, ...d }),
))).filter(Boolean)

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
    `Structure: Context → Decision → Architecture → Components → Data flow → Failure handling → ` +
    `Rejected alternatives (one line each, why) → Build plan (ordered).\n\n` +
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
  `Structure: Context → Decision → Architecture → Components → Data flow → Failure handling → Rejected alternatives (one line each, why) → Build plan (ordered).`,
  { label: 'synthesize:final', effort: 'xhigh' },
)

if (!final) {
  return { target: TARGET, error: 'Synthesis agent failed — winner and raw materials returned for manual synthesis.', winner: winnerKey, tied, tally, designs, verdicts }
}

return { target: TARGET, design: final, winner: winnerKey, tied, tally, designs, verdicts }
