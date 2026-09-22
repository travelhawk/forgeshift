// Host adapters: how to run ONE fresh-context agent turn on each agent CLI.
// A host is a coding agent with a headless mode. The runtime (lib/runtime.mjs) is host-
// neutral; everything a CLI does differently lives here. Flags verified 2026-09-19 against
// claude 2.1.272, codex-cli 0.154.0, opencode 1.18.31 — re-check when a CLI majors.
//
// Shell safety: on Windows npm-installed CLIs are .cmd shims, which Node can only spawn
// through a shell. So nothing free-form ever rides the command line — the prompt goes in on
// stdin, a schema goes in as a file path — and the few path arguments are quoted.
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

// Workflow scripts and agent files name a TIER by its Claude alias, because the native
// Claude Code Workflow runtime reads those tokens. Everywhere else the alias is only a
// tier: what it resolves to is per host, and the user's to override.
export const TIER_OF = { inherit: 'judge', opus: 'build', sonnet: 'execute', haiku: 'sweep' }
export const TIERS = ['judge', 'build', 'execute', 'sweep']
export const tierOf = model => TIER_OF[model || 'inherit'] || 'judge'

const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']

// OpenAI structured output rejects a schema node without a `type` (e.g. `items: {}`, "any
// value"). Such a schema still works through the prompt contract the runtime appends to every
// prompt, so the Codex adapter only hands over schemas where every node is typed.
export function everyNodeTyped(schema) {
  if (!schema || typeof schema !== 'object') return false
  if (!('type' in schema) && !schema.anyOf && !schema.enum) return false
  const kids = [...Object.values(schema.properties || {}), ...(schema.items ? [schema.items] : []), ...(schema.anyOf || [])]
  return kids.every(everyNodeTyped)
}

// null model = the host's own configured default. Only Claude ships a tier map: its
// aliases are stable. Codex/OpenCode model names differ per account and age fast, so tiers
// route by reasoning effort there until the user maps models in ~/.forge/config.json.
export const HOSTS = {
  claude: {
    bin: 'claude',
    models: { judge: null, build: 'opus', execute: 'sonnet', sweep: 'haiku' },
    command({ model, effort, schema, mode, shell, extraDirs = [] }) {
      const args = ['-p', '--output-format', 'json']
      if (model) args.push('--model', model)
      if (effort) args.push('--effort', effort)
      // Inline JSON survives only a shell-less spawn; under a shell the prompt carries it.
      if (schema && !shell) args.push('--json-schema', JSON.stringify(schema))
      // readonly still runs commands (tests, git diff) — it only loses the write tools. The deny
      // list wins over a user's own allow rules or default mode; the allow list alone would not.
      if (mode === 'readonly') args.push('--allowedTools', 'Bash,Read,Grep,Glob,WebFetch,WebSearch', '--disallowedTools', 'Write,Edit,NotebookEdit')
      else if (mode === 'full') args.push('--permission-mode', 'bypassPermissions')
      else args.push('--permission-mode', 'acceptEdits', '--allowedTools', 'Bash,Read,Write,Edit,Grep,Glob,WebFetch,WebSearch')
      // Sibling worktrees and the shared .git live outside the launch folder.
      if (mode !== 'full') for (const d of extraDirs) args.push('--add-dir', d)
      return args
    },
    parse({ stdout }) {
      // Hooks can print after the result, so take the result line, not the last line.
      let j = null
      for (const line of stdout.split(/\r?\n/)) {
        if (!line.startsWith('{')) continue
        try { const e = JSON.parse(line); if (e.type === 'result') j = e } catch { /* not the result line */ }
      }
      if (!j) throw new Error('no result line in the claude output')
      if (j.is_error) throw new Error(String(j.result || 'claude reported an error').slice(0, 300))
      return { text: j.result || '', structured: j.structured_output ?? null, outputTokens: j.usage?.output_tokens || 0 }
    },
  },
  codex: {
    bin: 'codex',
    models: { judge: null, build: null, execute: null, sweep: null },
    command({ model, effort, schema, schemaFile, outFile, mode, extraDirs = [] }) {
      const args = ['exec', '--json', '--skip-git-repo-check', '-o', outFile]
      if (model) args.push('-m', model)
      if (effort) args.push('-c', `model_reasoning_effort=${effort}`)
      if (schemaFile && everyNodeTyped(schema)) args.push('--output-schema', schemaFile)
      if (mode === 'full') args.push('--dangerously-bypass-approvals-and-sandbox')
      else args.push('-s', mode === 'readonly' ? 'read-only' : 'workspace-write')
      // Sibling worktrees and the shared .git live outside the workspace root.
      if (mode !== 'readonly' && mode !== 'full') for (const d of extraDirs) args.push('--add-dir', d)
      args.push('-')
      return args
    },
    parse({ stdout, outFile }) {
      let outputTokens = 0
      let failure = null, turnFailed = null
      for (const line of stdout.split(/\r?\n/)) {
        if (!line.startsWith('{')) continue
        try {
          const e = JSON.parse(line)
          if (e.type === 'turn.completed') { outputTokens += e.usage?.output_tokens || 0; turnFailed = null }
          if (e.type === 'turn.failed') turnFailed = e.error?.message || 'codex turn failed'
          if (e.type === 'error') failure = e.message || e.error?.message || 'codex error'
        } catch { /* not an event line */ }
      }
      // A failed last turn can still leave an earlier message in the -o file: that is a
      // fragment, never the answer.
      if (turnFailed) throw new Error(String(turnFailed).slice(0, 300))
      const text = existsSync(outFile) ? readFileSync(outFile, 'utf8') : ''
      if (!text && failure) throw new Error(String(failure).slice(0, 300))
      return { text, structured: null, outputTokens }
    },
  },
  opencode: {
    bin: 'opencode',
    models: { judge: null, build: null, execute: null, sweep: null },
    command({ model, effort, mode, cwd }) {
      const args = ['run', '--format', 'json', '--dir', cwd]
      if (model) args.push('-m', model)
      if (effort) args.push('--variant', effort === 'xhigh' ? 'high' : effort)
      // Headless runs cannot answer a permission prompt; read-only agents are told so in
      // their prompt, the host has no read-only switch for `run`.
      if (mode !== 'readonly') args.push('--auto')
      return args
    },
    parse({ stdout }) {
      let outputTokens = 0
      let lastMessage = null
      const texts = {}
      let failure = null
      for (const line of stdout.split(/\r?\n/)) {
        if (!line.startsWith('{')) continue
        let e
        try { e = JSON.parse(line) } catch { continue }
        if (e.type === 'text' && e.part?.text) {
          lastMessage = e.part.messageID
          texts[lastMessage] = (texts[lastMessage] || '') + e.part.text
          failure = null
        }
        if (e.type === 'step_finish') outputTokens += e.part?.tokens?.output || 0
        if (e.type === 'error') failure = e.error?.data?.message || e.error?.name || 'opencode error'
      }
      // An error after the last text means the session died mid-answer: the text is a fragment.
      if (failure) throw new Error(String(failure).slice(0, 300))
      return { text: lastMessage ? texts[lastMessage] : '', structured: null, outputTokens }
    },
  },
}

