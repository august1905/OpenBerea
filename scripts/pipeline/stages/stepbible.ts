// STEPBible Data (Tyndale House Cambridge / STEPBible.org) converters:
//   orig        TAHOT + TAGNT       → stepbible/orig/{BOOK}/{ch}.json      (OrigChapter, KJV verses)
//   steplex     TBESH + TBESG       → stepbible/lex/{H|G}/{bucket}.json    (StepLexEntry, CC BY-SA)
//   morph       TEHMC + TEGMC       → stepbible/morph/{hbo|grc}.json       (MorphEntry)
//   variants    TAGNT               → stepbible/variants/{BOOK}/{ch}.json  (VariantChapter)
//   names       TIPNR               → stepbible/names.json                 (ProperName)
//   concordance orig + kjv output   → stepbible/conc/{H|G}/{bucket}.json   (ConcEntry)
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { BOOKS, type BookCode, bookInfo } from '../../../src/lib/bible/books';
import { fromVerseId } from '../../../src/lib/bible/refs';
import { verseCount } from '../../../src/lib/bible/versification';
import { splitMorph } from '../../../src/lib/data/morph';
import type {
  ChapterText,
  ConcEntry,
  MorphEntry,
  OrigChapter,
  OrigVerse,
  ProperName,
  StepLexEntry,
  VariantChapter,
  VariantUnit,
} from '../../../src/lib/data/types';
import { log, OUT, readData, recordSource, type SourceRecord, writeData, writeText } from '../lib/context';
import {
  baseStrong,
  type FetchedFile,
  fetchStep,
  readLines,
  STEP_FILES,
  STEP_REPO,
  STEP_SHA,
  type StepFileKey,
  strongBucket,
  TAGNT_KEYS,
  TAHOT_KEYS,
} from '../lib/stepbible-common';
import { concEntry, countOccurrences, countRenderings, type Occurrences, type RenderingCounts } from '../lib/stepbible-conc';
import { droppedRefs, LexIds, lexEntry, type LexRow, parseLexRow } from '../lib/stepbible-lex';
import { decodeBrief, type MorphTables, parseMorphFile } from '../lib/stepbible-morph';
import { NameIndex, parseTipnr, properName, type TipnrRecord } from '../lib/stepbible-names';
import {
  BookAccumulator,
  parseTagntRow,
  parseTahotRow,
  splitGreekTags,
  tagntVariants,
  tagntWord,
  tahotWord,
  type TahotWordStats,
} from '../lib/stepbible-text';
import type { Stage } from '../run';

const ID = 'stepbible';

// ---------------------------------------------------------------------------------------------
// Loading helpers

async function fetchAll(keys: StepFileKey[]): Promise<Record<string, FetchedFile>> {
  const out: Record<string, FetchedFile> = {};
  for (const k of keys) out[k] = await fetchStep(k);
  return out;
}

async function allLines(path: string): Promise<string[]> {
  const lines: string[] = [];
  for await (const l of readLines(path)) lines.push(l);
  return lines;
}

async function lexRows(path: string): Promise<LexRow[]> {
  const rows: LexRow[] = [];
  for await (const line of readLines(path)) {
    const row = parseLexRow(line);
    if (row) rows.push(row);
  }
  return rows;
}

async function buildLexIds(files: Record<string, FetchedFile>): Promise<LexIds> {
  const ids = new LexIds();
  for (const row of await lexRows(files.tbesh.path)) ids.add(row);
  for (const row of await lexRows(files.tbesg.path)) ids.add(row);
  return ids;
}

async function tipnrRecords(files: Record<string, FetchedFile>): Promise<TipnrRecord[]> {
  return parseTipnr(await allLines(files.tipnr.path));
}

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(`[${ID}] verify failed: ${message}`);
}

function dirStats(rel: string): { files: number; bytes: number } {
  const root = join(OUT, rel);
  let files = 0;
  let bytes = 0;
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (name.endsWith('.json')) {
        files++;
        bytes += st.size;
      }
    }
  };
  if (existsSync(root)) walk(root);
  return { files, bytes };
}

const nfd = (s: string) => s.normalize('NFD');

const mb = (bytes: number) => `${(bytes / 1e6).toFixed(2)} MB`;

// ---------------------------------------------------------------------------------------------
// License records

