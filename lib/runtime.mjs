// Portable workflow runtime: executes a workflows/*.js script outside any one vendor's
// tool. It provides the same surface the scripts were written against — args, agent(),
// parallel(), pipeline(), phase(), log(), budget — and backs agent() with a headless run of
// whichever agent CLI is the host (lib/hosts.mjs). On Claude Code the native Workflow tool
// stays the fast path; this is what makes the same script run under Codex, OpenCode, CI.
//
// Contract the scripts rely on: agent() resolves to the schema-valid object (or the reply
// text when no schema was given) and to null when the agent died — never a throw. Gates are
// written fail-closed around that null.
import { spawn, execFileSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { HOSTS, which, resolveModel, loadConfig } from './hosts.mjs'

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

// --- structured output -----------------------------------------------------------

// Pull one JSON value out of a model reply: the whole reply, a fenced block, or the
// outermost {...} / [...] span.
export function extractJson(text) {
  if (text == null) return undefined
  const s = String(text).trim()
  const tries = [s]
  const fence = [...s.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map(m => m[1].trim())
  if (fence.length) tries.push(fence[fence.length - 1])
  for (const [open, close] of [['{', '}'], ['[', ']']]) {
    const a = s.indexOf(open), b = s.lastIndexOf(close)
    if (a !== -1 && b > a) tries.push(s.slice(a, b + 1))
  }
  for (const t of tries) { try { return JSON.parse(t) } catch { /* next candidate */ } }
  return undefined
}

// The JSON Schema subset the workflows use: type, required, properties, items, enum,
// additionalProperties:false. Returns a list of human-readable violations.
export function validate(schema, value, path = '$') {
  if (!schema || typeof schema !== 'object') return []
  const errs = []
  const typeOf = v => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v)
  if (schema.type) {
    const want = [].concat(schema.type)
    const got = typeOf(value)
    if (!want.includes(got) && !(got === 'integer' && want.includes('number'))) {
      return [`${path}: expected ${want.join('|')}, got ${got}`]
    }
  }
  if (schema.enum && !schema.enum.includes(value)) errs.push(`${path}: must be one of ${JSON.stringify(schema.enum)}`)
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const k of schema.required || []) if (!(k in value)) errs.push(`${path}.${k}: required`)
    for (const [k, sub] of Object.entries(schema.properties || {})) if (k in value) errs.push(...validate(sub, value[k], `${path}.${k}`))
    if (schema.additionalProperties === false && schema.properties) {
      for (const k of Object.keys(value)) if (!(k in schema.properties)) errs.push(`${path}.${k}: not allowed`)
    }
  }
  if (Array.isArray(value) && schema.items && Object.keys(schema.items).length) {
    value.forEach((v, i) => errs.push(...validate(schema.items, v, `${path}[${i}]`)))
  }
  return errs
}

const OUTPUT_CONTRACT = schema =>
  `\n\nOUTPUT CONTRACT: your final reply is ONE JSON value matching this JSON Schema and nothing else — ` +
  `no prose before or after, no code fence.\n${JSON.stringify(schema)}`

// --- the script surface ----------------------------------------------------------

