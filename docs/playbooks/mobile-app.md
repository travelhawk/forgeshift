# Playbook: Mobile App

_As of 2026-07. Verify major versions at kickoff — this file ages._

## Default stack

| Layer | Choice | Version (2026-07) | Notes |
|---|---|---|---|
| Framework | Expo (React Native) | SDK 57 (RN 0.86, React 19.2) | official RN recommendation; SDK 56 = conservative pin |
| Language | TypeScript | bundled | |
| Navigation | expo-router | bundled with SDK | file-based routes |
| State/server | TanStack Query + zustand (only if needed) | — | start with Query alone |
| Backend | Supabase (auth+db+storage) or your api-service playbook | — | Supabase = fastest path for standard CRUD apps |
| Styling | StyleSheet or NativeWind (Tailwind) | — | NativeWind if the team thinks in Tailwind |
| Tests | Jest (bundled) + Maestro (e2e flows) | — | |
| Build/distribution | EAS Build + EAS Update (OTA) | — | |

Flutter 3.44 is legitimate when the team prefers Dart or needs its renderer — but for a
JS/React shop with agent workflows, Expo is the default.

## Scaffold

```bash
pnpm dlx create-expo-app@latest <name>
cd <name>
npx expo install expo-router
pnpm add @tanstack/react-query
```

Verify immediately on a real device via Expo Go (dev build once native modules appear).

## Conventions

- File-based routing under `app/`; screens thin, logic in `src/features/<feature>/`.
- All server state through TanStack Query — no fetch-in-useEffect.
- Design for offline-tolerance from day one (Query cache persistence) — mobile networks
  lie; retrofitting offline is a rewrite.
- Env/config via `app.config.ts` + EAS secrets — never hardcode API URLs per
  environment.

## Build & release

- Development: Expo Go → dev builds (`eas build --profile development`) once you add
  native modules.
- Distribution: `eas build --profile production` → store submission via `eas submit`.
  TestFlight/Internal testing track first, always.
- OTA: `eas update` for JS-only changes between store releases — respect store rules
  (no feature-gating changes via OTA).

## Gotchas

- The iOS build needs an Apple Developer account ($99/y) and 1-3 days of review-related
  patience — plan it into the first release, not the day of.
- New Architecture is default since RN 0.76 — check native lib compatibility BEFORE
  adding any native dependency; incompatible libs are the #1 time sink.
- Agents can't see the simulator: e2e via Maestro flows (`maestro test`) gives them
  a runnable check; screenshot-based verification needs you in the loop.
- SDK upgrades are their own feature-sized task — never drive-by upgrade mid-feature.

## In flux (re-check at kickoff)

Expo SDK 57 just released (2026-06-30) — SDK 56/RN 0.85 is the conservative pin for
production; check your critical native deps against 57 first.
