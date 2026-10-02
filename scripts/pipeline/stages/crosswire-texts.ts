// CrossWire SWORD modules → Bible texts (KJV, ASV), search corpora, TSK cross-references, and
// commentaries (Matthew Henry, JFB, Barnes). Modules are read straight from the pinned .zip
// packages (or, for the beta-only TSK, the pinned raw files), so the checksums cover every byte
// that is converted.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { BOOKS, type BookCode, TOTAL_CHAPTERS } from '../../../src/lib/bible/books';
import { TOTAL_VERSES, verseCount } from '../../../src/lib/bible/versification';
import type { Block, ChapterText, CommentaryChapter, SearchCorpus, Seg, TskChapter, Verse } from '../../../src/lib/data/types';
import { download, log, OUT, readData, recordSource, writeData, writeText } from '../lib/context';
import { blocksToText, decodeEntities } from '../lib/richtext';
import { commentaryBlocks, mhcMarkerRange, prepareOsis, prepareScripRefs, type RefStats, splitBarnes, splitJfb } from '../lib/osis-comm';
import { appendSegs, parseOsisVerse, segsToText, strongsFromLemma } from '../lib/osis-bible';
import { bookToOsis, OSIS_BOOKS } from '../lib/osis-books';
import { compactValid, osisRefToCompact } from '../lib/osis-refs';
import { chapterGroups, confText, confValue, findGaps, kjvLayout, openModule, parseCanonH, readZip, type SwordConf, type ZVerse } from '../lib/sword-text';
import type { Stage } from '../run';

// ---------------------------------------------------------------------------------------------
// Pinned sources

const RAWZIP = 'https://www.crosswire.org/ftpmirror/pub/sword/packages/rawzip/';
const BETARAW = 'https://www.crosswire.org/ftpmirror/pub/sword/betaraw/';
const MODINFO = 'https://www.crosswire.org/sword/modules/ModInfo.jsp?modName=';

const ZIPS = {
  KJV: '873815aa4b4123025616d1f41eae75f412111275f4c3884e36f92d4f46dcba1d',
  ASV: '8f3d708510f7122a947a1c3eaa775a03c8ef5b1d456833abf506b78e689fcf18',
  MHC: '6bcb936873ca144e317805e5c1677940fd86e2403f7c14517752e44f25c8882b',
  JFB: 'e7640f85109d6a63697ea745e19a6edcadb24e3ad2c3cdf42f59487dadbc4fd0',
  Barnes: '9e8edc0333875c214124371b3862df118ad3a76ade7753cb2faeed3484615baf',
} as const;

/** SWORD's KJV versification table (include/canon.h), used to check the app's versification. */
const CANON_H = {
  url: 'https://crosswire.org/svn/sword/trunk/include/canon.h',
  sha256: '782e7a603cdfb45ddfd6eed9d31a639929fb928b47c7042d83c8ee9b76af078a',
};

type FileRecord = { url: string; sha256: string; bytes: number };

async function zipModule(name: keyof typeof ZIPS) {
  const url = `${RAWZIP}${name}.zip`;
  const file = await download(url, 'crosswire', `${name}.zip`, ZIPS[name]);
  const opened = openModule(readZip(readFileSync(file.path)));
  if (opened.conf.name !== name) throw new Error(`${name}.zip holds module ${opened.conf.name}`);
  return { ...opened, file: { url, sha256: file.sha256, bytes: file.bytes } as FileRecord };
}

function moduleVersion(conf: SwordConf, file: FileRecord) {
  const date = confValue(conf, 'SwordVersionDate');
  return `${conf.name} module ${confValue(conf, 'Version')}${date ? ` (${date})` : ''}; ${file.url.split('/').pop()} sha256 ${file.sha256}`;
}

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(`Verification failed: ${message}`);
}

/** Total size of the files under public/data/<folder>. */
function folderStats(folder: string) {
  let files = 0;
  let bytes = 0;
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.json')) {
        files++;
        bytes += statSync(p).size;
      }
    }
  };
  walk(join(OUT, folder));
  return { files, bytes, text: `${files} files, ${(bytes / 1e6).toFixed(2)} MB` };
}

const ref = (b: BookCode, c: number, v: number) => `${b} ${c}:${v}`;

// ---------------------------------------------------------------------------------------------
// Bibles

interface BibleStats {
  chapters: number;
  verses: number;
  emptyVerses: string[];
  redVerses: number;
  quotes: number;
  paraVerses: number;
  titles: number;
  titlesInVerse: string[];
  droppedHeadings: string[];
  colophons: string[];
  emptyWords: number;
  notes: number;
  midParagraphs: number;
  joinFixes: number;
  spaceFixes: number;
  strayHeadingText: string[];
}

/** Writes {tr}/{BOOK}/{ch}.json and search/{tr}.json from a SWORD Bible module. */
function convertBible(mod: ZVerse, tr: 'kjv' | 'asv', strongs: boolean): BibleStats {
  const st: BibleStats = {
    chapters: 0, verses: 0, emptyVerses: [], redVerses: 0, quotes: 0, paraVerses: 0, titles: 0, titlesInVerse: [],
    droppedHeadings: [], colophons: [], emptyWords: 0, notes: 0, midParagraphs: 0, joinFixes: 0, spaceFixes: 0,
    strayHeadingText: [],
  };
  const corpus: SearchCorpus = [];
  const add = (r: ReturnType<typeof parseOsisVerse>, where: string) => {
    st.quotes += r.stats.quotes;
    st.emptyWords += r.stats.emptyWords;
    st.notes += r.stats.notes;
    st.midParagraphs += r.stats.midParagraphs;
    st.joinFixes += r.stats.joinFixes;
    st.spaceFixes += r.stats.spaceFixes;
    st.colophons.push(...r.stats.colophons.map((c) => `${where} ${c}`));
    if (r.stats.badLemmas.length) throw new Error(`${where}: unexpected lemma tokens ${r.stats.badLemmas.join(' ')}`);
  };
  for (const book of BOOKS) {
    for (let c = 1; c <= book.chapters; c++) {
      // The chapter-heading slot holds the chapter milestone and "CHAPTER n." title (dropped); in
      // the ASV it also holds the first Ps 119 acrostic heading.
      const head = parseOsisVerse(mod.verse(book.code, c, 0), { strongs });
      add(head, ref(book.code, c, 0));
      if (head.segs.length) st.strayHeadingText.push(`${ref(book.code, c, 0)} ${segsToText(head.segs)}`);
      let title: Seg[] | undefined = head.titleType === 'acrostic' && head.title ? head.title : undefined;
      const verses: Verse[] = [];
      for (let v = 1; v <= verseCount(book.code, c); v++) {
        const where = ref(book.code, c, v);
        const r = parseOsisVerse(mod.verse(book.code, c, v), { strongs });
        add(r, where);
        let segs = r.segs;
        if (r.title) {
          if (v === 1 && !title) title = r.title;
          else if (r.titleType === 'psalm') {
            // ASV Hab 3:19 marks its closing "For the Chief Musician…" as a title; the KJV has it
            // as verse text, so it stays in the verse.
            segs = appendSegs(segs, r.title);
            st.titlesInVerse.push(`${where} ${segsToText(r.title)}`);
          } else st.droppedHeadings.push(`${where} ${segsToText(r.title)}`);
        }
        const verse: Verse = { n: v, s: segs };
        if (r.para) {
          verse.p = 1;
          st.paraVerses++;
        }
        if (!segs.length) st.emptyVerses.push(where);
        if (segs.some((s) => typeof s !== 'string' && s.w)) st.redVerses++;
        verses.push(verse);
        corpus.push(segsToText(segs, true));
        st.verses++;
      }
      if (title) st.titles++;
      const chapter: ChapterText = { b: book.code, c, tr, ...(title ? { title } : {}), v: verses };
      writeData(`${tr}/${book.code}/${c}.json`, chapter);
      st.chapters++;
    }
  }
  writeData(`search/${tr}.json`, corpus);
  return st;
}

