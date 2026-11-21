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
//     revert restores it, and so on down the chain. `reverted` = merged, but at least one
//     merge of it is not in effect now (the feature is failed: a plain re-merge after a
//     revert does not bring the reverted code back). With <baseline_sha>, only commits in
//     <baseline_sha>..HEAD are read.
//   node scripts/forge-git.mjs ignore-local [<path>]
//     -> IGNORED=already|added
//     Makes git ignore <path> (default `.agents/forge/`, forge's run state; the rest of
//     `.agents/`, e.g. project skills, stays versioned). Already ignored
//     (e.g. by .gitignore) -> no change. Otherwise appends <path> to the repo's local
//     `.git/info/exclude`, which never touches the product's tracked files. Safe to run
//     any number of times.
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

function git(cwd, args, { allowFail = false } = {}) {
  // A long history overflows the default 1 MiB stdout buffer (ENOBUFS).
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024 })
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
  // A merge with a custom subject is still found while the branch exists: its second parent
  // is a commit on the branch's own line. Another feature's tip never is (it reaches this
  // branch only as the second parent of an integration merge).
  const ownLine = new Set(tip ? git(cwd, ['rev-list', '--first-parent', tip]).out.split('\n') : [])
  const merges = commits.filter(c => c.parents.length > 1 &&
    (subjectRe.test(c.subject) || ownLine.has(c.parents[1])))
  if (merges.length === 0) return { state: 'absent', merges: [] }

  // `git revert` writes "This reverts commit <sha>." into the body of the revert commit;
  // with revert.reference / --reference the sha is abbreviated, so match it as a prefix.
  const reverts = []
  for (const c of commits) {
    for (const m of c.body.matchAll(/This reverts commit ([0-9a-f]{7,64})\b/g)) reverts.push({ ref: m[1], by: c.sha })
  }
  const revertersOf = new Map()
  for (const c of commits) {
    const by = reverts.filter(r => c.sha.startsWith(r.ref)).map(r => r.by)
    if (by.length) revertersOf.set(c.sha, by)
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
  // Every merge must be in effect. A plain re-merge after a revert brings only the new
  // commits; the code the revert took out stays out, so the feature is still failed.
  const state = merges.every(m => inEffect(m.sha)) ? 'integrated' : 'reverted'
  return { state, merges: merges.map(m => m.sha) }
}

// Make git ignore <path> (default `.agents/forge/`) without touching tracked files.
export function ignoreLocal(cwd, path = '.agents/forge/') {
  if (!path || /[\r\n]/.test(path) || path.startsWith('#') || path.startsWith('!')) {
    throw new Error(`forge-git: not a plain path to ignore: ${JSON.stringify(path)}`)
  }
  // <path> is relative to the repo root, the same anchor the exclude file uses.
  const top = git(cwd, ['rev-parse', '--show-toplevel']).out
  if (git(top, ['check-ignore', '-q', '--', path], { allowFail: true }).status === 0) return 'already'
  const exclude = resolve(top, git(top, ['rev-parse', '--git-path', 'info/exclude']).out)
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

// realpath on both sides: a FORGE_HOME reached through a symlink or junction still runs main.
const real = f => { try { return realpathSync(f) } catch { return resolve(f) } }
if (process.argv[1] && real(fileURLToPath(import.meta.url)) === real(process.argv[1])) {
  try { main(process.argv.slice(2)) } catch (e) { console.error(e.message); process.exit(1) }
}
