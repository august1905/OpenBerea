// Public-domain lexicons keyed by Strong's number: bdb/H/{bucket}.json (LexiconEntry).
//
//   bdb   Brown-Driver-Briggs, Hebrew and English Lexicon (1906), Bible Aquifer's CC0 edition
//         (BibleAquifer/BDBHebrewLexicon + BDBAramaicLexicon) → bdb/H/{floor(n/100)}.json
//
// Thayer (Greek) and Gesenius (Hebrew) are not built: no digitization with a clear free license and a
// clean, Strong's-keyed text was found. The candidates checked and the reasons are in the research
// note (scratchpad research/lexicons-pd.md), to be copied into docs/DATA_SOURCES.md.
//
// BDB cites the Hebrew Bible in Hebrew verse numbering. Refs are mapped to KJV numbering with the
// Hebrew numbers that the "orig" stage keeps for each KJV verse (stepbible/orig, `src`).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { BOOKS, type BookCode, bookByIndex, isBookCode } from '../../../src/lib/bible/books';
import { fromCompact } from '../../../src/lib/bible/refs';
import { verseCount } from '../../../src/lib/bible/versification';
import type { Block, Inline, LexiconEntry, OrigChapter, StepLexEntry } from '../../../src/lib/data/types';
import { download, log, OUT, readData, recordSource, type SourceRecord, writeData } from '../lib/context';
import {
  type AquiferArticle,
  type BdbEntry,
  type CitedVerse,
  citedVerse,
  DATA_REF_BOOKS,
  parseRefCode,
  headingBlock,
  headword,
  hebrewSpans,
  isMiscodedJoel,
  isStub,
  keyEvidence,
  MAX_STRONG_HEBREW,
  mentionsLemma,
  NEAR_WORDS,
  paragraphBlocks,
  parseArticle,
  parseDataRef,
  resolveCrossRef,
} from '../lib/lexpd-bdb';
import { MtToKjv } from '../lib/lexpd-mt';
import { BDB_ARAMAIC, BDB_HEBREW, cacheName, type PinnedRepo, rawUrl } from '../lib/lexpd-sources';
import { blocksToText } from '../lib/richtext';
import type { Stage } from '../run';

const ID = 'bdb';

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(`[${ID}] verify failed: ${message}`);
}

const mb = (bytes: number) => `${(bytes / 1e6).toFixed(2)} MB`;

// ---------------------------------------------------------------------------------------------
// Sources

interface Fetched {
  repo: PinnedRepo;
  path: string;
  url: string;
  local: string;
  sha256: string;
  bytes: number;
}

async function fetchRepo(repo: PinnedRepo): Promise<Fetched[]> {
  const out: Fetched[] = [];
  for (const [path, sha] of repo.files) {
    const url = rawUrl(repo, path);
    const f = await download(url, repo.sub, cacheName(path), sha);
    out.push({ repo, path, url, local: f.path, sha256: f.sha256, bytes: f.bytes });
  }
  return out;
}

/** The license statements in the repository's README and metadata.json must still say CC0. */
function checkLicense(files: Fetched[]) {
  const readme = readFileSync(files.find((f) => f.path === 'README.md')!.local, 'utf8');
  const meta = JSON.parse(readFileSync(files.find((f) => f.path === 'eng/metadata.json')!.local, 'utf8')) as {
    resource_metadata: { license_info: { copyright: { statement: string }; licenses: Record<string, { name: string }>[] } };
  };
  const statement = meta.resource_metadata.license_info.copyright.statement;
  const names = meta.resource_metadata.license_info.licenses.map((l) => Object.values(l)[0].name).join('; ');
  assert(/licensed with a CC0 license and is in the public domain/.test(readme), `${files[0].repo.repo} README no longer states CC0`);
  assert(/CC0/.test(statement) && /CC0/.test(names), `${files[0].repo.repo} metadata license is "${statement}" / "${names}"`);
  return { statement, names };
}

function loadArticles(files: Fetched[]): AquiferArticle[] {
  const out: AquiferArticle[] = [];
  for (const f of files) {
    if (!f.path.endsWith('.content.json')) continue;
    for (const a of JSON.parse(readFileSync(f.local, 'utf8')) as AquiferArticle[]) {
      if (/^BDB\d+$/.test(a.content_id)) out.push(a);
    }
  }
  // Content ids follow the order of the printed lexicon (Hebrew part, then the Aramaic appendix).
  return out.sort((a, b) => Number(a.content_id.slice(3)) - Number(b.content_id.slice(3)));
}

