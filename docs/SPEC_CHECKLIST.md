# Spec checklist

One line per requirement in the spec ("Bible Study App — Requirements Spec.md"). **Done** means built; **Tested** means covered by an automated test or a recorded manual check; **Evidence** names the test file or check.

Legend: ✅ yes · ⬜ not yet · ➖ not applicable (see note)

## Guiding principles

| ID | Requirement | Done | Tested | Evidence |
| --- | --- | --- | --- | --- |
| G1 | Free: no ads, no paid features; costs covered by donations | ⬜ | ⬜ | |
| G2 | Open: MIT-licensed code and only public-domain (or openly licensed) texts | ⬜ | ⬜ | |
| G3 | No account: nothing to sign up for; no settings or history saved | ⬜ | ⬜ | |
| G4 | Source-first: every definition links back to the text | ⬜ | ⬜ | |
| G5 | Offline-capable: Bible texts cached after the first visit | ⬜ | ⬜ | |

## Instructions for Claude Code

| ID | Requirement | Done | Tested | Evidence |
| --- | --- | --- | --- | --- |
| I1 | Build everything as one website release, following Build scope and order | ⬜ | ⬜ | |
| I2 | Code stays mobile-compatible (Expo); no iOS/Android builds or publishing | ⬜ | ⬜ | |
| I3 | Nothing from Out of scope and no undescribed features added | ⬜ | ⬜ | |
| I4 | Only Data-sources-table sources; each license confirmed in its own repository; skipped sources noted in DATA_SOURCES.md | ⬜ | ⬜ | |
| I5 | No user data stored (no accounts, cookies, localStorage, IndexedDB); the service worker caches app data only | ⬜ | ⬜ | |
| I6 | About page credits every source with the exact attribution each license requires | ⬜ | ⬜ | |
| I7 | Every external link pattern (Blue Letter Bible, teacher sites) verified to resolve before shipping | ⬜ | ⬜ | |
| I8 | Unclear points resolved simply and recorded in DECISIONS.md | ⬜ | ⬜ | |
| I9 | Commit after each build step, with tests passing | ⬜ | ⬜ | |

## Core requirements

| ID | Requirement | Done | Tested | Evidence |
| --- | --- | --- | --- | --- |
| C1 | KJV and ASV, both public domain, cached for offline use | ⬜ | ⬜ | |
| C2 | Read either translation and switch instantly | ⬜ | ⬜ | |
| C3 | Side-by-side parallel view | ⬜ | ⬜ | |
| C4 | Hebrew/Aramaic OT and Greek NT text; Hebrew right-to-left with vowel points | ⬜ | ⬜ | |
| C5 | Tap any word: Strong's number, root word, transliteration, pronunciation, definition, grammar parsing | ⬜ | ⬜ | |
| C6 | Pronunciation as phonetic spelling; audio only if a free, licensed source exists | ⬜ | ⬜ | |
| C7 | Interlinear view (original word under each English word) | ⬜ | ⬜ | |
| C8 | Lexicons: Strong's, Thayer's (Greek), Brown-Driver-Briggs and Gesenius (Hebrew), STEPBible brief lexicons | ⬜ | ⬜ | |
| C9 | Concordance: every verse that uses the same original word | ⬜ | ⬜ | |
| C10 | Usage stats: how often a word appears and how the KJV translates it | ⬜ | ⬜ | |
| C11 | Link-outs per verse and per word (Blue Letter Bible and other study sites) | ⬜ | ⬜ | |
| C12 | Featured teachers linked by passage: John Piper (Desiring God), John MacArthur (Grace to You), Paul Washer (HeartCry via SermonAudio) | ⬜ | ⬜ | |
| C13 | Embedded John Piper audio and video, whole and unaltered, with the required attribution line | ⬜ | ⬜ | |
| C14 | Curated resource library by book and topic, stored as an owner-editable data file | ⬜ | ⬜ | |
| C15 | Memorization: practice single verses and full chapters | ⬜ | ⬜ | |
| C16 | Memorization is practice only: nothing saved between sessions | ⬜ | ⬜ | |

## Reading and navigation

