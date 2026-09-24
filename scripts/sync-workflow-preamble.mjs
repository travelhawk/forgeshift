#!/usr/bin/env node
// Rewrite the args guard in every workflows/*.js from lib/workflow-preamble.mjs.
//
//   node scripts/sync-workflow-preamble.mjs            # fix every workflow in place
//   node scripts/sync-workflow-preamble.mjs --check    # report drift, change nothing (exit 1)
//   node scripts/sync-workflow-preamble.mjs [--check] <dir>   # against a copy, not this repo
//
// The guard is duplicated on purpose — a workflow script body cannot import — so this
// script is the only way it is edited. tests/harness.test.mjs runs the same comparison.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ARGS_GUARD, TAG, END } from '../lib/workflow-preamble.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const argv = process.argv.slice(2)
const check = argv.includes('--check')
// A directory argument lets the suite check a copy; without one it is this repo's workflows.
const dir = resolve(argv.find(a => !a.startsWith('--')) || join(ROOT, 'workflows'))

let drift = 0
let missing = 0
for (const file of readdirSync(dir).filter(f => f.endsWith('.js')).sort()) {
  const path = join(dir, file)
  const src = readFileSync(path, 'utf8')
  // The opening sentinel carries a "regenerate me" note, so match only its stable tag.
  const start = src.indexOf(TAG)
  const end = src.indexOf(END)
  if (start === -1 || end === -1 || end < start) {
    missing++
    console.error(`${file}: no forge:args-guard sentinels — add them around the args block by hand once.`)
    continue
  }
  const current = src.slice(start, end + END.length)
  if (current === ARGS_GUARD) continue
  drift++
  if (check) { console.error(`${file}: args guard differs from lib/workflow-preamble.mjs`); continue }
  writeFileSync(path, src.slice(0, start) + ARGS_GUARD + src.slice(end + END.length))
  console.log(`${file}: args guard updated`)
}

if (missing) process.exit(1)
if (check && drift) { console.error(`\n${drift} workflow(s) drifted — run: node scripts/sync-workflow-preamble.mjs`); process.exit(1) }
console.log(check ? 'args guard in sync across every workflow' : `done — ${drift} rewritten`)