// ---------------------------------------------------------------------------------------------
// Inputs from other stages: Hebrew→KJV verse numbers (orig) and Strong's lemmas (steplex)

function loadMtMap(): MtToKjv {
  const mt = new MtToKjv();
  for (const b of BOOKS) {
    if (b.testament !== 'OT') continue;
    for (let c = 1; c <= b.chapters; c++) {
      let ch: OrigChapter;
      try {
        ch = readData<OrigChapter>(`stepbible/orig/${b.code}/${c}.json`);
      } catch {
        throw new Error(`[${ID}] stepbible/orig/${b.code}/${c}.json is missing: run the "orig" stage first`);
      }
      mt.addChapter(ch);
    }
  }
  return mt;
}

/** Strong's number → lemmas (TBESH), used only to check the digitization's Strong's markers. */
function loadLemmas(): Map<number, string[]> {
  const dir = join(OUT, 'stepbible', 'lex', 'H');
  const lemmas = new Map<number, string[]>();
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch {
    throw new Error(`[${ID}] ${dir} is missing: run the "steplex" stage first`);
  }
  for (const f of files) {
    const bucket = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Record<string, StepLexEntry>;
    for (const e of Object.values(bucket)) {
      const n = Number(e.base.slice(1));
      if (!e.base.startsWith('H') || !Number.isFinite(n)) continue;
      const list = lemmas.get(n) ?? [];
      list.push(e.lemma);
      lemmas.set(n, list);
    }
  }
  return lemmas;
}

// ---------------------------------------------------------------------------------------------
// Scripture refs

interface RefStats {
  total: number;
  /** Where the chapter:verse came from: printed text, code (Hebrew), code already in KJV numbers. */
  basis: Record<CitedVerse['basis'], number>;
  /** Printed chapter:verse that is not a verse, where the code is (misprints). */
  codeFallback: string[];
  /** Printed numbers that the code contradicts (the printed numbers are used). */
  disagree: string[];
  linked: number;
  renumbered: number;
  titles: number;
  joel: number;
  dropped: string[];
  chapterLinked: number;
  chapterUnlinked: number;
}

