# Playbook: CLI Tool

_As of 2026-07. Verify major versions at kickoff — this file ages._

## Decision first: who installs this?

| Audience | Language | Why |
|---|---|---|
| Anyone (distributable binary) | **Go 1.26.x** | one static cross-platform binary, no runtime demand |
| Performance/systems-critical | Rust 1.93.x + clap | when Go isn't fast/precise enough — rare |
| JS-ecosystem devs (npm install -g) | **TypeScript + Commander** | smallest footprint; oclif only for large plugin CLIs |
| Personal/internal tooling | TypeScript + Bun (`bun build --compile`) | single-file executable, fastest iteration |

## Default (Go, distributable)

```bash
mkdir <name> && cd <name> && go mod init github.com/<user>/<name>
go get github.com/spf13/cobra@latest
```

Structure: `cmd/<name>/main.go` (thin), `internal/cli/` (cobra commands),
`internal/<domain>/` (logic — testable without the CLI). Cross-compile in CI:
`GOOS=linux|darwin|windows GOARCH=amd64|arm64 go build`.

## Default (TypeScript, npm-distributed)

```bash
mkdir <name> && cd <name> && pnpm init
pnpm add commander @clack/prompts picocolors
pnpm add -D typescript tsx vitest tsup
```

`tsup` for bundling, `bin` field in package.json, shebang `#!/usr/bin/env node`.
Interactive UX via `@clack/prompts` — but every prompt must have a flag equivalent
(CLIs get scripted; interactive-only is a bug).

## Conventions (both)

- `--help` is the spec: every command/flag documented there, examples included.
- Exit codes: 0 success, 1 expected failure (with actionable stderr message), 2 usage
  error. Machine-readable output behind `--json`.
- No config file until two+ flags are repeated constantly; then XDG-compliant location.
- Logic layer takes interfaces/handles, not globals — tests run the logic, e2e tests run
  the built binary against temp dirs.
- Never write outside cwd/explicit paths without a flag; destructive ops need `--force`
  or a confirm prompt (with `--yes` for scripts).

## Testing

Unit-test the domain layer; e2e-test the compiled artifact (run the real binary, assert
stdout/stderr/exit code/files). Golden-file tests for formatted output.

## Release

Go: GitHub Releases with per-platform archives (goreleaser). TS: `npm publish` with
`files` whitelist + provenance. Both: `--version` from build-time injection, CHANGELOG
per release.

## Gotchas

- Windows: path separators, no ANSI by default in old terminals (use a lib that
  detects), CRLF in golden files — run CI on windows-latest too.
- TS CLIs: keep deps minimal — install time is UX; every transitive dep is attack
  surface for your users.