// Run a workflow script body. agentFn(prompt, opts) is the only thing that differs between
// a real run and a simulation.
export async function runWorkflow(src, { args, agentFn, concurrency = 4, log = () => {} }) {
  let spent = 0
  let active = 0
  const waiting = []
  const acquire = () => (active < concurrency ? (active++, Promise.resolve()) : new Promise(r => waiting.push(r)))
  const release = () => { const next = waiting.shift(); if (next) next(); else active-- }

  const agent = async (prompt, opts = {}) => {
    await acquire()
    try {
      const out = await agentFn(prompt, opts)
      if (out && typeof out.outputTokens === 'number') spent += out.outputTokens
      return out ? out.value : null
    } catch (e) {
      log(`agent ${opts.label || ''} failed: ${String((e && e.message) || e).slice(0, 300)}`)
      return null
    } finally { release() }
  }
  const settle = p => Promise.resolve().then(p).catch(e => { log(`stage failed: ${String((e && e.message) || e).slice(0, 300)}`); return null })
  const parallel = thunks => Promise.all(thunks.map(t => settle(t)))
  // Every item flows through the stages on its own; items do not wait for each other.
  const pipeline = (items, ...stages) => Promise.all(items.map(async (item, i) => {
    let acc = item
    for (const stage of stages) {
      try { acc = await stage(acc, item, i) } catch (e) { log(`pipeline item ${i + 1} failed: ${String((e && e.message) || e).slice(0, 300)}`); return null }
    }
    return acc
  }))
  const budget = { total: null, spent: () => spent, remaining: () => Infinity }
  const phase = title => log(`── ${title}`)

  const body = src.replace(/^export\s+const\s+meta/m, 'const meta')
  const fn = new AsyncFunction('args', 'budget', 'parallel', 'pipeline', 'phase', 'log', 'workflow', body)
  // Scripts reach the raw agent through globalThis.agent before they wrap it.
  const prev = globalThis.agent
  globalThis.agent = agent
  try {
    const result = await fn(args, budget, parallel, pipeline, phase, log, async () => null)
    return { result, spent }
  } finally {
    if (prev === undefined) delete globalThis.agent
    else globalThis.agent = prev
  }
}

// --- a real agent turn on a host CLI ------------------------------------------------

// /d/x (Git Bash) → D:/x, so a path a skill resolved in the shell is usable as a cwd.
export const nativePath = p => (process.platform === 'win32' ? String(p).replace(/^\/([a-zA-Z])(\/|$)/, (_, d) => `${d.toUpperCase()}:/`) : String(p))