function refMapper(mt: MtToKjv, stats: RefStats) {
  let previousJoel = false;

  /** KJV verse for a cited verse: Hebrew numbering is mapped (OT); KJV numbering is only checked. */
  const kjv = (book: BookCode, chapter: number, verse: number, alreadyKjv = false) => {
    if (!alreadyKjv && bookByIndex(BOOK_INDEX[book])!.testament === 'OT') return mt.verse(book, chapter, verse) ?? null;
    return verse >= 1 && verse <= verseCount(book, chapter) ? { chapter, verse } : null;
  };

  const valid = (compact: string) => {
    const r = fromCompact(compact);
    if (!r) return false;
    if (r.verse === undefined) return r.chapter >= 1 && verseCount(r.book, r.chapter) > 0;
    const endCh = r.endChapter ?? r.chapter;
    return r.verse <= verseCount(r.book, r.chapter) && (r.endVerse ?? r.verse) <= verseCount(r.book, endCh);
  };

  const bibleRef = (start: string, end: string, text: string): string | null => {
    stats.total++;
    let bookNo = Number(start.slice(0, 2));
    if (isMiscodedJoel(bookNo, text, previousJoel)) {
      bookNo = 29;
      stats.joel++;
    }
    const book = bookByIndex(bookNo)?.code;
    previousJoel = book === 'JOL';
    const drop = () => {
      stats.dropped.push(`${start}-${end} "${text}"`);
      return null;
    };
    if (!book) return drop();
    let cited = citedVerse(start, end, text);
    const code = parseRefCode(start);
    const toKjv = (chapter: number, verse: number) =>
      cited.numbering === 'hebrew' ? kjv(book, chapter, verse) : kjv(book, chapter, verse, true);
    let s = toKjv(cited.chapter, cited.verse);
    if (cited.basis === 'display') {
      // Printed numbers and code should agree, the code being Hebrew or already-KJV numbering.
      const viaCode = kjv(book, code.chapter, code.verse);
      const codeAsKjv = kjv(book, code.chapter, code.verse, true);
      const same = (a: typeof s, b: typeof s) => !!a && !!b && a.chapter === b.chapter && a.verse === b.verse;
      if (!s && viaCode) {
        // A misprint in the printed numbers ("2 S 25:18" for 23:18): use the code.
        stats.codeFallback.push(`"${text}" → ${code.chapter}:${code.verse}`);
        cited = { numbering: 'hebrew', basis: 'code', chapter: code.chapter, verse: code.verse };
        s = viaCode;
      } else if (s && !same(s, viaCode) && !(codeAsKjv && same(s, codeAsKjv) && code.chapter !== cited.chapter) && !same(s, codeAsKjv)) {
        stats.disagree.push(`"${text}" code ${start}`);
      }
    }
    stats.basis[cited.basis]++;
    if (!s) return drop();
    if (s.chapter !== cited.chapter || s.verse !== cited.verse) stats.renumbered++;
    if (s.verse === 0) {
      // A Psalm title: the KJV does not number it, so link the psalm.
      stats.titles++;
      stats.linked++;
      return `${book}.${s.chapter}`;
    }
    let compact = `${book}.${s.chapter}.${s.verse}`;
    if (cited.endVerse !== undefined) {
      const e = toKjv(cited.endChapter ?? cited.chapter, cited.endVerse);
      if (e && e.verse > 0) {
        if (e.chapter === s.chapter && e.verse > s.verse) compact += `-${e.verse}`;
        else if (e.chapter > s.chapter) compact += `-${e.chapter}.${e.verse}`;
      }
    }
    if (!valid(compact)) return drop();
    stats.linked++;
    return compact;
  };

  const chapterRef = (dataRef: string): string | null => {
    const r = parseDataRef(dataRef);
    const code = r ? DATA_REF_BOOKS[r.abbr] : undefined;
    if (!r || !code || !isBookCode(code)) {
      stats.chapterUnlinked++;
      return null;
    }
    const ot = bookByIndex(BOOK_INDEX[code])!.testament === 'OT';
    let compact: string | null = null;
    if (r.verse !== undefined) {
      const v = kjv(code, r.chapter, r.verse);
      if (v) compact = v.verse ? `${code}.${v.chapter}.${v.verse}` : `${code}.${v.chapter}`;
    } else {
      const c = ot ? mt.chapter(code, r.chapter) : verseCount(code, r.chapter) ? r.chapter : undefined;
      if (c) compact = `${code}.${c}`;
    }
    if (compact && valid(compact)) {
      stats.chapterLinked++;
      return compact;
    }
    stats.chapterUnlinked++;
    return null;
  };

  return { bibleRef, chapterRef, beginParagraph: () => (previousJoel = false) };
}

const BOOK_INDEX = Object.fromEntries(BOOKS.map((b) => [b.code, b.index])) as Record<BookCode, number>;

// ---------------------------------------------------------------------------------------------
// Conversion

interface KeyedEntry extends BdbEntry {
  head: string;
  stub: boolean;
  /** Numbers whose Strong's lemma matches this entry's own headword. */
  own: Set<number>;
  /** Numbers whose marker passed the lemma check. */
  keep: Set<number>;
}

interface Built {
  entries: Map<number, LexiconEntry>;
  articles: number;
  bdbEntries: number;
  unkeyed: number;
  orphanAddenda: number;
  irregular: string[];
  keptKeys: number;
  weakKeys: number;
  droppedKeys: string[];
  restoredKeys: string[];
  uncheckedKeys: number;
  crossRefs: { linked: number; total: number };
  refs: RefStats;
}

