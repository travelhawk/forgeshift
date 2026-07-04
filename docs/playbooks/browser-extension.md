# Playbook: Browser Extension

_As of 2026-07. Verify major versions at kickoff — this file ages._

## Default stack

| Layer | Choice | Version (2026-07) | Notes |
|---|---|---|---|
| Framework | WXT | 0.20.x (pre-1.0 but the consensus pick) | Vite-based, MV2+MV3, Chrome/Firefox/Edge/Safari builds |
| Avoid | Plasmo | — | maintenance mode, no feature development |
| UI | React + TypeScript + Tailwind 4 | — | or vanilla for tiny popups |
| Storage | wxt/storage (typed wrapper over browser.storage) | — | |
| Tests | Vitest (logic) + Playwright with extension loading (e2e) | — | |
| Distribution | Chrome Web Store + Firefox AMO | — | |

## Scaffold

```bash
pnpm dlx wxt@latest init <name>   # pick react template
cd <name> && pnpm install
pnpm dev   # opens Chrome with the extension loaded
```

Entrypoints under `entrypoints/`: `popup/`, `background.ts`, `content.ts`,
`options/` — WXT generates the manifest from these.

## Conventions

- **Request the minimum permissions** and narrowest host patterns that work. Every added
  permission is store-review friction and user-trust cost; broad host access triggers
  manual review.
- MV3 background is a service worker: it dies and restarts — no in-memory state; persist
  via storage, react to events.
- Content scripts touch pages you don't control: defensive DOM queries, namespaced CSS
  (or shadow DOM via WXT's createShadowRootUi), assume the page's JS is hostile to yours.
- Message passing (content ↔ background) through one typed module — stringly-typed
  `sendMessage` calls rot instantly.

## Release

`pnpm zip` (and `pnpm zip:firefox`) → Chrome Web Store dashboard + AMO. First Chrome
review: days; AMO: hours-to-days. Privacy policy required if you touch any user data —
write it before submission, not during rejection. Keep a `store/` dir with listing
copy, screenshots, and the privacy policy under version control.

## Gotchas

- Chrome and Firefox MV3 differ (service worker vs event pages, API namespaces) — WXT
  papers over most of it, but test both browsers before each release, not after.
- Store review rejections are the schedule risk — minimal permissions, clear listing
  copy, and a demo video reduce round-trips.
- E2E: Playwright can load unpacked extensions in Chromium
  (`--load-extension`) — wire one smoke e2e (extension loads, popup renders) at scaffold.

## In flux (re-check at kickoff)

WXT pre-1.0 API surface; Safari distribution (requires Xcode wrapper + Apple account)
only if the audience demands it.
