// Comparative eval gate: run every eval scenario at the merge-base and at HEAD
// (working tree), then hold the deltas to the merge bar — quality may not drop,
// cost may not jump past budget, always-loaded prose may not balloon. CI runs
// this on every PR (.github/workflows/evals.yml); locally: npm run eval:gate.
// Deterministic and offline: stubbed agents, no API calls. docs/EVALS.md.
import { execFileSync } from 'node:child_process'
import { appendFileSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadSource, runWorkflow, SCENARIOS, CASES, ROOT } from './sim.mjs'

export const THRESHOLDS = {
  costUpFrac: 0.30,      // total agents or prompt chars: fail beyond +30% vs base
  claudeMdUpChars: 2500, // CLAUDE.md (always-loaded) fails only when it grows by
  claudeMdUpFrac: 0.20,  // BOTH more than this many bytes AND this fraction
}

const PROSE_DIRS = ['.claude/skills', '.claude/agents']

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', cwd: ROOT })

// --- metric collection ---------------------------------------------------------

// Byte sizes of the prose surfaces: CLAUDE.md alone (always loaded into every
// session) and the skills+agents .md total. rev = null reads the working tree.
export function proseSizes(rev) {
  const sizes = { claudeMd: 0, harnessMd: 0 }
  if (rev) {
    const out = git('ls-tree', '-r', '-l', rev, '--', 'CLAUDE.md', ...PROSE_DIRS)
    for (const line of out.split('\n')) {
      // <mode> <type> <sha> <size>\t<path>
      const m = line.match(/^\d+ blob \S+ +(\d+)\t(.+)$/)
      if (!m || !m[2].endsWith('.md')) continue
      if (m[2] === 'CLAUDE.md') sizes.claudeMd = Number(m[1])
      else sizes.harnessMd += Number(m[1])
    }
    return sizes
  }
  // LF-normalized byte count so a CRLF editor save can't skew the working-tree
  // side against the LF git blobs the baseline is measured from.
  const mdBytes = p => Buffer.byteLength(readFileSync(p, 'utf8').replace(/\r\n/g, '\n'))
  sizes.claudeMd = mdBytes(join(ROOT, 'CLAUDE.md'))
  for (const dir of PROSE_DIRS) {
    for (const f of readdirSync(join(ROOT, dir), { recursive: true, withFileTypes: true })) {
      if (f.isFile() && f.name.endsWith('.md')) sizes.harnessMd += mdBytes(join(f.parentPath, f.name))
    }
  }
  return sizes
}

// Run every case at one revision (null = working tree). Never throws per-case:
// a workflow absent at the rev marks { missing }, a crashed run marks { error }.
export async function collectMetrics(rev) {
  const scenarios = {}
  for (const c of CASES) {
    let src
    try { src = loadSource(`.claude/workflows/${c.wf}.js`, rev) }
    catch { scenarios[c.scenario] = { missing: true }; continue }
    try {
      const { args, responder } = SCENARIOS[c.scenario]
      const { result, calls } = await runWorkflow(src, { args, responder: responder() })
      if (result && result.error) throw new Error(result.error)
      let quality = null // null = result shape incomparable at this rev
      try { quality = c.quality ? c.quality(result) : [] } catch { /* keep null */ }
      scenarios[c.scenario] = {
        agents: calls.length,
        chars: calls.reduce((s, x) => s + x.chars, 0),
        quality,
      }
    } catch (e) {
      scenarios[c.scenario] = { error: String((e && e.message) || e).slice(0, 200) }
    }
  }
  return { scenarios, prose: proseSizes(rev) }
}

// --- the merge bar ---------------------------------------------------------------

const pct = (b, h) => `${h > b ? '+' : ''}${Math.round((h / b - 1) * 100)}%`
const k = n => `${Math.round(n / 1000)}k`

