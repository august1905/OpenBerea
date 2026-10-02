# OpenBerea

A free, open-source Bible study website: KJV and ASV, Hebrew and Greek with lexicons, study tools, and a memorization dashboard. No account, no ads, no tracking, nothing saved. It works offline after the first visit.

Built with Expo (React Native) and Expo Router in TypeScript, exported as a static website and hosted on Cloudflare. The same codebase can later target iOS and Android.

## Setup

Requires Node 22 or newer.

```sh
npm install
npx playwright install chromium   # browsers for end-to-end tests
```

## Build

```sh
npm run data      # download (pinned), license-check, convert, and verify every data source into public/data/ (about 30 s after the first download)
npm run build     # export the static site to dist/ (adds the service worker, precache list, and headers)
npm run serve     # serve dist/ at http://localhost:4173
```

`npm run web` starts the Expo dev server. Raw downloads are cached in `.cache/sources/`, and both `public/data/` and `dist/` are generated (not committed).

## Test

```sh
npm run typecheck     # app code, and scripts/tests (separate configs)
npm run lint
npm test              # unit tests (Vitest): reference parsing, data conversion, alignment, search, menus, policy checks
npm run e2e           # end-to-end and axe accessibility tests (Playwright), desktop and phone sizes; needs a build
npm run verify        # independent spot checks of public/data against the raw source files
npm run check:links   # every external link pattern and curated URL resolves (takes ~10 min, throttled per site)
npm run perf          # chapter open times under slow-4G and 4× CPU throttling; needs a build and npm run serve
```

## Deploy

The site is static files on Cloudflare (Workers static assets; see `wrangler.jsonc`). No server code runs.

```sh
npx wrangler login    # once, opens a browser
npm run data && npm run build
npm run deploy        # uploads dist/ (about 9,900 files; Cloudflare's limit is 20,000)
```

## Editing content

These files in `content/` are meant to be edited by the site owner. Run `npm run data && npm run build` afterwards; the pipeline validates them.

| File | What it is |
| --- | --- |
| `content/resources.json` | The curated resource library: sermons, studies, and media by book and topic. Only John Piper items may set `embed` (Desiring God's terms). |
| `content/votd.json` | Verse-of-the-day list, picked by day of the year. |
| `content/memorize-starters.json` | Starter passages for the memorization dashboard. |
| `content/site.json` | Repository, donation, and contact links for the About page (hidden until filled in). |
| `content/harmony-robertson.json` | Robertson's gospel-harmony section table (checked against the 1922 printing). |
| `content/librivox-kjv.json` | Which LibriVox recording plays for each chapter. |

## Project layout

```
src/app/              routes (one-line screens)
src/features/         reader, nav (corner menus, tabs), original (Hebrew/Greek, word study), search, study,
                      history (maps, timeline, people, harmony), memorize, resources, audio, about
src/components/       shared UI: corner menus, list menus, sheets, rich text, media embeds
src/lib/              book codes and references, data loading and types, in-memory state, platform helpers
src/theme/            colors (light, dark, high contrast), fonts, spacing
src/i18n/             all interface text, one file per feature (add a language by adding a sibling folder)
scripts/pipeline/     data pipeline: one stage file per source family, shared helpers in lib/
public/               HTML template, service worker, web manifest, icons
tests/e2e/            Playwright end-to-end and accessibility tests
docs/                 plan, spec checklist, data sources and licenses, decisions
```

## Docs

- [docs/PLAN.md](docs/PLAN.md): architecture and build plan
- [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md): every data source, its license, and how it's used or why it was skipped
- [docs/DECISIONS.md](docs/DECISIONS.md): decisions made where the spec was open
- [docs/SPEC_CHECKLIST.md](docs/SPEC_CHECKLIST.md): requirement-by-requirement status and evidence

## License

Code: MIT (see [LICENSE](LICENSE)). Data and fonts keep their own licenses: see [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md) and the `LICENSE.txt` in each `data/` folder. Share-alike data (Theographic, the STEPBible lexicon folder) stays share-alike.