/**
 * Plain text of a raw OSIS verse by simple tag stripping, independent of the converter: notes,
 * titles, colophons, and ASV centred heading lines are removed.
 */
function rawPlain(osis: string, keepTitles = false): string {
  let s = osis
    .replace(/<note\b[^>]*>[\s\S]*?<\/note>/g, '')
    .replace(/<div\b[^>]*type="colophon"[^>]*>[\s\S]*?<\/div>/g, '')
    .replace(/<l\b[^>]*type="x-center"[^>]*\/>[\s\S]*?<l\b[^>]*type="x-center"[^>]*\/>/g, '');
  if (!keepTitles) s = s.replace(/<title\b[^>]*>[\s\S]*?<\/title>/g, '');
  else s = s.replace(/<title\b(?![^>]*type="psalm")[^>]*>[\s\S]*?<\/title>/g, '');
  return decodeEntities(s.replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Strong's numbers of each non-empty <w> in a raw verse (notes, titles and colophons removed). */
function rawStrongs(osis: string): string[][] {
  const s = osis
    .replace(/<note\b[^>]*>[\s\S]*?<\/note>/g, '')
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/g, '')
    .replace(/<div\b[^>]*type="colophon"[^>]*>[\s\S]*?<\/div>/g, '');
  const out: string[][] = [];
  for (const m of s.matchAll(/<w\b([^>]*?)(?<!\/)>([\s\S]*?)<\/w>/g)) {
    if (!m[2].replace(/<[^>]+>/g, '').trim()) continue;
    const lemma = /lemma="([^"]*)"/.exec(m[1])?.[1] ?? '';
    const ids = lemma
      .split(/\s+/)
      .map(strongsFromLemma)
      .filter((x): x is string => !!x);
    if (ids.length) out.push(ids);
  }
  return out;
}

/** Strong's of the segments, one entry per <w> (adjacent segments of one word share the list). */
function segStrongs(segs: Seg[]): string[][] {
  const out: string[][] = [];
  let prev: Seg | null = null;
  for (const s of segs) {
    if (typeof s !== 'string' && s.s) {
      const p = prev && typeof prev !== 'string' ? prev : null;
      // A word split around <divineName> ("of the " + "Lord") gives two segments with one list.
      const sameWord = p && p.s && p.s.join() === s.s.join() && (!!p.dn !== !!s.dn || !!p.a !== !!s.a);
      if (!sameWord) out.push(s.s);
    }
    prev = s;
  }
  return out;
}

const segText = (v: Verse) => segsToText(v.s);

function readChapter(tr: 'kjv' | 'asv', b: BookCode, c: number) {
  return readData<ChapterText>(`${tr}/${b}/${c}.json`);
}

function readVerse(tr: 'kjv' | 'asv', b: BookCode, c: number, v: number) {
  return readChapter(tr, b, c).v[v - 1];
}

/** Checks the app's versification against SWORD's canon.h and the module's chapter milestones. */
function verifyVersification(canonSrc: string, mod: ZVerse, tr: string) {
  const canon = parseCanonH(canonSrc);
  assert(canon.length === 66, `canon.h has ${canon.length} books`);
  let total = 0;
  canon.forEach((b, i) => {
    assert(b.osis === OSIS_BOOKS[i], `canon.h book ${i + 1} is ${b.osis}, expected ${OSIS_BOOKS[i]}`);
    const code = BOOKS[i].code;
    assert(b.verses.length === BOOKS[i].chapters, `${code}: canon.h has ${b.verses.length} chapters`);
    b.verses.forEach((n, c) => {
      assert(n === verseCount(code, c + 1), `${code} ${c + 1}: canon.h has ${n} verses, versification.ts ${verseCount(code, c + 1)}`);
      total += n;
    });
  });
  assert(total === 31102 && TOTAL_VERSES === 31102, `verse totals canon.h ${total}, versification.ts ${TOTAL_VERSES}`);
  const layout = kjvLayout();
  assert(layout.slots[1] === 24115 && layout.slots[2] === 8246, `slot counts ${layout.slots[1]}/${layout.slots[2]}`);
  // Every chapter-heading slot holds that chapter's own <chapter osisID="Book.c"> milestone, so the
  // slot arithmetic (and therefore every verse count) agrees with the module.
  let checked = 0;
  for (const book of BOOKS) {
    for (let c = 1; c <= book.chapters; c++) {
      const head = mod.verse(book.code, c, 0);
      const id = `${bookToOsis(book.code)}.${c}`;
      assert(new RegExp(`<chapter\\b[^>]*osisID="${id.replace('.', '\\.')}"[^>]*sID=`).test(head), `${tr} ${id}: chapter milestone not in its heading slot`);
      checked++;
    }
  }
  return { books: canon.length, chapters: checked, verses: total };
}

// ---------------------------------------------------------------------------------------------
// KJV