const CHANGES = `Changes made by OpenBerea to the STEPBible data (github.com/STEPBible/STEPBible-Data, commit ${STEP_SHA})
=================================================================================================
The data was reformatted to JSON. Beyond reformatting:

Texts (stepbible/orig, stepbible/variants; from TAHOT and TAGNT)
- Verses use KJV numbering. TAHOT's English refs are used as given; TAGNT's NRSV-based refs are
  replaced by their KJV alternates "[ch.vs]" where present. The Hebrew (or NA) numbering is kept in
  "src" when it differs. Psalm titles are verse 0.
- Hebrew words: "/" morpheme separators and "\\" punctuation separators removed from the surface text;
  maqqef and sof pasuq stay attached, paseq and paragraph letters follow a space. Punctuation tags
  (H9014-H9019) are not listed as morphemes. Morpheme grammar codes carry the language letter
  ("HNcfsa"). The 14 TAHOT rows with no Hebrew (Ketiv written but not read) are omitted.
- Greek words: transliteration split into its own field; the paragraph mark "¶" removed; inline verse
  markers ("[13]", "{14.24}") removed from glosses; Strong's numbers removed from grammar codes
  ("G1473=P-1NS + G2532=CONJ" -> "P-1NS + CONJ"); word-order suffixes ("TR»1") removed from edition lists.
- Extended Strong's ids that are not in the brief lexicon point to the first lexicon entry with the
  same number (e.g. H0430J -> H0430G).
- Proper-name ids are mapped to the current TIPNR record ids (the texts sometimes carry older ids,
  e.g. "Jerusalem@Jos.10.1-Rev" -> "Jerusalem@Gen.14.18-Rev").
- Not used: TAGNT Spanish column, sub-meaning glosses (only the proper-name ids in that column are
  read), spelling variants and variant notes; TAHOT spelling variants and alternative Strong's.

Lexicon (stepbible/lex; from TBESH and TBESG)
- TBESH "Meaning" (Abridged BDB, (c) Online Bible) is omitted: its use needs permission from Online Bible.
- TBESG definitions converted to rich text: refs became links, "__1." markers became list items,
  transcriber notes (<note>) dropped. The (AS)/(ML) source tag moved to the "src" field.
- Brief morphology codes ("H:N-M") replaced by their English meaning from TEHMC/TEGMC.

Proper names (stepbible/names.json; from TIPNR)
- Only names that occur in the texts. AI-generated descriptions (@Brief, @Short, @Article) and
  @Briefest are not included. "sig" is TIPNR's Description field (people, others) or the start of the
  #Summary (places).

Concordance (stepbible/conc)
- Computed by OpenBerea from the texts above and the KJV (public domain). Hebrew affix tags
  (H9001-H9049) are not counted.
`;

async function recordStepBible() {
  const files = await fetchAll(Object.keys(STEP_FILES) as StepFileKey[]);
  const record: SourceRecord = {
    id: 'stepbible',
    name: 'STEPBible Data: TAHOT, TAGNT, TEHMC, TEGMC, TIPNR (STEPBible.org / Tyndale House Cambridge)',
    homepage: STEP_REPO,
    version: STEP_SHA,
    files: Object.entries(files)
      .filter(([k]) => !['tbesh', 'tbesg'].includes(k))
      .map(([, f]) => ({ url: f.url, sha256: f.sha256, bytes: f.bytes })),
    license: {
      id: 'CC-BY-4.0',
      name: 'Creative Commons Attribution 4.0 International',
      url: 'https://creativecommons.org/licenses/by/4.0/',
      attribution:
        'STEP Bible (https://www.STEPBible.org). Data created by www.STEPBible.org based on work at Tyndale House Cambridge (CC BY 4.0). ' +
        `Source: ${STEP_REPO} (commit ${STEP_SHA}). Hebrew morphology derives from ETCBC; English glosses of the Greek NT are based on the Berean Study Bible (public domain). Reformatted by OpenBerea; changes are listed in stepbible/CHANGES.txt.`,
      confirmedAt: `${STEP_REPO}/blob/${STEP_SHA}/README.md and the license header of each data file`,
    },
    outputs: ['stepbible', 'stepbible/orig', 'stepbible/variants', 'stepbible/morph', 'stepbible/conc'],
    notes:
      'Requests in the file headers: do not re-host or mirror the raw .txt files (OpenBerea ships only converted JSON); ' +
      `refer users to ${STEP_REPO} as the source; publish a note of changes (stepbible/CHANGES.txt). ` +
      'stepbible/LICENSE.txt covers files directly in stepbible/ (names.json); stepbible/lex has its own CC BY-SA 4.0 license (source "stepbible-lex"). ' +
      'TAHOT morphology is from ETCBC (whose own release is CC BY-NC 4.0; STEPBible re-releases it as CC BY). TAGNT editions data names NA27/NA28. ' +
      'TIPNR place data is based on OpenBible.info (CC BY 4.0); its AI-generated descriptions are not used.',
  };
  recordSource(record);
  writeText('stepbible/CHANGES.txt', CHANGES);
}

async function recordStepLex() {
  const files = await fetchAll(['tbesh', 'tbesg', 'tehmc', 'tegmc']);
  recordSource({
    id: 'stepbible-lex',
    name: 'STEPBible brief lexicons TBESH and TBESG (STEPBible.org / Tyndale House Cambridge)',
    homepage: STEP_REPO,
    version: STEP_SHA,
    files: Object.values(files).map((f) => ({ url: f.url, sha256: f.sha256, bytes: f.bytes })),
    license: {
      id: 'CC-BY-SA-4.0',
      name: 'Creative Commons Attribution-ShareAlike 4.0 International',
      url: 'https://creativecommons.org/licenses/by-sa/4.0/',
      attribution:
        'STEP Bible (https://www.STEPBible.org), based on work at Tyndale House Cambridge (CC BY 4.0). ' +
        'Greek definitions from Abbott-Smith, A Manual Greek Lexicon of the New Testament (public domain) and from the Middle Liddell ' +
        '(Liddell & Scott, An Intermediate Greek-English Lexicon) of the Perseus Digital Library, Tufts University (CC BY-SA 4.0). ' +
        `Source: ${STEP_REPO} (commit ${STEP_SHA}). Reformatted by OpenBerea; changes are listed in stepbible/CHANGES.txt.`,
      confirmedAt:
        `${STEP_REPO}/blob/${STEP_SHA}/README.md and the TBESH/TBESG headers; Perseus: https://github.com/PerseusDL/lexica (README, CC BY-SA 4.0); ` +
        'Abbott-Smith: https://github.com/translatable-exegetical-tools/Abbott-Smith (README, public domain)',
    },
    outputs: ['stepbible/lex'],
    notes:
      'This folder is CC BY-SA 4.0 as a whole because the definitions marked src "ML" derive from Perseus Middle Liddell (CC BY-SA 4.0; Perseus asks to be offered modifications). ' +
      'Portions: STEPBible ids, glosses and STEPBible-written definitions (src "STEP") are CC BY 4.0; Abbott-Smith definitions (src "AS") are public domain. ' +
      'Attribution must credit STEP Bible and Perseus Middle Liddell. ' +
      'The TBESH Meaning column (Abridged BDB, (c) Larry Pierce, Online Bible) is NOT included: its header says permission should be gained from Online Bible before use. ' +
      `Do not re-host the raw files; link to ${STEP_REPO}.`,
  });
}

