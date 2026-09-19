#!/usr/bin/env node
// Install F.O.R.G.E. for every agent CLI on this machine. Idempotent.
//   node scripts/install.mjs                       # every detected host, global
//   node scripts/install.mjs --host codex          # one host: claude | codex | opencode | all
//   node scripts/install.mjs --project [dir]       # scope to one repo (default: cwd)
//   node scripts/install.mjs --dry-run             # print what would be written
//   node scripts/install.mjs --uninstall           # remove exactly what the manifest lists
//
// Claude Code loads this repo as a plugin — skills/, agents/ and workflows/ are read as they
// are. Every other host gets a rendered copy (lib/render.mjs) plus the harness itself at
// ~/.forge/home, which is where the rendered skills resolve $FORGE_HOME.
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, rmdirSync, writeFileSync } from 'node:fs'
import { HOSTS, installedHosts, loadConfig, which } from '../lib/hosts.mjs'
import { renderSkill, renderCodexAgent, renderOpencodeAgent, renderOpencodeCommand } from '../lib/render.mjs'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// What a skill or the runner reads at run time. No tests, no evals, no private references/.
const HARNESS = ['AGENTS.md', 'package.json', '.claude-plugin', 'agents', 'bin', 'docs', 'lib', 'scripts', 'skills', 'templates', 'workflows']

const argv = process.argv.slice(2)
const flag = name => argv.includes(name)
const value = name => {
  const i = argv.indexOf(name)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null
}
const dryRun = flag('--dry-run')
const project = flag('--project') ? resolve(value('--project') || process.cwd()) : null
const home = resolve(value('--home') || join(homedir(), '.forge', 'home'))
const manifestPath = project ? join(project, '.forge', 'install.json') : join(homedir(), '.forge', 'install.json')
const posix = p => p.replace(/\\/g, '/')

const wanted = value('--host') || 'detected'
const hosts = wanted === 'all' ? Object.keys(HOSTS)
  : wanted === 'detected' ? installedHosts()
  : wanted.split(',')
for (const h of hosts) {
  if (!HOSTS[h]) { console.error(`✘ Unknown host "${h}". Known: ${Object.keys(HOSTS).join(', ')}, all.`); process.exit(1) }
}
if (!hosts.length) { console.error(`✘ No agent CLI on PATH (looked for: ${Object.keys(HOSTS).join(', ')}). Install one, or pass --host.`); process.exit(1) }

