# Data sources and licenses

Every source in the spec's Data sources table was checked against the license in its own repository or site before use. This file records the result. Each source is used as is, used in part, or skipped, with the reason. The same records, with exact attribution text, ship in `data/manifest.json` and appear on the About page. Each data folder under `data/` carries a `LICENSE.txt` for its source.

Code is MIT. Data keeps its own license in its own folder, and share-alike data (Theographic, the STEPBible lexicon folder) stays share-alike.

Checked on 2026-10-02. Versions are pinned by commit SHA or file checksum in `scripts/pipeline/stages/*`, and a changed upstream file fails the pipeline instead of being converted silently.

## Summary

| Source | Used for | License (as confirmed) | Status |
| --- | --- | --- | --- |
| KJV (CrossWire KJV module 3.1) | KJV text with Strong's, morphology, red letter, italics, paragraphs | Public-domain text (Crown rights in the UK); module markup under CrossWire's GPL grant "to use this text for any purpose" | **Used** |
| ASV (CrossWire ASV module 2.0) | ASV text; Strong's numbers carried over from the KJV | Public domain | **Used** (the module's own Strong's tags are misaligned, so unused) |
| STEPBible TAHOT, TAGNT | Hebrew/Aramaic and Greek text, interlinear, morphology, glosses, edition markers | CC BY 4.0 | **Used** |
| STEPBible TBESG | Greek brief lexicon (Abbott-Smith, Middle Liddell, STEPBible) | CC BY 4.0, with Middle Liddell entries CC BY-SA 4.0 | **Used** (folder is CC BY-SA 4.0) |
| STEPBible TBESH | Hebrew brief lexicon | CC BY 4.0 for lemma, gloss, morphology; definitions need Online Bible's permission | **Used in part** (definitions column skipped) |
| STEPBible TEHMC, TEGMC | Grammar helper (plain-English parsing) | CC BY 4.0 | **Used** |
| STEPBible TVTMS | Mapping ESV/NRSV numbering (OpenBible.info) to KJV | CC BY 4.0 | **Used** (build time only) |
| STEPBible TIPNR | Proper-name tags on Hebrew/Greek words | CC BY 4.0 | **Used** (AI-written descriptions excluded) |
| Strong's (CrossWire StrongsHebrew 1.2 + 3.0, StrongsGreek 2.0; morphgnt Strong's Greek XML) | Strong's dictionary: lemma, transliteration, pronunciation, root, definition, KJV usage | Public domain; morphgnt XML CC0 | **Used** |
| Thayer's Greek-English Lexicon | (Greek lexicon) | No freely licensed, reliable digital edition found | **Skipped** |
| Brown-Driver-Briggs (Bible Aquifer edition) | Hebrew/Aramaic lexicon | Public-domain text; Aquifer edition CC0 | **Used** |
| Gesenius's Hebrew-Chaldee Lexicon | (Hebrew lexicon) | Only non-commercial (CC BY-NC) or unverified digital editions | **Skipped** |
| Theographic Bible Metadata | People, family trees, events, timelines of kings and prophets | CC BY-SA 4.0 (repository); website says CC BY 4.0, so it is treated as share-alike | **Used** |
| OpenBible.info Bible Geocoding Data | Map locations and the verses that mention them | CC BY 4.0; OpenStreetMap-derived parts ODbL | **Used** (points only) |
| Natural Earth 5.1.2 | Self-hosted base map | Public domain | **Used** |
| Treasury of Scripture Knowledge (CrossWire TSK 1.5) | Cross-references | Public domain | **Used** |
| OpenBible.info cross-references | Cross-references | CC BY 4.0 | **Used** |
| Matthew Henry (CrossWire MHC 2.2) | Commentary | Public domain | **Used** |
| Jamieson-Fausset-Brown (CrossWire JFB 3.0) | Commentary | Public domain | **Used** |
| Barnes' Notes (CrossWire Barnes 1.1) | Commentary | Public domain | **Used** (New Testament only; that's all the module covers) |
| Gill's Exposition | Commentary | Only digital edition is "All Rights Reserved" | **Skipped** |
| Easton's, Smith's, ISBE, Nave's (CrossWire modules) | Dictionaries and topical index | Public domain | **Used** |
| A. T. Robertson, *A Harmony of the Gospels* (1922) | Gospel harmony | Public domain in the US | **Used** |
| LibriVox KJV recordings | Audio Bible | Public domain | **Used** (streamed from archive.org; only the chapter map is hosted) |
| Literata, Inter, Ezra SIL, Gentium Plus | Fonts | SIL Open Font License 1.1 | **Used** (served unmodified) |
| Blue Letter Bible | Link-outs | Not free to copy | **Linked only** |
| John Piper / Desiring God | Teacher links; embedded audio and video | Link freely; embed whole, unaltered audio/video; attribution required | **Linked and embedded** (no text copied) |
| John MacArthur / Grace to You | Teacher links | Link and share; no hosting or embedding | **Linked only** |
| Paul Washer / HeartCry (via SermonAudio) | Teacher links | Link and embed allowed; no hosting, edits, logo, or photos; credit required | **Linked only** |

