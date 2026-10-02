# OpenBerea — Requirements Spec

Oct 1, 2026 · @Gray

## Overview

OpenBerea is a free, open-source Bible study resource: fast and modern, built to pull up during a church service or a study. It launches as a website; iOS and Android follow once it proves useful. No account needed.

Guiding principles:

- **Free:** no ads, no paid features; costs covered by donations
- **Open:** open-source code (MIT license) and only public-domain texts
- **No account:** nothing to sign up for; no settings or history saved
- **Source-first:** every definition links back to the text
- **Offline-capable:** Bible texts are cached after the first visit, so reading works without internet

## Instructions for Claude Code

This spec is the full scope of the first release. Build all of it.

- Build everything in this document as one website release; there is no MVP phase. Follow the Build scope and order section.
- Keep the code mobile-compatible (Expo), but don't build or publish iOS or Android apps yet.
- Don't add anything listed under Out of scope, or any feature not described here.
- Use only the data sources in the Data sources table. Before using one, confirm its license in its own repository; if it isn't free for this use, skip it and note why in docs/DATA\_SOURCES.md.
- Never store user data: no accounts, cookies, localStorage, or IndexedDB for user state. The service worker may cache app data (texts, lexicons, study data) only.
- Credit every source on an About page, with the exact attribution each license requires.
- Check that every external link pattern (Blue Letter Bible, teacher sites) actually resolves before shipping.
- Where this spec is unclear, choose the simplest option that fits the Guiding principles and record it in docs/DECISIONS.md.
- Commit after each build step, with tests passing.

## Core requirements

The four pillars of the app.

1. **Bible translations**
   - KJV and ASV, both public domain, cached for offline use
   - Read either translation and switch instantly
   - Side-by-side parallel view
2. **Original languages (Blue Letter Bible–level)**
   - Hebrew/Aramaic Old Testament and Greek New Testament text (Hebrew shown right-to-left with vowel points)
   - Tap any word to see: Strong's number, root word, transliteration, pronunciation, definition, grammar parsing
   - Pronunciation as phonetic spelling; add audio only if a free, licensed source exists
   - Interlinear view (original word under each English word)
   - Lexicons: Strong's, Thayer's (Greek), Brown-Driver-Briggs and Gesenius (Hebrew), plus STEPBible's brief lexicons
   - Concordance: every verse that uses the same original word
   - Usage stats: how often a word appears and how the KJV translates it
3. **External resources**
   - Links out per verse and per word (Blue Letter Bible and other study sites)
   - Featured teachers, linked by passage: John Piper (Desiring God), John MacArthur (Grace to You), Paul Washer (HeartCry, via SermonAudio)
   - Embedded John Piper audio and video (whole and unaltered, with the required attribution line)
   - Curated resource library organized by book and topic, stored as a data file the owner can edit
4. **Memorization dashboard (separate area)**
   - Practice single verses and full chapters
   - Practice only: nothing is saved between sessions
   - Full feature list in the Memorization dashboard section

## Reading and navigation

Everyday reading features.

- Quick jump by typed reference ("Jn 3:16"), accepting common book abbreviations
- **Tabs:** keep several passages, interlinear views, or word studies open and bounce between them
  - Open a new tab from a reference, a cross-reference, or a tapped word
  - Tabs live in their own corner menu (see Design)
  - Tabs last for the current visit only; closing the site clears them
- Cross-references on every verse (Treasury of Scripture Knowledge and OpenBible.info)
- Search by keyword, phrase, Strong's number, or original-language word
- Audio Bible: public-domain KJV recording; highlight along with the reading if verse timings are available, otherwise chapter playback only
- Red-letter words of Christ (toggle)
- Verse-per-line or paragraph layout
- Verse of the day, picked by date from a built-in list

## Study and research tools

Study features.

