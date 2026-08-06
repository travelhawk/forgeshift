#!/usr/bin/env node
// bump-version.mjs — deterministic semver bump for .claude-plugin/plugin.json.
//
// Installed copies of the plugin only see an update when the manifest version
// grows, so every merge to main must move it. PRs bump deliberately with this
// script (minor/major); .github/workflows/version-bump.yml patch-bumps any
// merge that lands without one. Version arithmetic has one correct answer,
// so it is a script, never an agent turn.
//
// usage: node scripts/bump-version.mjs [patch|minor|major] [manifest-path]
// Prints the new version on stdout. Preserves the manifest's formatting —
// only the version string changes, never the layout.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const level = process.argv[2] ?? 'patch'
const file = process.argv[3] ?? fileURLToPath(new URL('../.claude-plugin/plugin.json', import.meta.url))
if (!['patch', 'minor', 'major'].includes(level)) {
  console.error(`bump-version: unknown level "${level}" (patch|minor|major)`)
  process.exit(2)
}

const src = readFileSync(file, 'utf8')
const m = src.match(/"version":\s*"(\d+)\.(\d+)\.(\d+)"/)
if (!m) {
  console.error(`bump-version: no semver "version" field in ${file}`)
  process.exit(1)
}

let [major, minor, patch] = m.slice(1).map(Number)
if (level === 'major') { major++; minor = 0; patch = 0 }
else if (level === 'minor') { minor++; patch = 0 }
else patch++

const next = `${major}.${minor}.${patch}`
writeFileSync(file, src.replace(m[0], `"version": "${next}"`))
console.log(next)
