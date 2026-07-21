// F.O.R.G.E. harness regression suite — static contract checks over skills,
// agents, workflows, and docs. Zero dependencies; run with `npm test`.
// Every harness change MUST keep this green; every optimization adds its
// invariant here so a later edit can't silently regress it.
import { test, suite } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const p = (...s) => join(ROOT, ...s)
const read = (...s) => readFileSync(p(...s), 'utf8')

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

// Strip // and /* */ comments from JSONC (settings.json is comment-tolerant), while
// leaving any `//` that lives inside a string (e.g. "http://localhost") untouched.
const stripJsonc = (s) =>
  s.replace(/"(?:[^"\\]|\\.)*"|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m) => (m[0] === '"' ? m : ''))

// --- inventory -------------------------------------------------------------
const workflowDir = p('.claude', 'workflows')
const skillDir = p('.claude', 'skills')
const agentDir = p('.claude', 'agents')
const workflows = readdirSync(workflowDir).filter(f => f.endsWith('.js'))
const skills = readdirSync(skillDir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)
const agents = readdirSync(agentDir).filter(f => f.endsWith('.md'))
const agentNames = new Set(agents.map(f => basename(f, '.md')))

function frontmatter(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!m) return null
  const fm = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z-]+):\s*(.*)$/)
    if (kv) fm[kv[1]] = kv[2].replace(/^["']|["']$/g, '')
  }
  return fm
}

