# Playbook: Static Site / Landing Page

_As of 2026-07. Verify major versions at kickoff — this file ages._

## Default stack

| Layer | Choice | Version (2026-07) | Notes |
|---|---|---|---|
| Framework | Astro | 7.0.x (NEW — released 2026-06-22) | Rust compiler, Vite 8/Rolldown, native "Sätteri" markdown pipeline, explicit AI-agent support (structured JSON logs, agent detection) |
| Fallback | Astro 6 | — | pin if a needed integration lags v7 |
| Styling | Tailwind CSS | 4.3.x | |
| Content | Astro content collections (markdown) | — | CMS only when a non-dev edits weekly |
| Tests | Playwright (smoke) | 1.61.x | full Vitest setup is overkill here |
| Package manager | pnpm | 11.x | |
| Hosting | Cloudflare Pages (default: free unlimited bandwidth) or Vercel | — | |

Requires Node 22.12+.

## Scaffold

```bash
pnpm create astro@latest <name> -- --template minimal --typescript strict
cd <name>
pnpm astro add tailwind
pnpm add -D playwright @playwright/test
```

One Playwright smoke test: homepage renders, no console errors, nav links resolve.

## Conventions

- Zero client-side JS by default; islands (`client:load`) only for genuinely interactive
  widgets — the whole point of Astro is shipping HTML.
- Images through `astro:assets` (`<Image>`), never raw `<img>` with unoptimized files.
- SEO basics at scaffold time: per-page title/description, OG tags, sitemap
  (`@astrojs/sitemap`), robots.txt — retrofitting is always forgotten.

## Deploy (Cloudflare Pages)

Connect repo → build command `pnpm build`, output `dist/`. Custom domain via CF DNS.
Redirects/headers in `public/_redirects` / `_headers`.

## Gotchas

- Astro 7 is ~2 weeks old: if any integration errors at install, pin `astro@6` and note
  it in the ADR rather than fighting the ecosystem.
- v7's Sätteri markdown replaces remark/rehype defaults — existing remark plugins need
  the compat flag or migration.
- Don't reach for Next.js because "we might need an app later" — if that happens, the
  content ports trivially; the premature framework tax is paid daily.

## In flux (re-check at kickoff)

Astro 7 integration ecosystem maturity; Vite 8/Rolldown plugin compat.
