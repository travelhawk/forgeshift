export const meta = {
  name: 'understand',
  description: 'Map a codebase with parallel readers, then synthesize an architecture brief',
  whenToUse: 'Start of work on an unfamiliar or large codebase, or when a change spans subsystems you have not read. Pass an optional focus question as args — or an object {dir: "<product path>", focus: "..."}; dir pins the target repo (required when the session did not start in the product directory).',
  phases: [
    { title: 'Scout', detail: 'one agent discovers the subsystem layout' },
    { title: 'Map', detail: 'parallel readers, one per subsystem' },
    { title: 'Synthesize', detail: 'merge into one architecture brief' },
  ],
}

// --- Target-directory contract (2026-07-06) -----------------------------------
// Workflow agents run in the SESSION's working directory — not necessarily the
// product this workflow should operate on (a session started from the harness
// root or a parent directory runs agents somewhere else entirely; observed
// live in the 2026-07-05 harness eval). So: accept an explicit target via args
// {dir: "..."}, verify it looks like a real project before any work, and pin
// every agent prompt to the verified absolute path. args may also arrive
// JSON-stringified (observed) — coerce before use.
let a = args
if (typeof a === 'string' && a.trim().startsWith('{')) { try { a = JSON.parse(a) } catch { /* keep raw string */ } }
const dirArg = a && typeof a === 'object' && typeof a.dir === 'string' && a.dir.trim() ? a.dir.trim() : null
const focus = typeof a === 'string' && a.trim() ? a.trim()
  : a && typeof a === 'object' && typeof a.focus === 'string' && a.focus.trim() ? a.focus.trim() : null

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
  },
}
const pre = await globalThis.agent(
  `Preflight, read-only, modify nothing. Run pwd. ${dirArg
    ? `The intended target directory is ${dirArg} — inspect it.`
    : 'No target was passed — the current working directory is the implied target; inspect it.'} ` +
  `Report per the schema: absolute target path, whether it exists, is a git repo, holds a real project, and ` +
  `whether it looks like an agent-harness/control-center repo instead of a product.`,
  { label: 'preflight:target', model: 'haiku', effort: 'low', schema: PREFLIGHT },
)
if (!pre) return { error: 'Preflight agent failed — cannot verify the target directory. Pass args {dir: "<product path>"} and retry.' }
if (!pre.exists || !pre.hasCode || pre.isControlCenter) {
  return {
    error: `Refusing to run against ${pre.path || dirArg || 'the session working directory'}: ` +
      (!pre.exists ? 'it does not exist.'
        : pre.isControlCenter ? 'it looks like a harness/control-center repo, not a product.'
          : 'it does not hold a project (no source or manifest).') +
      ' Pass the product directory explicitly: args {dir: "<absolute path>"}.',
    preflight: pre,
  }
}
const TARGET = pre.path
const AT = `TARGET REPOSITORY: ${TARGET} — treat it as the current working directory. cd there at the start of ` +
  `every shell command (or use absolute paths under it) and stay within it.\n\n`
const agent0 = globalThis.agent
const agent = (p, o) => agent0(AT + p, o)

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
  `Discover the subsystem layout of the target repository. ` +
  `Read the top-level structure, package manifests, and build config. Group the code into ` +
  `3-10 coherent subsystems (frontend, api, db layer, auth, jobs, shared libs, infra, tests...). ` +
  `Do NOT read implementation files deeply — this is layout discovery only.` +
  (focus ? ` The caller's focus question is: "${focus}" — make sure subsystems relevant to it are separated out.` : ''),
  { label: 'scout:layout', model: 'sonnet', effort: 'low', schema: SUBSYSTEMS },
)

if (!layout || !layout.subsystems.length) {
  return { target: TARGET, error: 'Scout found no subsystems — is the target directory a code repository?' }
}
log(`Scout found ${layout.subsystems.length} subsystems: ${layout.subsystems.map(s => s.name).join(', ')}`)

phase('Map')
const maps = await parallel(layout.subsystems.map(s => () =>
  agent(
    `Deep-read the "${s.name}" subsystem of the target repository. ` +
    `Paths: ${s.paths.join(', ')}. Initial hypothesis: ${s.guess}. ` +
    `Read the actual code — key modules, their responsibilities, how they connect to the rest of the app. ` +
    `Report conventions precisely enough that a new contributor could write code that fits. ` +
    `If the paths turn out not to exist or hold no code, set found=false and say what you actually saw — NEVER invent a map.` +
    (focus ? ` Prioritize anything relevant to: "${focus}".` : ''),
    { label: `map:${s.name}`, phase: 'Map', model: 'sonnet', effort: 'medium', schema: MAP },
  ).then(m => m && { name: s.name, ...m }),
))

const valid = maps.filter(Boolean).filter(m => m.found)
if (valid.length < layout.subsystems.length) {
  log(`${layout.subsystems.length - valid.length} subsystem(s) failed or not found — brief will be partial`)
}
if (!valid.length) {
  return { target: TARGET, error: 'All subsystem readers failed or found nothing — no maps to synthesize.', layout }
}

phase('Synthesize')
const brief = await agent(
  `Merge these subsystem maps into ONE architecture brief for the target repository:\n\n` +
  JSON.stringify(valid, null, 2) +
  `\n\nProduce: (1) a system overview paragraph, (2) the module map with responsibilities, ` +
  `(3) cross-cutting conventions every change must follow, (4) the top risks/fragile areas, ` +
  `(5) where a new feature would typically plug in.` +
  (focus ? ` (6) A direct, specific answer to the focus question: "${focus}".` : '') +
  `\n\nWrite it as markdown. Resolve contradictions between maps by re-reading the code yourself.`,
  { label: 'synthesize:brief', effort: 'high' },
)

if (!brief) {
  return { target: TARGET, error: 'Synthesis agent failed — subsystem maps returned for manual synthesis.', subsystems: valid }
}

return { target: TARGET, brief, subsystems: valid }
