# Decisions

Where the spec was unclear, the simplest option that fits the Guiding principles (free, open, no account, source-first, offline-capable) was chosen. Each entry gives the decision and the reason.

## Project setup

1. **Spec file name.** The spec lives in `Bible Study App — Requirements Spec.md` (the build request calls it SPEC.md). It is kept under its original name so the owner's file is unchanged.
2. **Single-page web export.** `web.output` is `"single"`: one `index.html` serves every route, with Cloudflare's single-page-application fallback. Static rendering of every chapter would add thousands of HTML files without serving any requirement, and a single shell is simpler to cache offline.
3. **Cloudflare Workers static assets** (not Pages). It is Cloudflare's current recommendation for static sites, runs no server code, and handles the single-page fallback in configuration (`wrangler.jsonc`).
4. **Placeholder deploy deferred.** Step 1 calls for a placeholder deploy, but deploying needs the owner's Cloudflare login. The deploy config is in place from step 1; the deploy itself is the final step, and the login is listed in the hand-off.
5. **Vitest for unit tests.** The required unit tests (reference parsing, data conversion) are plain TypeScript, and Vitest runs them without a React Native transform. End-to-end tests use Playwright against the exported site.
6. **Generated data is not committed.** `npm run data` rebuilds `public/data/` from sources pinned by commit or checksum and recorded in `data/manifest.json`. The generated files are large (hundreds of MB) and fully reproducible, so the repository holds the pipeline and the owner-edited `content/` files only.
7. **Parallel build, grouped commits.** Data converters and feature areas were built by several agents at once in their own folders. Steps were then committed in spec order once each step's checks passed, so some commits land together rather than at the moment each step finished.

## Data

8. **KJV markup license.** CrossWire's KJV module conf says `DistributionLicense=GPL` while granting use "for any purpose"; the 1769 text itself is public domain outside the UK. The converted KJV stays in its own `data/kjv/` folder with that notice, separate from the MIT code.
9. **Red letter is KJV-only.** The ASV module has no words-of-Christ markup, so the red-letter toggle applies to the KJV; the reader says so when the ASV is shown. Word taps work in both: the ASV module's Strong's tags are misaligned, so the ASV's numbers are carried over from the matching KJV words (88% of ASV words; added or reworded words stay untappable). Details are in DATA_SOURCES.md.
10. **TBESH definitions skipped.** STEPBible's Hebrew brief-lexicon definitions need Online Bible's permission. Its lemmas, transliterations, and glosses (CC BY 4.0) are used; Hebrew definitions come from Strong's and BDB.
11. **The whole STEPBible lexicon folder is CC BY-SA 4.0**, because TBESG's Middle Liddell entries are share-alike. That is simpler than splitting entries across folders and keeps share-alike data share-alike.
12. **Theographic is share-alike** (spec): its repository says CC BY-SA 4.0 although its website says CC BY 4.0.
13. **Gill skipped; Barnes is NT only; Thayer's and Gesenius skipped.** No freely licensed source exists for Gill, Thayer's, or Gesenius (details in DATA_SOURCES.md), and CrossWire's Barnes covers only the NT. The app says so where these would appear, and the About page explains each. BDB comes from Bible Aquifer's CC0 edition, the only complete free digital BDB.
14. **Strong's sources combined.** Greek comes from the morphgnt XML (CC0, complete, already structured), cross-checked with CrossWire StrongsGreek. Hebrew comes from CrossWire StrongsHebrew 1.2 for text and 3.0 for Hebrew script.
15. **Gentium Plus 6.200**, as the spec names it, rather than SIL's renamed successor Gentium 7.
16. **KJV versification everywhere.** TAHOT and TAGNT carry their own English mappings; TVTMS maps OpenBible.info's ESV numbering (only 3 John 1:15 differs). Psalm titles are verse 0 in the original-language data and the chapter title in the KJV.
17. **Cross-references:** OpenBible.info rows with zero or negative votes are dropped and the rest are sorted by votes. The verse panel shows all TSK references and OpenBible's top 10, then "Show all".
18. **Places:** OpenBible.info points only (no OpenStreetMap shapes). Places outside the map's bounds (India, Spain, Tarshish, …) are listed but not plotted.
19. **Dates are approximate.** Theographic's kings and prophets follow Floyd Nolen Jones's chronology; they are labelled approximate. No people or dates were added beyond the source, so non-writing prophets without a source event are absent.
20. **Curated derived data lives in `content/`.** The gospel-harmony section table (checked against two 1922 scans) and the LibriVox chapter map (built from the LibriVox and archive.org APIs) are kept as owner-visible files, and the pipeline validates and converts them.
21. **Audio streams from archive.org.** LibriVox's files total about 2.5 GB and are public domain at their source, so OpenBerea hosts only the chapter map and streams from where LibriVox hosts them. Audio is therefore not available offline. Where a recording covers several chapters, the player says where the chapter is.
22. **Core offline data** is the spec's list (KJV, ASV, Hebrew/Greek texts, lexicons) plus the concordance, grammar tables, and search index those features need. Commentaries, dictionaries, people, places, and maps are cached as they are viewed.