// ---------------------------------------------------------------------------------------------
// Texts

interface TextBuild {
  acc: BookAccumulator;
  /** chapter → verse → variant units (NT only). */
  variants: Map<number, Record<string, VariantUnit[]>>;
}

interface TextStats {
  rows: number;
  words: number;
  skipped: string[];
  morph: TahotWordStats;
}

async function* otBooks(files: Record<string, FetchedFile>, lex: LexIds, names: NameIndex, stats: TextStats) {
  const done = new Set<BookCode>();
  let acc: BookAccumulator | null = null;
  for (const key of TAHOT_KEYS) {
    for await (const line of readLines(files[key].path)) {
      const row = parseTahotRow(line);
      if (!row) continue;
      stats.rows++;
      if (!acc || acc.book !== row.book) {
        if (acc) yield { acc, variants: new Map() } as TextBuild;
        if (done.has(row.book)) throw new Error(`TAHOT: ${row.book} is not contiguous`);
        done.add(row.book);
        acc = new BookAccumulator(row.book, 'hbo');
      }
      const word = tahotWord(row, lex.resolve, names.resolve, stats.morph);
      if (!word) {
        stats.skipped.push(`${row.book}.${row.ch}.${row.vs}#${row.wn}`);
        continue;
      }
      stats.words++;
      acc.add(row.ch, row.vs, row.hch, row.hvs, word);
    }
  }
  if (acc) yield { acc, variants: new Map() } as TextBuild;
}

async function* ntBooks(files: Record<string, FetchedFile>, lex: LexIds, names: NameIndex, stats: TextStats) {
  const done = new Set<BookCode>();
  let cur: TextBuild | null = null;
  for (const key of TAGNT_KEYS) {
    for await (const line of readLines(files[key].path)) {
      const row = parseTagntRow(line);
      if (!row) continue;
      stats.rows++;
      if (!cur || cur.acc.book !== row.book) {
        if (cur) yield cur;
        if (done.has(row.book)) throw new Error(`TAGNT: ${row.book} is not contiguous`);
        done.add(row.book);
        cur = { acc: new BookAccumulator(row.book, 'grc'), variants: new Map() };
      }
      const word = tagntWord(row, lex.resolve, names.resolve);
      stats.words++;
      const w = cur.acc.add(row.kch, row.kvs, row.nch, row.nvs, word);
      const units = tagntVariants(row, word, w);
      if (units.length) {
        let chapter = cur.variants.get(row.kch);
        if (!chapter) cur.variants.set(row.kch, (chapter = {}));
        (chapter[String(row.kvs)] ??= []).push(...units);
      }
    }
  }
  if (cur) yield cur;
}

function newStats(): TextStats {
  return { rows: 0, words: 0, skipped: [], morph: { misaligned: 0 } };
}

function verseWords(chapters: OrigChapter[], c: number, n: number): OrigVerse | undefined {
  return chapters.find((ch) => ch.c === c)?.v.find((v) => v.n === n);
}