| ID | Requirement | Done | Tested | Evidence |
| --- | --- | --- | --- | --- |
| R1 | Quick jump by typed reference ("Jn 3:16"), accepting common book abbreviations | ⬜ | ⬜ | |
| R2 | Tabs: keep several passages, interlinear views, or word studies open and switch between them | ⬜ | ⬜ | |
| R3 | Open a new tab from a reference, a cross-reference, or a tapped word | ⬜ | ⬜ | |
| R4 | Tabs live in their own corner menu | ⬜ | ⬜ | |
| R5 | Tabs last for the current visit only; closing the site clears them | ⬜ | ⬜ | |
| R6 | Cross-references on every verse (Treasury of Scripture Knowledge and OpenBible.info) | ⬜ | ⬜ | |
| R7 | Search by keyword, phrase, Strong's number, or original-language word | ⬜ | ⬜ | |
| R8 | Audio Bible: public-domain KJV recording; verse highlighting if timings exist, otherwise chapter playback | ⬜ | ⬜ | |
| R9 | Red-letter words of Christ (toggle) | ⬜ | ⬜ | |
| R10 | Verse-per-line or paragraph layout | ⬜ | ⬜ | |
| R11 | Verse of the day, picked by date from a built-in list | ⬜ | ⬜ | |

## Study and research tools

