// F.O.R.G.E. harness regression suite — static contract checks over skills,
// agents, workflows, and docs. Zero dependencies; run with `npm test`.
// Every harness change MUST keep this green; every optimization adds its
// invariant here so a later edit can't silently regress it.
import { test, suite } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const p = (...s) => join(ROOT, ...s)
const read = (...s) => readFileSync(p(...s), 'utf8')

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

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

  test('every command in the CLAUDE.md command map has a skill or workflow', () => {
    const cmds = [...claudeMd.matchAll(/^\| `\/([a-z-]+)[ `]/gm)].map(m => m[1])
    assert.ok(cmds.length >= 10, `command map found (${cmds.length} commands)`)
    for (const c of cmds) {
      const hasSkill = skills.includes(c)
      const hasWorkflow = workflows.includes(`${c}.js`)
      assert.ok(hasSkill || hasWorkflow, `/${c} exists as a skill or workflow`)
    }
  })

  test('every forge-* agent referenced anywhere exists in .claude/agents/', () => {
    // Terms that look like agent names but are prose, not agents.
    const NON_AGENT_TERMS = new Set(['forge-agents', 'forge-themed'])
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
    assert.match(src, /Refuse to map the harness/i, 'keeps the target sanity check the preflight did')
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
      const cfg = JSON.parse(read('.claude', f))
      assert.ok(!('hooks' in cfg), `no hooks key in .claude/${f}`)
    }
  })

  test('/feature integrates via PR — never straight to main', () => {
    const src = read('.claude', 'skills', 'feature', 'SKILL.md')
    assert.match(src, /never commit a\s+feature straight to main/i)
    assert.match(src, /gh pr create/, 'PR flow present')
  })

  test('/forge keeps its hard stops (no force-push, no merging failed features)', () => {
    const src = read('.claude', 'skills', 'forge', 'SKILL.md')
    assert.match(src, /force-push/i)
    assert.match(src, /never merges a feature that failed verification/i)
  })

  test('/forge finish includes a docs pass: forge-etcher writes the README, commands verified', () => {
    const src = read('.claude', 'skills', 'forge', 'SKILL.md')
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

  test('/forge: waves of 1-2 features skip the workflow (direct /feature loop)', () => {
    const src = read('.claude', 'skills', 'forge', 'SKILL.md')
    assert.match(src, /Small-wave shortcut/, 'shortcut documented in Execute step')
    assert.match(src, /Waves of 3\+/, 'pipeline reserved for 3+ feature waves')
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
    assert.match(read('.claude', 'skills', 'forge', 'SKILL.md'), /known_failures/, '/forge passes it as its own field')
  })

  // Bug #2: crit/high findings are the highest-stakes filter — they stand unless disproven,
  // and a refuted ship-blocker is surfaced with reasoning, never reduced to a bare count.
  test('deep-review: crit/high stand unless disproven; refuted blockers surfaced with reasoning', () => {
    const src = readFileSync(join(workflowDir, 'deep-review.js'), 'utf8')
    assert.match(src, /refuted=true ONLY when/, 'crit/high refuter does not default to refuted')
    assert.match(src, /it STANDS/, 'unprovable crit/high scenario stands')
    assert.match(src, /rejectedBlockers/, 'refuted crit/high returned with reasoning')
    assert.match(read('.claude', 'skills', 'forge', 'SKILL.md'), /rejectedBlockers/, '/forge spot-checks the dismissals')
  })
})
