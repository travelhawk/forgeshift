// Render the canonical harness (skills/, agents/) into the formats other agent hosts read.
// Claude Code loads the canonical files directly as a plugin; every other host gets a
// rendered copy. Pure functions — scripts/install.mjs does the file writing.
//
// Formats verified 2026-09-19: Agent Skills (`~/.agents/skills/<name>/SKILL.md`, read by
// Codex and OpenCode), Codex subagents (`~/.codex/agents/<name>.toml`), OpenCode agents and
// commands (`~/.config/opencode/{agents,commands}/<name>.md`).
import { tierOf } from './hosts.mjs'

export const PREFIX = 'forge-'
export const HARNESS_HOME = '$HOME/.forge/home'

// The canonical idiom resolves the Claude plugin install; elsewhere the installer puts the
// harness at one fixed place, so the idiom collapses to it.
const CLAUDE_IDIOM = /FORGE_HOME="\$\{FORGE_HOME:-\$\{CLAUDE_PLUGIN_ROOT:-\$\([^`\n]*?tail -1\)\}\}"/g
export const portableIdiom = (home = HARNESS_HOME) => `FORGE_HOME="\${FORGE_HOME:-${home}}"`

export function splitFrontmatter(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!m) return { fm: {}, body: src }
  const fm = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z-]+):\s*(.*)$/)
    if (kv) fm[kv[1]] = kv[2].replace(/^["']|["']$/g, '')
  }
  return { fm, body: src.slice(m[0].length) }
}

// /forge:build is Claude's plugin namespace. Portable hosts have flat names: forge-build.
export const portableBody = (body, home) => body
  .replace(CLAUDE_IDIOM, () => portableIdiom(home))
  .replace(/\/forge:([a-z][a-z-]*)/g, `${PREFIX}$1`)

const SKILL_NOTE =
  `> **Portable build of a F.O.R.G.E. command.** Commands named \`${PREFIX}*\` are skills — invoke one as ` +
  `\`$${PREFIX}<name>\` (Codex) or \`/${PREFIX}<name>\` (OpenCode). \`$ARGUMENTS\` means the request text given ` +
  `with this command. Workflows run through the portable runner and \`forge-*\` specialists are this host's ` +
  `subagents — the mapping is in \`$FORGE_HOME/docs/HOSTS.md\`.\n\n`

const yamlString = s => JSON.stringify(String(s))

// skills/<name>/SKILL.md → an Agent Skills file. Hosts recognise name + description only,
// and the name must equal the directory name.
export function renderSkill(name, src, { home } = {}) {
  const { fm, body } = splitFrontmatter(src)
  const description = portableBody(fm.description || '')
  return {
    dir: `${PREFIX}${name}`,
    content: `---\nname: ${PREFIX}${name}\ndescription: ${yamlString(description)}\n---\n\n${SKILL_NOTE}${portableBody(body, home).replace(/^\n+/, '')}`,
  }
}

// OpenCode slash command: a thin pointer, so the playbook lives in exactly one file.
export function renderOpencodeCommand(name, src) {
  const { fm } = splitFrontmatter(src)
  return {
    file: `${PREFIX}${name}.md`,
    content: `---\ndescription: ${yamlString(portableBody(fm.description || ''))}\n---\n\n` +
      `Load the \`${PREFIX}${name}\` skill with the skill tool and follow it exactly.\n\nRequest: $ARGUMENTS\n`,
  }
}

const writes = fm => /\b(Write|Edit)\b/.test(fm.tools || '')
const runsShell = fm => /\bBash\b/.test(fm.tools || '')

// agents/<name>.md → Codex subagent TOML. `model` is set only when the user mapped the
// agent's tier for this host; otherwise Codex applies its own subagent default.
export function renderCodexAgent(src, models = {}, { home } = {}) {
  const { fm, body } = splitFrontmatter(src)
  const text = portableBody(body, home).trim()
  if (text.includes("'''")) throw new Error(`agent ${fm.name}: body contains ''' and cannot be a TOML literal string`)
  const model = models[tierOf(fm.model)]
  const lines = [
    `name = ${JSON.stringify(fm.name)}`,
    `description = ${JSON.stringify(portableBody(fm.description || ''))}`,
    ...(model ? [`model = ${JSON.stringify(model)}`] : []),
    ...(fm.effort ? [`model_reasoning_effort = ${JSON.stringify(fm.effort)}`] : []),
    // Reviewers run tests, which write caches — so anything with a shell gets the workspace.
    `sandbox_mode = ${JSON.stringify(writes(fm) || runsShell(fm) ? 'workspace-write' : 'read-only')}`,
    `developer_instructions = '''\n${text}\n'''`,
  ]
  return { file: `${fm.name}.toml`, content: lines.join('\n') + '\n' }
}

// agents/<name>.md → OpenCode subagent markdown.
export function renderOpencodeAgent(src, models = {}, { home } = {}) {
  const { fm, body } = splitFrontmatter(src)
  const model = models[tierOf(fm.model)]
  const head = [
    `description: ${yamlString(portableBody(fm.description || ''))}`,
    'mode: subagent',
    ...(model ? [`model: ${model}`] : []),
    ...(writes(fm) ? [] : ['permission:', '  edit: deny']),
  ]
  return { file: `${fm.name}.md`, content: `---\n${head.join('\n')}\n---\n\n${portableBody(body, home).trim()}\n` }
}
