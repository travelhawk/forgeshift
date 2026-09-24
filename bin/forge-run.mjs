#!/usr/bin/env node
// forge-run — run a F.O.R.G.E. workflow, or one specialist agent, on any agent CLI.
//
//   forge-run <workflow> --args-file <json> [--dir <product>] [--host claude|codex|opencode]
//   forge-run agent <forge-agent> --dir <product> [--prompt-file <f>]   (else: task on stdin)
//   forge-run hosts
//
// Options: --concurrency <n> (default 4) · --mode workspace|readonly|full (default workspace)
//          --resume <run-id> (completed agents replay from cache) · --timeout-min <n>
// The result JSON goes to stdout; progress goes to stderr. Details: docs/HOSTS.md
import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve, isAbsolute } from 'node:path'
import { randomBytes } from 'node:crypto'
import { runWorkflow, makeHostAgent, runsHome, nativePath, killAll } from '../lib/runtime.mjs'
import { HOSTS, TIERS, installedHosts, pickHost, loadConfig, resolveModel, which } from '../lib/hosts.mjs'

const FORGE_HOME = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const die = msg => { console.error(`forge-run: ${msg}`); process.exit(2) }

const argv = process.argv.slice(2)
const flags = {}
const positional = []
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) flags[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true
  else positional.push(argv[i])
}
const config = loadConfig()

if (!positional.length || flags.help) {
  console.error(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 11).map(l => l.replace(/^\/\/ ?/, '')).join('\n'))
  process.exit(positional.length ? 0 : 2)
}

if (positional[0] === 'hosts') {
  const found = installedHosts()
  for (const h of Object.keys(HOSTS)) {
    const tiers = TIERS.map(t => `${t}=${resolveModel(h, { judge: 'inherit', build: 'opus', execute: 'sonnet', sweep: 'haiku' }[t], null, config).model || 'host default'}`)
    console.log(`${found.includes(h) ? '✔' : '✘'} ${h.padEnd(9)} ${tiers.join('  ')}`)
  }
  process.exit(0)
}

let host
try { host = pickHost(typeof flags.host === 'string' ? flags.host : null, config) } catch (e) { die(e.message) }
if (!which(HOSTS[host].bin)) die(`the ${host} CLI (${HOSTS[host].bin}) is not on PATH. Found: ${installedHosts().join(', ') || 'none'} — pass --host, or fix PATH.`)
const runId = typeof flags.resume === 'string' ? flags.resume : `run_${Date.now().toString(36)}${randomBytes(2).toString('hex')}`
const runDir = join(runsHome(), runId)
if (flags.resume && !existsSync(runDir)) die(`no such run to resume: ${runId}`)
mkdirSync(runDir, { recursive: true })
const log = msg => { console.error(msg); appendFileSync(join(runDir, 'log.txt'), msg + '\n') }
// Agents must not outlive the runner: a Ctrl-C would leave them working with write access.
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => { log(`${sig} — stopping every agent`); killAll(); process.exit(130) })
}
const common = {
  host, runDir, forgeHome: FORGE_HOME, config, log,
  mode: typeof flags.mode === 'string' ? flags.mode : 'workspace',
  timeoutMs: (Number(flags['timeout-min']) || 45) * 60000,
}

// --- one specialist agent, fresh context ----------------------------------------------
if (positional[0] === 'agent') {
  const name = positional[1] || die('agent needs a name, e.g. forge-quench')
  const file = join(FORGE_HOME, 'agents', `${name}.md`)
  if (!existsSync(file)) die(`unknown agent "${name}" (no ${file})`)
  const src = readFileSync(file, 'utf8')
  const fm = Object.fromEntries([...(src.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] || '').matchAll(/^([a-z-]+):\s*(.*)$/gm)].map(m => [m[1], m[2]]))
  const task = typeof flags['prompt-file'] === 'string' ? readFileSync(flags['prompt-file'], 'utf8') : readFileSync(0, 'utf8')
  if (!task.trim()) die('empty task — pass --prompt-file or pipe the task on stdin')
  const dir = typeof flags.dir === 'string' ? flags.dir : process.cwd()
  const agentFn = makeHostAgent({ ...common, dir })
  try {
    const out = await agentFn(`${src.replace(/^---[\s\S]*?---\r?\n/, '')}\n\n# YOUR TASK\n\n${task}`, { label: name, model: fm.model, effort: fm.effort })
    console.log(out.value)
  } catch (e) { console.error(`forge-run: ${name} failed — ${e.message}`); process.exit(1) }
  process.exit(0)
}

// --- a workflow ----------------------------------------------------------------------
const wf = positional[0]
const scriptPath = wf.endsWith('.js') ? (isAbsolute(nativePath(wf)) ? nativePath(wf) : resolve(wf)) : join(FORGE_HOME, 'workflows', `${wf}.js`)
if (!existsSync(scriptPath)) die(`no such workflow: ${scriptPath}`)

let args = {}
if (typeof flags['args-file'] === 'string') {
  const raw = readFileSync(nativePath(flags['args-file']), 'utf8')
  try { args = JSON.parse(raw) } catch { args = raw } // design-panel takes a plain-text brief
} else if (typeof flags.args === 'string') {
  try { args = JSON.parse(flags.args) } catch { args = flags.args }
}
if (args && typeof args === 'object' && !Array.isArray(args)) {
  if (typeof flags.dir === 'string' && !args.dir) args.dir = flags.dir
  // The agents see this path in their prompts; a Git Bash /d/x means nothing to PowerShell.
  if (typeof args.dir === 'string') args.dir = nativePath(args.dir)
  if (!args.forge_home) args.forge_home = FORGE_HOME.replace(/\\/g, '/')
}
const dir = (args && typeof args === 'object' && args.dir) || (typeof flags.dir === 'string' ? flags.dir : process.cwd())

log(`forge-run ${wf} · host ${host} · run ${runId} · target ${dir}`)
const agentFn = makeHostAgent({ ...common, dir })
try {
  const { result, spent } = await runWorkflow(readFileSync(scriptPath, 'utf8'), {
    args, agentFn, log,
    concurrency: Number(flags.concurrency) || config.concurrency || 4,
  })
  const out = { run_id: runId, host, output_tokens: spent, result }
  writeFileSync(join(runDir, 'result.json'), JSON.stringify(out, null, 2))
  console.log(JSON.stringify(out, null, 2))
  log(`done · ${Math.round(spent / 1000)}k output tokens · resume with --resume ${runId}`)
  process.exit(result && result.error ? 1 : 0)
} catch (e) {
  log(`workflow crashed: ${(e && e.stack) || e}`)
  console.log(JSON.stringify({ run_id: runId, host, result: { error: String((e && e.message) || e) } }, null, 2))
  process.exit(1)
}