// Pure comparator: base/head metric objects in, verdict out. Fail-closed on a
// broken HEAD, fail-open (warn) on an incomparable baseline.
export function compare(base, head) {
  const failures = [], warnings = [], improvements = [], rows = []
  const totals = { base: { agents: 0, chars: 0 }, head: { agents: 0, chars: 0 } }

  for (const c of CASES) {
    const key = c.scenario
    const b = base.scenarios[key], h = head.scenarios[key]
    if (!h || h.missing) {
      failures.push(`${key}: workflow missing at HEAD — if the removal is deliberate, drop its case from evals/sim.mjs in the same PR`)
      continue
    }
    if (h.error) { failures.push(`${key}: run fails at HEAD — ${h.error}`); continue }
    rows.push({
      scenario: `${key} (${c.note})`,
      'agents base': b && !b.missing && !b.error ? b.agents : '—', 'agents head': h.agents,
      'prompt base': b && !b.missing && !b.error ? k(b.chars) : '—', 'prompt head': k(h.chars),
    })
    if (!b || b.missing) { warnings.push(`${key}: new at HEAD — no baseline to compare, absolute suite still applies`); continue }
    if (b.error) { warnings.push(`${key}: baseline run incomparable (${b.error}) — comparison skipped`); continue }

    totals.base.agents += b.agents; totals.head.agents += h.agents
    totals.base.chars += b.chars; totals.head.chars += h.chars

    if (h.quality === null) {
      // Fail-closed: a HEAD result the extractor can't read means quality went
      // uncompared — the workflow and its CASES extractor ship in the same PR.
      failures.push(`${key}: quality extractor failed on the HEAD result — update its CASES entry in evals/sim.mjs in the same PR`)
    } else if (b.quality === null) {
      warnings.push(`${key}: baseline quality shape incomparable — quality skipped, cost still compared`)
    } else {
      const prev = Object.fromEntries(b.quality.map(q => [q.metric, q.value]))
      for (const q of h.quality) {
        if (!(q.metric in prev)) continue
        const worse = q.better === 'higher' ? q.value < prev[q.metric] : q.value > prev[q.metric]
        const better = q.better === 'higher' ? q.value > prev[q.metric] : q.value < prev[q.metric]
        if (worse) failures.push(`${key}: ${q.metric} regressed ${prev[q.metric]} -> ${q.value}`)
        else if (better) improvements.push(`${key}: ${q.metric} improved ${prev[q.metric]} -> ${q.value}`)
      }
    }
    if (h.agents > b.agents) warnings.push(`${key}: agents ${b.agents} -> ${h.agents} (${pct(b.agents, h.agents)})`)
    else if (h.agents < b.agents) improvements.push(`${key}: agents ${b.agents} -> ${h.agents}`)
    if (h.chars > b.chars * 1.02) warnings.push(`${key}: prompt volume ${k(b.chars)} -> ${k(h.chars)} chars (${pct(b.chars, h.chars)})`)
    else if (h.chars < b.chars * 0.98) improvements.push(`${key}: prompt volume ${k(b.chars)} -> ${k(h.chars)} chars`)
  }

  // Cost budget over the comparable set: a jump past +30% total is "much worse".
  for (const [label, sel] of [['agents spawned', 'agents'], ['prompt chars', 'chars']]) {
    const b = totals.base[sel], h = totals.head[sel]
    if (b > 0 && h > b * (1 + THRESHOLDS.costUpFrac)) {
      failures.push(`total ${label} rose ${pct(b, h)} (budget: +${THRESHOLDS.costUpFrac * 100}%): ${sel === 'chars' ? k(b) : b} -> ${sel === 'chars' ? k(h) : h}`)
    }
  }

  // Always-loaded prose: every product session pays for CLAUDE.md.
  const bMd = base.prose.claudeMd, hMd = head.prose.claudeMd
  if (hMd - bMd > THRESHOLDS.claudeMdUpChars && hMd > bMd * (1 + THRESHOLDS.claudeMdUpFrac)) {
    failures.push(`CLAUDE.md grew ${bMd} -> ${hMd} bytes (${pct(bMd, hMd)}) — always-loaded prose budget is +${THRESHOLDS.claudeMdUpChars} bytes / +${THRESHOLDS.claudeMdUpFrac * 100}%`)
  } else if (hMd > bMd) warnings.push(`CLAUDE.md grew ${bMd} -> ${hMd} bytes (always loaded)`)
  else if (hMd < bMd) improvements.push(`CLAUDE.md shrank ${bMd} -> ${hMd} bytes`)
  const bHm = base.prose.harnessMd, hHm = head.prose.harnessMd
  if (bHm > 0 && hHm > bHm * 1.10) warnings.push(`skills+agents prose grew ${pct(bHm, hHm)} (${k(bHm)} -> ${k(hHm)} bytes)`)
  else if (hHm < bHm) improvements.push(`skills+agents prose shrank ${k(bHm)} -> ${k(hHm)} bytes`)

  return { verdict: failures.length ? 'fail' : 'pass', failures, warnings, improvements, rows, totals }
}

// --- CLI -------------------------------------------------------------------------

function resolveBaseline(baseArg) {
  const candidates = baseArg ? [baseArg] : ['origin/main', 'main']
  for (const c of candidates) {
    try { return git('merge-base', c, 'HEAD').trim() } catch { /* next */ }
  }
  throw new Error(`cannot resolve a baseline (tried: ${candidates.join(', ')}) — pass one explicitly: node evals/gate.mjs --base <rev>`)
}

function render({ verdict, failures, warnings, improvements, rows }, baseline) {
  const lines = [`## Eval gate: ${verdict === 'pass' ? 'PASS ✅' : 'FAIL ❌'}`, '', `Baseline: \`${baseline.slice(0, 10)}\` (merge-base) vs HEAD (working tree). Deterministic sim — stubbed agents, no API calls.`, '']
  const section = (title, items, mark) => {
    if (!items.length) return
    lines.push(`**${title}**`, ...items.map(i => `- ${mark} ${i}`), '')
  }
  section('Regressions (blocking)', failures, '❌')
  section('Improvements', improvements, '✅')
  section('Warnings (not blocking)', warnings, '⚠️')
  if (rows.length) {
    lines.push('| scenario | agents base | agents head | prompt base | prompt head |', '|---|---|---|---|---|')
    for (const r of rows) lines.push(`| ${r.scenario} | ${r['agents base']} | ${r['agents head']} | ${r['prompt base']} | ${r['prompt head']} |`)
    lines.push('')
  }
  return lines.join('\n')
}

async function main() {
  const baseIdx = process.argv.indexOf('--base')
  const baseline = resolveBaseline(baseIdx > -1 ? process.argv[baseIdx + 1] : null)
  const [base, head] = [await collectMetrics(baseline), await collectMetrics(null)]
  const outcome = compare(base, head)
  const md = render(outcome, baseline)
  console.log(md)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n')
  process.exitCode = outcome.verdict === 'pass' ? 0 : 1
}

// realpath both sides: Node realpaths the ESM entry, so a plain path compare
// fails open (gate silently does nothing) when the repo sits behind a symlink,
// junction, or subst drive.
const isMain = (() => {
  if (!process.argv[1]) return false
  try {
    return realpathSync(resolve(process.argv[1])).toLowerCase() ===
      realpathSync(fileURLToPath(import.meta.url)).toLowerCase()
  } catch { return false }
})()
if (isMain) await main()