## Reading and navigation

23. **Book and chapter browser on the home page**, next to the typed quick jump, so every chapter is reachable without typing. Basic Bible navigation, not a new feature.
24. **"Jud" means Judges** in the reference parser, as in older references (TSK, Easton); Jude is "Jude" or "Jd".
25. **Parallel view:** two columns, aligned verse by verse, at 760px and wider; on phones each verse shows the KJV then the ASV, since two columns are unreadable at phone width. Parallel view is always verse per line.
26. **Interlinear follows the spec literally:** each KJV English word with the Hebrew/Greek word it translates underneath, plus transliteration and Strong's number. The original-language text is a separate reading view (Hebrew right to left). Original words the KJV doesn't render with a separate English word are listed after each verse.
27. **Aligning KJV words to Hebrew/Greek** uses Strong's numbers within the verse, plus a small table of Strong's "form families" (e.g. μου G3165 / ἐγώ G1473), because the KJV module tags by lemma and TAGNT by form. At least 95% of tagged words align in every book tested.
28. **Verse of the day:** 183 commonly memorized verses in `content/votd.json`, picked by day of the year in the reader's local time and cycling through the year.
29. **The dyslexia-friendly option** switches Scripture to the interface sans-serif (Inter) with wider letter, word, and line spacing, following British Dyslexia Association guidance. That avoids adding a font source outside the Data sources table.
30. **Font size** steps from 85% to 175%. High contrast has its own light and dark palettes. Every text color is tested for WCAG contrast in `src/theme/palette.test.ts`.

## Corner menus and tabs

31. **Main menu** (bottom right), with at most five items per arc and three levels:
    - **Read:** Go to…; Version (KJV, ASV, KJV + ASV, Hebrew/Greek, Interlinear); Display (verse per line, paragraphs, red letter); Accessibility (larger/smaller text, dyslexia-friendly font, high contrast); Listen.
    - **Search.**
    - **Study:** This passage (commentary, cross-references, inductive study, textual variants, places); Reference (dictionaries, topical index, people, timeline, maps); Word study; Harmony.
    - **Memorize:** dashboard, this passage, starter sets.
    - **Resources:** for this passage, library, featured teachers, About & credits.
32. **Labels sit beside each dot**, with dots spaced by height so labels never overlap. Open parents show as a breadcrumb near the corner instead of covering the lines to their children.
33. **Marking-menu targeting:** the ring is chosen by distance from the corner. Inside a ring, the nearest dot wins, or the closest angle for a quick flick. Once a parent's arc is open, its siblings take over only after a 260 ms dwell, so a swipe across them toward the child arc doesn't collapse it; releasing on a sibling still selects it.
34. **Tap or click the corner dot** to open a menu for tapping; press and swipe to use it as a marking menu. Escape closes it.
35. **Tabs track every page.** The spec's tab views are passage, interlinear, and word study; other pages (search, study tools) get a generic page icon and a short label. "+" opens a new tab at the home page with the quick jump ready. Closing the last tab opens a fresh home tab. Switching tabs adds a history entry, so the back button returns to the previous tab's page.
36. **Keyboard shortcuts:** M main menu, T tabs, N new tab, X close tab, [ and ] previous/next tab, 1–9 a tab, G go to, / search, ← → previous/next chapter, Esc close.
37. **Accessible fallback:** the corner dots are pointer-only and hidden from assistive technology. Two buttons, visually hidden until focused ("Open main menu", "Open tabs menu"), open the same items as standard list menus in dialogs.
38. **On the web, only the current screen is rendered** (Expo Router `Slot`); the browser keeps the history. Native builds will use a stack.