const KJV_KNOWN: [BookCode, number, number, string][] = [
  ['GEN', 1, 1, 'In the beginning God created the heaven and the earth.'],
  ['JHN', 3, 16, 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.'],
  ['JHN', 11, 35, 'Jesus wept.'],
  ['PSA', 23, 1, 'The Lord is my shepherd; I shall not want.'],
  ['PSA', 119, 1, 'Blessed are the undefiled in the way, who walk in the law of the Lord.'],
  ['EST', 8, 9, 'Then were the king’s scribes called at that time in the third month, that is, the month Sivan, on the three and twentieth day thereof; and it was written according to all that Mordecai commanded unto the Jews, and to the lieutenants, and the deputies and rulers of the provinces which are from India unto Ethiopia, an hundred twenty and seven provinces, unto every province according to the writing thereof, and unto every people after their language, and to the Jews according to their writing, and according to their language.'],
  ['MAL', 4, 6, 'And he shall turn the heart of the fathers to the children, and the heart of the children to their fathers, lest I come and smite the earth with a curse.'],
];

async function runKjv() {
  const { conf, driver, module: mod, file } = await zipModule('KJV');
  const canon = await download(CANON_H.url, 'crosswire', 'canon.h', CANON_H.sha256);
  assert(driver === 'zText' && confValue(conf, 'Version') === '3.1', `KJV conf: ${driver} v${confValue(conf, 'Version')}`);
  assert(confValue(conf, 'DistributionLicense') === 'GPL', 'KJV DistributionLicense changed');
  const about = confText(conf.values.About?.[0] ?? '');
  const crown = 'The rights to the base text are held by the Crown of England.';
  const grant = 'CrossWire Bible Society hereby grants a general public license to use this text for any purpose.';
  assert(about.includes(crown) && about.includes(grant), 'KJV About text changed');

  const st = convertBible(mod, 'kjv', true);
  log('kjv', `wrote ${st.chapters} chapters, ${st.verses} verses, search/kjv.json`);

  recordSource({
    id: 'crosswire-kjv',
    name: 'King James Version (1769) with Strong’s numbers and morphology (CrossWire KJV module)',
    homepage: `${MODINFO}KJV`,
    version: moduleVersion(conf, file),
    files: [file, { url: CANON_H.url, sha256: canon.sha256, bytes: canon.bytes }],
    license: {
      id: 'GPL',
      name: `GPL (CrossWire DistributionLicense=GPL). The module's About text: "${crown}" and "Any copyright that might be obtained for this effort is held by CrossWire Bible Society © 2003-2023 and ${grant}"`,
      attribution:
        'King James Version (1769), public domain outside the UK (Crown rights in the UK). Text and Strong’s/morphology/red-letter markup from the CrossWire Bible Society KJV module (https://www.crosswire.org/sword/modules/).',
      confirmedAt: `mods.d/kjv.conf inside ${file.url} (DistributionLicense and About), ${MODINFO}KJV`,
    },
    outputs: ['kjv', 'search'],
    notes:
      'Notes (<note>), chapter and book titles, the 14 Pauline colophons, 21 Ps 119 acrostic headings after verse 1, and untranslated (empty) <w> elements are not included. Psalm titles are ChapterText.title; Ps 119 has its first acrostic heading (ALEPH) as title. Divine names keep the module text ("Lord") with dn:1; search/kjv.json writes them as "LORD".',
  });
  writeSearchLicense();

  verifyKjv(st, mod, canon.path);
}

function verifyKjv(st: BibleStats, mod: ZVerse, canonPath: string) {
  const vers = verifyVersification(readFileSync(canonPath, 'utf8'), mod, 'KJV');
  assert(st.strayHeadingText.length === 0, `text in chapter-heading slots: ${st.strayHeadingText.slice(0, 3).join(' | ')}`);
  assert(st.emptyVerses.length === 0, `empty KJV verses: ${st.emptyVerses.join(', ')}`);
  assert(st.joinFixes === 0 && st.spaceFixes === 0, `KJV spacing repairs: ${st.joinFixes} joins, ${st.spaceFixes} spaces`);
  assert(st.quotes === 2035, `KJV <q who="Jesus"> count ${st.quotes}`);

  const corpus = readData<SearchCorpus>('search/kjv.json');
  assert(corpus.length === 31102, `search/kjv.json has ${corpus.length} entries`);

  // Every chapter file, every verse, against the versification and against the raw module.
  let n = 0;
  let rawRed = 0;
  let rawParaOrig = 0;
  let rawParaAdded = 0;
  let outPara = 0;
  let outRed = 0;
  let strongsChecked = 0;
  let longest = { at: '', len: 0 };
  for (const book of BOOKS) {
    for (let c = 1; c <= book.chapters; c++) {
      const ch = readChapter('kjv', book.code, c);
      assert(ch.b === book.code && ch.c === c && ch.tr === 'kjv', `kjv/${book.code}/${c}.json header`);
      assert(ch.v.length === verseCount(book.code, c), `${book.code} ${c}: ${ch.v.length} verses, expected ${verseCount(book.code, c)}`);
      ch.v.forEach((verse, i) => {
        const where = ref(book.code, c, i + 1);
        assert(verse.n === i + 1, `${where}: numbered ${verse.n}`);
        const text = segText(verse);
        assert(text.length > 0, `${where} is empty`);
        assert(!/[<>]|\s\s|^\s|\s$|\s[,.;:?!)]/.test(text), `${where}: bad spacing or markup in "${text}"`);
        const raw = mod.verse(book.code, c, i + 1);
        assert(text === rawPlain(raw), `${where}: text differs from the module\n  out: ${text}\n  raw: ${rawPlain(raw)}`);
        const ss = segStrongs(verse.s);
        assert(JSON.stringify(ss) === JSON.stringify(rawStrongs(raw)), `${where}: Strong's differ from the module`);
        strongsChecked += ss.length;
        for (const s of verse.s) {
          if (typeof s === 'string') continue;
          assert(Object.keys(s).every((k) => ['t', 's', 'm', 'w', 'a', 'dn'].includes(k)) && s.t, `${where}: bad segment ${JSON.stringify(s)}`);
          for (const id of s.s ?? []) assert(/^(H[1-9]\d{0,3}|G[1-9]\d{0,3})$/.test(id) && Number(id.slice(1)) <= (id[0] === 'H' ? 8674 : 5624), `${where}: Strong's ${id}`);
        }
        const noNotes = raw.replace(/<note\b[^>]*>[\s\S]*?<\/note>/g, '');
        if (/<q\b[^>]*who="Jesus"/.test(noNotes)) rawRed++;
        const red = verse.s.some((s) => typeof s !== 'string' && s.w);
        if (red) outRed++;
        const pm = /^(?:<div[^>]*x-preverse[^>]*\/>|<title\b[\s\S]*?<\/title>\s*|<q\b[^>]*>)*<milestone\b([^>]*)type="x-p"/.exec(noNotes);
        if (pm) {
          if (/x-added/.test(pm[1])) rawParaAdded++;
          else rawParaOrig++;
        }
        if (verse.p) outPara++;
        assert(!!pm === !!verse.p, `${where}: paragraph flag ${verse.p} but module ${pm ? 'has' : 'has no'} ¶`);
        assert(corpus[n] === segsToText(verse.s, true), `${where}: search text differs`);
        if (text.length > longest.len) longest = { at: where, len: text.length };
        n++;
      });
    }
  }
  assert(n === 31102, `${n} verses checked`);
  assert(outRed === rawRed && outPara === rawParaOrig + rawParaAdded, `red ${outRed}/${rawRed}, ¶ ${outPara}/${rawParaOrig + rawParaAdded}`);
  assert(longest.at === 'EST 8:9', `longest verse is ${longest.at}`);

  // Known verses.
  for (const [b, c, v, want] of KJV_KNOWN) {
    const got = segText(readVerse('kjv', b, c, v));
    assert(got === want, `${ref(b, c, v)}: "${got}"`);
  }
  const ps23 = readChapter('kjv', 'PSA', 23);
  assert(segsToText(ps23.title ?? []) === 'A Psalm of David.', `Ps 23 title "${segsToText(ps23.title ?? [])}"`);
  const ps119 = readChapter('kjv', 'PSA', 119);
  assert(segsToText(ps119.title ?? []) === 'א ALEPH.', `Ps 119 title "${segsToText(ps119.title ?? [])}"`);
  assert(segsToText(readChapter('kjv', 'PSA', 3).title ?? []) === 'A Psalm of David, when he fled from Absalom his son.', 'Ps 3 title');
  assert(!readChapter('kjv', 'PSA', 1).title && !readChapter('kjv', 'GEN', 1).title, 'unexpected title on Ps 1 / Gen 1');
  assert(corpus[verseIndex('PSA', 23, 1)] === 'The LORD is my shepherd; I shall not want.', 'search text of Ps 23:1');

  // Gen 1:1 Strong's in module order: In the beginning / God / created / the heaven / and / the earth.
  const gen = readVerse('kjv', 'GEN', 1, 1).s.flatMap((s) => (typeof s === 'string' ? [] : (s.s ?? [])));
  assert(JSON.stringify(gen) === JSON.stringify(['H7225', 'H430', 'H853', 'H1254', 'H8064', 'H853', 'H776']), `Gen 1:1 Strong's ${gen}`);
  assert(JSON.stringify([...gen].sort()) === JSON.stringify(['H7225', 'H1254', 'H430', 'H853', 'H8064', 'H853', 'H776'].sort()), 'Gen 1:1 Strong’s set');
  const created = readVerse('kjv', 'GEN', 1, 1).s.find((s) => typeof s !== 'string' && s.t === 'created');
  assert(typeof created !== 'string' && created?.m?.[0] === 'TH8804', 'Gen 1:1 "created" morph TH8804');

  // John 3:16: Strong's on "God" and "loved", red letter, paragraph.
  const j316 = readVerse('kjv', 'JHN', 3, 16);
  const seg = (t: string) => j316.s.find((s) => typeof s !== 'string' && s.t === t) as Exclude<Seg, string> | undefined;
  assert(seg('God')?.s?.includes('G2316'), 'John 3:16 "God" has G2316');
  assert(JSON.stringify(seg('loved')?.s) === '["G25"]' && seg('loved')?.m?.[0] === 'V-AAI-3S', 'John 3:16 "loved" is G25 V-AAI-3S');
  assert(j316.s.every((s) => (typeof s === 'string' ? !s.trim() : s.w === 1)), 'John 3:16 is red letter throughout');
  assert(j316.p === 1, 'John 3:16 starts a paragraph');
  assert(readVerse('kjv', 'JHN', 11, 35).s.every((s) => typeof s === 'string' || !s.w), 'John 11:35 is narrative, not red letter');

  const kjvSize = folderStats('kjv');
  const searchSize = statSync(join(OUT, 'search', 'kjv.json')).size;
  log('kjv', `verify ok: versification = canon.h (${vers.books} books, ${vers.chapters} chapters, ${vers.verses} verses); every verse's text and Strong's equal the module (${strongsChecked} tagged words)`);
  log('kjv', `red-letter verses ${outRed} (from ${st.quotes} <q who="Jesus">); paragraph-start verses ${outPara} (${rawParaOrig} original ¶ + ${rawParaAdded} editor-added)`);
  log('kjv', `titles ${st.titles} (116 Psalms + Ps 119 ALEPH); dropped: ${st.droppedHeadings.length} later Ps 119 headings, ${st.colophons.length} colophons, ${st.notes} notes, ${st.emptyWords} empty <w>`);
  log('kjv', `longest verse ${longest.at} (${longest.len} chars); output kjv/ ${kjvSize.text}; search/kjv.json ${(searchSize / 1e6).toFixed(2)} MB`);
}