## Bible texts

### KJV: CrossWire KJV module
- **Source:** https://www.crosswire.org/ftpmirror/pub/sword/packages/rawzip/KJV.zip, module version 3.1 (2023-07-19), pinned by sha256 in `scripts/pipeline/stages/crosswire-texts.ts`.
- **License, as stated in the module's `.conf`:** `DistributionLicense=GPL`. About: "The rights to the base text are held by the Crown of England. … CrossWire grants a general public license to use this text for any purpose." The 1769 KJV text is public domain outside the UK.
- **Attribution:** "King James Version (1769), public domain outside the UK (Crown rights in the UK). Text and Strong's/morphology/red-letter markup from the CrossWire Bible Society KJV module."
- **Used:** text, Strong's numbers, morphology codes, words of Christ (red letter), translators' added words (italics), small-caps divine name, paragraph marks, and Psalm titles. Study notes are dropped.
- **Verified:** all 31,102 verses are present and non-empty. Verse counts match SWORD's canon.h and `src/lib/bible/versification.json`. Every verse's text and Strong's sequence equal an independent tag-strip of the raw module. Spot checks: Gen 1:1, John 3:16, John 11:35, Ps 23:1 and its title, Ps 119:1, Esther 8:9, Mal 4:6. 2,026 red-letter verses and 2,970 paragraph starts.

### ASV: CrossWire ASV module
- **Source:** CrossWire `ASV.zip`, module 2.0, pinned by sha256. **License:** public domain (`.conf`).
- **Used:** text, translators' added words (italics), and paragraph marks. The reader's red letter applies to the KJV only (the ASV has no words-of-Christ markup). The 16 verses the ASV prints only as footnotes (e.g. Matt 17:21) are kept as empty verses so the numbering matches.
- **The module's Strong's tags are not used.** It tags 87% of words, but usually with a neighbouring word's number: in Gen 1:1 "In" is H430 and "the" H853, and in Ps 23:1 "is", "my", "I" and "shall" are all H3068. On words identical to the KJV, its number agrees with the KJV's only 47% of the time (83% on content words), so the wrong ones can't be told apart from the right ones.
- **Strong's numbers come from the KJV instead** (`scripts/pipeline/lib/asv-strongs.ts`). The ASV is a light revision of the KJV, so each ASV verse is aligned to the KJV verse word by word. The steps are:
  - identical words, including phrases of three or more words the ASV moved, with "Jehovah" matching the KJV's small-caps LORD;
  - respellings and systematic substitutions inside the gaps ("honour"/"honor", "Ghost"/"Spirit", "which"/"who", "any thing"/"anything");
  - one-for-one swaps between two matched words ("wells"/"springs"), but only when both are content words or both are function words. A swap of "and" or "the" for a content word means the ASV reworded the phrase, so the word stays untagged.

  Each matched ASV word takes the Strong's numbers and morphology of the KJV phrase it belongs to. Words the ASV adds or rewords, and its own italics, stay untagged, so they can't be tapped.
