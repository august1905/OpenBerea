# Spec checklist

One line per requirement in the spec ("Bible Study App — Requirements Spec.md"). **Done** means built; **Tested** means covered by an automated test or a recorded check; **Evidence** names the test or check. Test files are in `tests/e2e/` (Playwright, desktop 1280×800 and Pixel 7 phone, with axe) and next to the code (`*.test.ts`, Vitest).

Legend: ✅ yes · ⚠️ partly (see note) · ⏳ waiting on the owner (listed in the hand-off)

Latest run (after the owner's light/dark and menu-motion requests): 462 unit tests and 240 end-to-end runs passed (6 skipped by design: phone-only or desktop-only cases), axe reported no serious or critical violations, 394 of 394 external links resolved, the data checks passed on 2,000 sampled verses per source, and Lighthouse scored 100 for accessibility, best practices, and SEO on the key pages.

## Guiding principles

| ID | Requirement | Done | Tested | Evidence |
| --- | --- | --- | --- | --- |
| G1 | Free: no ads, no paid features; costs covered by donations | ✅ | ✅ | No ad or payment code (`src/lib/policy.test.ts`); About states donation support (`about.spec`). The donation link is ⏳ for the owner (`content/site.json`). |
| G2 | Open: MIT-licensed code and only public-domain (or openly licensed) texts | ✅ | ✅ | `LICENSE` (MIT); every source's license in `docs/DATA_SOURCES.md` and on About (`about.spec`) |
| G3 | No account: nothing to sign up for; no settings or history saved | ✅ | ✅ | `offline.spec` (no cookies, localStorage, sessionStorage, or IndexedDB); `design.spec` (options reset on reload); `policy.test` |
| G4 | Source-first: every definition links back to the text | ✅ | ✅ | Scripture refs in lexicons, dictionaries, commentaries, and profiles are links (`study.spec`, `original.spec`); word study lists every occurrence, each linked to the reader (`original.spec`) |
| G5 | Offline-capable: Bible texts cached after the first visit | ✅ | ✅ | `offline.spec` (reads Romans 8, the ASV, Hebrew Genesis 1, a word study, and search with the network cut) |

## Instructions for Claude Code

| ID | Requirement | Done | Tested | Evidence |
| --- | --- | --- | --- | --- |
| I1 | Build everything as one website release, following Build scope and order | ✅ | ✅ | Commits for steps 1–12 in order; full suite on the final tree |
| I2 | Code stays mobile-compatible (Expo); no iOS/Android builds or publishing | ✅ | ✅ | React Native primitives only; web-only code is in `*.web.ts(x)` files with type-checked native versions (`npm run typecheck`). No native projects or store builds. |
| I3 | Nothing from Out of scope and no undescribed features added | ✅ | ✅ | `policy.test` (no storage, tracking, or text-to-speech); one small addition logged (book/chapter browser, DECISIONS #23) |
| I4 | Only Data-sources-table sources; each license confirmed in its own repository; skipped sources noted in DATA_SOURCES.md | ✅ | ✅ | `docs/DATA_SOURCES.md`; licenses re-checked by the pipeline (pinned checksums) |
| I5 | No user data stored (no accounts, cookies, localStorage, IndexedDB); the service worker caches app data only | ✅ | ✅ | `offline.spec`, `memorize.spec`, and `study.spec` (inductive answers) storage checks; `policy.test`; `public/sw.js` caches same-origin `/data` and the app shell only |
| I6 | About page credits every source with the exact attribution each license requires | ✅ | ✅ | `about.spec` checks every manifest source's attribution and license on About, plus the teacher credits |
| I7 | Every external link pattern (Blue Letter Bible, teacher sites) verified to resolve before shipping | ✅ | ✅ | `npm run check:links`: 394/394 OK (29 behind Desiring God's bot challenge, verified via Wayback) |
| I8 | Unclear points resolved simply and recorded in DECISIONS.md | ✅ | ✅ | `docs/DECISIONS.md` (63 entries) |
| I9 | Commit after each build step, with tests passing | ✅ | ✅ | One commit per step (steps 3–4 together; DECISIONS #7). Each commit type-checks and passes unit tests (verified in a clean worktree); the full end-to-end suite passed on the integrated tree. |

## Core requirements

| ID | Requirement | Done | Tested | Evidence |
| --- | --- | --- | --- | --- |
| C1 | KJV and ASV, both public domain, cached for offline use | ✅ | ✅ | `reader.spec`, `offline.spec`; `npm run verify` (sampled verses equal the CrossWire modules) |
| C2 | Read either translation and switch instantly | ✅ | ✅ | `reader.spec` "switches between KJV and ASV instantly" |
| C3 | Side-by-side parallel view | ✅ | ✅ | `reader.spec` (two columns on desktop; stacked per verse on phones, DECISIONS #25) |
| C4 | Hebrew/Aramaic OT and Greek NT text; Hebrew right-to-left with vowel points | ✅ | ✅ | `original.spec` (RTL direction, Ezra SIL, vowel points); `npm run verify` (TAHOT/TAGNT words) |
| C5 | Tap any word: Strong's number, root word, transliteration, pronunciation, definition, grammar parsing | ✅ | ✅ | `original.spec` (Hebrew tap; KJV "loved"; root link G26→G25) |
| C6 | Pronunciation as phonetic spelling; audio only if a free, licensed source exists | ✅ | ✅ | Phonetic from Strong's (`original.spec`: "ag-ap-ah'-o"); no licensed audio exists (DATA_SOURCES) |
| C7 | Interlinear view (original word under each English word) | ✅ | ✅ | `original.spec` (John 3:16 and Genesis 1:1); alignment unit tests (≥95% of tagged words in John, Romans, Genesis, Psalms) |
| C8 | Lexicons: Strong's, Thayer's (Greek), Brown-Driver-Briggs and Gesenius (Hebrew), STEPBible brief lexicons | ⚠️ | ✅ | Strong's, BDB, and STEPBible brief lexicons (Abbott-Smith, Middle Liddell) are built (`original.spec`). **Thayer's and Gesenius are skipped:** no freely licensed, reliable digital edition exists (DATA_SOURCES), and the app says so. |
| C9 | Concordance: every verse that uses the same original word | ✅ | ✅ | `original.spec` (G25: 110 verses, paged); `search.spec` (Strong's search) |
| C10 | Usage stats: how often a word appears and how the KJV translates it | ✅ | ✅ | `original.spec` ("143 times in 110 verses", KJV renderings) |
| C11 | Link-outs per verse and per word (Blue Letter Bible and other study sites) | ✅ | ✅ | `resources.spec` (verse tools: BLB, Bible Hub, STEP, Bible Gateway; word: BLB lexicon, Bible Hub) |
| C12 | Featured teachers linked by passage: John Piper (Desiring God), John MacArthur (Grace to You), Paul Washer (HeartCry via SermonAudio) | ✅ | ✅ | `resources.spec` (Romans 8 passage page; Desiring God hidden for Esther and Nahum) |
| C13 | Embedded John Piper audio and video, whole and unaltered, with the required attribution line | ✅ | ✅ | `resources.spec` (youtube-nocookie on request, Desiring God MP3 with `preload="none"`, exact attribution line) |
| C14 | Curated resource library by book and topic, stored as an owner-editable data file | ✅ | ✅ | `content/resources.json` (31 items); `resources.spec` (filters); validated by `npm run data` |
| C15 | Memorization: practice single verses and full chapters | ✅ | ✅ | `memorize.spec` |
| C16 | Memorization is practice only: nothing saved between sessions | ✅ | ✅ | `memorize.spec` (score resets on reload; no storage written) |

## Reading and navigation

| ID | Requirement | Done | Tested | Evidence |
| --- | --- | --- | --- | --- |
| R1 | Quick jump by typed reference ("Jn 3:16"), accepting common book abbreviations | ✅ | ✅ | `reader.spec`; `refs.test` (abbreviations, "Ps. 31", "Lev 8", one-chapter books) |
| R2 | Tabs: keep several passages, interlinear views, or word studies open and switch between them | ✅ | ✅ | `menus.spec` (tabs) |
| R3 | Open a new tab from a reference, a cross-reference, or a tapped word | ✅ | ✅ | `reader.spec` (verse sheet), `study.spec` (cross-reference), `original.spec` (tapped word) |
| R4 | Tabs live in their own corner menu | ✅ | ✅ | `menus.spec` (bottom-left tabs menu) |
| R5 | Tabs last for the current visit only; closing the site clears them | ✅ | ✅ | `design.spec` "tabs last for the current visit only" |
| R6 | Cross-references on every verse (Treasury of Scripture Knowledge and OpenBible.info) | ✅ | ✅ | `study.spec` (John 3:16 → Romans 5:8) |
| R7 | Search by keyword, phrase, Strong's number, or original-language word | ✅ | ✅ | `search.spec`; `engine.test` |
| R8 | Audio Bible: public-domain KJV recording; verse highlighting if timings exist, otherwise chapter playback | ✅ | ✅ | `audio.spec` (LibriVox chapter player; no timings exist, so no highlighting, which the bar says) |
| R9 | Red-letter words of Christ (toggle) | ✅ | ✅ | `reader.spec` (KJV only; the ASV has no markup, DECISIONS #9) |
| R10 | Verse-per-line or paragraph layout | ✅ | ✅ | `reader.spec` |
| R11 | Verse of the day, picked by date from a built-in list | ✅ | ✅ | `reader.spec`; `votd.test` |

## Study and research tools

| ID | Requirement | Done | Tested | Evidence |
| --- | --- | --- | --- | --- |
| S1 | Commentaries: Matthew Henry, Gill, Barnes, Jamieson-Fausset-Brown | ⚠️ | ✅ | Matthew Henry, JFB, and Barnes (NT only, the module's full coverage) are built (`study.spec`). **Gill is skipped:** its only digital edition is "All Rights Reserved" (DATA_SOURCES); the commentary page says so. |
| S2 | Bible dictionaries: Easton's, Smith's, ISBE | ✅ | ✅ | `study.spec` |
| S3 | Topical index (Nave's Topical Bible) | ✅ | ✅ | `study.spec` |
| S4 | Interactive maps of places in the text on a self-hosted base map (no third-party map service) | ✅ | ✅ | `history.spec` (chapter places, place sheet, zoom); CSP allows no map hosts |
| S5 | Timelines of events, kings, and prophets | ✅ | ✅ | `history.spec` |
| S6 | People profiles: every mention of a person, plus family trees | ✅ | ✅ | `history.spec` (David: Jesse, family tree, verses) |
| S7 | Harmony of the Gospels (parallel accounts side by side) | ✅ | ✅ | `history.spec` (§1 Luke 1:1–4; columns on wide screens) |
| S8 | Grammar helper: a word's parsing in plain English, from STEPBible's morphology code descriptions | ✅ | ✅ | `original.spec` (grammar in the word panel); `morph.test` (100% of TAHOT/TAGNT codes resolve) |
| S9 | Guided word study: word → lexicon → every occurrence | ✅ | ✅ | `original.spec` "guided word study" |
| S10 | Inductive study mode with fixed observe / interpret / apply prompts; answers aren't saved | ✅ | ✅ | `study.spec` (answers cleared on reload; no storage) |
| S11 | Textual variants from STEPBible's Greek edition markers, for advanced users | ✅ | ✅ | `study.spec` (John 3:16 αὐτοῦ in Treg, TR, Byz only) |

## Memorization dashboard

| ID | Requirement | Done | Tested | Evidence |
| --- | --- | --- | --- | --- |
| M1 | A separate dashboard for practicing verses and chapters | ✅ | ✅ | `memorize.spec` (`/memorize`) |
| M2 | Pick and practice any verse, passage, or chapter, in either translation | ✅ | ✅ | `memorize.spec` |
| M3 | Mode: first letter (type the first letter of each word) | ✅ | ✅ | `memorize.spec`; `check.test` |
| M4 | Mode: progressive hiding (more words disappear each round) | ✅ | ✅ | `memorize.spec`; `hide.test` |
| M5 | Mode: fill in the blank | ✅ | ✅ | `memorize.spec`; `check.test` |
| M6 | Mode: reference → verse | ✅ | ✅ | `memorize.spec` (word diff) |
| M7 | Mode: verse → reference | ✅ | ✅ | `memorize.spec` |
| M8 | Mode: word scramble (put words back in order) | ✅ | ✅ | `memorize.spec` |
| M9 | Chapter mode: split into chunks, chain verses together, run the whole chapter | ✅ | ✅ | `memorize.spec` (Psalm 23); `chunks.test` |
| M10 | Starter sets: built-in suggested passages (e.g., Psalm 23, Romans 8) | ✅ | ✅ | `memorize.spec`; `session.test` (every starter reference valid) |
| M11 | Session score: accuracy and missed words, current session only | ✅ | ✅ | `memorize.spec` |

## Design

| ID | Requirement | Done | Tested | Evidence |
| --- | --- | --- | --- | --- |
| D1 | Classy and simple: minimal interface, almost no visible chrome while reading; tools appear only when called up | ✅ | ✅ | `design.spec` (no header or nav bar; only the corner dots); verse tools and word panel open on tap |
| D2 | Fonts, open-licensed and self-hosted for offline: Literata (Scripture), Inter (interface), Ezra SIL (Hebrew), Gentium Plus (Greek) | ✅ | ✅ | `design.spec` (Literata loaded, Inter labels); `original.spec` (Ezra SIL, Gentium Plus); files in `/fonts/`, precached by the service worker |
| D3 | Generous white space and comfortable line length | ✅ | ✅ | 680px reading column (about 70 characters per line) with 1.65 line height; screenshots reviewed at both sizes |
| D4 | Colors: background #FFFAE1, text #1C1A17, gold #A87A22, peach #F2A06B | ✅ | ✅ | `palette.test`, `design.spec` |
| D5 | Gold for menu dots, lines, and active states; peach for soft highlights behind text | ✅ | ✅ | `design.spec` (gold dots); `reader.spec` (peach verse highlight); screenshots |
| D6 | Accents never used for body text | ✅ | ✅ | Gold appears only on dots, lines, rules, and the loading spinner (source check); `palette.test` (text colors meet WCAG contrast) |
| D7 | Light and dark themes following the device setting (dark: near-black background, #FFFAE1 text, same accents) | ✅ | ✅ | `design.spec` "dark theme follows the device setting"; owner addition: Resources › Light / dark toggles it for the visit (`design.spec`, decision 66) |
| N1 | Two corner menus: bottom-right main menu, bottom-left tabs | ✅ | ✅ | `menus.spec` |
| N2 | Press and hold a corner: a dot appears with up to 5 dots fanned in a quarter circle, connected by lines | ✅ | ✅ | `menus.spec`; `geometry.test`; owner additions: animated menus (`motion.spec`, `motion.test`, decisions 67–68); with a mouse, resting on the dot opens it; on touch screens, an edge swipe (`menus.spec`, `edge.test`, decision 69) |
| N3 | Swipe toward a dot to choose it; dots with sub-items open their own arc | ✅ | ✅ | `menus.spec` (three-level swipe); `geometry.test` (ring-aware targeting) |
| N4 | Main menu top level: Read, Search, Study, Memorize, Resources (up to 3 levels deep) | ✅ | ✅ | `menus.spec` |
| N5 | Tabs menu: each open tab is a sphere with a short label (e.g., "Jn 3") and a view icon (passage, interlinear, word study) | ✅ | ✅ | `menus.spec`, `original.spec` ("G25" tab) |
| N6 | Swipe to a sphere to switch to that tab | ✅ | ✅ | `menus.spec` |
| N7 | A "+" sphere opens a new tab | ✅ | ✅ | `menus.spec` |
| N8 | Drag a sphere off the arc to close it | ✅ | ✅ | `menus.spec` |
| N9 | Up to 5 tabs fit in the first arc; more go into an outer arc | ✅ | ✅ | `menus.spec` |
| N10 | A small, always-visible dot in each active corner hints at the menus | ✅ | ✅ | `menus.spec`, `design.spec`; owner change: hidden on touch screens, where edge swipes open the menus (decision 69) |
| N11 | Desktop: click a corner dot, or use keyboard shortcuts (including switching tabs) | ✅ | ✅ | `menus.spec` (click; M, T, N, X, [, ], 1–9); owner addition: hover opens menus and arcs (`menus.spec`, decision 69) |
| N12 | Accessibility fallback: standard list menus for screen readers and keyboard users | ✅ | ✅ | `menus.spec` (list menu by keyboard; hidden buttons that appear on focus) |
| N13 | Web: block text selection and the browser's long-press menu inside the corner zones | ✅ | ✅ | `menus.spec` |

## Platform, accessibility, and quality

| ID | Requirement | Done | Tested | Evidence |
| --- | --- | --- | --- | --- |
| P1 | Launch: website only | ✅ | ✅ | Static web export only |
| P2 | Later iOS and Android from the same codebase, with no rewrite needed | ✅ | ⚠️ | Expo/React Native throughout, with native versions of web-only pieces (type-checked). Not run on devices, since no apps are built yet. |
| P3 | Framework: React Native with Expo, one TypeScript codebase | ✅ | ✅ | Expo SDK 57, TypeScript strict |
| P4 | Hosting: everything on Cloudflare (website plus Bible and study data) | ✅ | ✅ | Deployed with `npm run deploy` to https://openberea.openberea.workers.dev (site and data, 9,860 files); menu, motion, design, and About tests pass against the live site |
| P5 | Open source: MIT license, public code repository | ✅ | ✅ | MIT license; public at https://github.com/august1905/OpenBerea, linked from the About page |
| P6 | Funding: donations only; no ads, no paid tiers | ✅ | ✅ | As G1; donation link ⏳ |
| P7 | No account: no sign-up, no login, no user data on a server | ✅ | ✅ | Static site, no server code |
| P8 | Nothing saved: no settings or history stored; only app data cached | ✅ | ✅ | `offline.spec`, `design.spec`, `policy.test` |
| P9 | Offline: installable web app; KJV, ASV, original texts, and lexicons offline after the first visit; other study data cached as viewed | ✅ | ✅ | `offline.spec`; Lighthouse installable-manifest pass; `public/sw.js` |
| P10 | Accessibility: screen reader support | ✅ | ✅ | axe on every screen (no serious or critical violations); Lighthouse accessibility 100 on key pages; roles and labels; list-menu fallback |
| P11 | Accessibility: adjustable font size (resets each visit) | ✅ | ✅ | `design.spec` |
| P12 | Accessibility: dyslexia-friendly font option | ✅ | ✅ | `design.spec` (DECISIONS #29) |
| P13 | Accessibility: dark mode | ✅ | ✅ | `design.spec` |
| P14 | Accessibility: high contrast | ✅ | ✅ | `design.spec`, `palette.test` |
| P15 | Privacy: no tracking or analytics | ✅ | ✅ | `policy.test`; strict Content-Security-Policy; YouTube loads only on request |
| P16 | Interface languages: English, with all interface text in translation files | ✅ | ✅ | `src/i18n/en/*`; `policy.test` (no hard-coded interface text) |
| P17 | Speed: any chapter opens in under 1 second | ⚠️ | ✅ | `npm run perf` (slow 4G, 4× CPU): next chapter 310–334 ms; typed jump about 820 ms; chapters on a repeat visit 840–904 ms (Hebrew Genesis 1 on phone 1,012 ms). The **first-ever visit** on slow 4G takes about 3.6 s, because the app's scripts download first; on broadband, Lighthouse desktop LCP is 1.2 s. |

## Technical architecture

| ID | Requirement | Done | Tested | Evidence |
| --- | --- | --- | --- | --- |
| T1 | Stack: Expo (React Native) with Expo Router and TypeScript, exported as a static website | ✅ | ✅ | `npm run build` |
| T2 | Hosting: Cloudflare static hosting; no server code and no database | ✅ | ✅ | Workers static assets; no Worker script |
| T3 | Data pipeline: build-time scripts download each source, check its license, convert to compact JSON split by chapter, with a manifest recording each source and license | ✅ | ✅ | `npm run data` (24 stages with verification; `data/manifest.json`); pipeline unit tests; `npm run verify` |
| T4 | References: standard book codes (GEN … REV); STEPBible TVTMS maps verse numbers where English and Hebrew/Greek differ | ✅ | ✅ | `books.ts`; `versemap` stage (TVTMS) maps OpenBible.info's numbering; TAHOT/TAGNT carry STEPBible's KJV mappings (e.g. Mal 4:1 = Hebrew 3:19) |
| T5 | Search: prebuilt indexes searched in the browser; no search server | ✅ | ✅ | `search.spec`; works offline (`offline.spec`) |
| T6 | Offline: a service worker caches the app shell and core data | ✅ | ✅ | `offline.spec` |
| T7 | State in memory only; the URL reflects the current passage, so back and direct links work | ✅ | ✅ | `reader.spec` (direct links, back button) |
| T8 | Data licenses: code MIT; data files keep their own licenses in a separate data folder (share-alike stays share-alike) | ✅ | ✅ | `LICENSE.txt` in every data folder; Theographic and the STEPBible lexicon folder are CC BY-SA |
| T9 | Testing: unit tests (reference parsing, data conversion); end-to-end (reading, tabs, corner menus, interlinear, search, memorization); automated accessibility checks | ✅ | ✅ | `npm test`, `npm run e2e` |
| T10 | Repo docs: README (setup, build, deploy), docs/DATA_SOURCES.md, docs/DECISIONS.md | ✅ | ✅ | Present |

## Data sources and licensing

| ID | Requirement | Done | Tested | Evidence |
| --- | --- | --- | --- | --- |
| DS1 | KJV with Strong's tags and red-letter markup (public domain; Crown rights noted for the UK) | ✅ | ✅ | `npm run verify` (text and Strong's equal the module) |
| DS2 | ASV (public domain) | ✅ | ✅ | `npm run verify` |
| DS3 | STEPBible TAHOT and TAGNT (CC BY 4.0; credit "STEP Bible" linked to STEPBible.org) | ✅ | ✅ | `npm run verify`; `about.spec` |
| DS4 | Lexicons: STEPBible TBESH/TBESG (TBESH terms checked); Strong's, Thayer's, BDB, Gesenius | ⚠️ | ✅ | TBESH definitions skipped (Online Bible permission needed); Thayer's and Gesenius skipped (no free source). Strong's, BDB, TBESG, and TBESH glosses are used. |
| DS5 | STEPBible TEHMC/TEGMC, TVTMS, TIPNR (CC BY 4.0) | ✅ | ✅ | Pipeline verification; `morph.test` |
| DS6 | Theographic Bible Metadata, treated as CC BY-SA 4.0 | ✅ | ✅ | `data/theographic/LICENSE.txt`; `about.spec` |
| DS7 | OpenBible.info Bible Geocoding Data (CC BY 4.0) | ✅ | ✅ | `history.spec`; `about.spec` |
| DS8 | Natural Earth base map (public domain) | ✅ | ✅ | `history.spec` |
| DS9 | Cross-references: TSK (public domain) and OpenBible.info (CC BY) | ✅ | ✅ | `study.spec` |
| DS10 | Commentaries: Matthew Henry, Gill, Barnes, JFB (public domain) | ⚠️ | ✅ | As S1 (Gill skipped; Barnes NT only) |
| DS11 | Dictionaries and topical index: Easton's, Smith's, ISBE, Nave's (public domain) | ✅ | ✅ | `study.spec` |
| DS12 | Gospel harmony: A. T. Robertson (1922), public domain in the US | ✅ | ✅ | `history.spec`; harmony stage checks every reference |
| DS13 | Audio Bible: LibriVox KJV recordings (public domain) | ✅ | ✅ | `audio.spec`; link check (first and last file of every book) |
| DS14 | Fonts: Literata, Inter, Ezra SIL, Gentium Plus (SIL Open Font License) | ✅ | ✅ | `design.spec`, `original.spec`; licenses in `/fonts/licenses/` |
| DS15 | Blue Letter Bible: linked out only, never copied | ✅ | ✅ | `resources.spec`; About |
| DS16 | John Piper / Desiring God: linked; audio/video embedded whole and unaltered; text excerpts only; attribution line | ✅ | ✅ | `resources.spec`; no Desiring God text is copied |
| DS17 | John MacArthur / Grace to You: linked and shared; no hosting or edited versions | ✅ | ✅ | `resources.spec` (no audio or iframe for Grace to You) |
| DS18 | Paul Washer / HeartCry and SermonAudio: linked with credit, copyright notice, and HeartCry link; no edits, logo, or photos | ✅ | ✅ | `resources.spec` (no images, credit text present) |
| DS19 | Teaching content from ministries linked or embedded, never copied | ✅ | ✅ | `content/resources.json` holds titles and links only |
| DS20 | Each license confirmed in the source's own repository before use; Theographic treated as share-alike | ✅ | ✅ | DATA_SOURCES.md |
| DS21 | All attributions on the About page | ✅ | ✅ | `about.spec` |

## Build scope and order

| ID | Requirement | Done | Tested | Evidence |
| --- | --- | --- | --- | --- |
| B1 | Scaffold: Expo + TypeScript + Expo Router; placeholder deployed to Cloudflare | ⚠️ | ✅ | Scaffold committed; the placeholder deploy was replaced by the final deploy (needs the owner's login, DECISIONS #4) |
| B2 | Data pipeline: download, license-check, convert every source; write docs/DATA_SOURCES.md | ✅ | ✅ | Step 2 commit |
| B3 | Reader: KJV, ASV, parallel view, reference parsing and quick jump, red letter, layouts, verse of the day | ✅ | ✅ | Steps 3–4 commit |
| B4 | Design system and navigation: colors, fonts, themes, corner quarter-radial menus, tabs menu | ✅ | ✅ | Steps 3–4 commit |
| B5 | Original languages: interlinear, word panel, lexicons, concordance, usage stats, grammar helper | ✅ | ✅ | Step 5 commit |
| B6 | Search | ✅ | ✅ | Step 6 commit |
| B7 | Study tools (all eleven) | ⚠️ | ✅ | Step 7 commit (Gill not available; see S1) |
| B8 | Memorization dashboard | ✅ | ✅ | Step 8 commit |
| B9 | External resources: link-outs, featured teachers, curated library, Piper embeds | ✅ | ✅ | Step 9 commit |
| B10 | Audio Bible | ✅ | ✅ | Step 10 commit |
| B11 | Polish: offline, accessibility, performance, interface-language structure | ✅ | ✅ | Step 11 commit, plus performance work in step 12 |
| B12 | Launch: About page with every attribution, full test pass, production deploy to Cloudflare | ✅ | ✅ | About and full test pass done; deployed to https://openberea.openberea.workers.dev |

## Out of scope (must be absent)

| ID | Requirement | Done | Tested | Evidence |
| --- | --- | --- | --- | --- |
| O1 | No accounts | ✅ | ✅ | No auth code; static site |
| O2 | No saved data of any kind (settings, notes, highlights, memorization progress) | ✅ | ✅ | `policy.test`; storage checks in `offline.spec`, `memorize.spec`, and `study.spec` |
| O3 | No sharing or community features | ✅ | ✅ | None present (review) |
| O4 | No AI features | ✅ | ✅ | None present; TIPNR's AI-written descriptions were excluded from the data |
| O5 | No reading plans | ✅ | ✅ | None present |
| O6 | No book introductions | ✅ | ✅ | None authored; commentary introductions are part of the public-domain commentaries |
| O7 | No text-to-speech | ✅ | ✅ | `policy.test` (no speechSynthesis); audio is human-read LibriVox recordings |
| O8 | No theological stance content | ✅ | ✅ | Inductive prompts and memorization notes are method-only; variants are described neutrally |
| O9 | No translations beyond KJV and ASV | ✅ | ✅ | Only KJV and ASV |
| O10 | No app store releases | ✅ | ✅ | None |