function verseIndex(b: BookCode, c: number, v: number) {
  let n = 0;
  for (const book of BOOKS) {
    for (let ch = 1; ch <= book.chapters; ch++) {
      if (book.code === b && ch === c) return n + v - 1;
      n += verseCount(book.code, ch);
    }
  }
  return -1;
}

/** search/ holds both corpora, so its LICENSE.txt covers both sources. */
function writeSearchLicense() {
  writeText(
    'search/LICENSE.txt',
    [
      'Search corpora: plain verse text in canonical KJV-versification order (31,102 entries each).',
      '',
      'search/kjv.json',
      '  King James Version (1769), public domain outside the UK (Crown rights in the UK).',
      '  Text from the CrossWire Bible Society KJV module 3.1 (https://www.crosswire.org/sword/modules/).',
      '  CrossWire DistributionLicense: GPL. About: "The rights to the base text are held by the Crown of England."',
      '  "CrossWire Bible Society hereby grants a general public license to use this text for any purpose."',
      '',
      'search/asv.json',
      '  American Standard Version (1901), public domain.',
      '  Text from the CrossWire Bible Society ASV module 2.0 (https://www.crosswire.org/sword/modules/).',
      '',
      'The files in this folder were converted by the OpenBerea data pipeline (scripts/pipeline).',
      'They keep the licenses above, which are separate from the MIT license of the OpenBerea code.',
      '',
    ].join('\n'),
  );
}

// ---------------------------------------------------------------------------------------------
// ASV

/** Verses the ASV omits (text only in a footnote); they stay as empty verses to keep KJV numbering. */
const ASV_OMITTED = [
  'MAT 17:21', 'MAT 18:11', 'MAT 23:14', 'MRK 7:16', 'MRK 9:44', 'MRK 9:46', 'MRK 11:26', 'MRK 15:28',
  'LUK 17:36', 'LUK 23:17', 'JHN 5:4', 'ACT 8:37', 'ACT 15:34', 'ACT 24:7', 'ACT 28:29', 'ROM 16:24',
];

async function runAsv() {
  const { conf, driver, module: mod, file } = await zipModule('ASV');
  const canon = await download(CANON_H.url, 'crosswire', 'canon.h', CANON_H.sha256);
  assert(driver === 'zText' && confValue(conf, 'Version') === '2.0', `ASV conf: ${driver} v${confValue(conf, 'Version')}`);
  assert(confValue(conf, 'DistributionLicense') === 'Public Domain', 'ASV DistributionLicense changed');

  const st = convertBible(mod, 'asv', false);
  log('asv', `wrote ${st.chapters} chapters, ${st.verses} verses, search/asv.json`);

  recordSource({
    id: 'crosswire-asv',
    name: 'American Standard Version (1901) (CrossWire ASV module)',
    homepage: `${MODINFO}ASV`,
    version: moduleVersion(conf, file),
    files: [file],
    license: {
      id: 'PD',
      name: 'Public Domain',
      attribution: 'American Standard Version (1901), public domain. Text from the CrossWire Bible Society ASV module (https://www.crosswire.org/sword/modules/).',
      confirmedAt: `mods.d/asv.conf inside ${file.url} (DistributionLicense=Public Domain; About: "The American Standard Version (ASV) of the Holy Bible is in the Public Domain.")`,
    },
    outputs: ['asv', 'search'],
    notes: `Strong's tags are not kept (misaligned in this module). Footnotes, poetry line breaks, and 21 Ps 119 acrostic headings after verse 1 are not included. ${ASV_OMITTED.length} verses the ASV omits are empty (s: []). ${st.joinFixes} missing spaces at <transChange> boundaries were restored.`,
  });
  writeSearchLicense();

  verifyAsv(st, mod, canon.path);
}

function verifyAsv(st: BibleStats, mod: ZVerse, canonPath: string) {
  verifyVersification(readFileSync(canonPath, 'utf8'), mod, 'ASV');
  assert(st.strayHeadingText.length === 0, `text in ASV chapter-heading slots: ${st.strayHeadingText.slice(0, 3).join(' | ')}`);
  assert(JSON.stringify(st.emptyVerses) === JSON.stringify(ASV_OMITTED), `ASV empty verses: ${st.emptyVerses.join(', ')}`);
  for (const where of ASV_OMITTED) {
    const [b, cv] = where.split(' ');
    const [c, v] = cv.split(':').map(Number);
    assert(rawPlain(mod.verse(b as BookCode, c, v)) === '', `${where}: module has verse text outside its footnote`);
  }
  const corpus = readData<SearchCorpus>('search/asv.json');
  assert(corpus.length === 31102, `search/asv.json has ${corpus.length} entries`);
  let n = 0;
  let paras = 0;
  for (const book of BOOKS) {
    for (let c = 1; c <= book.chapters; c++) {
      const ch = readChapter('asv', book.code, c);
      assert(ch.b === book.code && ch.c === c && ch.tr === 'asv', `asv/${book.code}/${c}.json header`);
      assert(ch.v.length === verseCount(book.code, c), `ASV ${book.code} ${c}: ${ch.v.length} verses`);
      ch.v.forEach((verse, i) => {
        const where = ref(book.code, c, i + 1);
        assert(verse.n === i + 1, `${where}: numbered ${verse.n}`);
        const text = segText(verse);
        for (const s of verse.s) assert(typeof s === 'string' || (!s.s && !s.m && !s.w && !s.dn), `${where}: unexpected flags`);
        assert(!/[<>]|\s\s|^\s|\s$|\s[,.;:?!)]/.test(text), `${where}: bad spacing "${text}"`);
        // Same text as the module apart from the spaces restored at <transChange> boundaries.
        const raw = rawPlain(mod.verse(book.code, c, i + 1), i + 1 !== 1);
        assert(text.replace(/ /g, '') === raw.replace(/ /g, ''), `${where}: text differs from the module\n  out: ${text}\n  raw: ${raw}`);
        assert(corpus[n] === text, `${where}: search text differs`);
        if (verse.p) paras++;
        n++;
      });
    }
  }
  const known: [BookCode, number, number, string][] = [
    ['JHN', 3, 16, 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth on him should not perish, but have eternal life.'],
    ['PSA', 23, 1, 'Jehovah is my shepherd; I shall not want.'],
    ['GEN', 1, 1, 'In the beginning God created the heavens and the earth.'],
    ['NUM', 21, 18, 'The well, which the princes digged, Which the nobles of the people delved, With the sceptre, and with their staves. And from the wilderness they journeyed to Mattanah;'],
  ];
  for (const [b, c, v, want] of known) {
    const got = segText(readVerse('asv', b, c, v));
    assert(got === want, `ASV ${ref(b, c, v)}: "${got}"`);
  }
  assert(readVerse('asv', 'JHN', 3, 16).p === 1, 'ASV John 3:16 starts a paragraph');
  assert(segsToText(readChapter('asv', 'PSA', 23).title ?? []) === 'A Psalm of David.', 'ASV Ps 23 title');
  assert(segsToText(readChapter('asv', 'PSA', 119).title ?? []) === 'א ALEPH.', 'ASV Ps 119 title');
  assert(!segText(readVerse('asv', 'PSA', 119, 8)).includes('BETH'), 'ASV Ps 119:8 keeps the next heading');
  assert(segText(readVerse('asv', 'HAB', 3, 19)).endsWith('For the Chief Musician, on my stringed instruments.'), 'ASV Hab 3:19 subscription');
  log('asv', `verify ok: ${n} verses in KJV versification, text equals the module; empty (omitted) verses ${st.emptyVerses.length}: ${st.emptyVerses.join(', ')}`);
  log('asv', `paragraph-start verses ${paras} (${st.midParagraphs} mid-verse paragraph marks not representable); titles ${st.titles}; restored ${st.joinFixes} missing spaces at <transChange> boundaries; dropped ${st.droppedHeadings.length} later Ps 119 headings, ${st.notes} footnotes; Hab 3:19 subscription kept in the verse`);
  log('asv', `output asv/ ${folderStats('asv').text}; search/asv.json ${(statSync(join(OUT, 'search', 'asv.json')).size / 1e6).toFixed(2)} MB`);
}