function build(articles: AquiferArticle[], mt: MtToKjv, lemmas: Map<number, string[]>): Built {
  const built: Built = {
    entries: new Map(),
    articles: articles.length,
    bdbEntries: 0,
    unkeyed: 0,
    orphanAddenda: 0,
    irregular: [],
    keptKeys: 0,
    weakKeys: 0,
    droppedKeys: [],
    restoredKeys: [],
    uncheckedKeys: 0,
    crossRefs: { linked: 0, total: 0 },
    refs: { total: 0, basis: { display: 0, code: 0, 'code-kjv': 0 }, codeFallback: [], disagree: [], linked: 0, renumbered: 0, titles: 0, joel: 0, dropped: [], chapterLinked: 0, chapterUnlinked: 0 },
  };

  // Pass 1: entries per article, with each Strong's marker checked against that number's lemma
  // (keyEvidence). The digitization also tags words that an entry only mentions (the יהוה entry carries
  // H6635 for צְבָאוֹת) and has digit slips (תַּאֲנִיָּה tagged H8396 Tabor). A marker is kept when
  //   - the evidence is strong (one of the entry's first three Hebrew words is the lemma), or
  //   - the evidence is weak and no entry has strong evidence for that number, or
  //   - the number would otherwise have no entry at all and the entry mentions its lemma anywhere
  //     (H799 אשׁדת, discussed under אֵשׁ).
  // Everything else is dropped and reported.
  const byArticle = new Map<string, KeyedEntry[]>();
  const weak: { entry: KeyedEntry; n: number }[] = [];
  const none: { entry: KeyedEntry; n: number; lemmas: string[] }[] = [];
  const strong = new Set<number>();
  for (const a of articles) {
    const parsed = parseArticle(a);
    built.unkeyed += parsed.unkeyed;
    built.orphanAddenda += parsed.orphanAddenda;
    built.irregular.push(...parsed.irregular);
    const keyed: KeyedEntry[] = [];
    for (const e of parsed.entries) {
      built.bdbEntries++;
      const head = headword(e) || a.title.replace(/^[IVX]+\s+/, '');
      const words = hebrewSpans(e.paras[0], NEAR_WORDS);
      const entry: KeyedEntry = { ...e, head, stub: isStub(e), own: new Set(), keep: new Set() };
      for (const n of e.nums) {
        const l = lemmas.get(n);
        const ev = l ? keyEvidence(words, l) : 'strong';
        if (!l) built.uncheckedKeys++;
        if (ev === 'strong') {
          entry.keep.add(n);
          strong.add(n);
          if (l && keyEvidence([head], l) === 'strong') entry.own.add(n);
        } else if (ev === 'weak') weak.push({ entry, n });
        else none.push({ entry, n, lemmas: l! });
      }
      keyed.push(entry);
    }
    byArticle.set(a.content_id, keyed);
  }
  const covered = new Set(strong);
  for (const { entry, n } of weak) {
    if (strong.has(n)) {
      built.droppedKeys.push(`H${n} on ${entry.article} "${entry.head}" (weak match; H${n} has a closer entry)`);
    } else {
      entry.keep.add(n);
      covered.add(n);
      built.weakKeys++;
    }
  }
  for (const { entry, n, lemmas: l } of none) {
    if (!covered.has(n) && mentionsLemma(entry.paras.flatMap((p) => hebrewSpans(p)), l)) {
      entry.keep.add(n);
      covered.add(n);
      built.restoredKeys.push(`H${n} on ${entry.article} "${entry.head}"`);
    } else built.droppedKeys.push(`H${n} on ${entry.article} "${entry.head}" (Strong's lemma ${l.join('/')})`);
  }
  for (const [id, list] of byArticle) {
    for (const e of list) {
      e.nums = e.nums.filter((n) => e.keep.has(n));
      built.keptKeys += e.nums.length;
    }
    byArticle.set(id, list.filter((e) => e.nums.length));
  }

  // Pass 2: blocks.
  const refs = refMapper(mt, built.refs);
  const ctx = {
    ...refs,
    crossRef: (contentId: string, text: string) => {
      built.crossRefs.total++;
      const s = resolveCrossRef(byArticle.get(contentId), text);
      if (s) built.crossRefs.linked++;
      return s;
    },
  };
  // The entry's head: the headword of its first BDB entry that is not a cross-reference stub, preferring
  // one whose headword is the Strong's lemma; stubs only when there is nothing else.
  const headRank = new Map<number, number>();
  for (const a of articles) {
    for (const e of byArticle.get(a.content_id) ?? []) {
      const blocks: Block[] = [headingBlock(e.head, e.nums)];
      for (const p of e.paras) blocks.push(...paragraphBlocks(p, ctx));
      for (const n of e.nums) {
        const id = `H${n}`;
        const entry = built.entries.get(n);
        if (entry) entry.blocks.push(...blocks);
        else built.entries.set(n, { id, head: e.head, blocks: [...blocks] });
        const rank = (e.stub ? 0 : 2) + (e.own.has(n) ? 1 : 0);
        if (rank > (headRank.get(n) ?? -1)) {
          built.entries.get(n)!.head = e.head;
          headRank.set(n, rank);
        }
      }
    }
  }
  return built;
}

