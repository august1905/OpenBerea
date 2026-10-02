# OpenBerea

A free, open-source Bible study website: KJV and ASV, Hebrew and Greek with lexicons, study tools, and a memorization dashboard. No account, no ads, no tracking. Works offline after the first visit.

Built with Expo (React Native) and Expo Router in TypeScript, exported as a static website and hosted on Cloudflare.

## Setup

Requires Node 22 or newer.

```sh
npm install
npx playwright install chromium   # browsers for end-to-end tests
```

## Build

```sh
npm run data      # download, license-check, and convert every data source into public/data/
npm run build     # export the static site to dist/
npm run serve     # serve dist/ at http://localhost:4173
```

`npm run web` starts the Expo dev server.

## Test

```sh
npm run typecheck
npm run lint
npm test          # unit tests (Vitest)
npm run e2e       # end-to-end and accessibility tests (Playwright + axe), desktop and phone sizes
```

## Deploy

```sh
npx wrangler login   # once
npm run deploy       # uploads dist/ to Cloudflare (Workers static assets)
```

## Docs

- [docs/PLAN.md](docs/PLAN.md): architecture and build plan
- [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md): every data source, its license, and how it's used
- [docs/DECISIONS.md](docs/DECISIONS.md): decisions made where the spec was open
- [docs/SPEC_CHECKLIST.md](docs/SPEC_CHECKLIST.md): requirement-by-requirement status

## License

Code: MIT (see [LICENSE](LICENSE)). Data and fonts keep their own licenses; see [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md).