const origStage: Stage = {
  id: 'orig',
  description: 'STEPBible TAHOT + TAGNT → stepbible/orig/{BOOK}/{ch}.json (KJV versification)',
  async run() {
    const files = await fetchAll([...TAHOT_KEYS, ...TAGNT_KEYS, 'tbesh', 'tbesg', 'tipnr']);
    const lex = await buildLexIds(files);
    const names = new NameIndex(await tipnrRecords(files));
    const ot = newStats();
    const nt = newStats();
    const seen = new Map<BookCode, Map<number, Map<number, number>>>(); // book → ch → verse → words
    const spots = new Map<string, OrigVerse>();
    const want: [BookCode, number, number][] = [
      ['GEN', 1, 1],
      ['MAL', 4, 1],
      ['MAL', 4, 6],
      ['PSA', 51, 0],
      ['PSA', 51, 1],
      ['JOL', 2, 28],
      ['JHN', 3, 16],
      ['3JN', 1, 14],
      ['REV', 13, 1],
      ['MAT', 17, 21],
      ['1JN', 5, 7],
    ];
    const pnUsed = new Set<string>();
    let srcVerses = 0;
    let titles = 0;
    const eMissing = new Set<string>();

    const writeBook = (build: TextBuild) => {
      const chapters = build.acc.toChapters();
      const perCh = new Map<number, Map<number, number>>();
      for (const ch of chapters) {
        writeData(`stepbible/orig/${ch.b}/${ch.c}.json`, ch);
        const verses = new Map<number, number>();
        for (const v of ch.v) {
          verses.set(v.n, v.w.length);
          if (v.src) srcVerses++;
          if (v.n === 0) titles++;
          for (const w of v.w) {
            if (w.pn) pnUsed.add(w.pn);
            if (w.e && !lex.has(w.e)) eMissing.add(w.e);
          }
        }
        perCh.set(ch.c, verses);
      }
      seen.set(build.acc.book, perCh);
      for (const [b, c, n] of want) {
        if (b !== build.acc.book) continue;
        const v = verseWords(chapters, c, n);
        if (v) spots.set(`${b}.${c}.${n}`, v);
      }
      return chapters.length;
    };

    let otChapters = 0;
    for await (const b of otBooks(files, lex, names, ot)) otChapters += writeBook(b);
    let ntChapters = 0;
    for await (const b of ntBooks(files, lex, names, nt)) ntChapters += writeBook(b);

    // ---- verify
    assert(ot.rows === 305652, `TAHOT rows ${ot.rows}, expected 305652`);
    assert(nt.rows === 142096, `TAGNT rows ${nt.rows}, expected 142096`);
    assert(ot.skipped.length === 14, `skipped ${ot.skipped.length} empty TAHOT rows, expected 14`);
    assert(ot.morph.misaligned === 0, `${ot.morph.misaligned} Hebrew morphemes without aligned grammar`);
    assert(otChapters === 929 && ntChapters === 260, `chapters OT ${otChapters} NT ${ntChapters}`);

    const empty: string[] = [];
    const extra: string[] = [];
    let kjvVerses = 0;
    for (const book of BOOKS) {
      const perCh = seen.get(book.code);
      assert(perCh, `no output for ${book.code}`);
      for (let c = 1; c <= book.chapters; c++) {
        const verses = perCh.get(c);
        assert(verses, `no chapter ${book.code} ${c}`);
        const count = verseCount(book.code, c);
        for (let v = 1; v <= count; v++) {
          kjvVerses++;
          const n = verses.get(v);
          if (n === undefined) throw new Error(`[${ID}] verify failed: KJV verse ${book.code} ${c}:${v} has no OrigVerse`);
          if (n === 0) empty.push(`${book.code} ${c}:${v}`);
        }
        for (const v of verses.keys()) {
          if (v > count || (v === 0 && book.code !== 'PSA')) extra.push(`${book.code} ${c}:${v}`);
        }
      }
    }
    assert(kjvVerses === 31102, `KJV verses ${kjvVerses}`);
    assert(!extra.length, `verses outside the KJV versification: ${extra.slice(0, 10).join(', ')}`);
    assert(!eMissing.size, `extended ids not in the lexicon: ${[...eMissing].slice(0, 10).join(', ')}`);
    for (const pn of pnUsed) assert(names.byId.has(pn), `pn ${pn} not in TIPNR`);

    const gen = spots.get('GEN.1.1');
    assert(gen && gen.w.length === 7, `Gen 1:1 has ${gen?.w.length} words`);
    const genS = gen.w.map((w) => w.s).join(' ');
    assert(genS === 'H7225 H1254 H430 H853 H8064 H853 H776', `Gen 1:1 Strong's ${genS}`);
    assert(nfd(gen.w[0].t) === nfd('בְּרֵאשִׁ֖ית') && gen.w[0].p?.length === 2 && gen.w[0].p[0].s === 'H9003', 'Gen 1:1 word 1 morphemes');
    assert(gen.w[0].m === 'HR/Ncfsa' && gen.w[0].e === 'H7225G' && gen.w[0].p[1].m === 'HNcfsa', 'Gen 1:1 word 1 codes');
    assert(gen.w[2].e === 'H0430G' && gen.w[2].pn === 'LORD@Gen.1.1-Rev', 'Gen 1:1 Elohim ids');
    assert(nfd(gen.w[6].t) === nfd('הָאָֽרֶץ׃'), `Gen 1:1 last word "${gen.w[6].t}" keeps sof pasuq`);
    const jhn = spots.get('JHN.3.16');
    assert(jhn && jhn.w.length === 26, `John 3:16 has ${jhn?.w.length} words`);
    assert(jhn.w[2].s === 'G25' && nfd(jhn.w[2].t) === nfd('ἠγάπησεν') && jhn.w[2].x === 'ēgapēsen', 'John 3:16 word 3');
    assert(nfd(jhn.w[10].t) === nfd('αὐτοῦ') && jhn.w[10].ed === 'Treg+TR+Byz', 'John 3:16 αὐτοῦ editions');
    assert(jhn.w.filter((w) => w.ed).length === 1, 'John 3:16 has one partial-edition word');
    const mal = spots.get('MAL.4.1');
    assert(mal?.src === '3:19', `Mal 4:1 src ${mal?.src}`);
    assert(spots.get('MAL.4.6')?.src === '3:24', 'Mal 4:6 src');
    const ps0 = spots.get('PSA.51.0');
    assert(ps0 && ps0.w.length > 0 && ps0.src === '51:1-2', `Ps 51:0 title src ${ps0?.src}`);
    assert(spots.get('PSA.51.1')?.src === '51:3', 'Ps 51:1 src');
    assert(spots.get('JOL.2.28')?.src === '3:1', 'Joel 2:28 src');
    assert(spots.get('3JN.1.14')?.src === '1:14-15', `3 John 1:14 src ${spots.get('3JN.1.14')?.src}`);
    assert(spots.get('REV.13.1')?.src === '12:18-13:1', `Rev 13:1 src ${spots.get('REV.13.1')?.src}`);
    const mt1721 = spots.get('MAT.17.21');
    assert(mt1721 && mt1721.w.length > 0 && mt1721.w.every((w) => w.ed), 'Mat 17:21 present via TR/Byz words');
    assert(titles === 116, `Psalm titles ${titles}, expected 116`);

    const { files: n, bytes } = dirStats('stepbible/orig');
    log('orig', `TAHOT ${ot.rows} rows → ${ot.words} words (${ot.skipped.length} unread Ketiv rows omitted: ${ot.skipped.join(', ')})`);
    log('orig', `TAGNT ${nt.rows} rows → ${nt.words} words`);
    log('orig', `KJV verses ${kjvVerses}, all present; ${empty.length} without words${empty.length ? `: ${empty.join(', ')}` : ''}; ${titles} Psalm titles (v0); ${srcVerses} verses with src numbering`);
    log('orig', `extended ids: ${lex.fallbacks.size} dStrongs fell back to another lexicon entry (${[...lex.fallbacks].slice(0, 8).map(([a, b]) => `${a}→${b}`).join(', ')}), ${lex.missing.size} unresolved`);
    log('orig', `proper names: ${pnUsed.size} distinct ids; matches ${JSON.stringify(Object.fromEntries(names.stats))}`);
    if (names.unmatched.size)
      log('orig', `unmatched name ids (pn omitted): ${[...names.unmatched].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k}×${v}`).join(', ')}`);
    log('orig', `spot checks: Gen 1:1 ${genS}; John 3:16 ${jhn.w.length} words; Mal 4:1 src ${mal.src}; Ps 51:0 ${ps0.w.length} words src ${ps0.src}`);
    log('orig', `output: ${n} files, ${mb(bytes)}`);
    await recordStepBible();
  },
};

// ---------------------------------------------------------------------------------------------
// Variants

const variantsStage: Stage = {
  id: 'variants',
  deps: ['orig'],
  description: 'STEPBible TAGNT → stepbible/variants/{BOOK}/{ch}.json (edition differences)',
  async run() {
    const files = await fetchAll([...TAGNT_KEYS, 'tbesh', 'tbesg', 'tipnr']);
    const lex = await buildLexIds(files);
    const names = new NameIndex(await tipnrRecords(files));
    const stats = newStats();
    let chapters = 0;
    let presence = 0;
    let alt = 0;
    let verses = 0;
    let checked = 0;
    let jhn316: VariantUnit[] | undefined;
    for await (const build of ntBooks(files, lex, names, stats)) {
      const book = build.acc.book;
      for (let c = 1; c <= bookInfo(book).chapters; c++) {
        const v = build.variants.get(c) ?? {};
        const out: VariantChapter = { b: book, c, v };
        writeData(`stepbible/variants/${book}/${c}.json`, out);
        chapters++;
        const origPath = join(OUT, `stepbible/orig/${book}/${c}.json`);
        const orig = existsSync(origPath) ? readData<OrigChapter>(`stepbible/orig/${book}/${c}.json`) : null;
        for (const [vs, units] of Object.entries(v)) {
          verses++;
          const n = Number(vs);
          assert(n >= 1 && n <= verseCount(book, c), `variant verse ${book} ${c}:${vs} outside KJV`);
          const ov = orig?.v.find((x) => x.n === n);
          for (const u of units) {
            if (u.k === 'presence') presence++;
            else alt++;
            assert(u.t && u.ed, `variant without text/editions at ${book} ${c}:${vs}`);
            if (ov) {
              assert(u.w >= 0 && u.w < ov.w.length, `variant index ${u.w} out of range at ${book} ${c}:${vs}`);
              if (u.k === 'presence') {
                assert(ov.w[u.w].t === u.t && ov.w[u.w].ed === u.ed, `variant word mismatch at ${book} ${c}:${vs}#${u.w}`);
                checked++;
              }
            }
          }
          if (book === 'JHN' && c === 3 && n === 16) jhn316 = units;
        }
      }
    }
    assert(chapters === 260, `variant chapters ${chapters}`);
    const autou = jhn316?.find((u) => u.k === 'presence');
    assert(jhn316?.length === 1 && autou && autou.w === 10 && nfd(autou.t) === nfd('αὐτοῦ') && autou.ed === 'Treg+TR+Byz', `John 3:16 variants ${JSON.stringify(jhn316)}`);
    const { files: n, bytes } = dirStats('stepbible/variants');
    log('variants', `${presence} presence units, ${alt} alternative readings in ${verses} verses; ${checked} checked against orig`);
    log('variants', `John 3:16: αὐτοῦ is word index ${autou.w} (0-based), editions ${autou.ed}; units ${JSON.stringify(jhn316)}`);
    log('variants', `output: ${n} files, ${mb(bytes)}`);
    await recordStepBible();
  },
};