// ---------------------------------------------------------------------------------------------
// TSK (beta v1.5, OSIS with explicit osisRef on every reference)

const TSK_FILES: Record<string, string> = {
  'mods.d/tsk.conf': 'c5830c08212c9122482670ae3cb9b1c51fea657f508c6578faafe3444d849919',
  'modules/comments/zcom/tsk/ot.bzs': '9cb1d75d71d66e63002a34f0ac139d9e6d129312efb16648132778bfc72f2a44',
  'modules/comments/zcom/tsk/ot.bzv': 'a389d2e8d3c2c0cb47c8814d84603ff9eccc89ba755b95648018ec099f7d9f4f',
  'modules/comments/zcom/tsk/ot.bzz': '96f95951999052678d2d99a60dbde9d43b63038d4cc3d59cd89b6f725037591c',
  'modules/comments/zcom/tsk/nt.bzs': '3ff5d36db4778491286a101a7644c323d0cb8eb1ea1a32305e3db83c3c24a9af',
  'modules/comments/zcom/tsk/nt.bzv': 'fea9c85eff7e8cba8189d2ee634d14d42d1e7d826d51a893602a75e6a99f5e68',
  'modules/comments/zcom/tsk/nt.bzz': '80c7489e951875f8cb6bbd89a78bf9fcafb433246949932d41ed32a90bcd509b',
};

/**
 * Refs that v1.5 adds to Gen 1:1 as a leading group with no keyword. They are not in TSK v1.4
 * (main repository) or anywhere else in either module and have nothing to do with the verse
 * (Num 1:21 is a census total), so they are treated as a conversion error and left out.
 */
const TSK_EXCLUDE: Record<string, string[]> = {
  'GEN.1.1': [
    'NUM.1.21', 'NUM.1.42', 'NUM.2.28', 'NUM.4.36', 'NUM.7.17', 'NUM.7.73', 'NUM.10.14', 'NUM.26.51', 'NUM.31.32',
    'NUM.35.4', '2CH.9.1', 'EZR.1.11', 'ECC.11.1', 'EZK.43.14', 'DEU.11.29',
  ],
};

/** The osisRef values of <reference> elements, in order. */
function referenceOsisRefs(osis: string): string[] {
  return [...osis.matchAll(/<reference\b[^>]*\bosisRef="([^"]*)"/g)].map((m) => decodeEntities(m[1]));
}

async function runTsk() {
  const files = new Map<string, Buffer>();
  const records: FileRecord[] = [];
  for (const [rel, sha] of Object.entries(TSK_FILES)) {
    const url = `${BETARAW}${rel}`;
    const f = await download(url, 'crosswire', `TSK-beta/${rel}`, sha);
    files.set(rel, readFileSync(f.path));
    records.push({ url, sha256: f.sha256, bytes: f.bytes });
  }
  const { conf, driver, module: mod } = openModule(files);
  assert(conf.name === 'TSK' && driver === 'zCom' && confValue(conf, 'Version') === '1.5' && confValue(conf, 'SourceType') === 'OSIS', 'TSK beta conf changed');
  assert(confValue(conf, 'DistributionLicense') === 'Public Domain', 'TSK DistributionLicense changed');

  const st = { verses: 0, refs: 0, invalid: [] as string[], strongs: 0, selfRefs: 0, duplicates: 0, introRefs: 0, excluded: 0, shortened: 0 };
  for (const book of BOOKS) {
    st.introRefs += referenceOsisRefs(mod.verse(book.code, 0, 0)).length;
    for (let c = 1; c <= book.chapters; c++) {
      st.introRefs += referenceOsisRefs(mod.verse(book.code, c, 0)).length;
      const out: TskChapter = {};
      for (let v = 1; v <= verseCount(book.code, c); v++) {
        const self = `${book.code}.${c}.${v}`;
        const exclude = new Set(TSK_EXCLUDE[self] ?? []);
        const refs: string[] = [];
        for (const raw of referenceOsisRefs(mod.verse(book.code, c, v))) {
          if (/^strong:/i.test(raw)) {
            st.strongs++;
            continue;
          }
          const r = osisRefToCompact(raw);
          if ('error' in r) {
            st.invalid.push(`${self}: ${raw} (${r.error})`);
            continue;
          }
          if (r.note) st.shortened++;
          if (exclude.has(r.ref)) {
            st.excluded++;
            exclude.delete(r.ref);
          } else if (r.ref === self) st.selfRefs++;
          else if (refs.includes(r.ref)) st.duplicates++;
          else refs.push(r.ref);
        }
        if (exclude.size) throw new Error(`TSK ${self}: expected source refs ${[...exclude].join(', ')} to exclude`);
        if (refs.length) {
          out[String(v)] = refs;
          st.verses++;
          st.refs += refs.length;
        }
      }
      writeData(`tsk/${book.code}/${c}.json`, out);
    }
  }
  log('tsk', `wrote ${TOTAL_CHAPTERS} chapters: ${st.refs} refs on ${st.verses} verses`);

  recordSource({
    id: 'crosswire-tsk',
    name: 'The Treasury of Scripture Knowledge (CrossWire TSK module, beta repository)',
    homepage: `${MODINFO}TSK`,
    version: `TSK module ${confValue(conf, 'Version')} (${confValue(conf, 'SwordVersionDate')}), CrossWire beta repository; files pinned by sha256`,
    files: records,
    license: {
      id: 'PD',
      name: 'Public Domain',
      attribution:
        'The Treasury of Scripture Knowledge (Canne, Browne, Blayney, Scott, and others, c. 1880), public domain. Cross-references from the CrossWire Bible Society TSK module (https://www.crosswire.org/sword/modules/).',
      confirmedAt: `${BETARAW}mods.d/tsk.conf (DistributionLicense=Public Domain)`,
    },
    outputs: ['tsk'],
    notes: `Only verse entries are converted (chapter outlines and book introductions, ${st.introRefs} refs, are not cross-references). Dropped: ${st.invalid.length} refs invalid in the KJV versification, ${st.strongs} Strong's links, ${st.selfRefs} self-references, ${st.duplicates} repeats within a verse, and ${st.excluded} stray refs on Gen 1:1 (see TSK_EXCLUDE).`,
  });
  verifyTsk(st, mod);
}