const readManifest = () => { try { return JSON.parse(readFileSync(manifestPath, 'utf8')) } catch { return { paths: [] } } }
const remove = p => {
  console.log('  − ' + p)
  if (dryRun) return
  rmSync(p, { recursive: true, force: true })
  // Drop the folders we created once they are empty; rmdir refuses anything that is not.
  for (let d = dirname(p), i = 0; i < 3; d = dirname(d), i++) { try { rmdirSync(d) } catch { break } }
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
function claude(uninstall) {
  if (!which('claude')) return console.log('· claude: CLI not on PATH, skipped')
  if (uninstall) return run('claude plugin uninstall forge', project || repo, true)
  // Re-adding a marketplace registered under the same name replaces it.
  run(`claude plugin marketplace add "${repo}"`, repo, true)
  run('claude plugin install forge@forge' + (project ? ' --scope project' : ''), project || repo)
}

// ── Every other host: rendered files ────────────────────────────────────────────
// Where each host reads from. Skills share one Agent Skills directory that Codex and
// OpenCode both scan, so the playbooks exist once per scope.
function roots() {
  const base = project || homedir()
  return {
    skills: join(base, '.agents', 'skills'),
    codexAgents: join(base, '.codex', 'agents'),
    opencode: project ? join(project, '.opencode') : join(homedir(), '.config', 'opencode'),
  }
}

function plan() {
  const r = roots()
  const config = loadConfig()
  const models = h => config.hosts?.[h]?.models || {}
  const opts = { home: value('--home') ? posix(home) : undefined }
  const files = []
  const skillNames = readdirSync(join(repo, 'skills')).filter(n => existsSync(join(repo, 'skills', n, 'SKILL.md')))
  const agentFiles = readdirSync(join(repo, 'agents')).filter(f => /^forge-.*\.md$/.test(f))
  const portable = hosts.filter(h => h !== 'claude')
  if (portable.length) {
    for (const name of skillNames) {
      const src = readFileSync(join(repo, 'skills', name, 'SKILL.md'), 'utf8')
      const s = renderSkill(name, src, opts)
      files.push({ path: join(r.skills, s.dir, 'SKILL.md'), content: s.content, owns: join(r.skills, s.dir) })
      if (portable.includes('opencode')) {
        const c = renderOpencodeCommand(name, src)
        files.push({ path: join(r.opencode, 'commands', c.file), content: c.content })
      }
    }
  }
  for (const f of agentFiles) {
    const src = readFileSync(join(repo, 'agents', f), 'utf8')
    if (portable.includes('codex')) {
      const a = renderCodexAgent(src, models('codex'), opts)
      files.push({ path: join(r.codexAgents, a.file), content: a.content })
    }
    if (portable.includes('opencode')) {
      const a = renderOpencodeAgent(src, models('opencode'), opts)
      files.push({ path: join(r.opencode, 'agents', a.file), content: a.content })
    }
  }
  return { files, portable }
}

function installPortable() {
  const { files, portable } = plan()
  if (!portable.length) return []
  console.log(`\nHarness → ${home}`)
  // The copy replaces the directory, so it must be ours: empty, absent, or a previous install.
  const ours = !existsSync(home) || !readdirSync(home).length || existsSync(join(home, 'workflows', 'release-gate.js'))
  if (!ours) { console.error(`✘ ${home} exists and is not a forge install — refusing to replace it.`); process.exit(1) }
  if (!dryRun) {
    // A fresh copy each time: a file deleted from the repo must not survive in the install.
    rmSync(home, { recursive: true, force: true })
    mkdirSync(home, { recursive: true })
    for (const entry of HARNESS) {
      if (existsSync(join(repo, entry))) cpSync(join(repo, entry), join(home, entry), { recursive: true })
    }
  }
  for (const f of files) {
    console.log('  + ' + f.path)
    if (dryRun) continue
    mkdirSync(dirname(f.path), { recursive: true })
    writeFileSync(f.path, f.content)
  }
  return [home, ...files.map(f => f.owns || f.path)]
}

// ── main ────────────────────────────────────────────────────────────────────────
const before = readManifest()

if (flag('--uninstall')) {
  console.log(`Uninstalling forge (${project ? 'project ' + project : 'global'}) — hosts: ${hosts.join(', ')}`)
  if (hosts.includes('claude')) claude(true)
  for (const p of before.paths) remove(p)
  if (existsSync(manifestPath)) remove(manifestPath)
  console.log(before.paths.length ? '\n✔ removed.' : '\n· no portable install recorded at ' + manifestPath)
  process.exit(0)
}

const version = JSON.parse(readFileSync(join(repo, '.claude-plugin', 'plugin.json'), 'utf8')).version
console.log(`Installing forge ${version} (${project ? 'project ' + project : 'global'}) — hosts: ${hosts.join(', ')}${dryRun ? '  [dry run]' : ''}\n`)
if (hosts.includes('claude')) claude(false)
const paths = installPortable()

// Whatever the last install wrote and this one did not is stale: a renamed or removed skill.
const stale = before.paths.filter(p => !paths.includes(p))
if (stale.length) console.log('\nStale from the previous install:')
for (const p of stale) remove(p)

if (paths.length && !dryRun) {
  mkdirSync(dirname(manifestPath), { recursive: true })
  writeFileSync(manifestPath, JSON.stringify({ version, hosts, home, installedAt: new Date().toISOString(), paths }, null, 2) + '\n')
}

const lines = ['', `✔ forge ${version} ${dryRun ? 'would be' : 'is'} installed. Start your agent in a product folder:`, '']
if (hosts.includes('claude')) lines.push('  Claude Code   /forge:kickoff <idea>      /forge:build      /forge:ship <version>')
if (hosts.includes('codex')) lines.push('  Codex         $forge-kickoff <idea>      $forge-build      $forge-ship <version>')
if (hosts.includes('opencode')) lines.push('  OpenCode      /forge-kickoff <idea>      /forge-build      /forge-ship <version>')
lines.push('', '  Workflows on any host:  node "' + posix(join(home, 'bin', 'forge-run.mjs')) + '" hosts',
  '  Models per tier:        ~/.forge/config.json   (docs/HOSTS.md)',
  '  Remove:                 node scripts/install.mjs --uninstall' + (project ? ' --project "' + project + '"' : ''), '')
console.log(lines.join('\n'))