// --- workflows ---------------------------------------------------------------
suite('workflows', () => {
  for (const f of workflows) {
    const src = readFileSync(join(workflowDir, f), 'utf8')

    test(`${f}: valid syntax in the workflow runtime shape (async body, no import/export)`, () => {
      // The runtime wraps the script in an async context where top-level
      // `return`/`await` are legal and `export const meta` is the only export.
      const body = src.replace(/^export\s+const\s+meta/m, 'const meta')
      assert.ok(!/^import\s/m.test(src), 'workflow scripts cannot use import')
      // Throws SyntaxError (failing the test) if the script does not parse.
      // No API params injected: scripts may shadow agent/log locally, and
      // unresolved identifiers are a runtime concern, not a parse concern.
      new AsyncFunction(body)
    })

    test(`${f}: meta block — name matches file, description present`, () => {
      const metaBlock = src.match(/export const meta = \{[\s\S]*?\r?\n\}/)
      assert.ok(metaBlock, 'export const meta = { ... } block at top')
      assert.match(metaBlock[0], new RegExp(`name:\\s*'${basename(f, '.js')}'`), 'meta.name matches filename')
      assert.match(metaBlock[0], /description:\s*'.+'/, 'meta.description present')
    })

    test(`${f}: meta.phases match phase()/phase: usage`, () => {
      const metaBlock = src.match(/export const meta = \{[\s\S]*?\r?\n\}/)[0]
      const declared = [...metaBlock.matchAll(/title:\s*'([^']+)'/g)].map(m => m[1])
      const used = new Set([
        ...[...src.matchAll(/phase\('([^']+)'\)/g)].map(m => m[1]),
        ...[...src.matchAll(/phase:\s*'([^']+)'/g)].map(m => m[1]),
      ])
      used.delete('') // defensive
      for (const t of declared) assert.ok(used.has(t), `declared phase "${t}" is used in the script`)
      for (const t of used) {
        if (t === 'title') continue
        assert.ok(declared.includes(t), `used phase "${t}" is declared in meta.phases`)
      }
    })

    test(`${f}: no runtime-banned globals (Date.now / Math.random / new Date())`, () => {
      assert.ok(!/Date\.now\(/.test(src), 'Date.now() is banned in workflow scripts')
      assert.ok(!/Math\.random\(/.test(src), 'Math.random() is banned in workflow scripts')
      assert.ok(!/new Date\(\)/.test(src), 'argless new Date() is banned in workflow scripts')
    })
  }
})

// --- skills ------------------------------------------------------------------
suite('skills', () => {
  for (const s of skills) {
    test(`skill ${s}: SKILL.md frontmatter (name matches dir, description present)`, () => {
      const src = read('.claude', 'skills', s, 'SKILL.md')
      const fm = frontmatter(src)
      assert.ok(fm, 'frontmatter block present')
      assert.equal(fm.name, s, 'frontmatter name matches directory')
      assert.ok(fm.description && fm.description.length > 20, 'meaningful description')
    })
  }
})

// --- agents --------------------------------------------------------------
suite('agents', () => {
  const VALID_MODELS = new Set(['inherit', 'opus', 'sonnet', 'haiku'])
  for (const f of agents) {
    test(`agent ${f}: frontmatter (name matches file, description, valid model)`, () => {
      const fm = frontmatter(readFileSync(join(agentDir, f), 'utf8'))
      assert.ok(fm, 'frontmatter block present')
      assert.equal(fm.name, basename(f, '.md'), 'frontmatter name matches filename')
      assert.ok(fm.description && fm.description.length > 20, 'meaningful description')
      if (fm.model) assert.ok(VALID_MODELS.has(fm.model), `model "${fm.model}" is a known tier`)
    })
  }
})

// --- cross-references ------------------------------------------------------
suite('cross-references', () => {
  const claudeMd = read('CLAUDE.md')

  test('every command in the CLAUDE.md command map resolves to a /forge: skill', () => {
    // Plugin commands are namespaced /forge:<name>; the map lists them that way.
    const cmds = [...claudeMd.matchAll(/^\| `\/forge:([a-z-]+)[ `]/gm)].map(m => m[1])
    assert.ok(cmds.length >= 10, `command map found (${cmds.length} commands)`)
    for (const c of cmds) {
      const hasSkill = skills.includes(c)
      const hasWorkflow = workflows.includes(`${c}.js`)
      assert.ok(hasSkill || hasWorkflow, `/forge:${c} exists as a skill or workflow`)
    }
  })

  test('every forge-* agent referenced anywhere exists in .claude/agents/', () => {
    // Terms that look like agent names but are prose (or shell scripts), not agents.
    const NON_AGENT_TERMS = new Set([
      'forge-agents', 'forge-themed', 'forge-home', 'forge-harness', 'forge-worktree', 'forge-pr',
    ])
    const sources = [
      ['CLAUDE.md', claudeMd],
      ...skills.map(s => [`skills/${s}`, read('.claude', 'skills', s, 'SKILL.md')]),
      ...workflows.map(w => [`workflows/${w}`, readFileSync(join(workflowDir, w), 'utf8')]),
      ...readdirSync(p('docs')).filter(f => f.endsWith('.md')).map(f => [`docs/${f}`, read('docs', f)]),
    ]
    for (const [name, src] of sources) {
      for (const m of src.matchAll(/forge-[a-z]+/g)) {
        if (NON_AGENT_TERMS.has(m[0])) continue
        assert.ok(agentNames.has(m[0]), `${name} references ${m[0]} which exists as an agent`)
      }
    }
  })

  test('every templates/*.md referenced by a skill exists', () => {
    for (const s of skills) {
      const src = read('.claude', 'skills', s, 'SKILL.md')
      for (const m of src.matchAll(/templates\/([A-Z-]+\.md)/g)) {
        assert.ok(existsSync(p('templates', m[1])), `skill ${s} references templates/${m[1]} which exists`)
      }
    }
  })

  test('core harness docs exist and playbooks are non-empty', () => {
    for (const d of ['LIFECYCLE.md', 'RISK-TIERS.md', 'COMMANDS.md', 'MODEL-ROUTING.md', 'ORCHESTRATION.md']) {
      assert.ok(existsSync(p('docs', d)), `docs/${d} exists`)
    }
    const playbooks = readdirSync(p('docs', 'playbooks')).filter(f => f.endsWith('.md'))
    assert.ok(playbooks.length >= 5, `playbooks present (${playbooks.length})`)
  })

  test('workflows referenced by skills exist as workflow files', () => {
    const wfNames = new Set(workflows.map(w => basename(w, '.js')))
    for (const wf of ['deep-review', 'feature-pipeline', 'release-gate', 'design-panel']) {
      assert.ok(wfNames.has(wf), `workflow ${wf} exists`)
    }
  })

  test('/understand is a skill, not a workflow (demoted — no gate to justify the runtime)', () => {
    assert.ok(skills.includes('understand'), '/understand exists as a skill')
    assert.ok(!workflows.includes('understand.js'), 'understand.js workflow removed')
    const src = read('.claude', 'skills', 'understand', 'SKILL.md')
    assert.match(src, /scratchpad/i, 'readers hand off maps via scratchpad files (context hygiene)')
    assert.match(src, /Refuse to map the forge plugin/i, 'keeps the target sanity check the preflight did')
  })
})

// --- safety invariants (the hard rules, made executable) ---------------------
suite('safety invariants', () => {
  test('.gitignore covers projects/ and references/', () => {
    const gi = read('.gitignore')
    assert.match(gi, /^projects\/\*?$/m, 'projects/ gitignored')
    assert.match(gi, /^references\/\*?$/m, 'references/ gitignored')
  })

  test('no project-level hooks (global hooks would double-fire)', () => {
    assert.ok(!existsSync(p('.claude', 'hooks')), 'no .claude/hooks directory')
    for (const f of ['settings.json', 'settings.local.json']) {
      if (!existsSync(p('.claude', f))) continue
      const cfg = JSON.parse(stripJsonc(read('.claude', f)))
      assert.ok(!('hooks' in cfg), `no hooks key in .claude/${f}`)
    }
  })

  test('/feature integrates via PR — never straight to main', () => {
    const src = read('.claude', 'skills', 'feature', 'SKILL.md')
    assert.match(src, /never commit a\s+feature straight to main/i)
    assert.match(src, /gh pr create/, 'PR flow present')
  })

  test('/forge keeps its hard stops (no force-push, no merging failed features)', () => {
    const src = read('.claude', 'skills', 'build', 'SKILL.md')
    assert.match(src, /force-push/i)
    assert.match(src, /never merges a feature that failed verification/i)
  })

  test('/forge finish includes a docs pass: forge-etcher writes the README, commands verified', () => {
    const src = read('.claude', 'skills', 'build', 'SKILL.md')
    assert.match(src, /## 5c\. Documentation pass/, 'the docs pass is its own finish section')
    assert.match(src, /forge-etcher/, 'the docs pass is delegated to forge-etcher')
    assert.match(src, /README/, 'the docs pass owns the README')
    assert.match(src, /Verify every command it documents by running it/i, 'documented commands are run, not claimed')
  })

  test('risk tiers wired: T1/T2/T3 handled by feature-pipeline, doc exists', () => {
    const src = readFileSync(join(workflowDir, 'feature-pipeline.js'), 'utf8')
    for (const t of ['T1', 'T2', 'T3']) assert.ok(src.includes(`'${t}'`), `${t} literal handled`)
    assert.ok(existsSync(p('docs', 'RISK-TIERS.md')))
  })

  test('all lifecycle templates exist', () => {
    for (const t of ['SPEC.md', 'PROGRESS.md', 'PROJECT-CLAUDE.md', 'ADR.md', 'FEATURE.md', 'RELEASE-CHECKLIST.md', 'RELEASE-KIT.md']) {
      assert.ok(existsSync(p('templates', t)), `templates/${t} exists`)
    }
  })

  test('feature-pipeline fails closed on T1 security silence', () => {
    const src = readFileSync(join(workflowDir, 'feature-pipeline.js'), 'utf8')
    assert.match(src, /security pass agent failed/, 'missing security pass sinks the feature')
  })

  test('reviewers are read-only; quench treats contract-surface changes as first-class', () => {
    const q = read('.claude', 'agents', 'forge-quench.md')
    const w = read('.claude', 'agents', 'forge-warden.md')
    assert.match(q, /read-only/i, 'quench is declared read-only — closes the Bash-write hole')
    assert.match(w, /read-only/i, 'warden is declared read-only')
    assert.match(q, /Contract-surface/i, 'quench flags public signature/route/schema/CLI/config changes')
  })

  test('reversibility decision policy: spec template + blueprint + /forge:build report', () => {
    const spec = read('templates', 'SPEC.md')
    assert.match(spec, /## Decision policy/, 'every spec carries the decision policy')
    assert.match(spec, /two-way door/i, 'reversible calls are decided-and-logged, not asked mid-run')
    assert.match(read('.claude', 'agents', 'forge-blueprint.md'), /one-way door/i, 'blueprint escalates only one-way doors')
    assert.match(read('.claude', 'skills', 'build', 'SKILL.md'), /Autonomous decisions/i, 'forge report surfaces the autonomous calls for review')
  })
})

// --- cost-optimization invariants (each optimization locks its shape here) ---
suite('cost optimizations', () => {
  test('design-panel defaults to the lean panel (3 designers, judge+synthesizer combined)', () => {
    const src = readFileSync(join(workflowDir, 'design-panel.js'), 'utf8')
    assert.match(src, /a\.panel === 'wide'/, 'wide panel is explicit opt-in')
    assert.match(src, /wide \? ANGLES : ANGLES\.filter/, 'lean drops a designer')
    assert.match(src, /label: 'judge\+synthesize'/, 'lean judge also synthesizes (one agent, two tasks)')
  })

  test('feature-pipeline: T3 features build direct — no plan agent', () => {
    const src = readFileSync(join(workflowDir, 'feature-pipeline.js'), 'utf8')
    assert.match(src, /f\.tier === 'T3'\s*\?\s*\{/, 'T3 gets a synthetic brief, not an agent call')
    assert.match(src, /T3 direct build/, 'synthetic brief marks itself')
  })

  test('/forge:build: waves of 1-3 features skip the workflow (direct /forge:feature loop)', () => {
    const src = read('.claude', 'skills', 'build', 'SKILL.md')
    assert.match(src, /Small-wave shortcut/, 'shortcut documented in Execute step')
    assert.match(src, /Waves of 4\+/, 'pipeline reserved for 4+ feature waves (prompt-driven path is the robust default below that)')
  })

  test('/kickoff hands off to /forge in the SAME session', () => {
    const src = read('.claude', 'skills', 'kickoff', 'SKILL.md')
    assert.match(src, /same session/i, 'same-session continuation offered')
    assert.match(src, /no new session needed/i, 'new session is the exception, not the rule')
  })

  test('hard rules include slim output + regression-suite gate', () => {
    const src = read('CLAUDE.md')
    assert.match(src, /\*\*Slim output\.\*\*/, 'output-discipline hard rule present')
    assert.match(src, /npm test/, 'regression suite wired into the hard rules')
  })

  test('deep-review: 3 merged lenses, batch refuter for medium/low, fail-closed', () => {
    const src = readFileSync(join(workflowDir, 'deep-review.js'), 'utf8')
    const lenses = [...src.matchAll(/\{ key: '([a-z-]+)', prompt:/g)].map(m => m[1])
    assert.deepEqual(lenses, ['bugs', 'boundaries', 'craft'], 'exactly 3 merged review lenses')
    assert.match(src, /label: 'verify:batch'/, 'medium/low findings refuted in one batch agent')
    assert.match(src, /'UNVERIFIED'/, 'missing verdicts stay open, never a free pass')
  })

  test('release-gate: 6 gates run by 3 agents, fail-closed on missing gates', () => {
    const src = readFileSync(join(workflowDir, 'release-gate.js'), 'utf8')
    assert.match(src, /label: 'gate:static\+docs'/, 'hygiene gates share one agent')
    assert.match(src, /label: 'gate:tests\+build\+runtime'/, 'execute gates share one runner')
    assert.match(src, /gate agent failed to report/, 'missing gate is a blocker')
    assert.match(src, /label: 'gate:security'/, 'security keeps its own session-model agent')
  })

  test('subagents are scope-boxed — bounded reads, no wholesale spec/memory crawls', () => {
    const dr = readFileSync(join(workflowDir, 'deep-review.js'), 'utf8')
    assert.match(dr, /CONTEXT BUDGET/, 'review lenses carry an explicit context budget')
    const dp = readFileSync(join(workflowDir, 'design-panel.js'), 'utf8')
    assert.match(dp, /SCOPE-BOXED/, 'designers get bounded exploration')
    assert.ok(!/Explore the target repository if you need ground truth/.test(dp), 'unbounded judge exploration removed')
    const fp = readFileSync(join(workflowDir, 'feature-pipeline.js'), 'utf8')
    assert.match(fp, /do NOT re-open the full spec/i, 'builders live off the brief')
    assert.match(read('CLAUDE.md'), /Scope-box every subagent/, 'delegation rule present')
    assert.match(read('docs', 'ORCHESTRATION.md'), /Scope-box the context/, 'orchestration contract rule present')
  })

  test('test volume is budgeted — builders capped at behavior-level tests', () => {
    assert.match(read('CLAUDE.md'), /Tests are load-bearing — and budgeted/, 'hard rule 1 carries the budget')
    assert.match(read('CLAUDE.md'), /never a unit\s+test per function/, 'anti-padding clause in hard rules')
    assert.match(read('.claude', 'agents', 'forge-hammer.md'), /Tests first, tests budgeted/, 'hammer has the budget')
    const fp = readFileSync(join(workflowDir, 'feature-pipeline.js'), 'utf8')
    assert.match(fp, /not a unit test per function/, 'plan schema bounds the test plan')
  })

  test('workflow agents cd standalone — chained cd trips permission prompts', () => {
    for (const wf of ['deep-review', 'design-panel', 'feature-pipeline', 'release-gate']) {
      const src = readFileSync(join(workflowDir, `${wf}.js`), 'utf8')
      assert.match(src, /standalone cd into it/, `${wf}: AT preamble mandates a standalone cd`)
      assert.ok(!/cd there at the start of/.test(src), `${wf}: per-command cd instruction removed`)
    }
    assert.match(read('docs', 'ORCHESTRATION.md'), /Standalone `cd`, never chained/, 'orchestration rule present')
  })

  test('/ship produces a release kit for user-facing products', () => {
    const src = read('.claude', 'skills', 'ship', 'SKILL.md')
    assert.match(src, /Release kit/, 'release-kit step present')
    assert.match(src, /RELEASE-KIT\.md/, 'wired to the template')
    assert.match(src, /incomplete kit blocks the\s+release/i, 'store products fail closed')
  })

  test('deterministic plumbing lives in scripts, not in agent prompts', () => {
    assert.ok(existsSync(p('scripts', 'forge-worktree.sh')), 'forge-worktree.sh extracted')
    assert.ok(existsSync(p('scripts', 'forge-pr.sh')), 'forge-pr.sh extracted')
    const fp = readFileSync(join(workflowDir, 'feature-pipeline.js'), 'utf8')
    assert.match(fp, /forge-worktree\.sh/, 'build/verify agents call the worktree script')
    assert.match(fp, /scriptsDir/, 'preflight resolves the script path; inline git is the fallback')
    // The workflow's WT branch must invoke the SAME subcommands the script defines — a typo
    // on either side (e.g. `newbuild`) would ship a broken agent instruction the sim's
    // fallback-only run never walks. Assert both sides carry each token, in lockstep.
    const wt = read('scripts', 'forge-worktree.sh')
    for (const cmd of ['new-build', 'new-detached', 'clean']) {
      assert.ok(wt.includes(cmd), `script defines the ${cmd} subcommand`)
      assert.match(fp, new RegExp(`\\$\\{WT\\} ${cmd}`), `workflow WT branch invokes forge-worktree.sh with ${cmd}`)
    }
    assert.match(read('CLAUDE.md'), /Deterministic work is a script/, 'the principle is a hard rule')
  })

  test('a stalled run is resumable: /forge:build writes run-state, /forge:resume reconciles it', () => {
    assert.ok(skills.includes('resume'), '/resume skill exists')
    assert.match(read('.claude', 'skills', 'build', 'SKILL.md'), /\.forge\/run\.json/, '/forge writes .forge/run.json at boundaries')
    assert.match(read('.claude', 'skills', 'next', 'SKILL.md'), /\.forge\/run\.json/, '/next writes it too')
    assert.match(read('.claude', 'skills', 'resume', 'SKILL.md'), /reconcile/i, '/resume reconciles run-state against git ground truth')
    assert.match(read('.gitignore'), /^\.forge\/$/m, 'run-state is local-only (gitignored)')
  })
})

// --- boundary-audit optimizations (2026-07-14) — each locks its shape here ----
suite('boundary-audit optimizations', () => {
  // P9: the preflight block is duplicated across workflows; assert it stays uniform
  // by structure (not text-diff), so a future fix to one copy can't silently diverge.
  test('every workflow preflight is uniform (schema fields, haiku pin, refusal, standalone cd)', () => {
    for (const f of workflows) {
      const src = readFileSync(join(workflowDir, f), 'utf8')
      assert.match(src, /required: \['path', 'exists', 'isGitRepo', 'hasCode', 'isControlCenter', 'cwdIsTarget'\]/,
        `${f}: preflight schema requires the six target-verification fields`)
      assert.match(src, /label: 'preflight:target', model: 'haiku', effort: 'low'/,
        `${f}: preflight agent pins haiku/low`)
      assert.match(src, /it looks like a harness\/control-center repo, not a product/,
        `${f}: refusal branch guards the control-center case`)
      assert.match(src, /standalone cd into it/, `${f}: AT preamble mandates a standalone cd`)
    }
  })

  // P1: T1/T2 builds pin Opus (building is Opus's tier) instead of riding a Fable session at 2x.
  test('feature-pipeline pins Opus for T1/T2 builds; RISK-TIERS says so', () => {
    const src = readFileSync(join(workflowDir, 'feature-pipeline.js'), 'utf8')
    assert.match(src, /t === 'T3' \? \{ model: 'sonnet', effort: 'medium' \} : \{ model: 'opus'/,
      'T3 → sonnet, T1/T2 → opus (pinned, not inherit)')
    assert.match(read('docs', 'RISK-TIERS.md'), /\*\*Opus\*\* \(pinned\)/, 'RISK-TIERS build row records the pin')
    assert.match(read('docs', 'MODEL-ROUTING.md'), /build stages pin `model: 'opus'`/, 'routing policy records the pin')
  })

  // P7: PR title/body schema guides toward reviewable, value-named PRs.
  test('feature-pipeline PR schema names the user-visible value and a How-to-review section', () => {
    const src = readFileSync(join(workflowDir, 'feature-pipeline.js'), 'utf8')
    assert.match(src, /USER-VISIBLE VALUE/, 'pr_title guidance names the value, not the task id')
    assert.match(src, /How to review/, 'pr_body carries a How-to-review section')
  })

  // P10: every skill closes with a Next-line so the next action is always one command away.
  test('every skill closes with a **Next →** pointer', () => {
    for (const s of skills) {
      assert.match(read('.claude', 'skills', s, 'SKILL.md'), /Next →/, `skill ${s} names the next command`)
    }
  })

  // Bug #1: a known-red baseline reaches every verifier as a first-class field, not via
  // the distillable `context` — else a pre-existing failure is scored as a regression.
  test('feature-pipeline threads a known-red baseline to builders/verifiers', () => {
    const src = readFileSync(join(workflowDir, 'feature-pipeline.js'), 'utf8')
    assert.match(src, /knownRedNote/, 'known-red preamble is defined and appended to prompts')
    assert.match(src, /BASELINE \(KNOWN-RED\)/, 'baseline note is surfaced to the agents')
    assert.match(src, /known_failures/, 'known_failures is a first-class arg, not buried in context')
    assert.match(read('.claude', 'skills', 'build', 'SKILL.md'), /known_failures/, '/forge passes it as its own field')
  })

  // Bug #2: crit/high findings are the highest-stakes filter — they stand unless disproven,
  // and a refuted ship-blocker is surfaced with reasoning, never reduced to a bare count.
  test('deep-review: crit/high stand unless disproven; refuted blockers surfaced with reasoning', () => {
    const src = readFileSync(join(workflowDir, 'deep-review.js'), 'utf8')
    assert.match(src, /refuted=true ONLY when/, 'crit/high refuter does not default to refuted')
    assert.match(src, /it STANDS/, 'unprovable crit/high scenario stands')
    assert.match(src, /rejectedBlockers/, 'refuted crit/high returned with reasoning')
    assert.match(read('.claude', 'skills', 'build', 'SKILL.md'), /rejectedBlockers/, '/forge:build spot-checks the dismissals')
  })
})

// --- plugin packaging (2026-07-18) — installable global Claude Code plugin -----
suite('plugin packaging', () => {
  const manifest = JSON.parse(read('.claude-plugin', 'plugin.json'))
  const marketplace = JSON.parse(read('.claude-plugin', 'marketplace.json'))

  test('plugin.json is valid and declares the skills + agents locations', () => {
    assert.equal(manifest.name, 'forge', 'plugin name is the /forge: command namespace')
    assert.ok(manifest.version, 'version present')
    assert.ok(manifest.description && manifest.description.length > 20, 'description present')
    assert.deepEqual(manifest.skills, ['./.claude/skills/'], 'skills point at the existing skills dir')
    // the agents field takes individual files, not a directory (validator-enforced)
    assert.ok(Array.isArray(manifest.agents) && manifest.agents.length === agents.length,
      `every agent file is declared (${agents.length})`)
    for (const a of manifest.agents) assert.ok(existsSync(p(a.replace(/^\.\//, ''))), `${a} exists`)
  })

  test('marketplace.json lists the forge plugin at the marketplace root', () => {
    assert.equal(marketplace.name, 'forge')
    assert.ok(marketplace.description, 'marketplace description present (no validator warning)')
    const entry = marketplace.plugins.find(pl => pl.name === 'forge')
    assert.ok(entry, 'forge plugin entry present')
    assert.equal(entry.source, '.', 'plugin sourced from the marketplace root')
  })

  test('forge-home anchor exists and is tracked executable (a marketplace install must run it)', () => {
    assert.ok(existsSync(p('bin', 'forge-home')), 'bin/forge-home present')
    const mode = execSync('git ls-files -s bin/forge-home', { cwd: ROOT }).toString()
    assert.match(mode, /^100755 /, 'forge-home carries the git exec bit')
    assert.match(read('.gitattributes'), /^bin\/\* text eol=lf$/m, 'bin/* pinned to LF so the shebang survives')
  })

  test('skills read harness assets through $FORGE_HOME — no bare (harness root) path', () => {
    for (const s of skills) {
      const src = read('.claude', 'skills', s, 'SKILL.md')
      assert.ok(!/\(harness root\)/.test(src), `skill ${s} has no stale "(harness root)" ref`)
      // Every harness-asset read is anchored: FORGE_HOME sits in the 12 chars before it.
      for (const m of src.matchAll(/templates\/|docs\/playbooks\/|docs\/RISK-TIERS\.md|references\//g)) {
        const prefix = src.slice(Math.max(0, m.index - 12), m.index)
        assert.match(prefix, /FORGE_HOME\/$/, `skill ${s} anchors "${m[0]}" to $FORGE_HOME`)
      }
      // A skill that uses $FORGE_HOME defines how to resolve it.
      if (/\$FORGE_HOME/.test(src)) {
        assert.match(src, /CLAUDE_PLUGIN_ROOT:-\$\(forge-home\)/, `skill ${s} carries the FORGE_HOME idiom`)
      }
    }
  })

  test('each workflow has a launcher skill firing it by $FORGE_HOME scriptPath', () => {
    // Plugins do not auto-register .claude/workflows/*.js as commands — the launcher
    // skills are what keep /forge:deep-review etc. invocable.
    for (const wf of ['deep-review', 'design-panel', 'feature-pipeline', 'release-gate']) {
      assert.ok(skills.includes(wf), `${wf} launcher skill exists`)
      const src = read('.claude', 'skills', wf, 'SKILL.md')
      assert.match(src, new RegExp(`\\$FORGE_HOME/\\.claude/workflows/${wf}\\.js`),
        `${wf} launcher builds scriptPath from $FORGE_HOME`)
    }
  })

  test('the backlog builder invokes as /forge:build (avoids the /forge:forge collision)', () => {
    assert.ok(skills.includes('build'), 'build skill dir present')
    assert.ok(!skills.includes('forge'), 'no forge skill dir (would collide with the plugin name)')
    assert.equal(frontmatter(read('.claude', 'skills', 'build', 'SKILL.md')).name, 'build')
  })

  test('claude plugin validate passes on the manifest + marketplace', (t) => {
    // Best-effort: only runs where the claude CLI is installed (dev machines), so
    // the suite stays green in CI without it.
    try {
      execSync('claude --version', { cwd: ROOT, stdio: 'ignore' })
    } catch {
      return t.skip('claude CLI not available')
    }
    const out = execSync('claude plugin validate .', { cwd: ROOT }).toString()
    assert.match(out, /Validation passed/, 'plugin + marketplace manifests validate')
  })
})

// --- review improvements (2026-07-21) — each fix locks its shape here ----------
suite('review improvements', () => {
  const build = () => read('.claude', 'skills', 'build', 'SKILL.md')
  const fp = () => readFileSync(join(workflowDir, 'feature-pipeline.js'), 'utf8')

  // #1 Flaky tests must not halt an unattended run — a NEW failure is re-run once and
  // only a reproducing failure stops the build; the isolation verifiers retry too.
  test('flaky-test resilience: targeted re-run before a NEW failure counts as a regression', () => {
    assert.match(build(), /re-run only those failing tests once/i, '/forge:build re-runs before declaring a regression')
    assert.match(build(), /reproduce[s]? on (?:a|the) targeted re-run/i, 'stop condition requires reproduction on re-run')
    assert.match(build(), /flaky/i, 'flakes are logged, not silently swallowed')
    assert.match(fp(), /re-run just that test once/i, 'isolation verifier retries a failing test')
    assert.match(fp(), /re-run it once/i, 'smoke check retries a failing check')
  })

  // #2 The seeded tier is re-checked against the BUILT diff; a T2/T3 that touched a
  // security surface is escalated to a security pass (raises depth, never lowers it).
  test('diff re-check escalates under-tiered features to a security pass', () => {
    assert.match(fp(), /const RECHECK = \{/, 'the re-check schema exists')
    assert.match(fp(), /label: `tier-recheck:\$\{i \+ 1\}`/, 'the re-check runs as its own labelled Haiku agent')
    assert.match(fp(), /model: 'haiku', effort: 'low', schema: RECHECK/, 'the re-check is a cheap Haiku pass')
    assert.match(fp(), /git diff --merge-base HEAD/, 're-check inspects the feature diff, read-only')
    assert.match(fp(), /secEscalated/, 'escalation flag threads to verify')
    assert.match(fp(), /if \(r\.secEscalated\)/, 'verify adds a security pass when escalated')
    assert.match(build(), /tier escalation/i, '/forge:build report surfaces escalations')
  })

  // #3 The no-questions build phase needs a Decision policy; an adopted spec may lack one.
  test('a missing Decision policy is synthesized and shown at the gate', () => {
    assert.match(build(), /no Decision policy section/i, 'build detects the missing policy')
    assert.match(build(), /synthesize/i, 'build synthesizes a default and shows it at the gate')
    assert.match(build(), /Never run the hands-off phase without a Decision policy/i, 'no autonomy without a policy in force')
  })

  // #4 A wave's PRs are batched — one push for all branches, PRs created concurrently.
  test('forge-pr.sh open-all batches the push and fans out PR creation', () => {
    const pr = read('scripts', 'forge-pr.sh')
    assert.match(pr, /open-all\)/, 'open-all subcommand exists')
    assert.match(pr, /git push -u origin "\$\{branches\[@\]\}"/, 'one push for every branch in the wave')
    assert.match(pr, /gh pr create .*&\n\s*pids\+=/s, 'PRs are created concurrently and awaited')
    assert.match(build(), /open-all/, '/forge:build drives the wave through open-all')
  })

  // #5 Merges wait only on required checks, watched across the wave concurrently.
  test('check-watching is concurrent and required-only', () => {
    assert.match(build(), /concurrently, not one at a time/i, 'wave checks are watched together')
    assert.match(build(), /--watch --required/, 'only required checks block a merge')
  })

  // #6 The finish walkthrough/docs detail lives in docs/FINISH.md; the skill points to it.
  test('finish detail is extracted to docs/FINISH.md (leaner skill hot path)', () => {
    assert.ok(existsSync(p('docs', 'FINISH.md')), 'docs/FINISH.md exists')
    const finish = read('docs', 'FINISH.md')
    assert.match(finish, /Visual walkthrough/i, 'walkthrough procedure moved here')
    assert.match(finish, /Documentation pass/i, 'docs-pass procedure moved here')
    assert.match(finish, /forge-proof/, 'walkthrough still delegates to forge-proof')
    assert.match(finish, /forge-etcher/, 'docs pass still delegates to forge-etcher')
    assert.match(build(), /\$FORGE_HOME\/docs\/FINISH\.md/, 'the skill anchors the pointer to $FORGE_HOME')
  })

  // #7 The pipeline reports actual output-token spend so cost can be checked vs the estimate.
  test('feature-pipeline reports actual spend against the gate estimate', () => {
    assert.match(fp(), /budget\.spent\(\)/, 'spend read from the Workflow budget API')
    assert.match(fp(), /spend,/, 'spend returned to the orchestrator')
    assert.match(build(), /Actual spend vs\. the gate estimate/i, '/forge:build report compares real spend to the estimate')
  })
})

// --- retro swarm loop (2026-07-21) — local apply + opt-in upstream PR ----------
suite('retro swarm loop', () => {
  test('retro applies locally, asks before an upstream PR, and never merges it', () => {
    const src = read('.claude', 'skills', 'retro', 'SKILL.md')
    assert.match(src, /FORGE_HOME/, 'changes land in the local plugin install first')
    assert.match(src, /Propose these changes upstream as a PR\?/, 'the PR offer is one explicit question')
    assert.match(src, /never assume yes/i, 'PR creation is opt-in, never automatic')
    assert.match(src, /origin\/<default-branch>/, 'the PR branch bases on the remote default branch, not local state')
    assert.match(src, /Never merge it/i, 'the maintainer alone decides — retro never merges its own PR')
    assert.match(src, /npm ci && npm test/, 'suite green in the PR working tree before pushing (hard rule 8)')
  })
})