function verifyTsk(st: { verses: number; refs: number; invalid: string[]; strongs: number; selfRefs: number; duplicates: number; introRefs: number; excluded: number; shortened: number }, mod: ZVerse) {
  const tsk = folderStats('tsk');
  assert(tsk.files === TOTAL_CHAPTERS, `tsk/ has ${tsk.files} chapter files`);
  let refs = 0;
  let verses = 0;
  for (const book of BOOKS) {
    for (let c = 1; c <= book.chapters; c++) {
      const ch = readData<TskChapter>(`tsk/${book.code}/${c}.json`);
      for (const [v, list] of Object.entries(ch)) {
        assert(/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= verseCount(book.code, c), `tsk ${book.code} ${c}: key ${v}`);
        assert(list.length > 0, `tsk ${book.code} ${c}:${v} is empty`);
        for (const r of list) assert(compactValid(r), `tsk ${book.code} ${c}:${v}: invalid ref ${r}`);
        refs += list.length;
        verses++;
      }
    }
  }
  assert(refs === st.refs && verses === st.verses, 'tsk totals differ from the files');
  // John 3:16 against the module (the refs as printed in the entry, in order).
  const want = [
    'LUK.2.14', 'ROM.5.8', '2CO.5.19-21', 'TIT.3.4', '1JN.4.9-10', '1JN.4.19', 'JHN.1.14', 'JHN.1.18', 'GEN.22.12', 'MRK.12.6',
    'ROM.5.10', 'ROM.8.32', 'JHN.3.15', 'MAT.9.13', '1TI.1.15-16',
  ];
  const j316 = readData<TskChapter>('tsk/JHN/3.json')['16'];
  assert(JSON.stringify(j316) === JSON.stringify(want), `TSK John 3:16 = ${j316}`);
  const raw = referenceOsisRefs(mod.verse('JHN', 3, 16));
  assert(raw.length === want.length && raw[2] === '2Cor.5.19-2Cor.5.21', `TSK John 3:16 raw refs ${raw.join(' ')}`);
  const gen = readData<TskChapter>('tsk/GEN/1.json')['1'];
  assert(gen[0] === 'PRO.8.22-24' && !gen.includes('NUM.1.21'), `TSK Gen 1:1 starts ${gen.slice(0, 3)}`);
  log('tsk', `verify ok: ${verses} verses with ${refs} refs, all valid in KJV versification; John 3:16 = ${j316.length} refs as in the module`);
  log('tsk', `invalid refs dropped ${st.invalid.length}${st.invalid.length ? `: ${st.invalid.slice(0, 8).join('; ')}${st.invalid.length > 8 ? '; …' : ''}` : ''}`);
  log('tsk', `also skipped: ${st.strongs} Strong's links, ${st.selfRefs} self-refs, ${st.duplicates} repeats, ${st.excluded} stray Gen 1:1 refs, ${st.introRefs} refs in chapter outlines/book intros; chapter ranges shortened ${st.shortened}`);
  log('tsk', `output tsk/ ${tsk.text}`);
}

// ---------------------------------------------------------------------------------------------
// Commentaries: Matthew Henry (MHC), Jamieson-Fausset-Brown (JFB), Barnes' NT Notes.
// Gill is not built: its only digitized edition (Larry Pierce's) is "All Rights Reserved".

type CommId = 'mhc' | 'jfb' | 'barnes';

interface CommSpec {
  id: CommId;
  zip: 'MHC' | 'JFB' | 'Barnes';
  name: string;
  attribution: string;
  markup: 'osis' | 'thml';
}

const COMMENTARIES: CommSpec[] = [
  {
    id: 'mhc',
    zip: 'MHC',
    name: 'Matthew Henry’s Complete Commentary on the Whole Bible (CrossWire MHC module)',
    attribution: 'Matthew Henry, Complete Commentary on the Whole Bible, public domain. Text from the CrossWire Bible Society MHC module (https://www.crosswire.org/sword/modules/), prepared from the Christian Classics Ethereal Library.',
    markup: 'osis',
  },
  {
    id: 'jfb',
    zip: 'JFB',
    name: 'Jamieson, Fausset and Brown, Commentary Critical and Explanatory on the Whole Bible (CrossWire JFB module)',
    attribution: 'Robert Jamieson, A. R. Fausset and David Brown, Commentary Critical and Explanatory on the Whole Bible (1871), public domain. Text from the CrossWire Bible Society JFB module (https://www.crosswire.org/sword/modules/).',
    markup: 'osis',
  },
  {
    id: 'barnes',
    zip: 'Barnes',
    name: 'Albert Barnes, Notes on the New Testament (CrossWire Barnes module)',
    attribution: 'Albert Barnes, Notes on the New Testament, public domain. Text from the CrossWire Bible Society Barnes module (https://www.crosswire.org/sword/modules/).',
    markup: 'thml',
  },
];

interface CommPiece {
  /** Verse range, or undefined for an introduction. */
  v?: [number, number];
  /** 0 = book introduction, 1 = chapter introduction (ordering only). */
  intro?: 0 | 1;
  html: string;
  /** Position in the module (block × 1e10 + byte offset), for ordering and orphan placement. */
  pos: number;
}

interface CommStats {
  chapters: number;
  emptyChapters: number;
  entries: number;
  intros: number;
  versesCovered: number;
  orphans: number;
  orphanPieces: number;
  orphansAppended: number;
  duplicateSlots: number;
  headerMismatch: number;
  /** Header ranges widened to the index slots no other entry covers. */
  extended: number;
  droppedEmpty: number;
  droppedDuplicate: number;
  greek: number;
  hebrew: number;
  refs: RefStats;
}

/** Reverse map of verse-index slots: testament + index → book, chapter (0 = book), verse. */
function slotIndex() {
  const map = new Map<string, { book: BookCode; chapter: number; verse: number }>();
  for (const b of kjvLayout().books) {
    map.set(`${b.testament}:${b.bookSlot}`, { book: b.code, chapter: 0, verse: 0 });
    b.chapterSlots.forEach((base, i) => {
      for (let v = 0; v <= b.verses[i]; v++) map.set(`${b.testament}:${base + v}`, { book: b.code, chapter: i + 1, verse: v });
    });
  }
  return map;
}

const validRange = (r: [number, number] | null, n: number): r is [number, number] => !!r && r[0] >= 1 && r[0] <= r[1] && r[1] <= n;

/** Splits one indexed entry (slots start..end of a chapter) into pieces, per commentary. */
function entryPieces(spec: CommSpec, html: string, g: { start: number; end: number }, c: number, n: number, pos: number, st: CommStats): CommPiece[] {
  const start = Math.max(1, g.start);
  const proseLength = (h: string) => h.replace(/<title\b[\s\S]*?<\/title>/g, '').replace(/<[^>]*>/g, '').trim().length;
  if (spec.id === 'mhc') {
    if (g.start === 0 && g.end === 0) return [{ intro: 1, html, pos }];
    // A book's (or chapter's) introduction can precede the section title that opens the quoted
    // passage (the last x-s3 title before the first superscript verse number) in the v.1 entry.
    const sup = html.search(/<hi type="super">/);
    const k = html.lastIndexOf('<title type="x-s3">', sup < 0 ? undefined : sup);
    if (g.start === 1 && k > 0 && proseLength(html.slice(0, k)) > 80) {
      return [
        { intro: c === 1 ? 0 : 1, html: html.slice(0, k), pos },
        { v: [start, g.end], html: html.slice(k), pos: pos + k },
      ];
    }
    return [{ v: [start, g.end], html, pos }];
  }
  const parts = spec.id === 'jfb' ? splitJfb(html) : splitBarnes(html, c === 1 && g.start === 1);
  const out: CommPiece[] = [];
  parts.forEach((p, i) => {
    const at = pos + p.offset;
    if (!p.head) {
      // Text before the first verse header.
      if (g.start === 0 && g.end === 0) out.push({ intro: 1, html: p.html, pos: at });
      else if (spec.id === 'barnes' && (g.start === 1 || (c === 1 && g.start <= 2)) && parts.length > 1) {
        // Barnes puts book prefaces/introductions in 1:1–2 and chapter introductions in v.1.
        out.push({ intro: c === 1 && g.start <= 2 ? 0 : 1, html: p.html, pos: at });
      } else if (spec.id === 'barnes' && c === 1 && g.start <= 2 && /INTRODUCTION|PREFACE|Introduction/.test(p.html.replace(/<[^>]*>/g, '').slice(0, 400))) {
        out.push({ intro: 0, html: p.html, pos: at });
      } else if (spec.id === 'jfb' && parts.length > 1) {
        // Section titles before the first "N." header stay with that comment; prose in a v.1 entry
        // is a book or chapter introduction (JFB's Pentateuch introduction sits in Gen 1:1).
        if (g.start === 1 && proseLength(p.html) > 80) out.push({ intro: c === 1 ? 0 : 1, html: p.html, pos: at });
        else parts[i + 1].html = p.html + parts[i + 1].html;
      } else out.push({ v: [start, g.end], html: p.html, pos: at });
      return;
    }
    const first = !out.some((x) => x.v);
    let v: [number, number] | null = validRange(p.head, n) ? p.head : null;
    if (first && v && g.start > 0) {
      // The first header must agree with the slots it is indexed under; otherwise trust the slots.
      const ok = spec.id === 'jfb' ? v[0] === g.start : v[0] <= g.start && g.start <= v[1];
      if (!ok) {
        st.headerMismatch++;
        v = [start, g.end];
      }
    }
    const prev = out[out.length - 1];
    if (!v) {
      if (prev) {
        prev.html += p.html;
        return;
      }
      st.headerMismatch++;
      v = g.start === 0 ? null : [start, g.end];
    }
    if (v && prev?.v && prev.v[0] === v[0] && prev.v[1] === v[1]) {
      // Barnes repeats "Verse 1." before each phrase it explains: one entry per range.
      prev.html += p.html;
      return;
    }
    out.push(v ? { v, html: p.html, pos: at } : { intro: 1, html: p.html, pos: at });
  });
  return out;
}

