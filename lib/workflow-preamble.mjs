// The one copy of the args/target-directory guard that every workflow script carries.
//
// Workflow scripts cannot import it: both runtimes execute the script BODY as a function,
// so there is no module scope to import into. So the block is pasted into every
// `workflows/*.js` between sentinels and kept in sync from here —
// `node scripts/sync-workflow-preamble.mjs` rewrites them, `--check` reports drift, and
// tests/harness.test.mjs pins every workflow to this text so a hand-edited copy cannot land.
// The stable half of the opening sentinel. The note after it may be reworded, so the
// sync script and the tests locate the block by TAG, never by the whole line.
export const TAG = '// >>> forge:args-guard'
export const BEGIN = `${TAG} — generated; edit lib/workflow-preamble.mjs, then: node scripts/sync-workflow-preamble.mjs`
export const END = '// <<< forge:args-guard'

export const ARGS_GUARD = `${BEGIN}
// Target-directory + args contract (2026-07-06; unified 2026-09-22). Two failure modes,
// both seen live in the 2026-07-05 harness eval, both from the NATIVE Workflow invocation:
// (1) workflow agents run in the SESSION's working directory — not necessarily the product
//     this workflow should operate on. So the target arrives as {dir}, is verified by the
//     preflight agent below, and every later prompt is pinned to the verified path.
// (2) args can arrive JSON-stringified. So they are coerced before anything reads them.
// \`bin/forge-run.mjs\` reads an args file and has neither problem, but the script file is
// identical on every host, so the guard rides along. Each workflow reads its own fields
// from \`a\` after this block.
let a = args
if (typeof a === 'string' && a.trim().startsWith('{')) { try { a = JSON.parse(a) } catch { /* keep raw string */ } }
const dirArg = a && typeof a === 'object' && !Array.isArray(a) && typeof a.dir === 'string' && a.dir.trim() ? a.dir.trim() : null
${END}`
