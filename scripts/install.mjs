#!/usr/bin/env node
// Install F.O.R.G.E. as a Claude Code plugin from the marketplace bundled in this
// repo. Global by default; pass --project to scope it to one repo. Idempotent.
//   node scripts/install.mjs            # global
//   node scripts/install.mjs --project  # this repo only
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const repo = join(dirname(fileURLToPath(import.meta.url)), '..')
const run = (cmd, tolerant = false) => {
  console.log('$ ' + cmd)
  try {
    execSync(cmd, { stdio: 'inherit', cwd: repo })
  } catch (e) {
    if (!tolerant) throw e
    console.log('  (continuing — already present or non-fatal)')
  }
}

try {
  execSync('claude --version', { stdio: 'ignore' })
} catch {
  console.error('✘ The `claude` CLI is not on PATH. Install Claude Code first: https://code.claude.com')
  process.exit(1)
}

const scope = process.argv.includes('--project') ? ' --scope project' : ''
console.log('Installing the forge plugin' + (scope ? ' (project scope)' : ' (global)') + ' from ' + repo + '\n')

// Adding a marketplace that is already registered under the same name replaces it;
// tolerate a non-zero exit either way and proceed to install.
run('claude plugin marketplace add "' + repo + '"', true)
run('claude plugin install forge@forge' + scope)

console.log([
  '',
  '✔ forge installed. Commands are namespaced /forge:* — run "claude" in any product folder:',
  '',
  '  /forge:kickoff <idea>   new product -> spec -> scaffold (in the current folder)',
  '  /forge:adopt <path>     bring an existing repo under the lifecycle',
  '  /forge:build            build the backlog hands-off',
  '  /forge:feature <F#>     one feature through the loop',
  '  /forge:ship <version>   gated release',
  '',
  '  Dev loop: claude --plugin-dir "' + repo + '"   (then /reload-plugins on edits)',
  '  Update:   claude plugin update forge     Remove: claude plugin uninstall forge',
  '',
].join('\n'))