/** Places an orphaned segment (text no index slot points to) by its own verse markers. */
function orphanPieces(spec: CommSpec, html: string, n: number, pos: number): (CommPiece | { append: string; pos: number })[] {
  if (spec.id === 'mhc') {
    const r = mhcMarkerRange(html);
    return validRange(r, n) ? [{ v: r, html, pos }] : [{ append: html, pos }];
  }
  return splitJfb(html, true).map((p) =>
    p.head && validRange(p.head, n) ? { v: p.head, html: p.html, pos: pos + p.offset } : { append: p.html, pos: pos + p.offset },
  );
}

const textOf = (blocks: Block[]) => blocksToText(blocks);
const HEADER_ONLY = /^(?:[1-3]?\s?[A-Z][a-z]+\s+)?Verses?\s+\d+(?:\s*[-–,]\s*\d+)?\s*[.:]?$/;
const HEADING_ONLY = /^[\w\s'’.]{0,40}\bchapter\s+[\divxlc]+\.?$/i;

async function runCommentary(spec: CommSpec) {
  const { conf, driver, module: mod, file } = await zipModule(spec.zip);
  assert(confValue(conf, 'DistributionLicense') === 'Public Domain', `${spec.zip} DistributionLicense changed`);
  const stats: CommStats = {
    chapters: 0, emptyChapters: 0, entries: 0, intros: 0, versesCovered: 0, orphans: 0, orphanPieces: 0, orphansAppended: 0,
    duplicateSlots: 0, headerMismatch: 0, extended: 0, droppedEmpty: 0, droppedDuplicate: 0, greek: 0, hebrew: 0, refs: { links: 0, failed: [] },
  };
  const slots = slotIndex();

  // Orphaned text, assigned to the chapter of the slot it follows.
  const orphans = new Map<string, { html: string; pos: number }[]>();
  if (spec.id !== 'barnes') {
    for (const t of [1, 2] as const) {
      for (const g of findGaps(mod, t)) {
        const at = slots.get(`${t}:${g.afterIdx ?? g.beforeIdx}`);
        if (!at) throw new Error(`${spec.id}: orphan at ${t}:${g.block}:${g.start} has no slot`);
        const key = `${at.book}.${Math.max(1, at.chapter)}`;
        const list = orphans.get(key) ?? [];
        list.push({ html: mod.block(t, g.block).toString(mod.encoding, g.start, g.end), pos: g.block * 1e10 + g.start });
        orphans.set(key, list);
        stats.orphans++;
      }
    }
  }

  const seen = new Set<string>();
  const keyOf = (t: number, e: { block: number; start: number; size: number }) => `${t}:${e.block}:${e.start}:${e.size}`;
  const prepare = (html: string, book: BookCode, c: number) =>
    spec.markup === 'osis' ? prepareOsis(html) : prepareScripRefs(html, { book, chapter: c }, stats.refs);

  for (const book of BOOKS) {
    const t = book.testament === 'OT' ? 1 : 2;
    if (!mod.has(t)) continue;
    const bookSlot = mod.slot(book.code, 0, 0);
    const bookEntry = mod.entry(bookSlot.t, bookSlot.idx);
    for (let c = 1; c <= book.chapters; c++) {
      const n = verseCount(book.code, c);
      const pieces: CommPiece[] = [];
      if (c === 1 && bookEntry?.size && !seen.has(keyOf(t, bookEntry))) {
        seen.add(keyOf(t, bookEntry));
        pieces.push({ intro: 0, html: mod.bytes(bookEntry, t).toString(mod.encoding), pos: bookEntry.block * 1e10 + bookEntry.start });
      }
      const indexed: { start: number; end: number; pieces: CommPiece[] }[] = [];
      for (const g of chapterGroups(mod, book.code, c)) {
        const key = keyOf(t, g.entry);
        if (seen.has(key)) {
          // Barnes points each book's first chapter-heading slot at the previous book's last comment.
          stats.duplicateSlots++;
          continue;
        }
        seen.add(key);
        const html = mod.bytes(g.entry, t).toString(mod.encoding);
        const made = entryPieces(spec, html, g, c, n, g.entry.block * 1e10 + g.entry.start, stats);
        pieces.push(...made);
        indexed.push({ start: g.start, end: g.end, pieces: made });
      }
      for (const o of orphans.get(`${book.code}.${c}`) ?? []) {
        for (const p of orphanPieces(spec, o.html, n, o.pos)) {
          if ('append' in p) {
            // No verse header: the text continues the comment it follows in the module.
            const prev = pieces.filter((x) => x.pos < p.pos).sort((a, b) => b.pos - a.pos)[0];
            if (!prev) throw new Error(`${spec.id} ${book.code} ${c}: orphaned text with nothing before it`);
            prev.html += p.append;
            stats.orphansAppended++;
          } else {
            pieces.push(p);
            stats.orphanPieces++;
          }
        }
      }

      // The index links each entry to its slots: when a header names a shorter range ("17-29." on
      // slots 17–36) and nothing else comments on the remaining slots, the entry keeps them.
      const has = (v: number) => pieces.some((p) => p.v && p.v[0] <= v && v <= p.v[1]);
      for (const g of indexed) {
        for (let v = Math.max(1, g.start); v <= g.end; v++) {
          if (has(v)) continue;
          const last = g.pieces.filter((p) => p.v && p.v[0] <= v).pop();
          if (last?.v) {
            last.v = [last.v[0], v];
            stats.extended++;
          }
        }
      }

      pieces.sort((a, b) => (a.v ? 1 : 0) - (b.v ? 1 : 0) || (a.intro ?? 0) - (b.intro ?? 0) || (a.v?.[0] ?? 0) - (b.v?.[0] ?? 0) || a.pos - b.pos);
      const entries: CommentaryChapter['e'] = [];
      const dedupe = new Set<string>();
      const covered = new Set<number>();
      for (const p of pieces) {
        const blocks = commentaryBlocks(prepare(p.html, book.code, c), stats.refs);
        const text = textOf(blocks).trim();
        if (!text || HEADER_ONLY.test(text) || (!p.v && (HEADING_ONLY.test(text) || (text.length < 100 && blocks.every((b) => b.k === 'h'))))) {
          stats.droppedEmpty++;
          continue;
        }
        const k = `${p.v?.join('-') ?? 'i'}|${JSON.stringify(blocks)}`;
        if (dedupe.has(k)) {
          stats.droppedDuplicate++;
          continue;
        }
        dedupe.add(k);
        entries.push(p.v ? { v: p.v, blocks } : { blocks });
        if (p.v) for (let v = p.v[0]; v <= p.v[1]; v++) covered.add(v);
        else stats.intros++;
        for (const b of blocks) for (const x of b.c) if (typeof x !== 'string' && x.l) stats[x.l === 'grc' ? 'greek' : 'hebrew']++;
      }
      stats.entries += entries.length;
      stats.versesCovered += covered.size;
      if (!entries.length) stats.emptyChapters++;
      const chapter: CommentaryChapter = { b: book.code, c, id: spec.id, e: entries };
      writeData(`comm/${spec.id}/${book.code}/${c}.json`, chapter);
      stats.chapters++;
    }
  }

  recordSource({
    id: `crosswire-${spec.id}`,
    name: spec.name,
    homepage: `${MODINFO}${spec.zip}`,
    version: moduleVersion(conf, file),
    files: [file],
    license: {
      id: 'PD',
      name: 'Public Domain',
      attribution: spec.attribution,
      confirmedAt: `mods.d/${spec.zip.toLowerCase()}.conf inside ${file.url} (DistributionLicense=Public Domain; About: "${confText(conf.values.About?.[0] ?? '').split('\n')[0]}")`,
    },
    outputs: [`comm/${spec.id}`],
    notes: `${driver}, ${confValue(conf, 'SourceType')}. Linked slots become verse ranges; the chapter-heading slot is the introduction; the book introduction is the first entry of chapter 1. Orphaned text (no index slot) re-attached by its verse markers: ${stats.orphans} segments → ${stats.orphanPieces} entries, ${stats.orphansAppended} continuations. Footnotes (<note>) dropped.`,
  });
  verifyCommentary(spec, stats, driver);
}

function verifyCommentary(spec: CommSpec, st: CommStats, driver: string) {
  let entries = 0;
  let links = 0;
  const expectBooks = BOOKS.filter((b) => spec.id !== 'barnes' || b.testament === 'NT');
  for (const book of expectBooks) {
    for (let c = 1; c <= book.chapters; c++) {
      const ch = readData<CommentaryChapter>(`comm/${spec.id}/${book.code}/${c}.json`);
      assert(ch.b === book.code && ch.c === c && ch.id === spec.id, `comm/${spec.id}/${book.code}/${c}.json header`);
      for (const e of ch.e) {
        const where = `${spec.id} ${book.code} ${c}${e.v ? `:${e.v.join('-')}` : ' intro'}`;
        assert(e.blocks.length > 0 && textOf(e.blocks).trim().length > 0, `${where}: empty entry`);
        if (e.v) assert(validRange(e.v, verseCount(book.code, c)), `${where}: bad range`);
        for (const b of e.blocks) {
          for (const x of b.c) {
            if (typeof x === 'string') {
              assert(!/[Ͱ-Ͽἀ-῿֐-׿]/.test(x), `${where}: untagged Greek/Hebrew "${x.slice(0, 40)}"`);
              continue;
            }
            assert(x.t.length > 0, `${where}: empty inline`);
            if (x.ref) {
              assert(compactValid(x.ref), `${where}: invalid ref ${x.ref}`);
              links++;
            }
          }
        }
        entries++;
      }
    }
  }
  const files = folderStats(`comm/${spec.id}`);
  assert(files.files === expectBooks.reduce((n, b) => n + b.chapters, 0), `comm/${spec.id} has ${files.files} files`);
  assert(entries === st.entries, `${spec.id}: ${entries} entries in files, ${st.entries} written`);

  const chapter = (b: BookCode, c: number) => readData<CommentaryChapter>(`comm/${spec.id}/${b}/${c}.json`);
  if (spec.id === 'jfb') {
    const own = chapter('JHN', 3).e.find((e) => e.v?.[0] === 16 && e.v[1] === 16);
    assert(own && /^16\. For God so loved/.test(textOf(own.blocks)), 'JFB John 3:16 has its own comment');
    assert(chapter('JHN', 3).e.some((e) => e.v?.[0] === 14 && e.v[1] === 16), 'JFB John 3:14-16 comment');
    assert(chapter('GEN', 3).e.some((e) => e.v?.[0] === 19 && /^19\. till thou return/.test(textOf(e.blocks))), 'JFB Gen 3:19 orphan re-attached');
  }
  if (spec.id === 'mhc') {
    const j3 = chapter('JHN', 3).e;
    assert(j3.some((e) => !e.v && /In this chapter we have/.test(textOf(e.blocks))), 'MHC John 3 introduction');
    const ranges = j3.filter((e) => e.v).map((e) => e.v!.join('-'));
    assert(ranges.includes('1-21') && ranges.includes('22-36'), `MHC John 3 ranges ${ranges}`);
    assert(chapter('PSA', 95).e.some((e) => e.v?.join('-') === '7-11' && /Warning against Hardness of Heart/.test(textOf(e.blocks))), 'MHC Ps 95:7-11 orphan');
    assert(chapter('ROM', 4).e.some((e) => e.v?.join('-') === '17-22'), 'MHC Rom 4:17-22 orphan');
    const ref316 = j3.flatMap((e) => e.blocks.flatMap((b) => b.c)).find((x) => typeof x !== 'string' && x.ref === 'JHN.3.16');
    assert(ref316, 'MHC John 3 links JHN.3.16');
  }
  if (spec.id === 'barnes') {
    const r8 = chapter('ROM', 8).e.filter((e) => e.v && e.v[0] <= 28 && 28 <= e.v[1]);
    assert(r8.length && textOf(r8[0].blocks).startsWith('Verse 28.'), 'Barnes Rom 8:28 is non-empty');
    const j316 = chapter('JHN', 3).e.find((e) => e.v?.[0] === 16);
    assert(j316 && /^Verse 16\. For God so loved/.test(textOf(j316.blocks)), 'Barnes John 3:16');
    const link = j316.blocks.flatMap((b) => b.c).filter((x) => typeof x !== 'string' && x.ref).map((x) => (x as { ref: string }).ref);
    assert(link.includes('JHN.6.33') && link.includes('JHN.17.21') && link.includes('1JN.4.9'), `Barnes John 3:16 links ${link.slice(0, 8)}`);
    assert(st.greek > 0, 'Barnes Greek is tagged');
    assert(!BOOKS.some((b) => b.testament === 'OT' && existsSync(join(OUT, 'comm', 'barnes', b.code))), 'Barnes has OT chapters');
  }
  log(spec.id, `verify ok (${driver}): ${st.chapters} chapters (${st.emptyChapters} without comments), ${entries} entries (${st.intros} introductions), ${st.versesCovered} verses covered, ${links} scripture links`);
  log(spec.id, `orphans: ${st.orphans} segments → ${st.orphanPieces} entries + ${st.orphansAppended} continuations; skipped ${st.duplicateSlots} duplicate slots, ${st.droppedEmpty} empty/header-only pieces, ${st.droppedDuplicate} repeats; header/slot disagreements ${st.headerMismatch}; ranges widened to their index slots ${st.extended}`);
  log(spec.id, `refs: ${st.refs.links} converted, ${st.refs.failed.length} not convertible${st.refs.failed.length ? ` (e.g. ${[...new Set(st.refs.failed)].slice(0, 6).join('; ')})` : ''}; Greek runs tagged ${st.greek}, Hebrew ${st.hebrew}`);
  log(spec.id, `output comm/${spec.id}/ ${files.text}`);
}

async function runCommentaries() {
  for (const spec of COMMENTARIES) await runCommentary(spec);
}

// ---------------------------------------------------------------------------------------------

export const stages: Stage[] = [
  { id: 'kjv', description: 'CrossWire KJV → kjv/{BOOK}/{ch}.json and search/kjv.json', run: runKjv },
  { id: 'asv', description: 'CrossWire ASV → asv/{BOOK}/{ch}.json and search/asv.json', run: runAsv },
  { id: 'tsk', description: 'CrossWire TSK 1.5 (beta) → tsk/{BOOK}/{ch}.json cross-references', run: runTsk },
  {
    id: 'commentaries',
    description: 'CrossWire MHC, JFB, Barnes → comm/{mhc|jfb|barnes}/{BOOK}/{ch}.json',
    run: runCommentaries,
  },
];
