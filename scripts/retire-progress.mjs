#!/usr/bin/env node
// retire-progress.mjs — move a product from the build phase to the issue phase.
//
// PROGRESS.md is the tracker and handoff while a product is built to its first
// release. After that, open work lives in GitHub issues and evidence in PRs, so
// a second tracker would only drift. This script turns every unchecked F#-row
// into a GitHub issue (label `forge`) and removes PROGRESS.md from the index.
// It does not commit: the calling skill commits with its own message.
// Parsing rows has one correct answer, so it is a script, never an agent turn.
//
// usage: node scripts/retire-progress.mjs [--dry-run] [product-dir]
// --dry-run prints the planned issues as JSON and changes nothing.
import { readFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// `- [ ] F3 — Admin user list — **T3** (read-only, same-tenant) — <done-criteria>`
const ROW = /^- \[ \] (F\d+) — (.+?) — \*\*(T[123?])\*\*(?: \((.*?)\))? — (.+)$/

export function parseOpenFeatures(src) {
  const out = []
  for (const line of src.split(/\r?\n/)) {
    const m = line.trim().match(ROW)
    if (!m) continue
    const [, id, name, tier, why, criteria] = m
    out.push({
      id,
      title: name.trim(),
      body: [
        `**Done when:** ${criteria.trim()}`,
        '',
        `Risk tier: ${tier}${why ? ` — ${why.trim()}` : ''}`,
        '',
        `_Moved from PROGRESS.md (${id}) when the product left the build phase._`,
      ].join('\n'),
    })
  }
  return out
}

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8' })
  if (r.status !== 0) {
    console.error(`retire-progress: ${cmd} ${args.join(' ')} failed\n${r.stderr || r.error}`)
    process.exit(1)
  }
  return r.stdout.trim()
}

function main(argv) {
  const dryRun = argv.includes('--dry-run')
  const dir = argv.find(a => !a.startsWith('--')) ?? process.cwd()
  const file = join(dir, 'PROGRESS.md')
  if (!existsSync(file)) {
    console.log('retire-progress: no PROGRESS.md — product is already in the issue phase')
    return
  }
  const features = parseOpenFeatures(readFileSync(file, 'utf8'))
  if (dryRun) {
    console.log(JSON.stringify(features, null, 2))
    return
  }
  run('gh', ['label', 'create', 'forge', '--force', '--description', 'Feature tracked by forge'], dir)
  for (const f of features) {
    const url = run('gh', ['issue', 'create', '--title', f.title, '--body', f.body, '--label', 'forge'], dir)
    console.log(`${f.id} → ${url}`)
  }
  run('git', ['rm', '-q', 'PROGRESS.md'], dir)
  console.log(`retire-progress: ${features.length} open feature(s) moved to issues; PROGRESS.md removed (not committed)`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2))