// ~/.forge/config.json: { "host": "codex", "concurrency": 4,
//   "hosts": { "codex": { "models": { "sweep": "<cheap model>" }, "args": ["..."] } } }
export function loadConfig(path = join(homedir(), '.forge', 'config.json')) {
  try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return {} }
}

// Absolute path of a CLI, or null. `where`/`command -v` both print one path per line.
export function which(bin) {
  try {
    const out = process.platform === 'win32'
      ? execFileSync('where', [bin], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      : execFileSync('sh', ['-c', `command -v ${bin}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    const lines = out.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
    // On Windows prefer something directly spawnable (.exe), then the .cmd shim.
    return lines.find(l => /\.exe$/i.test(l)) || lines.find(l => /\.(cmd|bat)$/i.test(l)) || lines[0] || null
  } catch { return null }
}

export const installedHosts = () => Object.keys(HOSTS).filter(h => which(HOSTS[h].bin))

// The agent whose shell is calling us, read from the marker each host sets in its tool
// environment (probed 2026-09-19). Innermost first: a Codex started from inside a Claude
// session inherits CLAUDECODE too, so the Claude marker only counts when it stands alone.
export function callingHost(env = process.env) {
  const codex = !!(env.CODEX_THREAD_ID || env.CODEX_SESSION_ID)
  const opencode = !!(env.OPENCODE || env.OPENCODE_PID)
  if (codex !== opencode) return codex ? 'codex' : 'opencode'
  if (!codex && env.CLAUDECODE) return 'claude'
  return null
}

// --host flag > FORGE_HOST > the calling agent > config > the first installed CLI.
export function pickHost(explicit, config = loadConfig(), env = process.env) {
  const name = explicit || env.FORGE_HOST || callingHost(env) || config.host || installedHosts()[0]
  if (!name) throw new Error('No agent CLI found on PATH (looked for: ' + Object.keys(HOSTS).join(', ') + ').')
  if (!HOSTS[name]) throw new Error(`Unknown host "${name}". Known: ${Object.keys(HOSTS).join(', ')}.`)
  return name
}

// Resolve a workflow's model alias + effort to what the host is actually given.
export function resolveModel(hostName, modelAlias, effort, config = loadConfig()) {
  const tier = tierOf(modelAlias)
  const envModel = process.env[`FORGE_MODEL_${tier.toUpperCase()}`]
  const model = envModel || config.hosts?.[hostName]?.models?.[tier] || HOSTS[hostName].models[tier] || null
  return { tier, model, effort: EFFORTS.includes(effort) ? effort : null }
}
