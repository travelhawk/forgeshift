# Release Kit — <product> <version>

> Store/listing assets for this release. Lives in the product at
> `docs/release-kit/<version>/`. Texts: `forge-etcher` from `docs/SPEC.md` +
> CHANGELOG. Images: `forge-proof` from the running app — real data, no lorem.
> Check off only what applies to the product's distribution channels.

## Texts — one set per shipped language (i18n list from the spec)

- [ ] App name / title — App Store ≤30 chars, Play ≤30
- [ ] Subtitle / short description — App Store ≤30, Play ≤80
- [ ] Long description — App Store ≤4000, Play ≤4000; benefits before features
- [ ] Keywords — App Store ≤100 chars total
- [ ] What's new in <version> — from CHANGELOG, user language, not commit language
- [ ] Web: `og:title` (~60) + `og:description` (~155) + landing headline/subline

## Images — from the real app at release state

- [ ] Screenshots at store sizes: iOS 6.9" 1320×2868 (+ 6.5" 1284×2778), Android
      phone ≥1080×1920 (2–8 shots), tablet sets if the app targets tablets;
      web/desktop: key screens 1280×800+
- [ ] Feature graphic (Play, 1024×500) / OG image (web, 1200×630)
- [ ] App icon master 1024×1024 — final, matches brand
- [ ] Optional: 15–30s preview video (cut from the walkthrough flow videos)

## Layout

```
docs/release-kit/<version>/
  <lang>/store.md      # all texts for that language
  images/              # screenshots, feature graphic / OG image
```

Unchanged since the last release → copy forward, refresh only "What's new" +
screenshots of changed screens.