| ID | Requirement | Done | Tested | Evidence |
| --- | --- | --- | --- | --- |
| S1 | Commentaries: Matthew Henry, Gill, Barnes, Jamieson-Fausset-Brown | ⬜ | ⬜ | |
| S2 | Bible dictionaries: Easton's, Smith's, ISBE | ⬜ | ⬜ | |
| S3 | Topical index (Nave's Topical Bible) | ⬜ | ⬜ | |
| S4 | Interactive maps of places in the text on a self-hosted base map (no third-party map service) | ⬜ | ⬜ | |
| S5 | Timelines of events, kings, and prophets | ⬜ | ⬜ | |
| S6 | People profiles: every mention of a person, plus family trees | ⬜ | ⬜ | |
| S7 | Harmony of the Gospels (parallel accounts side by side) | ⬜ | ⬜ | |
| S8 | Grammar helper: a word's parsing in plain English, from STEPBible's morphology code descriptions | ⬜ | ⬜ | |
| S9 | Guided word study: word → lexicon → every occurrence | ⬜ | ⬜ | |
| S10 | Inductive study mode with fixed observe / interpret / apply prompts; answers aren't saved | ⬜ | ⬜ | |
| S11 | Textual variants from STEPBible's Greek edition markers, for advanced users | ⬜ | ⬜ | |

## Memorization dashboard

| ID | Requirement | Done | Tested | Evidence |
| --- | --- | --- | --- | --- |
| M1 | A separate dashboard for practicing verses and chapters | ⬜ | ⬜ | |
| M2 | Pick and practice any verse, passage, or chapter, in either translation | ⬜ | ⬜ | |
| M3 | Mode: first letter (type the first letter of each word) | ⬜ | ⬜ | |
| M4 | Mode: progressive hiding (more words disappear each round) | ⬜ | ⬜ | |
| M5 | Mode: fill in the blank | ⬜ | ⬜ | |
| M6 | Mode: reference → verse | ⬜ | ⬜ | |
| M7 | Mode: verse → reference | ⬜ | ⬜ | |
| M8 | Mode: word scramble (put words back in order) | ⬜ | ⬜ | |
| M9 | Chapter mode: split into chunks, chain verses together, run the whole chapter | ⬜ | ⬜ | |
| M10 | Starter sets: built-in suggested passages (e.g., Psalm 23, Romans 8) | ⬜ | ⬜ | |
| M11 | Session score: accuracy and missed words, current session only | ⬜ | ⬜ | |

## Design

| ID | Requirement | Done | Tested | Evidence |
| --- | --- | --- | --- | --- |
| D1 | Classy and simple: minimal interface, almost no visible chrome while reading; tools appear only when called up | ⬜ | ⬜ | |
| D2 | Fonts, open-licensed and self-hosted for offline: Literata (Scripture), Inter (interface), Ezra SIL (Hebrew), Gentium Plus (Greek) | ⬜ | ⬜ | |
| D3 | Generous white space and comfortable line length | ⬜ | ⬜ | |
| D4 | Colors: background #FFFAE1, text #1C1A17, gold #A87A22, peach #F2A06B | ⬜ | ⬜ | |
| D5 | Gold for menu dots, lines, and active states; peach for soft highlights behind text | ⬜ | ⬜ | |
| D6 | Accents never used for body text | ⬜ | ⬜ | |
| D7 | Light and dark themes following the device setting (dark: near-black background, #FFFAE1 text, same accents) | ⬜ | ⬜ | |
| N1 | Two corner menus: bottom-right main menu, bottom-left tabs | ⬜ | ⬜ | |
| N2 | Press and hold a corner: a dot appears with up to 5 dots fanned in a quarter circle, connected by lines | ⬜ | ⬜ | |
| N3 | Swipe toward a dot to choose it; dots with sub-items open their own arc | ⬜ | ⬜ | |
| N4 | Main menu top level: Read, Search, Study, Memorize, Resources (up to 3 levels deep) | ⬜ | ⬜ | |
| N5 | Tabs menu: each open tab is a sphere with a short label (e.g., "Jn 3") and a view icon (passage, interlinear, word study) | ⬜ | ⬜ | |
| N6 | Swipe to a sphere to switch to that tab | ⬜ | ⬜ | |
| N7 | A "+" sphere opens a new tab | ⬜ | ⬜ | |
| N8 | Drag a sphere off the arc to close it | ⬜ | ⬜ | |
| N9 | Up to 5 tabs fit in the first arc; more go into an outer arc | ⬜ | ⬜ | |
| N10 | A small, always-visible dot in each active corner hints at the menus | ⬜ | ⬜ | |
| N11 | Desktop: click a corner dot, or use keyboard shortcuts (including switching tabs) | ⬜ | ⬜ | |
| N12 | Accessibility fallback: standard list menus for screen readers and keyboard users | ⬜ | ⬜ | |
| N13 | Web: block text selection and the browser's long-press menu inside the corner zones | ⬜ | ⬜ | |

## Platform, accessibility, and quality

| ID | Requirement | Done | Tested | Evidence |
| --- | --- | --- | --- | --- |
| P1 | Launch: website only | ⬜ | ⬜ | |
| P2 | Later iOS and Android from the same codebase, with no rewrite needed | ⬜ | ⬜ | |
| P3 | Framework: React Native with Expo, one TypeScript codebase | ⬜ | ⬜ | |
| P4 | Hosting: everything on Cloudflare (website plus Bible and study data) | ⬜ | ⬜ | |
| P5 | Open source: MIT license, public code repository | ⬜ | ⬜ | |
| P6 | Funding: donations only; no ads, no paid tiers | ⬜ | ⬜ | |
| P7 | No account: no sign-up, no login, no user data on a server | ⬜ | ⬜ | |
| P8 | Nothing saved: no settings or history stored; only app data cached | ⬜ | ⬜ | |
| P9 | Offline: installable web app; KJV, ASV, original texts, and lexicons offline after the first visit; other study data cached as viewed | ⬜ | ⬜ | |
| P10 | Accessibility: screen reader support | ⬜ | ⬜ | |
| P11 | Accessibility: adjustable font size (resets each visit) | ⬜ | ⬜ | |
| P12 | Accessibility: dyslexia-friendly font option | ⬜ | ⬜ | |
| P13 | Accessibility: dark mode | ⬜ | ⬜ | |
| P14 | Accessibility: high contrast | ⬜ | ⬜ | |
| P15 | Privacy: no tracking or analytics | ⬜ | ⬜ | |
| P16 | Interface languages: English, with all interface text in translation files | ⬜ | ⬜ | |
| P17 | Speed: any chapter opens in under 1 second | ⬜ | ⬜ | |

## Technical architecture

| ID | Requirement | Done | Tested | Evidence |
| --- | --- | --- | --- | --- |
| T1 | Stack: Expo (React Native) with Expo Router and TypeScript, exported as a static website | ⬜ | ⬜ | |
| T2 | Hosting: Cloudflare static hosting; no server code and no database | ⬜ | ⬜ | |
| T3 | Data pipeline: build-time scripts download each source, check its license, convert to compact JSON split by chapter, with a manifest recording each source and license | ⬜ | ⬜ | |
| T4 | References: standard book codes (GEN … REV); STEPBible TVTMS maps verse numbers where English and Hebrew/Greek differ | ⬜ | ⬜ | |
| T5 | Search: prebuilt indexes searched in the browser; no search server | ⬜ | ⬜ | |
| T6 | Offline: a service worker caches the app shell and core data | ⬜ | ⬜ | |
| T7 | State in memory only; the URL reflects the current passage, so back and direct links work | ⬜ | ⬜ | |
| T8 | Data licenses: code MIT; data files keep their own licenses in a separate data folder (share-alike stays share-alike) | ⬜ | ⬜ | |
| T9 | Testing: unit tests (reference parsing, data conversion); end-to-end (reading, tabs, corner menus, interlinear, search, memorization); automated accessibility checks | ⬜ | ⬜ | |
| T10 | Repo docs: README (setup, build, deploy), docs/DATA_SOURCES.md, docs/DECISIONS.md | ⬜ | ⬜ | |

## Data sources and licensing

| ID | Requirement | Done | Tested | Evidence |
| --- | --- | --- | --- | --- |
| DS1 | KJV with Strong's tags and red-letter markup (public domain; Crown rights noted for the UK) | ⬜ | ⬜ | |
| DS2 | ASV (public domain) | ⬜ | ⬜ | |
| DS3 | STEPBible TAHOT and TAGNT (CC BY 4.0; credit "STEP Bible" linked to STEPBible.org) | ⬜ | ⬜ | |
| DS4 | Lexicons: STEPBible TBESH/TBESG (TBESH terms checked); Strong's, Thayer's, BDB, Gesenius | ⬜ | ⬜ | |
| DS5 | STEPBible TEHMC/TEGMC, TVTMS, TIPNR (CC BY 4.0) | ⬜ | ⬜ | |
| DS6 | Theographic Bible Metadata, treated as CC BY-SA 4.0 | ⬜ | ⬜ | |
| DS7 | OpenBible.info Bible Geocoding Data (CC BY 4.0) | ⬜ | ⬜ | |
| DS8 | Natural Earth base map (public domain) | ⬜ | ⬜ | |
| DS9 | Cross-references: TSK (public domain) and OpenBible.info (CC BY) | ⬜ | ⬜ | |
| DS10 | Commentaries: Matthew Henry, Gill, Barnes, JFB (public domain) | ⬜ | ⬜ | |
| DS11 | Dictionaries and topical index: Easton's, Smith's, ISBE, Nave's (public domain) | ⬜ | ⬜ | |
| DS12 | Gospel harmony: A. T. Robertson (1922), public domain in the US | ⬜ | ⬜ | |
| DS13 | Audio Bible: LibriVox KJV recordings (public domain) | ⬜ | ⬜ | |
| DS14 | Fonts: Literata, Inter, Ezra SIL, Gentium Plus (SIL Open Font License) | ⬜ | ⬜ | |
| DS15 | Blue Letter Bible: linked out only, never copied | ⬜ | ⬜ | |
| DS16 | John Piper / Desiring God: linked; audio/video embedded whole and unaltered; text excerpts only; attribution line | ⬜ | ⬜ | |
| DS17 | John MacArthur / Grace to You: linked and shared; no hosting or edited versions | ⬜ | ⬜ | |
| DS18 | Paul Washer / HeartCry and SermonAudio: linked with credit, copyright notice, and HeartCry link; no edits, logo, or photos | ⬜ | ⬜ | |
| DS19 | Teaching content from ministries linked or embedded, never copied | ⬜ | ⬜ | |
| DS20 | Each license confirmed in the source's own repository before use; Theographic treated as share-alike | ⬜ | ⬜ | |
| DS21 | All attributions on the About page | ⬜ | ⬜ | |

## Build scope and order

| ID | Requirement | Done | Tested | Evidence |
| --- | --- | --- | --- | --- |
| B1 | Scaffold: Expo + TypeScript + Expo Router; placeholder deployed to Cloudflare | ⬜ | ⬜ | |
| B2 | Data pipeline: download, license-check, convert every source; write docs/DATA_SOURCES.md | ⬜ | ⬜ | |
| B3 | Reader: KJV, ASV, parallel view, reference parsing and quick jump, red letter, layouts, verse of the day | ⬜ | ⬜ | |
| B4 | Design system and navigation: colors, fonts, themes, corner quarter-radial menus, tabs menu | ⬜ | ⬜ | |
| B5 | Original languages: interlinear, word panel, lexicons, concordance, usage stats, grammar helper | ⬜ | ⬜ | |
| B6 | Search | ⬜ | ⬜ | |
| B7 | Study tools (all eleven) | ⬜ | ⬜ | |
| B8 | Memorization dashboard | ⬜ | ⬜ | |
| B9 | External resources: link-outs, featured teachers, curated library, Piper embeds | ⬜ | ⬜ | |
| B10 | Audio Bible | ⬜ | ⬜ | |
| B11 | Polish: offline, accessibility, performance, interface-language structure | ⬜ | ⬜ | |
| B12 | Launch: About page with every attribution, full test pass, production deploy to Cloudflare | ⬜ | ⬜ | |

## Out of scope (must be absent)

| ID | Requirement | Done | Tested | Evidence |
| --- | --- | --- | --- | --- |
| O1 | No accounts | ⬜ | ⬜ | |
| O2 | No saved data of any kind (settings, notes, highlights, memorization progress) | ⬜ | ⬜ | |
| O3 | No sharing or community features | ⬜ | ⬜ | |
| O4 | No AI features | ⬜ | ⬜ | |
| O5 | No reading plans | ⬜ | ⬜ | |
| O6 | No book introductions | ⬜ | ⬜ | |
| O7 | No text-to-speech | ⬜ | ⬜ | |
| O8 | No theological stance content | ⬜ | ⬜ | |
| O9 | No translations beyond KJV and ASV | ⬜ | ⬜ | |
| O10 | No app store releases | ⬜ | ⬜ | |