- **Coverage:** 87.8% of ASV words are tagged (688,349 of 783,567), against 94.3% in the KJV. Tagged: 84.0% of all words are identical to the KJV, 1.5% are respelled or substituted, and 2.3% are one-for-one swaps. Untagged: 4.4% match words the KJV itself leaves untagged (its italics), 0.5% are ASV italics, and 7.2% have no KJV counterpart.
- **Verified:** the text, italics, paragraphs, titles, and empty verses are unchanged: stripping the tags gives back the untagged conversion exactly, and the search corpus is byte-identical. Every tag is checked to be a KJV tag of the same verse. Tagged ASV words align with the Hebrew/Greek words as well as the KJV's do (99.5% of tagged words in Genesis, 99.6% in Psalms, 98.8% in John, 99.0% in Romans). Spot checks: Gen 1:1 "God" H430 and "heavens" H8064; Ps 23:1 "Jehovah" H3068; John 3:16 "loved" G25 and "eternal" G166; Acts 2:4 "Spirit" G4151; and Rom 8:28's moved "to them that love" G25.

## Original languages and lexicons (STEPBible)

- **Source:** https://github.com/STEPBible/STEPBible-Data at commit `b99716b0cddb648ddb95cc786a197180f2f97d48` (2026-09-18).
- **License:** the README says CC BY 4.0 and asks: *Credit it to "STEP Bible" linked to www.STEPBible.org*. File headers say "Data created by www.STEPBible.org based on work at Tyndale House Cambridge (CC BY 4.0)" and ask users not to redistribute the raw files, to link back to the repository, and to note changes. OpenBerea ships converted files only, links back from the About page, and records its changes in `data/stepbible/CHANGES.txt`.
- **Upstream notes:** TAHOT's morphology derives from ETCBC (CC BY-NC); OpenBerea is non-commercial. TAGNT's English glosses come from the Berean Study Bible, public domain since 2023. TAGNT's Spanish and sub-meaning columns come from OpenGNT (CC BY-SA) and are not used, apart from name ids.

| Dataset | Output | Notes |
| --- | --- | --- |
| TAHOT, TAGNT | `stepbible/orig/` | KJV verse numbering (TAHOT gives English refs with Hebrew in brackets; TAGNT gives KJV alternates). Every KJV verse has original words. 305,638 Hebrew/Aramaic and 142,096 Greek words. |
| TBESG | `stepbible/lex/` (CC BY-SA 4.0 folder) | 11,035 entries: Abbott-Smith (public domain) 5,708, Middle Liddell (Perseus, CC BY-SA 4.0) 2,305, STEPBible 3,022. |
| TBESH | `stepbible/lex/` | 11,682 entries with lemma, transliteration, part of speech, and gloss only. **Definitions skipped:** the file says they are "based on the Abridged BDB by Online Bible, © Larry Pierce … Permission should be gained from Online Bible before these are applied in any project." |
| TEHMC, TEGMC | `stepbible/morph/` | 921 Hebrew and 1,644 Greek codes; 100% of the codes used in TAHOT and TAGNT resolve. |
| TAGNT edition markers | `stepbible/variants/` | 10,156 words present only in some editions, plus 3,932 alternative readings. |
| TIPNR | `stepbible/names.json` | 4,162 names. TIPNR's AI-generated descriptions are excluded. |
| TVTMS | (build time) | Maps OpenBible.info's ESV numbering to KJV (only 3 John 1:15 → 1:14 differs). |
| Concordance | `stepbible/conc/` | Built from TAHOT/TAGNT plus KJV renderings: 13,930 Strong's numbers. Spot checks: G25 = 143 occurrences in 110 verses; H430 = 2,603. |

