#!/usr/bin/env node
// Install F.O.R.G.E. for every agent CLI on this machine. Idempotent.
//   node scripts/install.mjs                       # every detected host, global
//   node scripts/install.mjs --host codex          # claude | codex | opencode | all | a,b
//   node scripts/install.mjs --project [dir]       # scope to one repo (default: cwd)
//   node scripts/install.mjs --dry-run             # print what would be written
//   node scripts/install.mjs --uninstall [--host h] # remove what the manifest lists (default: all)
//
// Claude Code loads this repo as a plugin — skills/, agents/ and workflows/ are read as they
// are. Every other host gets a rendered copy (lib/render.mjs) plus the harness itself at
// ~/.forge/home, which is where the rendered skills resolve $FORGE_HOME.
//
// The manifest records files per host, so installing or removing one host never touches
// another host's files. The shared parts (skills, harness copy) go when the last host goes.
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { homedir } from 'node:os'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, rmdirSync, statSync, writeFileSync } from 'node:fs'
import { HOSTS, installedHosts, loadConfig, which } from '../lib/hosts.mjs'
import { renderSkill, renderCodexAgent, renderOpencodeAgent, renderOpencodeCommand } from '../lib/render.mjs'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// What a skill or the runner reads at run time. No tests, no evals, no private references/.
const HARNESS = ['AGENTS.md', 'package.json', '.claude-plugin', 'agents', 'bin', 'docs', 'lib', 'scripts', 'skills', 'templates', 'workflows']
// Written into the harness copy. Only a directory carrying it is ever replaced or deleted.
const MARKER = '.forge-install.json'

const argv = process.argv.slice(2)
const flag = name => argv.includes(name)
const value = name => {
  const i = argv.indexOf(name)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null
}
const die = msg => { console.error('✘ ' + msg); process.exit(1) }
const dryRun = flag('--dry-run')
const uninstall = flag('--uninstall')
// The on-disk spelling (realpath), so a re-run typed with other casing is the same install.
const canonical = p => { try { return realpathSync.native(p) } catch { return p } }
const project = flag('--project') ? canonical(resolve(value('--project') || process.cwd())) : null
const home = resolve(value('--home') || join(homedir(), '.forge', 'home'))
const manifestPath = project ? join(project, '.forge', 'install.json') : join(homedir(), '.forge', 'install.json')
const posix = p => p.replace(/\\/g, '/')
const within = (a, b) => { const r = relative(b, a); return r === '' || (!r.startsWith('..') && !isAbsolute(r)) }
const samePath = (a, b) => process.platform === 'win32' ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b)

// Where this scope's rendered files live. Nothing outside these is ever written or removed.
const base = project || homedir()
const roots = {
  skills: join(base, '.agents', 'skills'),
  codex: join(base, '.codex', 'agents'),
  opencode: project ? join(project, '.opencode') : join(homedir(), '.config', 'opencode'),
}
const inScope = p => typeof p === 'string' && isAbsolute(p) && basename(p).startsWith('forge-') &&
  Object.values(roots).some(r => within(resolve(p), r) && !samePath(p, r))

// A project manifest travels with the repo, so a clone can ship one: its paths are only
// trusted inside this scope's roots, and only the global manifest may own the harness copy.
const readManifest = () => {
  try {
    const m = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const list = v => (Array.isArray(v) ? v.filter(inScope) : [])
    const hostMap = m.hosts && typeof m.hosts === 'object' && !Array.isArray(m.hosts) ? m.hosts : {}
    return {
      hosts: Object.fromEntries(Object.entries(hostMap).filter(([h]) => HOSTS[h]).map(([h, v]) => [h, list(v)])),
      shared: list(m.shared),
      ownsHome: !project && !!m.ownsHome && typeof m.home === 'string' && isAbsolute(m.home),
      home: m.home,
    }
  } catch { return { hosts: {}, shared: [], ownsHome: false } }
}
const before = readManifest()

const wanted = value('--host')
const hosts = wanted === 'all' ? Object.keys(HOSTS)
  : wanted ? wanted.split(',')
  : uninstall ? Object.keys(before.hosts)
  : installedHosts()
