# OpenBerea build plan

This plan implements the whole spec ("Bible Study App — Requirements Spec.md", referred to as SPEC) as one website release, in the spec's build order. Decisions made along the way are logged in [DECISIONS.md](DECISIONS.md); source licenses are recorded in [DATA_SOURCES.md](DATA_SOURCES.md); requirement status is tracked in [SPEC_CHECKLIST.md](SPEC_CHECKLIST.md).

## Architecture

| Layer | Choice |
| --- | --- |
| App | Expo SDK 57, Expo Router (file routes in `src/app/`), TypeScript, React Native components rendered on the web by react-native-web |
| Web output | `web.output: "single"`: a static single-page app; every route is served by `index.html` |
| Hosting | Cloudflare Workers static assets (`wrangler.jsonc`, `not_found_handling: single-page-application`); no server code, no database |
| Data | Build-time pipeline (`scripts/pipeline/`, run with `npm run data`) writes compact JSON to `public/data/`, which `expo export` copies into `dist/data/` |
| Offline | Hand-written service worker (`public/sw.js`): app shell plus core data (KJV, ASV, original texts, lexicons, concordance, search index) precached after the first visit; other study data cached on first view |
| State | In memory only (React context): tabs, display options, memorization session. The URL holds the current passage. Nothing touches cookies, localStorage, sessionStorage, or IndexedDB |
| i18n | All interface strings in `src/i18n/en.ts`, read through `t()`; new languages are added as sibling files |
| Mobile later | Only React Native primitives in shared code; web-only code (service worker registration, document listeners) lives in `*.web.ts(x)` files with native no-op twins |

### Source layout

```
src/app/                 routes (screens only)
src/components/          shared UI (Scripture text, word panel, menus, layout)
src/features/<area>/     feature logic and views: reader, original, search, study, memorize, resources, audio
src/lib/bible/           book codes, versification, reference parsing and formatting
src/lib/data/            typed data loaders (fetch + in-memory cache) and data types
src/lib/state/           in-memory stores: tabs, display options
src/theme/               colors, fonts, spacing, themes
src/i18n/                translation files and t()
content/                 owner-edited data files (resource library, verse-of-the-day list, memorization starter sets)
scripts/pipeline/        data pipeline: one module per source plus shared helpers
tests/e2e/               Playwright end-to-end and axe accessibility tests
```

### Data layout (served at `/data/…`)

Every source keeps its own folder with its LICENSE text, so share-alike data stays separate. `data/manifest.json` records each source, URL, pinned version or checksum, license, and file counts.

| Path | Contents |
| --- | --- |
| `kjv/{BOOK}/{ch}.json`, `asv/{BOOK}/{ch}.json` | Verses as text segments; KJV segments carry Strong's numbers, morphology, words-of-Christ and added-word (italic) flags, plus paragraph marks and Psalm titles |
| `orig/{BOOK}/{ch}.json` | TAHOT/TAGNT words in KJV verse numbering: surface text, transliteration, gloss, Strong's, morphology code, and (NT) edition markers |
| `lex/{H|G}/{bucket}.json` | Lexicon entries per Strong's number (Strong's, STEPBible brief lexicon, Thayer's, BDB, Gesenius where available) |
| `lex/index.json` | Strong's number → lemma, transliteration, gloss (for search and labels) |
| `conc/{H|G}/{bucket}.json` | Concordance: every verse per Strong's number, occurrence counts, KJV renderings |
| `morph/{he|grc}.json` | Morphology code descriptions (grammar helper) |
| `xref/{BOOK}/{ch}.json` | Cross-references per verse (TSK and OpenBible.info) |
| `comm/{id}/{BOOK}/{ch}.json` | Commentaries (Matthew Henry, Gill, Barnes, JFB) |
| `dict/{id}/index.json`, `dict/{id}/{bucket}.json` | Dictionaries (Easton, Smith, ISBE) and Nave's topical index |
| `people/…`, `places/…`, `timeline/…` | Theographic people, family links, events; OpenBible places; kings and prophets |
| `map/base.json` | Natural Earth land, lakes, and rivers clipped to Bible lands |
| `harmony/robertson.json` | Gospel harmony sections |
| `variants/{BOOK}/{ch}.json` | NT words that differ between Greek editions |
| `search/{kjv|asv}.json` | Verse text in canonical order, for in-browser keyword and phrase search |
| `audio/kjv.json` | LibriVox chapter recordings |

