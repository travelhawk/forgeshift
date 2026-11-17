#!/usr/bin/env node
// forge-git.mjs — deterministic git reads and writes for /forge:build and /forge:resume.
//
// Both jobs have one correct answer, so they are a script, never an agent turn
// (AGENTS.md rule 12). Run with cwd inside the product repo (any worktree of it).
// Machine-readable KEY=VALUE lines go to stdout; diagnostics go to stderr.
//
// usage:
//   node scripts/forge-git.mjs merge-state <feature-branch> [<baseline_sha>]
//     -> STATE=integrated|reverted|absent   MERGES=<sha,...>
//     Reads HEAD (check out the integration branch first). A merge of the branch counts
//     only while it is in effect: `git revert -m 1 <merge>` undoes it, a revert of that
//     revert restores it, and so on down the chain. `reverted` = merged, but no merge of
//     it is in effect now (the feature is failed). With <baseline_sha>, only commits in
//     <baseline_sha>..HEAD are read.
//   node scripts/forge-git.mjs ignore-local [<path>]
//     -> IGNORED=already|added
//     Makes git ignore <path> (default `.forge/`, the run-state folder). Already ignored
//     (e.g. by .gitignore) -> no change. Otherwise appends <path> to the repo's local
//     `.git/info/exclude`, which never touches the product's tracked files. Safe to run
//     any number of times.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

function git(cwd, args, { allowFail = false } = {}) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' })
  if (r.status !== 0 && !allowFail) {
    throw new Error(`forge-git: git ${args.join(' ')} failed\n${r.stderr || r.error}`)
  }
  return { status: r.status, out: (r.stdout || '').trim() }
}

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Is a merge of <branch> currently in effect on HEAD?
export function mergeState(cwd, branch, baseline) {
  const range = baseline ? [`${baseline}..HEAD`] : ['HEAD']
  // %x1f / %x1e separate fields / records; bodies may hold anything else.
  const log = git(cwd, ['log', '--format=%H%x1f%P%x1f%s%x1f%b%x1e', ...range]).out
  const commits = log.split('\x1e').map(r => r.replace(/^\s+/, '')).filter(Boolean).map(r => {
    const [sha, parents, subject, body] = r.split('\x1f')
    return { sha, parents: parents.split(' ').filter(Boolean), subject, body: body || '' }
  })

  const tip = git(cwd, ['rev-parse', '--verify', '--quiet', `${branch}^{commit}`], { allowFail: true }).out
  const name = escapeRe(branch.replace(/^origin\//, ''))
  const subjectRe = new RegExp(`^Merge (?:remote-tracking )?branch '(?:origin/)?${name}'(?: into .+)?$`)
  const merges = commits.filter(c => c.parents.length > 1 &&
    (subjectRe.test(c.subject) || (tip && c.parents[1] === tip)))
  if (merges.length === 0) return { state: 'absent', merges: [] }

  // `git revert` writes "This reverts commit <sha>." into the body of the revert commit.
  const revertersOf = new Map()
  for (const c of commits) {
    for (const m of c.body.matchAll(/This reverts commit ([0-9a-f]{40})/g)) {
      if (!revertersOf.has(m[1])) revertersOf.set(m[1], [])
      revertersOf.get(m[1]).push(c.sha)
    }
  }
  // A commit is in effect unless a revert of it is in effect: merge -> revert -> revert
  // of the revert reads in effect, failed, in effect again.
  const memo = new Map()
  const inEffect = sha => {
    if (!memo.has(sha)) {
      memo.set(sha, true) // a cycle cannot occur in a DAG; guards against odd bodies
      memo.set(sha, !(revertersOf.get(sha) || []).some(inEffect))
    }
    return memo.get(sha)
  }
  const state = merges.some(m => inEffect(m.sha)) ? 'integrated' : 'reverted'
  return { state, merges: merges.map(m => m.sha) }
}

// Make git ignore <path> (default `.forge/`) without touching tracked files.
export function ignoreLocal(cwd, path = '.forge/') {
  if (!path || /[\r\n]/.test(path) || path.startsWith('#') || path.startsWith('!')) {
    throw new Error(`forge-git: not a plain path to ignore: ${JSON.stringify(path)}`)
  }
  if (git(cwd, ['check-ignore', '-q', '--', path], { allowFail: true }).status === 0) return 'already'
  const exclude = resolve(cwd, git(cwd, ['rev-parse', '--git-path', 'info/exclude']).out)
  mkdirSync(dirname(exclude), { recursive: true })
  const prev = existsSync(exclude) ? readFileSync(exclude, 'utf8') : ''
  appendFileSync(exclude, (prev && !prev.endsWith('\n') ? '\n' : '') + path + '\n')
  return 'added'
}

function main([sub, ...args]) {
  const cwd = process.cwd()
  if (sub === 'merge-state' && args[0]) {
    const { state, merges } = mergeState(cwd, args[0], args[1])
    console.log(`STATE=${state}`)
    console.log(`MERGES=${merges.join(',')}`)
  } else if (sub === 'ignore-local') {
    console.log(`IGNORED=${ignoreLocal(cwd, args[0])}`)
  } else {
    console.error('usage: forge-git.mjs {merge-state <feature-branch> [<baseline_sha>] | ignore-local [<path>]}')
    process.exit(2)
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try { main(process.argv.slice(2)) } catch (e) { console.error(e.message); process.exit(1) }
}