### Strong's dictionaries
- **Sources:** CrossWire StrongsHebrew 1.2 (definitions, pronunciation, derivation, KJV usage) and 3.0 beta (Hebrew script); StrongsGreek 2.0 (cross-check); and the morphgnt Strong's Greek dictionary XML (commit `dd6758b8`, CC0), which is the same 1890 text, already split into fields.
- **License:** public domain (module `.conf` files); the morphgnt XML is CC0.
- **Why morphgnt for Greek:** StrongsGreek 2.0 lacks 34 real entries (e.g. G2309 θέλω), mislabels Hebrew cross-references, and has stray non-English notes in 53 pronunciations.
- **Verified:** every number G1–G5624 and H1–H8674 is present; 101 are stubs for numbers Strong's never used. Spot checks: G25 ἀγαπάω "ag-ap-ah'-o"; G26 "from G25"; H430 "plural of H433".

### Brown-Driver-Briggs
- **Source:** Bible Aquifer, BibleAquifer/BDBHebrewLexicon (commit `09fbdf3`) and BDBAramaicLexicon (commit `7ccfaf4`). **License:** "This edition of the Brown-Driver-Briggs Hebrew Lexicon is licensed with a CC0 license and is in the public domain" (README and `eng/metadata.json`). The 1906 text is public domain. Aquifer's text comes from the University of Texas digitization (via jackweinbender/bdb_parse and Sefaria) and uses Open Scriptures HebrewLexicon data (CC BY 4.0, "credit the Open Scriptures Hebrew Bible Project"), which is credited.
- **Why not Open Scriptures' own BDB:** its BDB file is "a work in progress"; for 69% of Strong's numbers its entry is an outline without Scripture references.
- **OpenBerea changes:** BDB's Hebrew verse numbers are mapped to KJV (12,629 refs). Strong's markers are checked against Strong's lemmas, and 385 doubtful markers are dropped. 61 "Jo" refs coded as John are recoded to Joel. Coverage: 8,637 of 8,674 Strong's numbers (99.6%), with 148,544 Scripture links.

### Thayer's Greek-English Lexicon: skipped
No candidate was both reliable and clearly free to redistribute:
- **imbennyhim/Every-Promise-Thayers (CC0):** decoded from the e-Sword "Thayer's Unabridged" module, whose digitizer and license are unstated. The text is identical to Bible Hub's and is sold commercially, and the repository's own parent licenses it CC BY-SA.
- **nigelmsipa/thayers-greek-lexicon-dataset (CC0):** an unreviewed single-pass AI transcription of the 1889 scan. It has invented text, page-split entries, and placeholders, and only 64% is keyed to Strong's.
- **Abridged editions:** aist-lexicons and the MySword modules are abridged Online Bible / Bible Analyzer editions.
- **Incomplete:** Wikisource covers 128 of about 750 pages, and the archive.org OCR has unreadable Greek.
- **Unavailable:** CrossWire, Perseus, and CCEL have no Thayer; BLB, Logos, and Accordance are proprietary.

The word study shows a note instead, and the STEPBible brief lexicon includes Abbott-Smith's public-domain Greek lexicon.

### Gesenius's Hebrew-Chaldee Lexicon: skipped
- **eliranwong/ETCBC-remix's Gesenius (Tregelles):** CC BY-NC 4.0 ("can only be re-used for FREE and non-commercial purpose"). Its digitizer is unstated, and it is not keyed to Strong's.
- **MySword SC-Gesenius:** inherits that license.
- **machshev/gesenius-lexicon:** an unreviewed OCR pilot of 217 entries.
- **Unusable:** archive.org OCR has unreadable Hebrew, and BLB serves page images.

Using the ETCBC-remix edition would need Eliran Wong's permission; it is listed for the owner in the hand-off.

## Study data

### Cross-references
- **Treasury of Scripture Knowledge:** CrossWire TSK 1.5 (beta repository; OSIS with explicit references), public domain. 337,314 references on 29,458 verses, all valid KJV verses. One keyword-less 15-reference group on Gen 1:1, which exists only in the beta, is excluded as unrelated.
- **OpenBible.info cross-references:** https://a.openbible.info/data/cross-references.zip (sha256 `224f28aa…`). The page says: "Unless otherwise indicated, all content is licensed under a Creative Commons Attribution License" (CC BY 4.0). Attribution: "Cross-references from OpenBible.info, CC BY 4.0." 341,265 rows kept; the 3,534 with zero or negative votes are dropped.