// ---------------------------------------------------------------------------------------------
// Lexicon

const lexStage: Stage = {
  id: 'steplex',
  description: 'STEPBible TBESH + TBESG → stepbible/lex/{H|G}/{bucket}.json (CC BY-SA 4.0)',
  async run() {
    const files = await fetchAll(['tbesh', 'tbesg', 'tehmc', 'tegmc']);
    const heb = parseMorphFile(await allLines(files.tehmc.path));
    const grc = parseMorphFile(await allLines(files.tegmc.path));
    const buckets = new Map<string, Record<string, StepLexEntry>>();
    const counts = { H: 0, G: 0, AS: 0, ML: 0, STEP: 0, none: 0, refs: 0, posMissing: new Set<string>() };
    const spot = new Map<string, StepLexEntry>();
    for (const [lang, key, tables] of [
      ['hbo', 'tbesh', [heb.brief, grc.brief]],
      ['grc', 'tbesg', [grc.brief, heb.brief]],
    ] as const) {
      for (const row of await lexRows(files[key].path)) {
        const pos = decodeBrief(row.morph, ...tables);
        if (row.morph && !pos) counts.posMissing.add(row.morph);
        const entry = lexEntry(row, lang, pos ?? (row.morph || undefined));
        const L = entry.id[0] as 'H' | 'G';
        counts[L]++;
        if (entry.d) {
          counts[entry.src!]++;
          for (const b of entry.d) for (const c of b.c) if (typeof c !== 'string' && c.ref) counts.refs++;
        } else if (lang === 'grc') counts.none++;
        const rel = `stepbible/lex/${L}/${strongBucket(entry.id)}.json`;
        let bucket = buckets.get(rel);
        if (!bucket) buckets.set(rel, (bucket = {}));
        assert(!bucket[entry.id], `duplicate lexicon id ${entry.id}`);
        bucket[entry.id] = entry;
        if (['G0025', 'G0026', 'H0430G', 'H1254A', 'H7225G', 'G0001G', 'G2453G'].includes(entry.id)) spot.set(entry.id, entry);
      }
    }
    for (const [rel, bucket] of buckets) writeData(rel, bucket);

    // ---- verify
    assert(counts.H === 11682, `TBESH entries ${counts.H}`);
    assert(counts.G === 11035, `TBESG entries ${counts.G}`);
    for (const bucket of buckets.values())
      for (const e of Object.values(bucket)) {
        if (e.id.startsWith('H')) assert(!e.d && !e.src, `Hebrew entry ${e.id} carries a definition`);
        assert(e.base === baseStrong(e.id), `base of ${e.id}`);
        for (const b of e.d ?? [])
          for (const c of b.c)
            if (typeof c !== 'string' && c.ref) {
              const m = /^([1-3A-Z]{3})\.(\d+)(?:\.(\d+))?/.exec(c.ref);
              assert(m, `bad ref ${c.ref} in ${e.id}`);
              if (m[3]) assert(Number(m[3]) <= verseCount(m[1] as BookCode, Number(m[2])), `ref ${c.ref} outside KJV in ${e.id}`);
            }
      }
    const g25 = spot.get('G0025');
    assert(g25 && nfd(g25.lemma) === nfd('ἀγαπάω') && g25.g === 'to love' && g25.src === 'AS' && g25.base === 'G25', 'G0025 entry');
    const g25refs = (g25.d ?? []).flatMap((b) => b.c).filter((c) => typeof c !== 'string' && c.ref).map((c) => (c as { ref: string }).ref);
    assert(g25refs.includes('MAT.5.43') && g25refs.includes('JHN.3.35') && g25refs.includes('2TI.4.8') && g25refs.includes('2TI.4.10'), `G0025 refs ${g25refs.join(' ')}`);
    const h430 = spot.get('H0430G');
    assert(h430 && h430.g === 'God' && nfd(h430.lemma) === nfd('אֱלֹהִים') && h430.base === 'H430' && !h430.d, 'H0430G entry');
    assert(spot.get('H1254A')?.g === 'to create', 'H1254A gloss');
    const text = JSON.stringify(spot.get('H1254A'));
    assert(!text.includes('shape, fashion'), 'TBESH Meaning text leaked into H1254A');

    const { files: n, bytes } = dirStats('stepbible/lex');
    log('steplex', `TBESH ${counts.H} entries (no definitions), TBESG ${counts.G} entries: definitions AS ${counts.AS}, ML ${counts.ML}, STEP ${counts.STEP}, none ${counts.none}; ${counts.refs} Scripture links`);
    log('steplex', `${droppedRefs.length} prose refs not linked (outside the KJV versification, e.g. LXX numbering): ${droppedRefs.slice(0, 8).join(', ')}`);
    log('steplex', `G0025: ${g25.lemma} "${g25.g}" src ${g25.src}, ${g25.d?.length} blocks, ${g25refs.length} refs; H0430G: ${h430.lemma} "${h430.g}" pos ${h430.pos}`);
    if (counts.posMissing.size) log('steplex', `${counts.posMissing.size} brief morph codes kept as given (not in TEHMC/TEGMC): ${[...counts.posMissing].join(', ')}`);
    log('steplex', `output: ${n} files, ${mb(bytes)}`);
    await recordStepLex();
  },
};