## Search and word study

39. **Search modes** are detected from the query, and the user can switch them:
    - a Strong's number (G26, H430);
    - Hebrew or Greek script;
    - a phrase in quotes;
    - otherwise words, where every word must appear, as whole words, and * matches word beginnings.
    Original-language search matches lemmas without accents or vowel points, or transliterations, through the Strong's index. The search index is the plain verse text, searched in the browser.
40. **The word panel** combines Strong's (definition, pronunciation, root), STEPBible's brief gloss, the grammar of the exact form in that verse (found through the alignment), usage counts, and links to lexicons, the word study, and other sites.

## Resources and media

41. **Only John Piper's media is embedded.** Desiring God permits embedding whole, unaltered audio and video. Grace to You forbids it. HeartCry allows it, but its sermons are linked only, keeping the page free of third-party players.
42. **YouTube loads only on request** (a "Play video" button), from youtube-nocookie.com. Audio uses `preload="none"`. Nothing from another site loads until the viewer asks.
43. **The Desiring God link is hidden for Esther and Nahum**, which have no page in Desiring God's Scripture index. Grace to You can't be linked by chapter, so its Scripture archive is linked with a note.
44. **The resource library is bundled into the app** from `content/resources.json`, so it works offline and needs no extra request. The owner edits the file and rebuilds; the pipeline validates it.
45. **Site settings** (repository, donation, and contact links) live in `content/site.json`, and are hidden until the owner fills them in.

## Offline, privacy, and quality

46. **Hand-written service worker** (no build plugin):
    - It caches the app shell at install, then downloads the core data a few files at a time, resuming on the next visit if interrupted.
    - It caches other `/data/` files as they are viewed.
    - It never intercepts other sites, per Desiring God's terms and for privacy.
    - Data caches are versioned by the data manifest's content hash.
47. **Security headers:** a strict Content-Security-Policy (only this site, plus Desiring God and archive.org audio and youtube-nocookie frames), no-sniff, a referrer policy, and a Permissions-Policy that turns off camera, microphone, geolocation, and ad topics.
48. **App icon:** an original mark echoing the corner menus, with gold dots fanning from a corner, rendered from `assets/brand/icon.svg` by `scripts/make-icons.mjs`.

## Memorization

49. **First letter:** a wrong letter doesn't advance; only the correct letter reveals the word. "Show word" moves on and counts a miss.
50. **Verse → reference is typed**, parsed like the quick-jump box, with graded feedback (close, right chapter, right book, or wrong). Typing asks for real recall, which multiple choice wouldn't.
51. **Scoring:**
    - First letter and scramble count each word once.
    - Reference → verse scores correct ÷ (expected + extra words).
    - Progressive hiding counts a word once the round that hid it ends, unless it was peeked.
52. **Chapter mode** turns on for whole chapters and passages of 6 or more verses. Chunks are about 3 verses, balanced by word count.
53. **Shuffle seed:** one random seed per page load, held in memory.

## Study tools

54. **Commentary** defaults to Matthew Henry. The entry for the requested verse is the one that starts there, or else the narrowest one covering it.
55. **Cross-references page:** full previews for the selected verse, compact links for the others.
56. **Nave's** internal links (`/study/dictionary/nave/<id>`) render the topic view directly.
57. **Textual variants** is disabled for Old Testament passages. It lists only verses with differences and explains the eight editions neutrally.
58. **Inductive prompts** are fixed and method-only (Observe, Interpret, Apply), with no doctrinal content. Answers live in component state and clear on leave, reload, or restore from the back/forward cache.

## Maps, timelines, people, harmony

59. **Place confidence:** OpenBible.info scores of 700 or more read as high confidence, 300–699 as medium, and below 300 as low; the percentage is shown too.
60. **Event eras** follow the source chronology (e.g. the division of the kingdom at 975 BC), and the events timeline shows one era at a time. All 450 events on one page was slow on phones.
61. **Maps** open fitted to the frame. `?ch=` shows a chapter's places and `?place=` selects one. Tapping the same spot again cycles through places stacked at one point (e.g. Jerusalem, Zion).
62. **Harmony columns** sit side by side only when each would be at least 230px wide; on phones the accounts stack under gospel headings. The verse tool "Harmony" appears only for Gospel verses that a section covers.
63. **Family trees** run down a single spine of generations (grandparents to grandchildren) with every name a link, so they stay readable at phone width without a graph library.