function writeBuckets(entries: Map<number, LexiconEntry>) {
  const buckets = new Map<number, Record<string, LexiconEntry>>();
  for (const n of [...entries.keys()].sort((a, b) => a - b)) {
    const b = Math.floor(n / 100);
    const bucket = buckets.get(b) ?? {};
    bucket[`H${n}`] = entries.get(n)!;
    buckets.set(b, bucket);
  }
  let bytes = 0;
  for (const [b, bucket] of buckets) {
    writeData(`bdb/H/${b}.json`, bucket);
    bytes += Buffer.byteLength(JSON.stringify(bucket));
  }
  return { files: buckets.size, bytes };
}

// ---------------------------------------------------------------------------------------------
// License record

async function record(files: Fetched[], licenses: { statement: string; names: string }[]) {
  const record: SourceRecord = {
    id: 'bdb-aquifer',
    name: 'Brown-Driver-Briggs Hebrew and English Lexicon (1906), Bible Aquifer edition (Hebrew and Aramaic)',
    homepage: 'https://github.com/BibleAquifer/BDBHebrewLexicon',
    version: `${BDB_HEBREW.repo}@${BDB_HEBREW.commit}; ${BDB_ARAMAIC.repo}@${BDB_ARAMAIC.commit}`,
    files: files.map((f) => ({ url: f.url, sha256: f.sha256, bytes: f.bytes })),
    license: {
      id: 'CC0-1.0',
      name: 'Creative Commons Zero v1.0 Universal (public domain dedication)',
      url: 'https://creativecommons.org/publicdomain/zero/1.0/',
      attribution:
        'Brown-Driver-Briggs Hebrew and English Lexicon (1906), public domain; digital edition by Bible Aquifer ' +
        '(github.com/BibleAquifer/BDBHebrewLexicon and BDBAramaicLexicon), CC0 1.0. The Aquifer edition is based on the ' +
        'University of Texas digitization (via jackweinbender/bdb_parse, Sefaria, and James Cuénod), with data from the ' +
        'Open Scriptures Hebrew Bible Project (HebrewLexicon, CC BY 4.0) and transcriptions from unfoldingWord ' +
        'Brown-Driver-Briggs-Enhanced. Converted by OpenBerea: verse numbers changed from Hebrew to KJV numbering.',
      confirmedAt:
        `https://github.com/${BDB_HEBREW.repo}/blob/${BDB_HEBREW.commit}/README.md and eng/metadata.json ` +
        `("${licenses[0].statement}"); https://github.com/${BDB_ARAMAIC.repo}/blob/${BDB_ARAMAIC.commit}/README.md and eng/metadata.json`,
    },
    outputs: ['bdb'],
    notes:
      'Aquifer README: the primary text "traces back to a University of Texas digitization and has the clearest open provenance of any available edition"; ' +
      'editions whose provenance points to the BibleSoft-licensed edition were excluded by Aquifer. Open Scriptures is credited because Aquifer used ' +
      'its CC BY 4.0 data for headword checks and article alignment. Strong\'s markers are the digitization\'s own; OpenBerea keeps a marker when one of the entry\'s first three Hebrew ' +
      'words is the Strong\'s lemma (consonants compared; STEPBible TBESH lemmas, used only for this check and not shipped), keeps weaker matches only ' +
      'for numbers with no closer entry, and drops the rest (385 of 12,830: digit slips and words an entry merely mentions). ' +
      'Refs: Hebrew verse numbers mapped to KJV via STEPBible TAHOT (stepbible/orig); Psalm-title refs link to the psalm; "Jo" refs coded as John ' +
      'are recoded to Joel (BDB\'s abbreviation).',
  };
  recordSource(record);
}

// ---------------------------------------------------------------------------------------------
// Verify