- Commentaries (public domain: Matthew Henry, Gill, Barnes, Jamieson-Fausset-Brown)
- Bible dictionaries (Easton's, Smith's, ISBE)
- Topical index (Nave's Topical Bible)
- Interactive maps of places in the text, on a self-hosted base map (no third-party map service)
- Timelines of events, kings, and prophets
- People profiles: every mention of a person, plus family trees
- Harmony of the Gospels (parallel accounts side by side)
- Grammar helper: explains a word's parsing in plain English, from STEPBible's morphology code descriptions
- Guided word study: word → lexicon → every occurrence
- Inductive study mode with fixed observe / interpret / apply prompts (answers aren't saved)
- Textual variants (manuscript differences), from STEPBible's Greek edition markers, for advanced users

## Memorization dashboard

A separate dashboard for practicing verses and chapters on the spot; nothing is saved between sessions.

- **Pick and practice:** any verse, passage, or chapter, in either translation
- **Practice modes:**
  - First-letter: type the first letter of each word
  - Progressive hiding: more words disappear each round
  - Fill in the blank
  - Reference → verse, and verse → reference
  - Word scramble: put words back in order
- **Chapter mode:** split into chunks, chain verses together, run the whole chapter
- **Starter sets:** built-in suggested passages (e.g., Psalm 23, Romans 8)
- **Session score:** accuracy and missed words for the current session only

## Design

Classy and simple: the text is the focus, and tools appear only when called up.

**Look and feel**

- Minimal interface with almost no visible chrome while reading
- **Fonts** (open-licensed, self-hosted for offline use): Literata for Scripture, Inter for interface labels, Ezra SIL for Hebrew, Gentium Plus for Greek
- Generous white space and comfortable line length
- **Colors** (hex values other than the background are proposed starting points):
  - Background: #FFFAE1 (yellowy off-white)
  - Text: near-black, #1C1A17
  - Accents, used sparingly: gold #A87A22 and peach #F2A06B, inspired by Ella Langley's Peaches & Honey BUM Energy can
  - Gold for menu dots, lines, and active states; peach for soft highlights behind text
  - Accents never used for body text; they're too faint on the off-white to read
- Light and dark themes, following the device setting (dark: near-black background, #FFFAE1 text, same accents)

**Navigation: corner quarter-radial menus**

Each menu is a quarter of a radial (pie) menu, fanning out from a screen corner. With swipe-to-select and nested arcs, the pattern is called a marking menu.

- **Two corners, two menus** (proposed placement; can be swapped):
  - Bottom-right: main menu
  - Bottom-left: tabs
- **How it works:** press and hold a corner; a dot appears with up to 5 dots fanned out in a quarter circle, connected by lines
- Swipe toward a dot to choose it; dots with sub-items open into their own arc
- **Main menu, top level (proposed):** Read, Search, Study, Memorize, Resources (up to 3 levels deep)
- **Tabs menu:** each open tab is a sphere
  - Each sphere shows a short label (e.g., "Jn 3") and an icon for its view: passage, interlinear, or word study
  - Swipe to a sphere to switch to that tab
  - A "+" sphere opens a new tab
  - Drag a sphere off the arc to close it
  - Up to 5 tabs fit in the first arc; more go into an outer arc
- A small, always-visible dot in each active corner hints that the menus are there
- Desktop: click a corner dot, or use keyboard shortcuts (including switching tabs)
- Accessibility fallback: standard list menus for screen readers and keyboard users
- Web: block text selection and the browser's long-press menu inside the corner zones

## Platform, accessibility, and quality

Requirements that apply across every feature.

- **Launch:** website only, until it proves useful
- **Later:** iOS and Android apps from the same codebase, no rewrite needed
- **Framework:** React Native with Expo (one TypeScript codebase that targets web now and mobile later)
- **Hosting:** everything on Cloudflare (the website and its Bible and study data)
- **Open source:** MIT license, public code repository
- **Funding:** donations only; no ads, no paid tiers
- **No account:** no sign-up, no login, no user data on a server
- **Nothing saved:** no settings or history stored; only app data (texts, lexicons, study data) is cached
- **Offline:** installable web app; KJV, ASV, original-language texts, and lexicons work offline after the first visit; other study data is cached as it's viewed
- **Accessibility:** screen reader support, adjustable font size (resets each visit), dyslexia-friendly font option, dark mode, high contrast
- **Privacy:** no tracking or analytics
- **Interface languages:** English, with all interface text in translation files so more languages can be added
- **Speed:** any chapter opens in under 1 second

## Technical architecture

How the pieces fit together.

- **Stack:** Expo (React Native) with Expo Router and TypeScript, exported as a static website
- **Hosting:** Cloudflare static hosting; no server code and no database unless a feature can't work without one
- **Data pipeline:** build-time scripts download each source, check its license, and convert it to compact JSON split by chapter (e.g., data/kjv/JHN/3.json), with a manifest recording each source and license
- **References:** standard book codes (GEN … REV); STEPBible's TVTMS data maps verse numbers where English and Hebrew/Greek numbering differ
- **Search:** prebuilt indexes searched in the browser; no search server
- **Offline:** a service worker caches the app shell and core data (see Platform)
- **State:** kept in memory only (tabs, current passage, memorization session); the URL reflects the current passage so the back button and direct links work
- **Data licenses:** code is MIT; data files keep their own licenses in a separate data folder (share-alike data stays share-alike)
- **Testing:** unit tests for reference parsing and data conversion; end-to-end tests for reading, tabs, corner menus, interlinear, search, and memorization; automated accessibility checks
- **Repo docs:** README (setup, build, deploy), docs/DATA\_SOURCES.md, docs/DECISIONS.md

## Data sources and licensing

Bible texts and study data are public domain or openly licensed, so they ship with the app and work offline. Teaching content from ministries is linked or embedded, never copied.

| Category | Source | License / terms |
| --- | --- | --- |
| Translations | KJV (with Strong's tags and red-letter markup, e.g., CrossWire's KJV module), ASV | Public domain (KJV: Crown rights apply in the UK) |
| Original-language texts and interlinear | [STEPBible Data](https://github.com/STEPBible/STEPBible-Data): TAHOT (Hebrew/Aramaic OT) and TAGNT (Greek NT), with Strong's numbers, morphology, English glosses, and edition markers | CC BY 4.0; credit "STEP Bible" linked to STEPBible.org |
| Lexicons | STEPBible TBESH and TBESG; Strong's, Thayer's, Brown-Driver-Briggs, Gesenius | CC BY 4.0 (check TBESH Hebrew definition terms); others public domain |
| Morphology, versification, proper names | STEPBible TEHMC/TEGMC, TVTMS, TIPNR | CC BY 4.0 |
| People, events, timelines | Theographic Bible Metadata | CC BY-SA 4.0 |
| Map locations | [OpenBible.info Bible Geocoding Data](https://github.com/openbibleinfo/Bible-Geocoding-Data) | CC BY 4.0 |
| Base map | Natural Earth | Public domain |
| Cross-references | Treasury of Scripture Knowledge; OpenBible.info cross-references | Public domain; CC BY |
| Commentaries | Matthew Henry, Gill, Barnes, Jamieson-Fausset-Brown (e.g., via [Free Use Bible API](https://learnofchrist.com/resources/free-use-bible-api) or CrossWire modules) | Public domain |
| Dictionaries and topical index | Easton's, Smith's, ISBE, Nave's | Public domain |
| Gospel harmony | A. T. Robertson's Harmony of the Gospels (1922) | Public domain in the US |
| Audio Bible | LibriVox KJV recordings | Public domain |
| Fonts | Literata, Inter, Ezra SIL, Gentium Plus | SIL Open Font License |
| Blue Letter Bible | Its own site content | Not free to copy; link out instead |
| John Piper | [Desiring God](https://desiringgod.org/permissions) sermons, articles, audio, video | Link freely; embed audio/video whole and unaltered; text as excerpts only; attribution line required |
| John MacArthur | [Grace to You](https://www.gty.org/about#copyright) sermons and articles | Link and share; no hosting or edited versions |
| Paul Washer | [HeartCry](https://heartcrymissionary.com/copyrights-and-permissions/) and SermonAudio sermons | Link; credit, copyright notice, and HeartCry link required; no edits, logo, or photos |

Licenses above are a starting point: confirm each in the source's own repository before use. Theographic's site and repository list different licenses, so treat it as share-alike. All attributions go on the About page.

## Build scope and order

Everything in this document ships together as one website release; there is no MVP phase. Build it in this sequence:

1. **Scaffold:** Expo + TypeScript + Expo Router; deploy a placeholder to Cloudflare
2. **Data pipeline:** download, license-check, and convert every source; write docs/DATA\_SOURCES.md
3. **Reader:** KJV, ASV, parallel view, reference parsing and quick jump, red letter, layouts, verse of the day
4. **Design system and navigation:** colors, fonts, themes, corner quarter-radial menus, tabs menu
5. **Original languages:** interlinear, word panel, lexicons, concordance, usage stats, grammar helper
6. **Search**
7. **Study tools:** cross-references, commentaries, dictionaries, topical index, maps, timelines, people profiles, gospel harmony, guided word study, inductive mode, textual variants
8. **Memorization dashboard**
9. **External resources:** link-outs, featured teachers, curated library, Piper embeds
10. **Audio Bible**
11. **Polish:** offline, accessibility, performance, interface-language structure
12. **Launch:** About page with every attribution, full test pass, production deploy to Cloudflare

Later (not built now): iOS and Android apps from the same codebase, once the website proves useful.

Out of scope for this version: accounts, saved data of any kind (settings, notes, highlights, memorization progress), sharing, community, AI features, reading plans, book introductions, text-to-speech, theological stance content, translations beyond KJV and ASV, and app store releases.