Owner-edited files in `content/` are validated and copied to `data/content/` by the pipeline.

## Build steps

Each step ends with the self-check below, then a commit.

1. **Scaffold**: Expo + TypeScript + Expo Router, lint, unit tests (Vitest), end-to-end tests (Playwright, desktop 1280×800 and Pixel 7 phone), static server, Cloudflare config. The Cloudflare deploy needs a login, so it moves to the end (see DECISIONS).
2. **Data pipeline**: verify every license in its own repository (DATA_SOURCES.md), then download, checksum, and convert each source; write the manifest and per-source LICENSE files; unit-test the converters and data invariants (verse counts, Strong's spot checks).
3. **Reader**: book data and reference parser (unit-tested), chapter loader, KJV/ASV with instant switching, parallel view, quick jump, red-letter toggle, verse-per-line vs. paragraph layout, verse of the day.
4. **Design system and navigation**: theme tokens (light, dark, high contrast), self-hosted fonts, corner quarter-radial marking menus (main and tabs), keyboard shortcuts, accessible list-menu fallback, in-memory tabs.
5. **Original languages**: original-text view (Hebrew right-to-left), interlinear, word panel, lexicons, concordance, usage stats, grammar helper.
6. **Search**: keyword, phrase, Strong's number, original-language word (prebuilt indexes, in-browser).
7. **Study tools**: cross-references, commentaries, dictionaries, topical index, maps, timelines, people and family trees, gospel harmony, guided word study, inductive mode, textual variants.
8. **Memorization dashboard**: picker, five practice modes, chapter mode, starter sets, session score.
9. **External resources**: per-verse and per-word link-outs, featured teachers by passage, curated library, Piper embeds with attribution.
10. **Audio Bible**: LibriVox chapter playback.
11. **Polish**: service worker and installable manifest, accessibility options, performance, i18n structure.
12. **Launch**: About page with every attribution, full test pass, Lighthouse, production deploy.

## Parallel work

Up to five agents work at once on disjoint files:

- **Research (step 2 prep)**: five agents verify licenses and formats: STEPBible; CrossWire modules; Theographic, OpenBible, and Natural Earth; harmony, LibriVox, and fonts; external link patterns and starter resources.
- **Pipeline (step 2)**: converters split by source family, each writing only its own `scripts/pipeline/sources/*.ts` module and `public/data/<source>/` folder.
- **Features (steps 5–10)**: once the reader, design system, and menus exist (steps 3–4, built first because everything depends on them), feature areas are built in parallel in their own `src/features/<area>/` folders and routes. The orchestrator integrates shared files (menu config, i18n, route registry) and commits each step in spec order after its checks pass.

## Self-check after every step

- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` all pass.
- Playwright end-to-end tests pass for every feature built so far, on the desktop and phone projects.
- axe (via `@axe-core/playwright`) reports no serious or critical violations on each screen.
- Screenshots of new screens are reviewed against the Design section (colors, fonts, corner menus).
- Data checks: spot-check verses, verse counts per chapter, and Strong's numbers against the original source files (`scripts/pipeline/verify.ts`).
- Link check: every external link pattern and curated URL resolves (`scripts/check-links.ts`).

## Finish

- Lighthouse on the production build: chapter navigation under 1 second; the site works offline after the first visit (service worker test in Playwright with the network cut).
- Walk [SPEC_CHECKLIST.md](SPEC_CHECKLIST.md) item by item, marking each done and tested.
- Deploy to Cloudflare. Anything that needs the owner (Cloudflare login, public repository, donation link) is listed at the end.
