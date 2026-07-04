export const meta = {
  name: 'understand',
  description: 'Map a codebase with parallel readers, then synthesize an architecture brief',
  whenToUse: 'Start of work on an unfamiliar or large codebase, or when a change spans subsystems you have not read. Pass an optional focus question as args.',
  phases: [
    { title: 'Scout', detail: 'one agent discovers the subsystem layout' },
    { title: 'Map', detail: 'parallel readers, one per subsystem' },
    { title: 'Synthesize', detail: 'merge into one architecture brief' },
  ],
}

const focus = typeof args === 'string' && args.trim() ? args.trim() : null

const SUBSYSTEMS = {
  type: 'object',
  additionalProperties: false,
  required: ['subsystems'],
  properties: {
    subsystems: {
      type: 'array',
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'paths', 'guess'],
        properties: {
          name: { type: 'string' },
          paths: { type: 'array', minItems: 1, items: { type: 'string' }, description: 'Directories/globs belonging to this subsystem' },
          guess: { type: 'string', description: 'One-line hypothesis of what it does' },
        },
      },
    },
  },
}

const MAP = {
  type: 'object',
  additionalProperties: false,
  required: ['found', 'purpose', 'key_files', 'entry_points', 'data_flow', 'conventions', 'risks'],
  properties: {
    found: { type: 'boolean', description: 'false if the listed paths do not exist or contain no code — then describe what you actually saw in purpose and leave the arrays empty' },
    purpose: { type: 'string' },
    key_files: { type: 'array', items: { type: 'string' }, description: 'path — one-line role' },
    entry_points: { type: 'array', items: { type: 'string' } },
    data_flow: { type: 'string', description: 'How data/control moves through this subsystem' },
    conventions: { type: 'array', items: { type: 'string' }, description: 'Patterns the code follows that new code must match' },
    risks: { type: 'array', items: { type: 'string' }, description: 'Fragile spots, tech debt, surprising couplings' },
  },
}

phase('Scout')
const layout = await agent(
  `Discover the subsystem layout of the repository in the current working directory. ` +
  `Read the top-level structure, package manifests, and build config. Group the code into ` +
  `3-10 coherent subsystems (frontend, api, db layer, auth, jobs, shared libs, infra, tests...). ` +
  `Do NOT read implementation files deeply — this is layout discovery only.` +
  (focus ? ` The caller's focus question is: "${focus}" — make sure subsystems relevant to it are separated out.` : ''),
  { label: 'scout:layout', effort: 'low', schema: SUBSYSTEMS },
)

if (!layout || !layout.subsystems.length) {
  return { error: 'Scout found no subsystems — is the working directory a code repository?' }
}
log(`Scout found ${layout.subsystems.length} subsystems: ${layout.subsystems.map(s => s.name).join(', ')}`)

phase('Map')
const maps = await parallel(layout.subsystems.map(s => () =>
  agent(
    `Deep-read the "${s.name}" subsystem of the repository in the current working directory. ` +
    `Paths: ${s.paths.join(', ')}. Initial hypothesis: ${s.guess}. ` +
    `Read the actual code — key modules, their responsibilities, how they connect to the rest of the app. ` +
    `Report conventions precisely enough that a new contributor could write code that fits. ` +
    `If the paths turn out not to exist or hold no code, set found=false and say what you actually saw — NEVER invent a map.` +
    (focus ? ` Prioritize anything relevant to: "${focus}".` : ''),
    { label: `map:${s.name}`, phase: 'Map', schema: MAP },
  ).then(m => m && { name: s.name, ...m }),
))

const valid = maps.filter(Boolean).filter(m => m.found)
if (valid.length < layout.subsystems.length) {
  log(`${layout.subsystems.length - valid.length} subsystem(s) failed or not found — brief will be partial`)
}
if (!valid.length) {
  return { error: 'All subsystem readers failed or found nothing — no maps to synthesize.', layout }
}

phase('Synthesize')
const brief = await agent(
  `Merge these subsystem maps into ONE architecture brief for the repository:\n\n` +
  JSON.stringify(valid, null, 2) +
  `\n\nProduce: (1) a system overview paragraph, (2) the module map with responsibilities, ` +
  `(3) cross-cutting conventions every change must follow, (4) the top risks/fragile areas, ` +
  `(5) where a new feature would typically plug in.` +
  (focus ? ` (6) A direct, specific answer to the focus question: "${focus}".` : '') +
  `\n\nWrite it as markdown. Resolve contradictions between maps by re-reading the code yourself.`,
  { label: 'synthesize:brief', effort: 'high' },
)

if (!brief) {
  return { error: 'Synthesis agent failed — subsystem maps returned for manual synthesis.', subsystems: valid }
}

return { brief, subsystems: valid }
