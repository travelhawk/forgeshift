# Playbook: Desktop App

_As of 2026-07. Verify major versions at kickoff — this file ages._

## Default stack

| Layer | Choice | Version (2026-07) | Notes |
|---|---|---|---|
| Shell | Tauri | 2.x | 2-10MB bundles, Rust core, OS-native webviews, capability-based security |
| Fallback | Electron | 43.x | when you need identical Chromium rendering everywhere or its packaging ecosystem |
| Frontend | Vite + React + TypeScript + Tailwind 4 | — | any Vite-served frontend works |
| State/persistence | SQLite via tauri-plugin-sql, or plain files in app-data | — | local-first by default |
| Tests | Vitest (frontend) + Rust `cargo test` (commands) + WebdriverIO/tauri-driver (e2e, Linux/Windows) | — | |
| Distribution | Tauri bundler (msi/dmg/AppImage/deb) + tauri-plugin-updater | — | |

**Pick Electron instead when:** pixel-identical rendering across OSes is a hard
requirement (Tauri uses WebKitGTK on Linux, WebView2 on Windows, WKWebView on macOS),
or you depend on Chromium-only APIs, or deep Node integration in the shell.

## Scaffold

```bash
pnpm create tauri-app@latest <name>   # pick: TypeScript, React, pnpm
cd <name> && pnpm install
pnpm tauri dev   # verify the window opens before anything else
```

## Conventions

- **The webview is untrusted UI; the Rust side owns power.** File access, shell, network
  beyond fetch — all through Tauri commands (`#[tauri::command]`) with explicit
  capability permissions in `tauri.conf.json`/capabilities. Never blanket-enable APIs.
- Commands are the API boundary: validated inputs, typed via specta/ts-rs if the surface
  grows.
- Frontend stays a normal web app (testable with Vitest/browser) — business logic that
  doesn't need OS power lives in TS, not Rust.
- App data in the platform-correct dir (`appDataDir()`), never next to the executable.

## Release

`pnpm tauri build` per platform (CI matrix: macos-latest, windows-latest,
ubuntu-latest). Code signing: Windows cert / Apple notarization — budget a full day for
first-time signing setup, it is pure bureaucracy. Auto-update via updater plugin +
signed release manifests on GitHub Releases.

## Gotchas

- Linux WebKitGTK lags Chrome in CSS features — check flexbox-gap-era features you rely
  on, test on Linux early.
- Agents build Rust slowly the first time (cold cargo) — keep the Rust surface thin so
  the iteration loop stays in the frontend.
- Window state (size/position) restoration is expected desktop behavior — plugin exists,
  wire it at scaffold.