const quote = a => (/[\s"&|<>^()]/.test(a) ? `"${String(a).replace(/"/g, '\\"')}"` : a)

function killTree(child) {
  try {
    if (process.platform === 'win32') execFileSync('taskkill', ['/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore' })
    else process.kill(-child.pid, 'SIGKILL')
  } catch { try { child.kill('SIGKILL') } catch { /* already gone */ } }
}

function runCli({ bin, args, cwd, stdin, timeoutMs, env }) {
  const shell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(bin)
  return new Promise((resolvePromise, reject) => {
    const child = shell
      ? spawn([quote(bin), ...args.map(quote)].join(' '), { cwd, env, shell: true, windowsHide: true })
      : spawn(bin, args, { cwd, env, windowsHide: true, detached: process.platform !== 'win32' })
    let stdout = '', stderr = ''
    const timer = setTimeout(() => { killTree(child); reject(new Error(`timed out after ${Math.round(timeoutMs / 60000)} min`)) }, timeoutMs)
    child.stdout.on('data', d => { stdout += d })
    child.stderr.on('data', d => { stderr += d })
    child.on('error', e => { clearTimeout(timer); reject(e) })
    child.on('close', code => { clearTimeout(timer); resolvePromise({ code, stdout, stderr }) })
    child.stdin.on('error', () => { /* the CLI closed stdin early — its exit code tells the story */ })
    child.stdin.end(stdin)
  })
}

const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

// One fresh-context agent per call. Returns { value, outputTokens } or throws.
export function makeHostAgent({ host, dir, mode = 'workspace', runDir, forgeHome, timeoutMs = 45 * 60000, config = loadConfig(), log = () => {} }) {
  const adapter = HOSTS[host]
  const bin = which(adapter.bin)
  if (!bin) throw new Error(`The \`${adapter.bin}\` CLI is not on PATH — install it or pick another --host.`)
  const shell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(bin)
  const cacheDir = join(runDir, 'cache')
  mkdirSync(cacheDir, { recursive: true })
  const target = resolve(nativePath(dir))
  const env = { ...process.env, FORGE_HOME: forgeHome, FORGE_HOST: host }
  let seq = 0

  const turn = async ({ prompt, schema, modelAlias, effort, cwd, extraDirs }) => {
    const id = `${++seq}-${randomBytes(3).toString('hex')}`
    const { model, effort: eff } = resolveModel(host, modelAlias, effort, config)
    const schemaFile = schema ? join(runDir, `schema-${id}.json`) : null
    const outFile = join(runDir, `out-${id}.txt`)
    if (schemaFile) writeFileSync(schemaFile, JSON.stringify(schema))
    const args = [
      ...adapter.command({ model, effort: eff, schema, schemaFile, outFile, mode, cwd, shell, extraDirs }),
      ...(config.hosts?.[host]?.args || []),
    ]
    const stdin = schema ? prompt + OUTPUT_CONTRACT(schema) : prompt
    const { code, stdout, stderr } = await runCli({ bin, args, cwd, stdin, timeoutMs, env })
    let parsed
    try { parsed = adapter.parse({ stdout, outFile }) } catch (e) {
      throw new Error(`${host} exit ${code}: ${e.message} ${stderr.slice(-300)}`.trim())
    }
    if (!parsed.text && parsed.structured == null) throw new Error(`${host} exit ${code}: empty reply. ${stderr.slice(-300)}`.trim())
    return parsed
  }

  return async (prompt, opts = {}) => {
    const key = createHash('sha256').update(JSON.stringify([prompt, opts.model, opts.effort, opts.schema, opts.isolation])).digest('hex').slice(0, 24)
    const cacheFile = join(cacheDir, `${key}.json`)
    if (existsSync(cacheFile)) { log(`↺ ${opts.label || 'agent'} (cached)`); return { value: JSON.parse(readFileSync(cacheFile, 'utf8')), outputTokens: 0 } }

    // isolation:'worktree' — the agent works in a throwaway detached worktree and commits
    // to a branch it creates there. The worktree goes, the branch survives in the shared .git.
    let cwd = target, worktree = null
    const extraDirs = [dirname(target)] // sibling worktrees the scripts create via forge-worktree.sh
    if (opts.isolation === 'worktree') {
      worktree = join(dirname(target), `wf-iso-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`)
      git(target, 'worktree', 'add', '--detach', worktree, 'HEAD')
      cwd = worktree
    }
    const started = Date.now()
    const routed = resolveModel(host, opts.model, opts.effort, config)
    log(`▶ ${opts.label || 'agent'} [${host} · ${routed.tier}${routed.model ? ' → ' + routed.model : ''}${routed.effort ? ' · ' + routed.effort : ''}]`)
    try {
      let outputTokens = 0
      let reply = await turn({ prompt, schema: opts.schema, modelAlias: opts.model, effort: opts.effort, cwd, extraDirs })
      outputTokens += reply.outputTokens
      let value = reply.text
      if (opts.schema) {
        value = reply.structured ?? extractJson(reply.text)
        let errs = value === undefined ? ['reply held no JSON value'] : validate(opts.schema, value)
        if (errs.length) {
          // Repair = reformat, not redo: a cheap agent reshapes the reply it is handed.
          log(`  ${opts.label || 'agent'}: reply off-schema (${errs.slice(0, 3).join('; ')}) — one reformat pass`)
          reply = await turn({
            prompt: `Reformat the REPLY below into the required JSON. Change no facts and add none; fill a missing ` +
              `required field from the reply's own content. Violations found: ${errs.slice(0, 8).join('; ')}\n\nREPLY:\n${reply.text}`,
            schema: opts.schema, modelAlias: 'haiku', effort: 'low', cwd, extraDirs,
          })
          outputTokens += reply.outputTokens
          value = reply.structured ?? extractJson(reply.text)
          errs = value === undefined ? ['reply held no JSON value'] : validate(opts.schema, value)
          if (errs.length) throw new Error(`reply still off-schema after the reformat pass: ${errs.slice(0, 3).join('; ')}`)
        }
      }
      writeFileSync(cacheFile, JSON.stringify(value))
      log(`✔ ${opts.label || 'agent'} (${Math.round((Date.now() - started) / 1000)}s)`)
      return { value, outputTokens }
    } finally {
      if (worktree) {
        try { git(target, 'worktree', 'remove', '--force', worktree) } catch { /* prune below */ }
        try { git(target, 'worktree', 'prune') } catch { /* best effort */ }
        if (existsSync(worktree)) rmSync(worktree, { recursive: true, force: true })
      }
    }
  }
}

export const runsHome = () => join(homedir(), '.forge', 'runs')