// ---------------------------------------------------------------------------------------------
// Morphology

async function distinctGrammar(files: Record<string, FetchedFile>): Promise<{ hbo: Set<string>; grc: Set<string> }> {
  const hbo = new Set<string>();
  const grc = new Set<string>();
  for (const key of TAHOT_KEYS)
    for await (const line of readLines(files[key].path)) {
      const row = parseTahotRow(line);
      if (row && row.grammar) hbo.add(row.grammar);
    }
  for (const key of TAGNT_KEYS)
    for await (const line of readLines(files[key].path)) {
      const row = parseTagntRow(line);
      if (row) grc.add(splitGreekTags(row.tags).m);
    }
  return { hbo, grc };
}

function coverage(codes: Set<string>, lang: 'hbo' | 'grc', table: Record<string, MorphEntry>) {
  const missing = new Map<string, number>();
  let ok = 0;
  const keys = new Set<string>();
  for (const code of codes) {
    const parts = splitMorph(code, lang);
    let all = parts.length > 0;
    for (const k of parts) {
      keys.add(k);
      if (!table[k]) {
        all = false;
        missing.set(k, (missing.get(k) ?? 0) + 1);
      }
    }
    if (all) ok++;
  }
  return { ok, total: codes.size, keys: keys.size, missing };
}