for (const h of hosts) if (!HOSTS[h]) die(`Unknown host "${h}". Known: ${Object.keys(HOSTS).join(', ')}, all.`)
if (!hosts.length) die(uninstall ? `Nothing recorded at ${manifestPath}.` : `No agent CLI on PATH (looked for: ${Object.keys(HOSTS).join(', ')}). Install one, or pass --host.`)
const portable = hosts.filter(h => h !== 'claude')

const remove = p => {
  console.log('  − ' + p)
  if (dryRun) return
  rmSync(p, { recursive: true, force: true })
  // Drop the folders we created once they are empty; rmdir refuses anything that is not.
  // Never the project or home folder itself, however empty.
  for (let d = dirname(p); within(d, base) && !samePath(d, base); d = dirname(d)) { try { rmdirSync(d) } catch { break } }
}
const run = (cmd, cwd, tolerant = false) => {
  console.log('$ ' + cmd)
  if (dryRun) return
  try { execSync(cmd, { stdio: 'inherit', cwd }) } catch (e) {
    if (!tolerant) throw e
    console.log('  (continuing — already present or non-fatal)')
  }
}

// ── Claude Code: the plugin route ───────────────────────────────────────────────
// Returns whether the plugin is now installed, so the manifest records only what we did.
function claude() {
  if (!which('claude')) { console.log('· claude: CLI not on PATH, skipped'); return false }
  const scope = project ? ' --scope project' : ''
  if (uninstall) { run('claude plugin uninstall forge' + scope, project || repo, true); return false }
  // Re-adding a marketplace registered under the same name replaces it.
  run(`claude plugin marketplace add "${repo}"`, repo, true)
  run('claude plugin install forge@forge' + scope, project || repo)
  return true
}

// ── Every other host: rendered files ────────────────────────────────────────────
// Skills go to the one Agent Skills directory Codex and OpenCode both scan, so the
// playbooks exist once per scope and are shared by those hosts.
function plan() {
  const config = loadConfig()
  const models = h => config.hosts?.[h]?.models || {}
  const opts = { home: value('--home') ? posix(home) : undefined }
  const files = { shared: [], codex: [], opencode: [] }
  const skillNames = readdirSync(join(repo, 'skills')).filter(n => existsSync(join(repo, 'skills', n, 'SKILL.md')))
  const agentFiles = readdirSync(join(repo, 'agents')).filter(f => /^forge-.*\.md$/.test(f))
  for (const name of skillNames) {
    const src = readFileSync(join(repo, 'skills', name, 'SKILL.md'), 'utf8')
    const s = renderSkill(name, src, opts)
    files.shared.push({ path: join(roots.skills, s.dir, 'SKILL.md'), content: s.content, owns: join(roots.skills, s.dir) })
    const c = renderOpencodeCommand(name, src)
    files.opencode.push({ path: join(roots.opencode, 'commands', c.file), content: c.content })
  }
  for (const f of agentFiles) {
    const src = readFileSync(join(repo, 'agents', f), 'utf8')
    const a = renderCodexAgent(src, models('codex'), opts)
    files.codex.push({ path: join(roots.codex, a.file), content: a.content })
    const o = renderOpencodeAgent(src, models('opencode'), opts)
    files.opencode.push({ path: join(roots.opencode, 'agents', o.file), content: o.content })
  }
  return files
}

// The copy replaces the directory, so it must be ours: absent, empty, or carrying the
// marker a previous install wrote — and never the source repo or anything around it.
function guardHome() {
  if (within(home, repo) || within(repo, home)) die(`--home ${home} overlaps the forge repo ${repo} — pick a directory outside it.`)
  if (!existsSync(home)) return
  if (!statSync(home).isDirectory()) die(`${home} is a file, not a directory.`)
  if (readdirSync(home).length && !existsSync(join(home, MARKER))) die(`${home} exists and is not a forge install — refusing to replace it.`)
}

function copyHarness(version) {
  console.log(`\nHarness → ${home}`)
  if (dryRun) return
  // A fresh copy each time: a file deleted from the repo must not survive in the install.
  rmSync(home, { recursive: true, force: true })
  mkdirSync(home, { recursive: true })
  for (const entry of HARNESS) {
    if (existsSync(join(repo, entry))) cpSync(join(repo, entry), join(home, entry), { recursive: true })
  }
  writeFileSync(join(home, MARKER), JSON.stringify({ version, source: repo }, null, 2) + '\n')
}

