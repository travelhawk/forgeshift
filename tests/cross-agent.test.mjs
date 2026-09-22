// Cross-agent contract: the same skills, agents and workflow scripts run on every host.
// Pure tests — no CLI is spawned. Adapter parsers are pinned on output shapes recorded from
// the real CLIs (claude 2.1.272, codex-cli 0.154.0, opencode 1.18.31, 2026-09-19).
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { HOSTS, TIERS, tierOf, callingHost, pickHost, resolveModel, everyNodeTyped } from '../lib/hosts.mjs'
import { extractJson, validate, runWorkflow, makeHostAgent } from '../lib/runtime.mjs'
import { renderSkill, renderCodexAgent, renderOpencodeAgent, renderOpencodeCommand, portableBody, splitFrontmatter } from '../lib/render.mjs'
import { ARGS_GUARD } from '../lib/workflow-preamble.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const p = (...s) => join(root, ...s)
const read = (...s) => readFileSync(p(...s), 'utf8')
const skills = readdirSync(p('skills')).filter(n => existsSync(p('skills', n, 'SKILL.md')))
const agents = readdirSync(p('agents')).filter(f => /^forge-.*\.md$/.test(f))
const workflows = readdirSync(p('workflows')).filter(f => f.endsWith('.js'))

describe('layout — one canonical source, no host lock-in', () => {
  test('skills, agents and workflows live at the repo root, not under .claude/', () => {
    for (const d of ['skills', 'agents', 'workflows']) {
      assert.ok(existsSync(p(d)), `${d}/ exists`)
      assert.ok(!existsSync(p('.claude', d)), `.claude/${d} is gone — a second copy would drift`)
    }
  })

  test('AGENTS.md is the manual; CLAUDE.md only imports it', () => {
    assert.match(read('AGENTS.md'), /^# F\.O\.R\.G\.E\./, 'AGENTS.md carries the manual')
    assert.equal(read('CLAUDE.md').trim(), '@AGENTS.md', 'CLAUDE.md is the one-line import stub')
  })

  test('the acronym is Fleet-Orchestrated everywhere it is spelled out', () => {
    for (const f of ['README.md', join('.claude-plugin', 'plugin.json')]) {
      assert.match(read(f), /Fleet-Orchestrated/, `${f} spells the new acronym`)
      assert.doesNotMatch(read(f), /Fable-Orchestrated/, `${f} dropped the old one`)
    }
  })

  test('every workflow launcher names the portable runner next to the Claude tool', () => {
    for (const wf of workflows.map(f => f.replace(/\.js$/, ''))) {
      const src = read('skills', wf, 'SKILL.md')
      assert.match(src, new RegExp(`bin/forge-run\\.mjs" ${wf} --args-file`), `${wf} launcher gives the runner command`)
    }
    assert.match(read('skills', 'build', 'SKILL.md'), /bin\/forge-run\.mjs/, 'build fires workflows host-neutrally')
    assert.match(read('skills', 'ship', 'SKILL.md'), /bin\/forge-run\.mjs" release-gate/, 'ship fires the gate host-neutrally')
  })

  test('the FORGE_HOME idiom honours a preset FORGE_HOME before any Claude path', () => {
    for (const s of skills) {
      for (const m of read('skills', s, 'SKILL.md').matchAll(/FORGE_HOME="\$\{[^"]*"/g)) {
        assert.ok(m[0].startsWith('FORGE_HOME="${FORGE_HOME:-'), `skill ${s}: idiom starts from $FORGE_HOME`)
      }
    }
  })

  test('docs/HOSTS.md documents every host adapter', () => {
    const doc = read('docs', 'HOSTS.md')
    for (const h of Object.keys(HOSTS)) assert.match(doc, new RegExp(h, 'i'), `HOSTS.md covers ${h}`)
    for (const t of TIERS) assert.match(doc, new RegExp('`' + t + '`'), `HOSTS.md names the ${t} tier`)
  })
})

describe('hosts — tiers, detection, model resolution', () => {
  test('Claude aliases map onto the four tiers; unknown means judge', () => {
    assert.deepEqual(['inherit', 'opus', 'sonnet', 'haiku'].map(tierOf), TIERS)
    assert.equal(tierOf(undefined), 'judge')
    assert.equal(tierOf('something-else'), 'judge')
  })

  test('every agent file and workflow uses only known tier aliases', () => {
    for (const f of agents) {
      const { fm } = splitFrontmatter(read('agents', f))
      assert.ok(['inherit', 'opus', 'sonnet', 'haiku'].includes(fm.model), `${f}: model "${fm.model}" is a tier alias`)
    }
    for (const w of workflows) {
      for (const m of read('workflows', w).matchAll(/model: '([^']+)'/g)) {
        assert.ok(['opus', 'sonnet', 'haiku'].includes(m[1]), `${w}: model '${m[1]}' is a tier alias`)
      }
    }
  })

  test('callingHost reads the innermost agent from its env marker', () => {
    assert.equal(callingHost({}), null)
    assert.equal(callingHost({ CLAUDECODE: '1' }), 'claude')
    assert.equal(callingHost({ CODEX_THREAD_ID: 'x' }), 'codex')
    assert.equal(callingHost({ OPENCODE: '1' }), 'opencode')
    // A Codex started from a Claude session inherits CLAUDECODE — Codex is the caller.
    assert.equal(callingHost({ CLAUDECODE: '1', CODEX_SESSION_ID: 'x' }), 'codex')
  })

  test('pickHost: flag > FORGE_HOST > calling agent > config; unknown names throw', () => {
    assert.equal(pickHost('opencode', { host: 'codex' }, { FORGE_HOST: 'claude' }), 'opencode')
    assert.equal(pickHost(null, { host: 'codex' }, { FORGE_HOST: 'claude', CODEX_THREAD_ID: 'x' }), 'claude')
    assert.equal(pickHost(null, { host: 'claude' }, { CODEX_THREAD_ID: 'x' }), 'codex')
    assert.equal(pickHost(null, { host: 'opencode' }, {}), 'opencode')
    assert.throws(() => pickHost('cursor', {}, {}), /Unknown host/)
  })

  test('resolveModel: Claude ships aliases, other hosts default to null until mapped', () => {
    assert.deepEqual(resolveModel('claude', 'opus', 'high', {}), { tier: 'build', model: 'opus', effort: 'high' })
    assert.deepEqual(resolveModel('claude', undefined, 'xhigh', {}), { tier: 'judge', model: null, effort: 'xhigh' })
    assert.deepEqual(resolveModel('codex', 'haiku', 'low', {}), { tier: 'sweep', model: null, effort: 'low' })
    const cfg = { hosts: { codex: { models: { sweep: 'cheap-model' } } } }
    assert.equal(resolveModel('codex', 'haiku', 'low', cfg).model, 'cheap-model')
    assert.equal(resolveModel('codex', 'haiku', 'bogus', cfg).effort, null, 'an unknown effort is dropped, not passed on')
  })

  test('nothing free-form rides the command line: no adapter takes the prompt as an argument', () => {
    const opts = { model: 'm', effort: 'high', schema: { type: 'object' }, schemaFile: 's.json', outFile: 'o.txt', mode: 'workspace', cwd: '/x', shell: true, extraDirs: ['/parent'] }
    const codex = HOSTS.codex.command(opts)
    assert.equal(codex.at(-1), '-', 'codex reads the prompt from stdin')
    assert.ok(codex.includes('--output-schema') && codex.includes('s.json'), 'codex gets the schema as a file')
    assert.deepEqual(codex.slice(codex.indexOf('-s'), codex.indexOf('-s') + 2), ['-s', 'workspace-write'])
    assert.ok(codex.includes('--add-dir'), 'sibling worktrees need the parent dir')
    assert.ok(HOSTS.claude.command({ ...opts, shell: false }).includes('--add-dir'), 'claude reaches sibling worktrees too')
    assert.ok(!HOSTS.claude.command(opts).includes('--json-schema'), 'inline JSON never passes through a shell')
    assert.ok(HOSTS.claude.command({ ...opts, shell: false }).includes('--json-schema'))
    assert.ok(HOSTS.opencode.command(opts).includes('--auto'))
  })

  test('readonly: Codex sandboxes, Claude denies the write tools, OpenCode only drops --auto', () => {
    const ro = { mode: 'readonly', outFile: 'o', cwd: '/x' }
    assert.ok(HOSTS.codex.command(ro).includes('read-only'))
    assert.ok(!HOSTS.opencode.command(ro).includes('--auto'), 'OpenCode has no read-only switch — documented limit')
    const tools = HOSTS.claude.command(ro)
    assert.doesNotMatch(tools[tools.indexOf('--allowedTools') + 1], /Write|Edit/)
    assert.match(tools[tools.indexOf('--allowedTools') + 1], /Bash/, 'readonly still runs tests')
    assert.match(tools[tools.indexOf('--disallowedTools') + 1], /Write/, "a deny rule beats the user's own allow rules")
  })

  test('codex gets --output-schema only when every schema node is typed (OpenAI rejects the rest)', () => {
    const typed = { type: 'object', properties: { a: { type: 'array', items: { type: 'string' } } } }
    const untyped = { type: 'object', properties: { a: { type: 'array', items: {} } } }
    assert.equal(everyNodeTyped(typed), true)
    assert.equal(everyNodeTyped(untyped), false)
    const base = { schemaFile: 's.json', outFile: 'o', mode: 'workspace' }
    assert.ok(HOSTS.codex.command({ ...base, schema: typed }).includes('--output-schema'))
    assert.ok(!HOSTS.codex.command({ ...base, schema: untyped }).includes('--output-schema'), 'the prompt contract carries it instead')
  })
})

describe('adapters — parse() against recorded CLI output', () => {
  test('claude: takes the result line even when a hook prints after it', () => {
    const stdout = [
      '{"type":"result","subtype":"success","is_error":false,"result":"{\\"ok\\":true}","usage":{"output_tokens":41},"structured_output":{"ok":true}}',
      'SessionEnd hook [cleanup] failed: Hook cancelled',
    ].join('\n')
    assert.deepEqual(HOSTS.claude.parse({ stdout }), { text: '{"ok":true}', structured: { ok: true }, outputTokens: 41 })
    assert.throws(() => HOSTS.claude.parse({ stdout: '{"type":"result","is_error":true,"result":"OAuth session expired"}' }), /OAuth/)
    assert.throws(() => HOSTS.claude.parse({ stdout: 'garbage' }), /no result line/)
  })

  test('codex: final text from the -o file, tokens summed over turns', () => {
    const dir = mkdtempSync(join(tmpdir(), 'forge-x-'))
    try {
      const outFile = join(dir, 'out.txt')
      writeFileSync(outFile, '{"sum":42}')
      const stdout = [
        '{"type":"thread.started","thread_id":"t"}',
        '{"type":"item.completed","item":{"type":"agent_message","text":"{\\"sum\\":42}"}}',
        '{"type":"turn.completed","usage":{"input_tokens":9000,"output_tokens":120}}',
        '{"type":"turn.completed","usage":{"output_tokens":30}}',
      ].join('\n')
      assert.deepEqual(HOSTS.codex.parse({ stdout, outFile }), { text: '{"sum":42}', structured: null, outputTokens: 150 })
      assert.throws(() => HOSTS.codex.parse({ stdout: '{"type":"turn.failed","error":{"message":"quota"}}', outFile: join(dir, 'none.txt') }), /quota/)
      // A failed last turn can leave an earlier message in the -o file: a fragment, not an answer.
      assert.throws(() => HOSTS.codex.parse({ stdout: '{"type":"turn.failed","error":{"message":"out of credits"}}', outFile }), /credits/)
      const retried = '{"type":"turn.failed","error":{"message":"x"}}\n{"type":"turn.completed","usage":{"output_tokens":5}}'
      assert.equal(HOSTS.codex.parse({ stdout: retried, outFile }).text, '{"sum":42}', 'a later completed turn clears the failure')
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  test('opencode: the LAST message is the answer; earlier narration is dropped', () => {
    const stdout = [
      '{"type":"text","part":{"messageID":"m1","text":"Let me look."}}',
      '{"type":"step_finish","part":{"tokens":{"output":12}}}',
      '{"type":"text","part":{"messageID":"m2","text":"{\\"sum\\":"}}',
      '{"type":"text","part":{"messageID":"m2","text":"43}"}}',
      '{"type":"step_finish","part":{"tokens":{"output":8}}}',
    ].join('\n')
    assert.deepEqual(HOSTS.opencode.parse({ stdout }), { text: '{"sum":43}', structured: null, outputTokens: 20 })
    assert.throws(() => HOSTS.opencode.parse({ stdout: '{"type":"error","error":{"name":"ProviderAuthError"}}' }), /ProviderAuthError/)
    // Died mid-answer: the narration before the error must not come back as the reply.
    const died = '{"type":"text","part":{"messageID":"m1","text":"Let me run the tests first."}}\n{"type":"error","error":{"name":"APIError"}}'
    assert.throws(() => HOSTS.opencode.parse({ stdout: died }), /APIError/)
    const recovered = '{"type":"error","error":{"name":"APIError"}}\n{"type":"text","part":{"messageID":"m2","text":"done"}}'
    assert.equal(HOSTS.opencode.parse({ stdout: recovered }).text, 'done')
  })
})

describe('runtime — the workflow surface off Claude', () => {
  test('extractJson finds the value in a bare reply, a fence, or surrounding prose', () => {
    assert.deepEqual(extractJson('{"a":1}'), { a: 1 })
    assert.deepEqual(extractJson('Here you go:\n```json\n{"a":2}\n```\nDone.'), { a: 2 })
    assert.deepEqual(extractJson('The result is {"a":3} as asked.'), { a: 3 })
    assert.deepEqual(extractJson('[1,2]'), [1, 2])
    assert.equal(extractJson('no json here'), undefined)
  })

  test('validate covers the schema subset the workflows use', () => {
    const schema = { type: 'object', required: ['status', 'n'], additionalProperties: false,
      properties: { status: { type: 'string', enum: ['pass', 'fail'] }, n: { type: 'number' }, list: { type: 'array', items: { type: 'string' } } } }
    assert.deepEqual(validate(schema, { status: 'pass', n: 1, list: ['a'] }), [])
    assert.equal(validate(schema, { status: 'maybe', n: 1 }).length, 1, 'enum violation')
    assert.equal(validate(schema, { status: 'pass' }).length, 1, 'missing required')
    assert.equal(validate(schema, { status: 'pass', n: 1, extra: true }).length, 1, 'additionalProperties:false')
    assert.equal(validate(schema, { status: 'pass', n: 1, list: [1] }).length, 1, 'items type')
    assert.equal(validate(schema, 'nope').length, 1, 'wrong root type')
  })

  test('every workflow schema stays inside that subset', () => {
    // A keyword the portable validator ignores would be enforced on Claude and not elsewhere.
    const UNSUPPORTED = ['oneOf', 'anyOf', 'allOf', 'pattern', 'minimum', 'maximum', 'minItems', 'maxItems', 'minLength', 'maxLength', 'const', '$ref', 'format']
    for (const w of workflows) {
      const src = read('workflows', w)
      for (const k of UNSUPPORTED) assert.doesNotMatch(src, new RegExp(`\\b${k.replace('$', '\\$')}:\\s`), `${w}: schema keyword ${k} is not portable`)
    }
  })

  test('agent() returns the value, and null — never a throw — when the agent dies', async () => {
    const src = `export const meta = { name: 't' }
      const a = await agent('one', { label: 'a' })
      const b = await agent('boom', { label: 'b' })
      return { a, b, spent: budget.spent() }`
    const agentFn = async prompt => { if (prompt === 'boom') throw new Error('died'); return { value: { ok: true }, outputTokens: 7 } }
    const { result, spent } = await runWorkflow(src, { args: {}, agentFn })
    assert.deepEqual(result, { a: { ok: true }, b: null, spent: 7 })
    assert.equal(spent, 7)
    assert.equal(globalThis.agent, undefined, 'the global is restored after the run')
  })

  test('parallel() runs concurrently under the limit and isolates a failing branch', async () => {
    let live = 0, peak = 0
    const agentFn = async () => { live++; peak = Math.max(peak, live); await new Promise(r => setTimeout(r, 15)); live--; return { value: 1, outputTokens: 1 } }
    const src = `const r = await parallel([1,2,3,4,5,6].map(i => () => agent('p' + i)))
      const mixed = await parallel([() => { throw new Error('x') }, () => 5])
      return { r, mixed }`
    const { result } = await runWorkflow(src, { args: {}, agentFn, concurrency: 3 })
    assert.deepEqual(result.r, [1, 1, 1, 1, 1, 1])
    assert.deepEqual(result.mixed, [null, 5])
    assert.equal(peak, 3, 'the concurrency cap holds')
  })

  test('pipeline() streams each item through the stages; a failing item becomes null', async () => {
    const src = `return await pipeline(['a', 'b', 'c'],
      (acc) => acc + '1',
      (acc, item, i) => { if (item === 'b') throw new Error('bad'); return acc + item + i })`
    const { result } = await runWorkflow(src, { args: {}, agentFn: async () => null })
    assert.deepEqual(result, ['a1a0', null, 'c1c2'])
  })

  test('a real workflow refuses fail-closed when its preflight agent never reports', async () => {
    for (const w of workflows) {
      const { result } = await runWorkflow(read('workflows', w), {
        args: { dir: '/nowhere', features: ['x'], brief: 'b', context: 'c' }, agentFn: async () => { throw new Error('host down') },
      })
      assert.ok(result && result.error, `${w}: a dead host yields an error result, not a pass`)
    }
  })

  test('the shared args guard normalizes what every host hands a workflow', async () => {
    // One guard, four scripts (lib/workflow-preamble.mjs). The pin in harness.test.mjs keeps
    // the four copies identical; this is what the text has to DO.
    const src = 'export const meta = {}\n' + ARGS_GUARD +
      '\nreturn { dir: dirArg, parsed: a && typeof a === "object" && !Array.isArray(a) ? Object.keys(a) : null }'
    const run = async args => (await runWorkflow(src, { args, agentFn: async () => null })).result
    assert.equal((await run({ dir: 'D:/p' })).dir, 'D:/p')
    assert.equal((await run('{"dir":"D:/p"}')).dir, 'D:/p', 'args arriving JSON-stringified are parsed')
    assert.equal((await run({ dir: '  D:/p  ' })).dir, 'D:/p', 'a padded path is trimmed')
    assert.equal((await run({ dir: '' })).dir, null, 'an empty dir is no dir')
    assert.equal((await run({})).dir, null)
    assert.equal((await run(['D:/p'])).dir, null, 'an array carries no target')
    assert.equal((await run('just a brief')).parsed, null, 'a plain-text brief stays a string')
  })

  test('an off-schema reply is reformatted once; a reply holding no answer fails closed', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'forge-fmt-'))
    const schema = { type: 'object', required: ['verdict'], properties: { verdict: { type: 'string' } } }
    let turns = 0
    const answers = []
    HOSTS.fake = { bin: 'node', models: { judge: null, build: null, execute: null, sweep: null },
      command: () => ['-e', `process.stdin.resume();process.stdin.on('end',()=>console.log(${JSON.stringify(JSON.stringify(answers[turns++] ?? ''))}))`],
      parse: ({ stdout }) => ({ text: JSON.parse(stdout.trim()), structured: null, outputTokens: 1 }) }
    try {
      answers.push('Looks fine to me, honestly.', '{"verdict":"pass"}')
      const ok = makeHostAgent({ host: 'fake', dir, runDir: join(dir, 'a'), forgeHome: root, config: {} })
      const out = await ok('review it', { label: 'r', schema })
      assert.deepEqual(out.value, { verdict: 'pass' }, 'the repaired reply is the value')
      assert.equal(turns, 2, 'exactly one reformat pass, never a redo')
      assert.equal(out.outputTokens, 2, 'the repair is counted, not hidden')

      // A reply that never reached an answer must not be reshaped into one.
      turns = 0; answers.length = 0
      answers.push('I will start by reading the diff.', 'NO_ANSWER')
      const dead = makeHostAgent({ host: 'fake', dir, runDir: join(dir, 'b'), forgeHome: root, config: {} })
      await assert.rejects(dead('review it', { label: 'r', schema }), /no answer/)
    } finally { delete HOSTS.fake; rmSync(dir, { recursive: true, force: true }) }
  })
})

describe('render — canonical files → other hosts', () => {
  test('skills render to Agent Skills: name = directory, only name + description', () => {
    for (const s of skills) {
      const r = renderSkill(s, read('skills', s, 'SKILL.md'))
      const { fm } = splitFrontmatter(r.content)
      assert.equal(r.dir, `forge-${s}`)
      assert.equal(fm.name, r.dir, `${s}: name equals the directory name`)
      assert.deepEqual(Object.keys(fm), ['name', 'description'], `${s}: no host-specific frontmatter leaks`)
      assert.doesNotMatch(r.content, /CLAUDE_PLUGIN_ROOT|~\/\.claude\/plugins/, `${s}: no Claude install path survives`)
      assert.doesNotMatch(r.content, /\/forge:[a-z]/, `${s}: /forge:x is rewritten to forge-x`)
    }
  })

  test('the portable idiom resolves the installed harness, overridable per install', () => {
    const body = 'x `FORGE_HOME="${FORGE_HOME:-${CLAUDE_PLUGIN_ROOT:-$(forge-home 2>/dev/null || ls -d ~/.claude/plugins/cache/forge/forge/*/ | sort -V | tail -1)}}"` y'
    assert.equal(portableBody(body), 'x `FORGE_HOME="${FORGE_HOME:-$HOME/.forge/home}"` y')
    assert.equal(portableBody(body, '/opt/forge'), 'x `FORGE_HOME="${FORGE_HOME:-/opt/forge}"` y')
  })

  test('Codex agents: valid TOML fields only, sandbox follows the tool list', () => {
    const ALLOWED = ['name', 'description', 'model', 'model_reasoning_effort', 'sandbox_mode', 'developer_instructions']
    for (const f of agents) {
      const src = read('agents', f)
      const r = renderCodexAgent(src, { build: 'mapped-model' })
      const head = r.content.split("developer_instructions = '''")[0]
      const keys = [...head.matchAll(/^([a-z_]+) = /gm)].map(m => m[1])
      for (const k of keys) assert.ok(ALLOWED.includes(k), `${f}: Codex rejects unknown key ${k}`)
      assert.equal(r.file, f.replace(/\.md$/, '.toml'))
      assert.match(r.content, /'''\n$/, `${f}: the literal string is closed`)
      const { fm } = splitFrontmatter(src)
      assert.equal(/^model = /m.test(head), tierOf(fm.model) === 'build', `${f}: model is set only for a mapped tier`)
      if (!/\b(Bash|Write|Edit)\b/.test(fm.tools)) assert.match(head, /sandbox_mode = "read-only"/, `${f}: no shell, no writes → read-only`)
    }
  })

  test('OpenCode agents are subagents; agents without write tools get edit: deny', () => {
    for (const f of agents) {
      const src = read('agents', f)
      const r = renderOpencodeAgent(src)
      assert.match(r.content, /^---\ndescription: ".*"\nmode: subagent\n/, `${f}: subagent frontmatter`)
      const { fm } = splitFrontmatter(src)
      assert.equal(/edit: deny/.test(r.content), !/\b(Write|Edit)\b/.test(fm.tools), `${f}: edit permission follows the tool list`)
    }
  })

  test('OpenCode commands are thin pointers — the playbook exists once', () => {
    const r = renderOpencodeCommand('build', read('skills', 'build', 'SKILL.md'))
    assert.equal(r.file, 'forge-build.md')
    assert.match(r.content, /Load the `forge-build` skill/)
    assert.match(r.content, /\$ARGUMENTS/)
    assert.ok(r.content.length < 1200, 'a pointer, not a copy')
  })
})

describe('runner + installer — safety', () => {
  test('--resume replays two identical agent() calls as two results, without re-running either', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'forge-cache-'))
    const counter = join(dir, 'launches.txt')
    // A stand-in host: node itself, answering with how often it has been launched.
    const script = `const fs=require('fs');fs.appendFileSync(${JSON.stringify(counter)},'x');` +
      `process.stdin.resume();process.stdin.on('end',()=>console.log(fs.readFileSync(${JSON.stringify(counter)},'utf8').length))`
    HOSTS.fake = { bin: 'node', models: { judge: null, build: null, execute: null, sweep: null },
      command: () => ['-e', script], parse: ({ stdout }) => ({ text: stdout.trim(), structured: null, outputTokens: 1 }) }
    try {
      const make = () => makeHostAgent({ host: 'fake', dir, runDir: join(dir, 'run'), forgeHome: root, config: {} })
      const first = make()
      const a = await first('same prompt', { label: 'x' })
      const b = await first('same prompt', { label: 'x' })
      assert.deepEqual([a.value, b.value], ['1', '2'], 'two launches, two answers')
      const resumed = make()
      const ra = await resumed('same prompt', { label: 'x' })
      const rb = await resumed('same prompt', { label: 'x' })
      assert.deepEqual([ra.value, rb.value], ['1', '2'], 'each call replays its own answer')
      assert.equal(readFileSync(counter, 'utf8').length, 2, 'nothing re-ran on resume')
    } finally { delete HOSTS.fake; rmSync(dir, { recursive: true, force: true }) }
  })

  test('an isolated agent is granted its worktree admin dir, and the worktree is removed after', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'forge-iso-'))
    const repo = join(dir, 'repo')
    mkdirSync(repo)
    const g = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8' })
    g('init', '-q'); g('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'init')
    const seen = []
    HOSTS.fake = { bin: 'node', models: { judge: null, build: null, execute: null, sweep: null },
      command: ({ cwd, extraDirs }) => { seen.push({ cwd, extraDirs }); return ['-e', 'process.stdin.resume();process.stdin.on("end",()=>console.log("ok"))'] },
      parse: ({ stdout }) => ({ text: stdout.trim(), structured: null, outputTokens: 1 }) }
    try {
      const agent = makeHostAgent({ host: 'fake', dir: repo, runDir: join(dir, 'run'), forgeHome: root, config: {} })
      await agent('build it', { label: 'b', isolation: 'worktree' })
      const [{ cwd, extraDirs }] = seen
      const norm = s => s.replace(/\\/g, '/').toLowerCase()
      assert.match(norm(cwd), /\/wf-iso-[^/]+$/)
      assert.ok(extraDirs.some(d => norm(d).endsWith(`/.git/worktrees/${norm(cwd).split('/').pop()}`)), `worktree admin dir granted: ${extraDirs}`)
      assert.ok(extraDirs.some(d => norm(d).endsWith('/repo/.git')), 'the shared git dir too')
      assert.ok(!existsSync(cwd), 'the throwaway worktree is gone')
    } finally { delete HOSTS.fake; rmSync(dir, { recursive: true, force: true }) }
  })

  // PATH holds node only: no agent CLI is reachable, so even a regressed installer cannot
  // touch the real Claude/Codex/OpenCode setup of whoever runs the suite.
  const install = (...args) => {
    const env = { ...process.env, PATH: dirname(process.execPath), Path: dirname(process.execPath) }
    try { return { code: 0, out: execFileSync(process.execPath, [p('scripts', 'install.mjs'), ...args], { encoding: 'utf8', stdio: 'pipe', env }) } }
    catch (e) { return { code: e.status, out: String(e.stdout) + String(e.stderr) } }
  }

  test('installer refuses a harness home that overlaps the repo or is not a forge install', () => {
    const dir = mkdtempSync(join(tmpdir(), 'forge-inst-'))
    try {
      for (const home of [root, p('lib'), dirname(root)]) {
        const r = install('--project', dir, '--host', 'codex', '--home', home)
        assert.equal(r.code, 1, home)
        assert.match(r.out, /overlaps the forge repo/)
      }
      const foreign = join(dir, 'mine')
      mkdirSync(foreign); writeFileSync(join(foreign, 'keep.txt'), 'x')
      assert.match(install('--project', dir, '--host', 'codex', '--home', foreign).out, /not a forge install/)
      assert.ok(existsSync(join(foreign, 'keep.txt')))
      assert.ok(!existsSync(join(dir, '.codex')), 'nothing written before the refusal')
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  test('a manifest shipped inside a repo can only remove forge files in that repo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'forge-evil-'))
    try {
      mkdirSync(join(dir, '.forge')); mkdirSync(join(dir, '.codex', 'agents'), { recursive: true })
      mkdirSync(join(dir, '.agents', 'skills', 'my-skill'), { recursive: true })
      writeFileSync(join(dir, '.forge-install.json'), '{}')
      writeFileSync(join(dir, 'important.txt'), 'x')
      const ours = join(dir, '.codex', 'agents', 'forge-quench.toml')
      writeFileSync(ours, 'x')
      writeFileSync(join(dir, '.forge', 'install.json'), JSON.stringify({
        hosts: { codex: ['..', dir, join(dir, '.agents', 'skills', 'my-skill'), ours] },
        shared: [join(dir, '.agents')], ownsHome: true, home: dir,
      }))
      assert.equal(install('--project', dir, '--uninstall').code, 0)
      assert.ok(!existsSync(ours), 'a real forge file in scope is removed')
      assert.ok(existsSync(join(dir, 'important.txt')) && existsSync(join(dir, '.agents', 'skills', 'my-skill')), 'nothing else is')
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})