## Performance

64. **Route code splitting on the web** (`asyncRoutes` in app.json) plus on-demand loading of the Hebrew/Greek view, word panel, audio player, and verse-tool panels keeps the startup bundle to the framework and the reader.
65. **A same-origin boot script** (`public/boot.js`) starts downloading the current chapter's data while the app's scripts load, and the Scripture font is preloaded. Chapters open in under a second in the app and on repeat visits. A first-ever visit on a slow mobile network still waits for the scripts (about 3.6 s on throttled 4G). Pre-rendering chapter HTML would be the next step if that matters.

## Added after launch

Requests from the site owner after the first release.

66. **Light / dark toggle under Resources** (the site owner's request after launch). The spec's themes follow the device setting; the toggle flips whichever theme is showing, for this visit only. Like font size and high contrast it's held in memory, so nothing is saved and a reload returns to the device setting. The page behind the app (background, scrollbars, the browser's bar color) follows the choice through `html[data-theme]`.
67. **Corner menus are richly animated** (the site owner's request after launch; everything else stays still). On the web, a small engine (`src/components/radial/engine.web.ts`) springs every dot, line, and label:
    - Closed: the corner dot breathes, pings faintly every 7 s, and swells and leans toward a pointer or finger that comes within about 240 px, while preview dots fan out along the arc.
    - Open: items fly out from the preview dots with a staggered spring, lines stretch with them, labels slide in, and dotted ring guides grow from the corner. Items drift gently, and items near the pointer magnify like a dock. The item a release would choose fills with gold, glows, and shows its icon. Light runs along the lines of the open path, and a swipe leaves a trail.
    - Closing: the chosen item bursts and the rest fall back into the corner.
    - Tab spheres trail a drag with a tilt, shake when far enough out to close, pop when closed, and glide when the arc re-spreads.
68. **How the motion stays out of the way.**
    - Test ids sit on still anchors at each item's resting place, and removed pieces animate out as clones on an `aria-hidden` layer without ids. The menus behave exactly as before for gestures, tests, and assistive technology.
    - The loop runs only while something is moving, and the idle loops are compositor-only CSS animations.
    - With `prefers-reduced-motion`, nothing moves or loops; menus simply fade.
    - Labels now count as part of their item: hovering one lights its dot, and tapping one chooses it, but a dot directly under the pointer always wins.
    - Releasing the corner dot without swiping leaves the menu open for tapping, however long it was held.
69. **Fewer clicks and taps to reach the menus** (the site owner's request after launch).
    - Mouse: resting on a corner dot for 80 ms opens its menu, and resting on an item with sub-items for 120 ms opens its arc, so one click chooses anything. The short waits keep a pointer passing by from opening menus and arcs. Moving away from the open menu closes it after 300 ms. Clicking the dot keeps the menu open until the next click, and press-and-swipe still works.
    - Touch screens (no hover): the corner dots are hidden. A swipe in from the left or right edge opens that side's menu: tabs on the left, the main menu on the right. The swipe may start up to 32 px in, so it still works beside the phone's own back-gesture strip. The finger can carry on to an item, opening arcs as it goes, and lift there to choose it. It must rest on the item for 120 ms first, so a quick swipe that happens to end on one leaves the menu open instead. Vertical scrolls, and swipes that start on a map, a sideways-scrolling row, or away from the edge, are left alone. This replaces spec N10's always-visible dot on touch screens.
    - Only one menu is open at a time.
    - The app's root clips its overflow: on phones the main menu's touch zone stuck out 2 px past the screen, which let the whole page pan sideways.
70. **Interrupted animations carry on smoothly.** Hovering opens and closes menus and arcs often, so the engine now runs exits itself, frame by frame with the same curves and timings, instead of handing them to the browser. A menu, arc, or label that comes back while its copy is still leaving takes over from the copy. It starts where the copy is, moving as it was, and springs back to its place, rather than restarting its entrance beside a fading double. Ring guides keep their spin angle, and the corner dot cross-fades with the open menu's own dot.