### Commentaries (CrossWire)
- **Matthew Henry** (MHC 2.2, complete), **Jamieson-Fausset-Brown** (JFB 3.0), and **Barnes' Notes** (Barnes 1.1, New Testament only, since that is all the module contains). All public domain.
- JFB's 1,294 comments that the module's index doesn't point to are re-attached by their verse numbers, so John 3:16 has its own comment.
- **Gill's Exposition: skipped.** The only digital edition, Larry Pierce's (Online Bible), is marked "All Rights Reserved" in its CrossWire/Xiphos conf. The Free Use Bible API's copy is the same text word for word.
- The Free Use Bible API (bible.helloao.org) was also evaluated. It has no Barnes, unlinked plain-text references, and the same Gill text, so CrossWire was used.

### Dictionaries and topical index (CrossWire)
- Easton 2.0.1 (3,961 entries), Smith 1.3 (4,561), ISBE 2.2 (9,343), and Nave 3.0 (5,319 topics); all public domain.
- The modules' auto-generated verse links are often wrong, so every link is re-read from its displayed text and checked against the KJV versification: 211,941 links, of which 1,563 were corrected, with no invalid links left.

### People, events, timelines: Theographic Bible Metadata
- **Source:** https://github.com/robertrouse/theographic-bible-metadata at commit `cfb1c485`.
- **License:** the repository's LICENSE file is CC BY-SA 4.0, and the README says "This work is free to use and copy under a Creative Commons Attribution Share-Alike 4.0 License." The website says CC BY 4.0. As the spec directs, it is treated as share-alike: `data/theographic/` is CC BY-SA 4.0.
- **Attribution:** "People, family-tree, event and timeline data adapted from Theographic Bible Metadata by Robert Rouse (viz.bible), CC BY-SA 4.0. Modified."
- **Notes:**
  - Easton's text inside profiles is public domain.
  - Kings and prophets come from the "Reign of …" and "Prophecies of …" events. They are dated with Floyd Nolen Jones's chronology and shown as approximate.
  - Twenty clearly inconsistent person dates were replaced by event dates. No people or dates were invented.
  - Prophets without a source event, such as Samuel and Nathan, are absent.

### Places: OpenBible.info Bible Geocoding Data
- **Source:** https://github.com/openbibleinfo/Bible-Geocoding-Data at commit `7eb18a5e`.
- **License:** "This data is licensed under a Creative Commons Attribution 4.0 license. OpenStreetMap data is licensed under ODbL 1.0."
- **Attribution:** "Bible place locations from OpenBible.info, CC BY 4.0. Includes some data © OpenStreetMap contributors (ODbL)."
- **Used:** points only; no OpenStreetMap shapes. 1,309 plottable places and 8,647 place–verse links.

### Base map: Natural Earth
- **Source:** nvkelso/natural-earth-vector v5.1.2. **Terms:** "All versions of Natural Earth raster + vector map data found on this website are in the public domain." Credited as "Made with Natural Earth."
- **Used:** 10m land, lakes (no modern reservoirs), and rivers (no canals), clipped to 5–65°E, 15–45°N and pre-projected (148 KB).

### Gospel harmony
- **Source:** A. T. Robertson, *A Harmony of the Gospels for Students of the Life of Christ* (George H. Doran, 1922), public domain in the US. Text via Project Gutenberg eBook #36264.
- 185 sections were extracted into `content/harmony-robertson.json` and checked against two 1922 scans on archive.org, the book's own "Table for Finding Any Passage," and its section headers. Eight misprints in the printed outline were corrected; each is noted per section. Only section titles and references (facts) are used.

### Audio Bible: LibriVox
- **License:** "all our recordings are public domain … anyone can use all our recordings however they wish" (librivox.org). Credit is requested but not required, and it is given with the reader names for each book.
- **Used:** a chapter map built from the LibriVox and archive.org APIs. It covers all 1,189 chapters with 647 MP3s; 392 chapters have their own file, and the rest share multi-chapter files. Audio streams from archive.org, where LibriVox hosts it. No verse timings exist, so playback is by chapter, without highlighting.