const morphStage: Stage = {
  id: 'morph',
  description: 'STEPBible TEHMC + TEGMC → stepbible/morph/{hbo|grc}.json (grammar helper)',
  async run() {
    const files = await fetchAll(['tehmc', 'tegmc', ...TAHOT_KEYS, ...TAGNT_KEYS]);
    const heb: MorphTables = parseMorphFile(await allLines(files.tehmc.path));
    const grc: MorphTables = parseMorphFile(await allLines(files.tegmc.path));
    writeData('stepbible/morph/hbo.json', heb.full);
    writeData('stepbible/morph/grc.json', grc.full);

    // ---- verify
    const nH = Object.keys(heb.full).length;
    const nG = Object.keys(grc.full).length;
    assert(nH === 921, `TEHMC full records ${nH}, expected 921`);
    assert(nG >= 1643 && nG <= 1644, `TEGMC full records ${nG}, expected 1643-1644`);
    assert(heb.full.HVqp3ms?.p === 'Verb : Qal (Simple, Active) Perfect (Past/present Indicative) Third Singular Masculine', `HVqp3ms "${heb.full.HVqp3ms?.p}"`);
    assert(heb.full.HNcmpa?.p === 'Noun (Plural Masculine, Absolute)', 'HNcmpa');
    assert(grc.full['V-AAI-3S']?.p === 'Verb Aorist Active Indicative 3rd Singular', `V-AAI-3S "${grc.full['V-AAI-3S']?.p}"`);
    assert(grc.full['V-PMO-1S']?.x === '"_I hopefully am taught myself_"', `V-PMO-1S example "${grc.full['V-PMO-1S']?.x}"`);
    const codes = await distinctGrammar(files);
    const ch = coverage(codes.hbo, 'hbo', heb.full);
    const cg = coverage(codes.grc, 'grc', grc.full);
    const fmt = (c: ReturnType<typeof coverage>) =>
      `${c.ok}/${c.total} distinct codes (${((100 * c.ok) / c.total).toFixed(2)}%), ${c.keys} distinct single keys${c.missing.size ? `; missing ${[...c.missing.keys()].join(', ')}` : ''}`;
    log('morph', `TEHMC ${nH} codes, TEGMC ${nG} codes`);
    log('morph', `TAHOT coverage: ${fmt(ch)}`);
    log('morph', `TAGNT coverage: ${fmt(cg)}`);
    assert(ch.ok === ch.total && cg.ok === cg.total, 'morphology coverage below 100%');
    const { files: n, bytes } = dirStats('stepbible/morph');
    log('morph', `output: ${n} files, ${mb(bytes)}`);
    await recordStepBible();
  },
};

// ---------------------------------------------------------------------------------------------
// Proper names

function* origChapters(): Generator<OrigChapter> {
  for (const book of BOOKS)
    for (let c = 1; c <= book.chapters; c++) {
      const rel = `stepbible/orig/${book.code}/${c}.json`;
      if (!existsSync(join(OUT, rel))) throw new Error(`[${ID}] missing ${rel}: run the "orig" stage first`);
      yield readData<OrigChapter>(rel);
    }
}

const namesStage: Stage = {
  id: 'names',
  deps: ['orig'],
  description: 'STEPBible TIPNR → stepbible/names.json (names used in the texts)',
  async run() {
    const files = await fetchAll(['tipnr']);
    const records = await tipnrRecords(files);
    const index = new NameIndex(records);
    const used = new Map<string, number>();
    for (const ch of origChapters()) for (const v of ch.v) for (const w of v.w) if (w.pn) used.set(w.pn, (used.get(w.pn) ?? 0) + 1);
    const out: Record<string, ProperName> = {};
    for (const id of [...used.keys()].sort()) {
      const rec = index.byId.get(id);
      assert(rec, `pn ${id} has no TIPNR record`);
      out[id] = properName(rec);
    }
    writeData('stepbible/names.json', out);

    // ---- verify
    const kinds = { person: 0, place: 0, other: 0 };
    for (const p of Object.values(out)) {
      kinds[p.kind]++;
      assert(p.person === undefined, 'person must stay undefined');
    }
    assert(records.length === 4256, `TIPNR records ${records.length}`);
    const aaron = out['Aaron@Exo.4.14-Heb'];
    assert(aaron?.kind === 'person' && aaron.sig === 'High Priest living at the time of Egypt and Wilderness' && aaron.name === 'Aaron', `Aaron ${JSON.stringify(aaron)}`);
    const jer = out['Jerusalem@Gen.14.18-Rev'];
    assert(jer?.kind === 'place', `Jerusalem ${JSON.stringify(jer)}`);
    assert(out['Jesus@Isa.7.14-Rev']?.kind === 'person', 'Jesus record');
    const brief = records.find((r) => r.id === 'Abagtha@Est.1.10');
    assert(!JSON.stringify(out).includes('One of King Ahasuerus') && brief, 'AI-generated descriptions must not be included');
    log('names', `${Object.keys(out).length} names used in the texts (of ${records.length} TIPNR records): ${kinds.person} people, ${kinds.place} places, ${kinds.other} other; ${[...used.values()].reduce((a, b) => a + b, 0)} tagged words`);
    log('names', `Jerusalem: ${JSON.stringify(jer)} used ${used.get('Jerusalem@Gen.14.18-Rev')}×`);
    const st = statSync(join(OUT, 'stepbible/names.json'));
    log('names', `output: 1 file, ${mb(st.size)}`);
    await recordStepBible();
  },
};