function write(list) {
  for (const f of list) {
    console.log('  + ' + f.path)
    if (dryRun) continue
    mkdirSync(dirname(f.path), { recursive: true })
    writeFileSync(f.path, f.content)
  }
  return list.map(f => f.owns || f.path)
}

function saveManifest(m) {
  if (dryRun) return
  if (!Object.keys(m.hosts).length) { if (existsSync(manifestPath)) remove(manifestPath); return }
  mkdirSync(dirname(manifestPath), { recursive: true })
  writeFileSync(manifestPath, JSON.stringify(m, null, 2) + '\n')
}

// ── main ────────────────────────────────────────────────────────────────────────
const version = JSON.parse(readFileSync(join(repo, '.claude-plugin', 'plugin.json'), 'utf8')).version
const scopeLabel = project ? 'project ' + project : 'global'

if (uninstall) {
  console.log(`Uninstalling forge (${scopeLabel}) — hosts: ${hosts.join(', ')}${dryRun ? '  [dry run]' : ''}`)
  const after = { ...before.hosts }
  if (hosts.includes('claude')) { claude(); delete after.claude }
  for (const h of portable) {
    for (const p of after[h] || []) remove(p)
    delete after[h]
  }
  // The shared parts go with the last portable host. A project install shares ~/.forge/home
  // with the global one and every other project, so only the global manifest owns it.
  const left = Object.keys(after).some(h => h !== 'claude')
  if (!left) {
    for (const p of before.shared) remove(p)
    if (before.ownsHome && before.home && existsSync(join(before.home, MARKER))) remove(before.home)
    else if (before.home && existsSync(join(before.home, MARKER))) console.log(`  · kept the shared harness copy at ${before.home}`)
  }
  saveManifest({ version, home: before.home, ownsHome: before.ownsHome, installedAt: new Date().toISOString(), hosts: after, shared: left ? before.shared : [] })
  console.log('\n✔ removed.')
  process.exit(0)
}

console.log(`Installing forge ${version} (${scopeLabel}) — hosts: ${hosts.join(', ')}${dryRun ? '  [dry run]' : ''}\n`)
if (portable.length) guardHome()   // before any host is touched
const after = { ...before.hosts }
if (hosts.includes('claude') && claude()) after.claude = []
let shared = before.shared

if (portable.length) {
  const files = plan()
  copyHarness(version)
  shared = write(files.shared)
  for (const h of portable) after[h] = write(files[h])
  // Whatever this run's hosts had last time and no longer have is stale: a removed skill or agent.
  const stale = [
    ...portable.flatMap(h => (before.hosts[h] || []).filter(p => !after[h].some(q => samePath(p, q)))),
    ...before.shared.filter(p => !shared.some(q => samePath(p, q))),
  ]
  if (stale.length) console.log('\nStale from the previous install:')
  for (const p of stale) remove(p)
}
saveManifest({ version, home, ownsHome: !project, installedAt: new Date().toISOString(), hosts: after, shared })

const lines = ['', `✔ forge ${version} ${dryRun ? 'would be' : 'is'} installed. Start your agent in a product folder:`, '']
if (hosts.includes('claude')) lines.push('  Claude Code   /forge:kickoff <idea>      /forge:build      /forge:ship <version>')
if (hosts.includes('codex')) lines.push('  Codex         $forge-kickoff <idea>      $forge-build      $forge-ship <version>')
if (hosts.includes('opencode')) lines.push('  OpenCode      /forge-kickoff <idea>      /forge-build      /forge-ship <version>')
if (portable.length) lines.push('', '  Workflows on any host:  node "' + posix(join(home, 'bin', 'forge-run.mjs')) + '" hosts',
  '  Models per tier:        ~/.forge/config.json   (docs/HOSTS.md)')
lines.push('  Remove:                 node scripts/install.mjs --uninstall' + (project ? ' --project "' + project + '"' : ''), '')
console.log(lines.join('\n'))