function verify(built: Built, articles: AquiferArticle[], lemmas: Map<number, string[]>) {
  const { entries } = built;
  const ids = [...entries.keys()];
  assert(ids.every((n) => n >= 1 && n <= MAX_STRONG_HEBREW), 'Strong\'s number out of range');
  const coverage = ids.length / MAX_STRONG_HEBREW;
  assert(ids.length >= 8500, `only ${ids.length} Strong's numbers have a BDB entry`);

  // Every bucket file holds exactly its numbers; every block is non-empty; every ref is a KJV ref.
  let refCount = 0;
  let strongLinks = 0;
  let hebrewRuns = 0;
  const buckets = new Map<number, Record<string, LexiconEntry>>();
  for (const [n, e] of entries) {
    const k = Math.floor(n / 100);
    if (!buckets.has(k)) buckets.set(k, readData<Record<string, LexiconEntry>>(`bdb/H/${k}.json`));
    const bucket = buckets.get(k)!;
    assert(bucket[`H${n}`]?.id === `H${n}`, `H${n} missing from bucket ${k}`);
    assert(Object.keys(bucket).every((id) => Math.floor(Number(id.slice(1)) / 100) === k), `bucket ${k} holds a foreign id`);
    assert(e.blocks.length >= 2 && e.blocks[0].k === 'h', `H${n} has no heading + text`);
    for (const b of e.blocks) {
      assert(b.c.length, `H${n} has an empty block`);
      for (const c of b.c) {
        if (typeof c === 'string') continue;
        if (c.l === 'hbo') hebrewRuns++;
        if (c.s) {
          strongLinks++;
          assert(/^H\d+$/.test(c.s) && Number(c.s.slice(1)) <= MAX_STRONG_HEBREW, `bad Strong's link ${c.s} in H${n}`);
        }
        if (!c.ref) continue;
        refCount++;
        const r = fromCompact(c.ref);
        assert(r, `H${n}: unparseable ref ${c.ref}`);
        if (r.verse !== undefined) {
          assert(r.verse >= 1 && r.verse <= verseCount(r.book, r.chapter), `H${n}: ${c.ref} is not a KJV verse`);
          const endCh = r.endChapter ?? r.chapter;
          assert((r.endVerse ?? r.verse) <= verseCount(r.book, endCh), `H${n}: ${c.ref} ends past the KJV chapter`);
        } else {
          assert(verseCount(r.book, r.chapter) > 0, `H${n}: ${c.ref} is not a KJV chapter`);
        }
      }
    }
  }
  assert(refCount > 150_000, `only ${refCount} ref links in the output`);

  // Raw-source cross-checks: marker count and a few known texts.
  const raw = articles.map((a) => a.content).join('');
  const rawMarkers = (raw.match(/\[Str<span class="strongs-number">/g) ?? []).length;
  assert(rawMarkers === 9805 + 817, `raw marker count changed: ${rawMarkers}`);
  const text = (n: number) => blocksToText(entries.get(n)!.blocks);
  const refs = (n: number) =>
    entries
      .get(n)!
      .blocks.flatMap((b) => b.c)
      .filter((c): c is Exclude<Inline, string> => typeof c !== 'string' && !!c.ref)
      .map((c) => c.ref!);

  // H430 אֱלֹהִים: "rulers, judges … Ex 21:6"; Ex 21:6 has the same number in Hebrew and KJV.
  const h430 = entries.get(430)!;
  assert(h430.head && /^אֱל.?הִים$/.test(h430.head.normalize('NFC')), `H430 head is ${h430.head}`);
  assert(/rulers, judges/.test(text(430)) && refs(430).includes('EXO.21.6'), 'H430 text or Ex 21:6 link missing');
  assert(raw.includes('<i>rulers, judges</i>, either as divine representatives'), 'H430 raw text changed');
  // H1 אָב father: "father … Gn 44:19".
  assert(entries.get(1)!.head === 'אָב' && /\bfather\b/.test(text(1)) && refs(1).includes('GEN.44.19'), 'H1 spot check');
  // H433 אֱלוֹהַּ cites ψ 18:32 (Hebrew) = KJV Ps 18:31.
  assert(raw.includes('data-start-ref="19018032"'), 'raw Ps 18:32 ref missing');
  assert(refs(433).includes('PSA.18.31') && !refs(433).includes('PSA.18.32'), 'H433: Ps 18:32 (Hebrew) not mapped to PSA.18.31');
  // H6 and H8 share the verb entry אָבַד; its Jon 1:6 is mis-tagged as John 1:6 in the source and stays as given.
  assert(text(6).includes('perish') && entries.get(8)!.blocks.some((b) => b.k === 'h' && JSON.stringify(b.c).includes('"H6"')), 'H6/H8 shared entry');
  // Aramaic: H2 אַב father (Ezr 4:15).
  assert(entries.get(2)!.head === 'אַב' && refs(2).includes('EZR.4.15'), `H2 (Aramaic) spot check: head ${entries.get(2)!.head}`);
  // Joel: "Jo 2:4" (horses) is Joel 2:4.
  assert([...entries.values()].some((e) => e.blocks.some((b) => b.c.some((c) => typeof c !== 'string' && c.ref === 'JOL.2.4'))), 'Joel 2:4 link missing');

  // Strong's markers: few dropped by the lemma check.
  const keys = built.droppedKeys.length + built.keptKeys;
  assert(built.droppedKeys.length < 0.05 * keys, `${built.droppedKeys.length} of ${keys} Strong's markers failed the lemma check`);
  assert(lemmas.size > 8000, 'Strong\'s lemma list too small');

  return { coverage, refCount, strongLinks, hebrewRuns };
}

// ---------------------------------------------------------------------------------------------

export const stages: Stage[] = [
  {
    id: ID,
    deps: ['orig', 'steplex'],
    description: 'Brown-Driver-Briggs (Bible Aquifer CC0 edition) → bdb/H, keyed by Strong\'s number',
    run: async () => {
      const heb = await fetchRepo(BDB_HEBREW);
      const arc = await fetchRepo(BDB_ARAMAIC);
      const licenses = [checkLicense(heb), checkLicense(arc)];
      const articles = loadArticles([...heb, ...arc]);
      const mt = loadMtMap();
      assert(mt.badSrc.length === 0, `unparsed src values: ${mt.badSrc.slice(0, 5).join(', ')}`);
      const lemmas = loadLemmas();
      log(ID, `${articles.length} articles; Hebrew→KJV map ${mt.size} verses; ${lemmas.size} Strong's lemmas`);

      const built = build(articles, mt, lemmas);
      const out = writeBuckets(built.entries);
      await record([...heb, ...arc], licenses);
      const v = verify(built, articles, lemmas);

      const r = built.refs;
      log(ID, `BDB entries with Strong's markers: ${built.bdbEntries}; unkeyed paragraphs ${built.unkeyed}; orphan addenda ${built.orphanAddenda}`);
      log(ID, `Strong's numbers covered: ${built.entries.size} / ${MAX_STRONG_HEBREW} (${(v.coverage * 100).toFixed(2)}%)`);
      log(ID, `Strong's keys: ${built.keptKeys} kept (${built.weakKeys} on weak evidence, ${built.restoredKeys.length} as the only entry for their number), ${built.droppedKeys.length} dropped by the lemma check; unchecked (no lemma) ${built.uncheckedKeys}; irregular marker parts ${built.irregular.length}`);
      // BDB_SHOW=all lists every dropped marker (default: the first 12).
      const show = process.env.BDB_SHOW === 'all' ? Infinity : 12;
      for (const d of built.droppedKeys.slice(0, show)) log(ID, `  dropped ${d}`);
      for (const d of built.irregular) log(ID, `  irregular ${d}`);
      log(ID, `ref numbers from: printed text ${r.basis.display}, code (Hebrew) ${r.basis.code}, code already KJV ${r.basis['code-kjv']}`);
      log(ID, `refs: ${r.total} in source, ${r.linked} linked (${r.renumbered} renumbered Hebrew→KJV, ${r.titles} Psalm titles → psalm, ${r.joel} John→Joel), ${r.dropped.length} dropped`);
      for (const d of r.dropped.slice(0, show)) log(ID, `  dropped ref ${d}`);
      log(ID, `printed chapter:verse not a verse, code used instead: ${r.codeFallback.length}; printed numbers contradicted by the code (printed kept): ${r.disagree.length}`);
      for (const d of r.codeFallback.slice(0, show)) log(ID, `  code used for ${d}`);
      for (const d of r.disagree.slice(0, show)) log(ID, `  disagree ${d}`);
      log(ID, `chapter refs (span.ref): ${r.chapterLinked} linked, ${r.chapterUnlinked} left unlinked (apocrypha or chapters numbered differently)`);
      log(ID, `cross-references: ${built.crossRefs.linked} / ${built.crossRefs.total} linked to a Strong's number`);
      log(ID, `output: bdb/H ${out.files} files, ${mb(out.bytes)}; ${v.refCount} ref links, ${v.strongLinks} Strong's links, ${v.hebrewRuns} Hebrew runs`);
    },
  },
];