### Fonts (SIL Open Font License 1.1)
Literata 3.103, Inter 4.1, Ezra SIL 2.51, and Gentium Plus 6.200, downloaded from their official releases and served byte-for-byte (no subsetting or conversion; OFL FAQ 2.2.1, 2.6). License files ship in `/fonts/licenses/`. SIL has since renamed Gentium Plus back to Gentium (7.000); Gentium Plus is used because the spec names it.

### Pronunciation audio: none
No free, openly licensed audio of Hebrew or Greek words keyed to Strong's exists (the ones found are commercial). Pronunciation is shown as phonetic spelling, as the spec allows.

## External links

All link patterns are checked by `npm run check:links`, which samples books with unusual slugs across every site.

| Site | Pattern | Notes |
| --- | --- | --- |
| Blue Letter Bible | `/{kjv\|asv}/{slug}/{ch}/{v}/`, `/tools/interlinear/{tr\|wlc}/…`, `/lexicon/{g\|h}{n}/kjv/{tr\|wlc}/0-1/` | 66 verified slugs (`rth`, `eze`, `joe`, `mar`, `phl`, `1jo`, `jde`, …). Linked only, never copied. |
| Bible Hub | `/{slug}/{ch}-{v}.htm`, `/interlinear/…`, `/greek/{n}.htm`, `/hebrew/{n}.htm` | Slugs like `1_samuel`, `psalms`, `songs`. |
| STEP Bible | `/?q=version=KJV%7Creference={OSIS}.{ch}.{v}` | Verses only (its Strong's URLs need sense suffixes and are unreliable). |
| Bible Gateway | `/passage/?search={Book} {ch}:{v}&version=KJV` | Full book names. |
| Desiring God | `/scripture/{slug}/{ch}` | Chapter level (no verse pages). Esther and Nahum have no index page, so the link is hidden for them. |
| Grace to You | `/sermons/archive?tab=scripture` | Its book/chapter filter can't be linked; individual sermons are linked from the library. |
| HeartCry (SermonAudio) | `/broadcasters/heartcry/sermons?book={USFM}&chapter={n}` | HeartCry's official uploads. |

### Teacher permissions and how OpenBerea complies
- **Desiring God** (https://www.desiringgod.org/permissions; the live page sits behind a Cloudflare challenge, so it was read from the Wayback snapshot of 2026-08-09):
  - "For audio and video content online, you may embed the entire unaltered original content from this website in another webpage but not reproduce, redistribute, or re-upload by other methods."
  - Required attribution: **"By John Piper. © Desiring God Foundation. Source: desiringGod.org"**.
  - OpenBerea embeds only Piper-authored media, whole and unaltered, streamed from audio.desiringgod.org and Desiring God's YouTube channel. It never proxies or caches it (the service worker ignores other origins), and shows the attribution line next to every embed. YouTube uses privacy-enhanced mode and loads only when the viewer presses play. No text is copied. The author bio DG asks for appears on the About page.
- **Grace to You** (https://www.gty.org/about?tab=copyright): "You may link to and share media produced by Grace to You, but you may not post that media on your website or host them on your media channel." OpenBerea links only, with the credit "John MacArthur, Grace to You … gty.org", and doesn't use the logo.
- **HeartCry** (https://heartcrymissionary.com/copyrights-and-permissions/, updated May 21, 2024): "You may link to, embed and share media produced by HeartCry, but you may NOT host/upload HeartCry content …" Credit is required to "Paul Washer or the HeartCry Missionary Society Inc.", along with the copyright notice and www.heartcrymissionary.com. No edits, logo, or photos of Paul Washer are allowed without permission. OpenBerea links to HeartCry's official SermonAudio uploads, as text only, with the credit, notice, and link.

### Curated library
`content/resources.json` holds 31 verified items: 13 John Piper (6 audio, 7 official Desiring God YouTube videos), 10 John MacArthur, and 8 Paul Washer. Each was checked on 2026-10-02: Desiring God page titles via Wayback (the live site challenges automated requests), media URLs live, and YouTube channel ownership via oEmbed. The owner can edit the file; the pipeline validates it.