// ---------------------------------------------------------------------------------------------
// Concordance

/** Independent count of a dStrong family in the raw files, for the spot checks. */
async function rawCount(files: Record<string, FetchedFile>, keys: StepFileKey[], num: string, lang: 'hbo' | 'grc') {
  const re = lang === 'hbo' ? new RegExp(`\\{${num}[A-Za-z]?\\}`, 'g') : new RegExp(`^${num}[A-Za-z]?=`);
  let all = 0;
  let na28 = 0;
  let tr = 0;
  for (const key of keys)
    for await (const line of readLines(files[key].path)) {
      if (!/^[1-3A-Z][a-z0-9A-Z]{2}\.\d/.test(line)) continue;
      const f = line.split('\t');
      if (lang === 'hbo') {
        if (!f[1]) continue;
        all += (f[4].match(re) ?? []).length;
      } else if (re.test(f[3])) {
        all++;
        const ed = f[5].split('+').map((e) => e.replace(/[»«].*$/, ''));
        if (ed.includes('NA28')) na28++;
        if (ed.includes('TR')) tr++;
      }
    }
  return { all, na28, tr };
}

const concStage: Stage = {
  id: 'concordance',
  deps: ['orig', 'kjv'],
  description: 'Concordance from stepbible/orig + kjv → stepbible/conc/{H|G}/{bucket}.json',
  async run() {
    const files = await fetchAll([...TAHOT_KEYS, ...TAGNT_KEYS]);
    const occ = new Map<string, Occurrences>();
    let affixOnly = 0;
    for (const ch of origChapters()) affixOnly += countOccurrences(ch, occ);

    const kjvDir = join(OUT, 'kjv');
    const haveKjv = existsSync(kjvDir);
    const renderings: RenderingCounts = new Map();
    let kjvChapters = 0;
    if (haveKjv) {
      for (const book of BOOKS) {
        const chapters: ChapterText[] = [];
        for (let c = 1; c <= book.chapters; c++) {
          const rel = `kjv/${book.code}/${c}.json`;
          assert(existsSync(join(OUT, rel)), `KJV output is incomplete: ${rel} is missing`);
          chapters.push(readData<ChapterText>(rel));
        }
        countRenderings(chapters, renderings);
        kjvChapters += chapters.length;
      }
    } else {
      log('concordance', 'WARNING: public/data/kjv/ does not exist yet; KJV renderings are left empty. Re-run after the "kjv" stage.');
    }

    const buckets = new Map<string, Record<string, ConcEntry>>();
    for (const [s, o] of occ) {
      const rel = `stepbible/conc/${s[0]}/${strongBucket(s)}.json`;
      let bucket = buckets.get(rel);
      if (!bucket) buckets.set(rel, (bucket = {}));
      bucket[s] = concEntry(o, renderings.get(s));
    }
    for (const [rel, bucket] of buckets) writeData(rel, bucket);

    // ---- verify
    let titleIds = 0;
    for (const [s, o] of occ) {
      assert(/^[HG][1-9]\d*$/.test(s) && !/^H9\d{3}$/.test(s), `bad concordance key ${s}`);
      for (const id of o.verses) {
        const { book, chapter, verse } = fromVerseId(id);
        if (verse === 0) {
          assert(book === 'PSA', `verse 0 outside Psalms: ${id}`);
          titleIds++;
        } else assert(verse <= verseCount(book, chapter), `verse id ${id} outside KJV`);
      }
    }
    const kjvOnly = [...renderings.keys()].filter((s) => !occ.has(s));
    const g25 = occ.get('G25');
    const h430 = occ.get('H430');
    assert(g25 && h430, 'G25 and H430 present');
    const rawG = await rawCount(files, TAGNT_KEYS, 'G0025', 'grc');
    const rawH = await rawCount(files, TAHOT_KEYS, 'H0430', 'hbo');
    assert(g25.n === rawG.all, `G25 n ${g25.n} vs raw ${rawG.all}`);
    assert(h430.n === rawH.all, `H430 n ${h430.n} vs raw ${rawH.all}`);
    const top = (s: string) => (renderings.get(s) ? concEntry(occ.get(s)!, renderings.get(s)).kjv.slice(0, 6) : []);
    const { files: n, bytes } = dirStats('stepbible/conc');
    log('concordance', `${occ.size} Strong's numbers (H ${[...occ.keys()].filter((s) => s[0] === 'H').length}, G ${[...occ.keys()].filter((s) => s[0] === 'G').length}); ${titleIds} verse ids are Psalm titles (verse 0); ${affixOnly} Hebrew words made only of affixes (H9xxx) not counted`);
    log('concordance', `G25 agapaō: n ${g25.n} in ${g25.verses.size} verses (raw TAGNT rows ${rawG.all}: NA28 ${rawG.na28}, TR ${rawG.tr}); KJV ${JSON.stringify(top('G25'))}`);
    log('concordance', `H430 elohim: n ${h430.n} in ${h430.verses.size} verses (raw TAHOT tags ${rawH.all}); KJV ${JSON.stringify(top('H430'))}`);
    log('concordance', haveKjv ? `KJV renderings from ${kjvChapters} chapters; ${kjvOnly.length} KJV Strong's numbers not in the original texts (not written)` : 'KJV renderings: none (kjv output missing)');
    log('concordance', `output: ${n} files, ${mb(bytes)}`);
    await recordStepBible();
  },
};

export const stages: Stage[] = [origStage, lexStage, morphStage, variantsStage, namesStage, concStage];
