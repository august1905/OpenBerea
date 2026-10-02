// CrossWire SWORD dictionaries and lexicons → dict/{easton|smith|isbe|nave}/ and strongs/.
//
// dictionaries: Easton (zLD TEI), Smith v1.3 (RawLD ThML), ISBE (zLD TEI), Nave (zLD TEI). Every
//   Scripture reference is re-read from its text and checked against the KJV versification
//   (dict-refs.ts); cross-entry links become internal hrefs "/study/dictionary/<dict>/<id>".
// strongs: Strong's Greek (morphgnt XML v1.9, checked against CrossWire StrongsGreek v2.0) and
//   Strong's Hebrew (CrossWire StrongsHebrew v1.2 text with the Hebrew script of v3.0).
import { readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

import type { Block, DictBucket, DictEntry, DictIndex, DictionaryId, Inline, LexIndex, StrongsEntry } from '../../../src/lib/data/types';
import { download, log, OUT, recordSource, writeData } from '../lib/context';
import {
  assignBuckets,
  cleanIsbeMarkers,
  compareTitles,
  type ConvertedEntry,
  entryBytes,
  groupByKey,
  isEmptyEntry,
  naveEntryToBlocks,
  TargetIndex,
  teiEntryToBlocks,
  thmlEntryToBlocks,
  titleCase,
  uniqueSlugs,
} from '../lib/dict-convert';
import { addRefStats, emptyRefStats, homeBook, isValidCompact, linkedTagged, type MarkupOptions, RefLinker, type RefStats } from '../lib/dict-refs';
import {
  greekEntry,
  hebrewEntry,
  type HebrewBeta,
  type HebrewMain,
  inlineText,
  parseCrossWireGreek,
  parseHebrewBeta,
  parseHebrewMain,
  parseMorphgntXml,
  UNUSED_NOTE,
} from '../lib/dict-strongs';
import { openLDModule, type OpenedLD } from '../lib/sword-ld';
import { confText, confValue, readZip, type SwordConf } from '../lib/sword-text';
import type { Stage } from '../run';

// ---------------------------------------------------------------------------------------------
// Pinned sources

const RAWZIP = 'https://www.crosswire.org/ftpmirror/pub/sword/packages/rawzip/';
const BETARAW = 'https://www.crosswire.org/ftpmirror/pub/sword/betaraw/';
const MODINFO = 'https://www.crosswire.org/sword/modules/ModInfo.jsp?modName=';

const ZIPS = {
  Easton: 'f6dd054554764e2e97d5d189a697eb26039054578a9ccf98ce668ab810341c6e',
  Smith: '88a2c2d11f70b2484fa39d61a8e821849dca799d51e1593e8a2839f6313a8f9a',
  ISBE: '4de747545d9c349ab724bc1708b01df5481e3b93e5e51077f859dd8a32023a32',
  Nave: '52d9b7cde04c2abb5187ae804bcb97d93c7344a1358539f50ebc178ac0c945f0',
  StrongsGreek: '38f7d29db912d7c6a416cf19bfdefd9bdb9882193634229210a0d10b5cccc434',
  StrongsHebrew: '51bd1f67e8730ce60ce3ad601faa53e79110f24f695d88f85d914c153204d0e0',
} as const;

/** StrongsHebrew v3.0 is only in the beta repository (no rawzip); its files are pinned one by one. */
const HEBREW_BETA_FILES: Record<string, string> = {
  'mods.d/strongshebrew.conf': '7ccdf8c1ff5803847c7bf821c7a4bd48445cc7ba7f3f1ee932b11cab6b0e5049',
  'modules/lexdict/zld/strongshebrew/dict.idx': '529d79b65d1829eb1b3c1f051cc144ab2ad5b1d25a2f9b7a70b9ce0643412e35',
  'modules/lexdict/zld/strongshebrew/dict.dat': '7092a1466682113b2c4ca73d461c1606a8c5de0880214ea1e3a83f13765afd74',
  'modules/lexdict/zld/strongshebrew/dict.zdx': 'f4e50f292ed89ab3baa6596930e2ed45355e3c68d17000ef7d959de5dbc544dc',
  'modules/lexdict/zld/strongshebrew/dict.zdt': '876c4df568a9ec283db05468dba3977adf9a5e48b4a4ce55ad1d58724520fa4c',
};

/** Strong's Greek Dictionary in XML with real Greek (Ulrik Sandborg-Petersen), v1.9, CC0. */
const MORPHGNT_COMMIT = 'dd6758b82f46b620804a8ea677d715844679eea1';
const MORPHGNT = {
  xml: {
    url: `https://raw.githubusercontent.com/morphgnt/strongs-dictionary-xml/${MORPHGNT_COMMIT}/strongsgreek.xml`,
    name: 'strongsgreek-dd6758b8.xml',
    sha256: '91474213b208a4e487d35f85c10e5c90737acc69082dad15dec5431406003545',
  },
  readme: {
    url: `https://raw.githubusercontent.com/morphgnt/strongs-dictionary-xml/${MORPHGNT_COMMIT}/README.md`,
    name: 'README-dd6758b8.md',
    sha256: '62cbf4dd5b1a631e38fd6663e5d774c29261f1cb39c1110cd48a608a0afd2365',
  },
};

type FileRecord = { url: string; sha256: string; bytes: number };

async function zipModule(name: keyof typeof ZIPS): Promise<OpenedLD & { file: FileRecord }> {
  const url = `${RAWZIP}${name}.zip`;
  const file = await download(url, 'crosswire', `${name}.zip`, ZIPS[name]);
  const opened = openLDModule(readZip(readFileSync(file.path)));
  if (opened.conf.name !== name) throw new Error(`${name}.zip holds module ${opened.conf.name}`);
  return { ...opened, file: { url, sha256: file.sha256, bytes: file.bytes } };
}

async function hebrewBetaModule(): Promise<OpenedLD & { files: FileRecord[] }> {
  const files = new Map<string, Buffer>();
  const records: FileRecord[] = [];
  for (const [rel, sha] of Object.entries(HEBREW_BETA_FILES)) {
    const url = `${BETARAW}${rel}`;
    const f = await download(url, 'crosswire', `StrongsHebrew-beta/${rel}`, sha);
    files.set(rel, readFileSync(f.path));
    records.push({ url, sha256: f.sha256, bytes: f.bytes });
  }
  return { ...openLDModule(files), files: records };
}

function moduleVersion(conf: SwordConf, file?: FileRecord) {
  const date = confValue(conf, 'SwordVersionDate');
  const pkg = file ? `; ${file.url.split('/').pop()} sha256 ${file.sha256}` : '';
  return `${conf.name} module ${confValue(conf, 'Version')}${date ? ` (${date})` : ''}${pkg}`;
}

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(`Verification failed: ${message}`);
}

/** Files and size under public/data/<folder>. */
function folderStats(folder: string) {
  let files = 0;
  let bytes = 0;
  let largest = 0;
  let smallest = Infinity;
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.json')) {
        const size = statSync(p).size;
        files++;
        bytes += size;
        if (e.name !== 'index.json') {
          largest = Math.max(largest, size);
          smallest = Math.min(smallest, size);
        }
      }
    }
  };
  walk(join(OUT, folder));
  return { files, bytes, largest, smallest, text: `${files} files, ${(bytes / 1e6).toFixed(2)} MB` };
}

/** Every inline of some blocks. */
function* inlines(blocks: Block[]): Generator<Exclude<Inline, string>> {
  for (const b of blocks) for (const p of b.c) if (typeof p !== 'string') yield p;
}

const refsOf = (blocks: Block[]) => [...inlines(blocks)].filter((p) => p.ref).map((p) => p.ref!);
const textOf = (blocks: Block[]) => blocks.map((b) => inlineText(b.c)).join('\n');

// ---------------------------------------------------------------------------------------------
// Dictionaries

interface DictSpec {
  id: DictionaryId;
  module: 'Easton' | 'Smith' | 'ISBE' | 'Nave';
  name: string;
  /** Converts one record (several records with the same key are merged). */
  convert: (text: string, key: string, opts: MarkupOptions) => ConvertedEntry;
  /** Title from the first record's <title>, or the key in title case. */
  useTitle: boolean;
  attribution: string;
  /** Link bare refs after prose that names no book (dict-refs RefLinker.longLeads). */
  longLeads: boolean;
}

const DICTS: DictSpec[] = [
  {
    id: 'easton',
    module: 'Easton',
    name: 'Easton’s Bible Dictionary (M. G. Easton, 1897), CrossWire Easton module',
    convert: (t, _k, o) => teiEntryToBlocks(t, o),
    useTitle: true,
    longLeads: true,
    attribution: 'Easton’s Bible Dictionary by M. G. Easton (Illustrated Bible Dictionary, 3rd ed., Thomas Nelson, 1897), public domain. Text from the CrossWire Bible Society Easton module.',
  },
  {
    id: 'smith',
    module: 'Smith',
    name: 'Smith’s Bible Dictionary (William Smith, 1884), CrossWire Smith module',
    convert: (t, _k, o) => thmlEntryToBlocks(t, o),
    useTitle: false,
    longLeads: true,
    attribution: 'Smith’s Bible Dictionary by William Smith (1884), public domain. Text from the CrossWire Bible Society Smith module.',
  },
  {
    id: 'isbe',
    module: 'ISBE',
    name: 'International Standard Bible Encyclopedia (James Orr, ed., 1915), CrossWire ISBE module',
    convert: (t, _k, o) => teiEntryToBlocks(cleanIsbeMarkers(t), o),
    useTitle: false,
    // Sampled: 78% of ISBE's bare refs after book-less prose point to the right book (vs 97% in
    // Easton), so ISBE links bare refs only in ref lists, after a named book, or in a book's article.
    longLeads: false,
    attribution: 'The International Standard Bible Encyclopedia, James Orr, general editor (1915 edition), public domain. Text from the CrossWire Bible Society ISBE module.',
  },
  {
    id: 'nave',
    module: 'Nave',
    name: 'Nave’s Topical Bible (Orville J. Nave), CrossWire Nave module',
    convert: (t, k, o) => naveEntryToBlocks(t, k, o),
    useTitle: false,
    longLeads: true,
    attribution: 'Nave’s Topical Bible by Orville J. Nave (1896), public domain. Text from the CrossWire Bible Society Nave module (from ccel.org).',
  },
];

/** Bucket target: buckets of about 150–250 KB. */
const DICT_BUCKET_BYTES = 230_000;

interface DictResult {
  spec: DictSpec;
  records: number;
  entries: DictEntry[];
  /** Raw records by key (for spot checks against the module). */
  raw: Map<string, string[]>;
  ids: Map<string, string>;
  refs: RefStats;
  invalid: number;
  targets: TargetIndex;
  buckets: number;
  conf: SwordConf;
  file: FileRecord;
  /** Records left out because they have no article text. */
  empty: number;
}

async function buildDictionary(spec: DictSpec): Promise<DictResult> {
  const { conf, driver, module, file } = await zipModule(spec.module);
  assert(confValue(conf, 'DistributionLicense') === 'Public Domain', `${spec.module} DistributionLicense is ${confValue(conf, 'DistributionLicense')}`);
  const records = [...module.entries()];
  const groups = groupByKey(records);
  const ids = uniqueSlugs(groups.map((g) => g[0].key));
  const keyToId = new Map(groups.map((g, i) => [g[0].key, ids[i]]));
  const refs = emptyRefStats();
  let invalid = 0;
  const raw = new Map<string, string[]>();
  const href = (id: string) => `/study/dictionary/${spec.id}/${id}`;
  // Records without article text are left out; links to them stay plain text.
  const empty = new Set<string>();
  for (const g of groups) {
    const probe = g.map((r) => spec.convert(r.text, g[0].key, { contextual: false }).blocks).flat();
    if (isEmptyEntry(probe)) empty.add(g[0].key);
  }
  const live = groups.filter((g) => !empty.has(g[0].key));
  const targets = new TargetIndex(live.map((g) => ({ key: g[0].key, id: keyToId.get(g[0].key)! })));
  const entries: DictEntry[] = [];
  groups.forEach((group, i) => {
    if (empty.has(group[0].key)) return;
    const key = group[0].key;
    raw.set(key, group.map((r) => r.text));
    const opts: MarkupOptions = {
      label: `${spec.id}:${key}`,
      home: homeBook(key),
      longLeads: spec.longLeads,
      target: (t) => {
        const id = targets.find(t);
        return id ? { href: href(id) } : null;
      },
      term: (t) => {
        const id = targets.find(t);
        return id ? { href: href(id) } : null;
      },
    };
    const blocks: Block[] = [];
    let title: string | undefined;
    for (const r of group) {
      const c = spec.convert(r.text, key, opts);
      blocks.push(...c.blocks);
      addRefStats(refs, c.refs);
      invalid += c.invalid;
      title ??= spec.useTitle ? c.title : undefined;
    }
    entries.push({ id: ids[i], title: title || titleCase(key), blocks });
  });
  log('dictionaries', `${spec.id}: ${driver} ${records.length} records → ${entries.length} entries (${records.length - groups.length} repeated keys merged, ${empty.size} without text left out${empty.size ? `: ${[...empty].slice(0, 6).join('; ')}…` : ''})`);
  return { spec, records: records.length, entries, raw, ids: keyToId, refs, invalid, targets, buckets: 0, conf, file, empty: empty.size };
}

function writeDictionary(res: DictResult) {
  const dir = `dict/${res.spec.id}`;
  rmSync(join(OUT, dir), { recursive: true, force: true });
  const sorted = [...res.entries].sort(compareTitles);
  const buckets = assignBuckets(sorted.map(entryBytes), DICT_BUCKET_BYTES, 300_000);
  const files = new Map<number, DictBucket>();
  const index: DictIndex = [];
  sorted.forEach((e, i) => {
    const b = buckets[i];
    if (!files.has(b)) files.set(b, {});
    files.get(b)![e.id] = e;
    index.push([e.id, e.title, b]);
  });
  for (const [b, bucket] of files) writeData(`${dir}/${b}.json`, bucket);
  writeData(`${dir}/index.json`, index);
  res.buckets = files.size;
}

function recordDictionary(res: DictResult) {
  const { conf, file, spec } = res;
  recordSource({
    id: `crosswire-${spec.id}`,
    name: spec.name,
    homepage: `${MODINFO}${spec.module}`,
    version: moduleVersion(conf, file),
    files: [file],
    license: {
      id: 'PD',
      name: 'Public Domain',
      attribution: spec.attribution,
      confirmedAt: `mods.d/${spec.module.toLowerCase()}.conf inside ${file.url} (DistributionLicense=Public Domain; About: "${confText(confValue(conf, 'About') ?? '').split('\n')[0].trim()}"), ${MODINFO}${spec.module}`,
    },
    outputs: [`dict/${spec.id}`],
    notes:
      `Scripture references: ${linkedTagged(res.refs)} tagged refs linked (${res.refs.fixed} re-read from their text because the module's osisRef/passage disagreed with it or was invalid${res.refs.kept ? `, ${res.refs.kept} passage attributes kept where the text omits the book` : ''}), ` +
      `${res.refs.dropped} dropped (not in the KJV versification: Apocrypha, invalid verses, or not references), ${res.refs.book} book names without numbers used as context only; ` +
      `${res.refs.prose + res.refs.context} untagged prose refs linked (${res.refs.context} without a book name, through the preceding ref or the book named in the prose). ` +
      `Cross-entry links: ${res.targets.resolved} resolved, ${res.targets.unresolved.length} unresolved left as text. Records with the same key are merged into one entry; ${res.empty} records without article text are left out. ${res.records} records → ${res.entries.length} entries.`,
  });
}

/** First osisRef/passage of a raw record, converted to a compact ref (for spot checks). */
function firstRawRef(raw: string): string | null {
  const m = /<(?:ref|scripRef)\b[^>]*\b(?:osisRef|passage)="([^"]*)"/.exec(raw);
  if (!m) return null;
  const v = m[1].replace(/^Bible:/, '');
  return v;
}

function verifyDictionary(res: DictResult) {
  const { spec, entries } = res;
  const byId = new Map(entries.map((e) => [e.id, e]));
  // Ids, refs, hrefs.
  let refCount = 0;
  let hrefCount = 0;
  for (const e of entries) {
    assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(e.id), `${spec.id}: id "${e.id}" is not a URL-safe slug`);
    assert(e.title.trim() && e.title === e.title.trim(), `${spec.id}:${e.id}: bad title "${e.title}"`);
    assert(e.blocks.length > 0, `${spec.id}:${e.id}: no blocks`);
    for (const p of inlines(e.blocks)) {
      if (p.ref) {
        refCount++;
        assert(isValidCompact(p.ref), `${spec.id}:${e.id}: ref ${p.ref} is not a valid KJV ref`);
      }
      if (p.href) {
        hrefCount++;
        const m = /^\/study\/dictionary\/([a-z]+)\/([a-z0-9-]+)$/.exec(p.href);
        assert(m && m[1] === spec.id && byId.has(m[2]), `${spec.id}:${e.id}: href ${p.href} does not point to an entry`);
      }
      assert(!/[<>]|&[a-z]+;/.test(p.t), `${spec.id}:${e.id}: markup left in "${p.t}"`);
    }
    for (const b of e.blocks) {
      const text = inlineText(b.c);
      assert(!/<\/?[a-zA-Z][^>]*>|&(?:amp|lt|gt|quot);/.test(text), `${spec.id}:${e.id}: markup left in block "${text.slice(0, 80)}"`);
    }
  }
  assert(new Set(entries.map((e) => e.id)).size === entries.length, `${spec.id}: duplicate ids`);
  assert(res.invalid === 0, `${spec.id}: ${res.invalid} refs were invalid after linking`);

  // Index and buckets read back from disk.
  const index = JSON.parse(readFileSync(join(OUT, 'dict', spec.id, 'index.json'), 'utf8')) as DictIndex;
  assert(index.length === entries.length, `${spec.id}: index has ${index.length} rows for ${entries.length} entries`);
  for (let i = 1; i < index.length; i++) {
    assert(compareTitles({ title: index[i - 1][1], id: index[i - 1][0] }, { title: index[i][1], id: index[i][0] }) < 0, `${spec.id}: index not sorted at ${index[i][1]}`);
  }
  const bucketCache = new Map<number, DictBucket>();
  for (const [id, title, b] of index) {
    if (!bucketCache.has(b)) bucketCache.set(b, JSON.parse(readFileSync(join(OUT, 'dict', spec.id, `${b}.json`), 'utf8')) as DictBucket);
    const e = bucketCache.get(b)![id];
    assert(e && e.title === title, `${spec.id}: ${id} missing from bucket ${b}`);
  }

  // Spot checks against the module text.
  const entryOf = (key: string) => byId.get(res.ids.get(key)!)!;
  const check = (key: string, expectFirst: string, mustHave: string[], startsWith?: RegExp) => {
    const e = entryOf(key);
    assert(e, `${spec.id}: no entry for ${key}`);
    const refs = refsOf(e.blocks);
    const rawRefs = res.raw.get(key)!.join('').match(/<(?:ref|scripRef)\b[^>]*\b(?:osisRef|passage)=/g)?.length ?? 0;
    const first = firstRawRef(res.raw.get(key)![0]);
    assert(refs[0] === expectFirst, `${spec.id} ${key}: first ref ${refs[0]}, expected ${expectFirst} (module: ${first})`);
    for (const r of mustHave) assert(refs.includes(r) || [...inlines(e.blocks)].some((p) => p.href === r), `${spec.id} ${key}: ${r} missing`);
    if (startsWith) assert(startsWith.test(textOf(e.blocks)), `${spec.id} ${key}: text starts "${textOf(e.blocks).slice(0, 60)}"`);
    log('dictionaries', `  ${spec.id} ${key}: "${e.title}" ${e.blocks.length} blocks, ${refs.length} ref links (module tags ${rawRefs}); first ${refs[0]} (module ${first})`);
    return { e, refs, rawRefs };
  };
  const expected: Record<DictionaryId, number> = { easton: 3963, smith: 4639, isbe: 9380, nave: 5322 };
  assert(res.records === expected[spec.id], `${spec.id}: ${res.records} records, research says ${expected[spec.id]}`);
  if (spec.id === 'easton') {
    assert(entries.length === 3961 - res.empty, `easton: ${entries.length} entries (3,963 records less KADESH and SALMON duplicates and ${res.empty} empty)`);
    const { e } = check('AARON', 'EXO.6.20', ['1CH.2.10', 'EXO.4.27-30', 'EXO.2.1', 'EXO.7.7', 'LEV.8', 'HEB.6.20', '/study/dictionary/easton/moses'], /^The eldest son of Amram/);
    assert(e.title === 'Aaron', `easton AARON title ${e.title}`);
  }
  if (spec.id === 'smith') {
    assert(entries.length === 4561 - res.empty, `smith: ${entries.length} entries (4,639 records, 78 repeated keys merged, ${res.empty} empty)`);
    const { e } = check('AARON', 'NUM.26.59', ['NUM.33.39', 'EXO.4.14', 'DEU.9.20', '/study/dictionary/smith/moses'], /^\(a teacher, or lofty\)/);
    assert(e.title === 'Aaron', `smith AARON title ${e.title}`);
    assert(e.blocks[0].c.some((p) => typeof p !== 'string' && p.i && p.t.includes('a teacher')), 'smith AARON keeps the italics of the name meaning');
  }
  if (spec.id === 'isbe') {
    assert(entries.length === 9380 - res.empty, `isbe: ${entries.length} entries, ${res.empty} empty`);
    const { e } = check('AARON', 'EXO.6.20', ['EXO.6.16-20', '1CH.6.1-3'], /^ar'-un, sometimes pronounced ar'on/);
    assert(e.blocks.some((b) => b.k === 'h' && inlineText(b.c) === '1. Family:'), 'isbe AARON keeps its numbered sub-headings');
  }
  if (spec.id === 'nave') {
    assert(entries.length === 5320 - res.empty, `nave: ${entries.length} entries (5,322 records less REVERENCE and SIN duplicates and ${res.empty} empty)`);
    const love = check('LOVE', 'EXO.20.6', ['DEU.5.10', '2JN.1.6', 'JUD.1.21', 'MAT.26.6-13', '/study/dictionary/nave/children']);
    assert(love.e.blocks.some((b) => b.k === 'h' && inlineText(b.c) === 'INSTANCES OF LOVE FOR JESUS'), 'nave LOVE heading INSTANCES OF LOVE FOR JESUS');
    const mary = love.e.blocks.find((b) => b.k === 'li' && inlineText(b.c).startsWith('Mary '));
    assert(mary && mary.d === 0 && refsOf([mary]).join() === 'MAT.26.6-13,JHN.12.3-8,LUK.10.39', `nave LOVE item Mary: ${mary && refsOf([mary]).join()}`);
    const lead = love.e.blocks.find((b) => b.k === 'p' && inlineText(b.c).startsWith('OF MAN FOR GOD'));
    assert(lead && typeof lead.c[0] !== 'string' && lead.c[0].b === 1, 'nave LOVE "OF MAN FOR GOD" has a bold lead-in');
    assert(love.refs.length >= love.rawRefs, `nave LOVE: ${love.refs.length} links for ${love.rawRefs} module refs`);
    // "See FAITH IN CHRIST": Nave has no such topic, so that link stays text.
    const faith = check('FAITH', '2SA.22.31', ['PSA.2.12', 'PSA.5.11', 'EXO.14.13']);
    assert(faith.refs.length >= faith.rawRefs - 2, `nave FAITH: ${faith.refs.length} links for ${faith.rawRefs} module refs`);
  }
  log('dictionaries', `${spec.id} verify ok: ${entries.length} entries (${res.records} records), ${refCount} ref links, ${hrefCount} entry links, ${res.buckets} buckets`);
}

async function runDictionaries() {
  const totals = emptyRefStats();
  for (const spec of DICTS) {
    const res = await buildDictionary(spec);
    writeDictionary(res);
    recordDictionary(res);
    verifyDictionary(res);
    addRefStats(totals, res.refs, 0);
    const fs = folderStats(`dict/${spec.id}`);
    const r = res.refs;
    log('dictionaries', `${spec.id}: refs ok ${r.ok}, unchecked ${r.unchecked}, kept ${r.kept}, fixed ${r.fixed}, dropped ${r.dropped}, book-only ${r.book}, repaired boundaries ${r.repaired}; prose ${r.prose}, context ${r.context}, prose outside KJV ${r.proseInvalid}`);
    log('dictionaries', `${spec.id}: targets resolved ${res.targets.resolved}, unresolved ${res.targets.unresolved.length}${res.targets.unresolved.length ? ` (${[...new Set(res.targets.unresolved)].slice(0, 8).join('; ')})` : ''}`);
    for (const s of r.samples.slice(0, 6)) log('dictionaries', `    e.g. ${s}`);
    log('dictionaries', `${spec.id}: output dict/${spec.id} ${fs.text}; buckets ${(fs.smallest / 1e3).toFixed(0)}–${(fs.largest / 1e3).toFixed(0)} KB`);
  }
  log('dictionaries', `all: ${linkedTagged(totals)} tagged refs linked, ${totals.fixed} fixed, ${totals.dropped} dropped; ${totals.prose + totals.context} prose refs linked`);
}

// ---------------------------------------------------------------------------------------------
// Strong's

const GREEK_MAX = 5624;
const HEBREW_MAX = 8674;
/** Numbers Strong's Greek dictionary never assigned. */
const GREEK_UNUSED = new Set([2717, ...Array.from({ length: 100 }, (_, i) => 3203 + i)]);

function strongsBucket(id: string) {
  return `strongs/${id[0]}/${Math.floor(Number(id.slice(1)) / 100)}.json`;
}

const normKjv = (s: string) => s.replace(/[\s.]+/g, ' ').replace(/\s*([(),])\s*/g, '$1').trim().toLowerCase();

async function runStrongs() {
  const greekZip = await zipModule('StrongsGreek');
  const hebrewZip = await zipModule('StrongsHebrew');
  const hebrewBeta = await hebrewBetaModule();
  const xml = await download(MORPHGNT.xml.url, 'morphgnt', MORPHGNT.xml.name, MORPHGNT.xml.sha256);
  const readme = await download(MORPHGNT.readme.url, 'morphgnt', MORPHGNT.readme.name, MORPHGNT.readme.sha256);
  const readmeText = readFileSync(readme.path, 'utf8');
  assert(/Released under the Creative Commons CC0 waiver/.test(readmeText) && /## Version 1\.9/.test(readmeText), 'morphgnt README license or version changed');
  for (const [m, v] of [[greekZip, '2.0'], [hebrewZip, '1.2'], [hebrewBeta, '3.0']] as const) {
    assert(confValue(m.conf, 'Version') === v, `${m.conf.name} version ${confValue(m.conf, 'Version')}, expected ${v}`);
    assert(confValue(m.conf, 'DistributionLicense') === 'Public Domain', `${m.conf.name} DistributionLicense changed`);
  }
  assert(confValue(hebrewBeta.conf, 'SourceType') === 'TEI' && hebrewBeta.driver === 'zLD', 'StrongsHebrew beta is not zLD TEI');

  // Greek
  const greekXml = parseMorphgntXml(readFileSync(xml.path, 'utf8'));
  const linker = new RefLinker('strongs', false);
  const out = new Map<string, StrongsEntry>();
  const index: LexIndex = [];
  const glosses = new Map<string, string>();
  for (let n = 1; n <= GREEK_MAX; n++) {
    const e = greekXml.get(n);
    assert(e, `morphgnt has no G${n}`);
    const { entry, gloss } = greekEntry(e, linker);
    out.set(entry.id, entry);
    glosses.set(entry.id, gloss);
  }
  // Cross-check with CrossWire StrongsGreek v2.0.
  const cw = new Map<number, ReturnType<typeof parseCrossWireGreek>>();
  let cwSuffixed = 0;
  for (const r of greekZip.module.entries()) {
    if (/^\d{5}$/.test(r.key) && Number(r.key) >= 1 && Number(r.key) <= GREEK_MAX) cw.set(Number(r.key), parseCrossWireGreek(r.text));
    else if (r.key !== '00000') cwSuffixed++;
  }
  const cwMissing: number[] = [];
  let lemmaSame = 0;
  let pronSame = 0;
  let kjvSame = 0;
  let compared = 0;
  for (let n = 1; n <= GREEK_MAX; n++) {
    if (GREEK_UNUSED.has(n)) continue;
    const c = cw.get(n);
    const g = out.get(`G${n}`)!;
    if (!c) {
      cwMissing.push(n);
      continue;
    }
    compared++;
    if (c.lemma === g.lemma) lemmaSame++;
    if (c.pron === g.pron) pronSame++;
    if (c.kjv !== undefined && g.kjv !== undefined && normKjv(c.kjv) === normKjv(g.kjv)) kjvSame++;
  }

  // Hebrew
  const main = new Map<number, HebrewMain>();
  const misnumbered: string[] = [];
  for (const r of hebrewZip.module.entries()) {
    const p = parseHebrewMain(r.text);
    if (p) {
      // The key decides: record 08483 prints "8383" but holds H8483 (Tahtim-hodshi).
      if (p.n !== Number(r.key)) misnumbered.push(`${r.key} prints ${p.n}`);
      main.set(Number(r.key), { ...p, n: Number(r.key) });
    } else assert(!/^\d+$/.test(r.key), `StrongsHebrew ${r.key}: cannot read the first line`);
  }
  assert(misnumbered.join() === '08483 prints 8383', `StrongsHebrew records whose printed number differs from the key: ${misnumbered.join(', ')}`);
  const beta = new Map<number, HebrewBeta>();
  let betaDup = 0;
  for (const r of hebrewBeta.module.entries()) {
    const n = Number(r.key);
    if (beta.has(n)) betaDup++;
    else beta.set(n, parseHebrewBeta(r.text));
  }
  let pronDiffers = 0;
  for (let n = 1; n <= HEBREW_MAX; n++) {
    const m = main.get(n);
    const b = beta.get(n);
    assert(m && b, `H${n}: missing from ${m ? 'v3.0' : 'v1.2'}`);
    assert(b.forms.length && /[\u05d0-\u05ea]/.test(b.forms[0]), `H${n}: no Hebrew script in v3.0`);
    if (b.pron && b.pron.replace(/\s/g, '') !== m.pron.replace(/\s/g, '')) pronDiffers++;
    const { entry, gloss } = hebrewEntry(m, b, linker);
    out.set(entry.id, entry);
    glosses.set(entry.id, gloss);
  }

  // Write
  rmSync(join(OUT, 'strongs'), { recursive: true, force: true });
  const buckets = new Map<string, Record<string, StrongsEntry>>();
  const order = [
    ...Array.from({ length: HEBREW_MAX }, (_, i) => `H${i + 1}`),
    ...Array.from({ length: GREEK_MAX }, (_, i) => `G${i + 1}`),
  ];
  for (const id of order) {
    const e = out.get(id)!;
    const file = strongsBucket(id);
    if (!buckets.has(file)) buckets.set(file, {});
    buckets.get(file)![id] = e;
    index.push([id, e.lemma, e.x, glosses.get(id)!]);
  }
  for (const [file, bucket] of buckets) writeData(file, bucket);
  writeData('strongs/index.json', index);

  recordSource({
    id: 'crosswire-strongs',
    name: 'Strong’s Hebrew and Greek Dictionaries (James Strong, 1890): CrossWire StrongsHebrew and StrongsGreek modules; Greek text from Strong’s Greek Dictionary in XML (U. Sandborg-Petersen)',
    homepage: `${MODINFO}StrongsHebrew`,
    version:
      `${moduleVersion(hebrewZip.conf, hebrewZip.file)}; ${moduleVersion(hebrewBeta.conf)} (beta repository, files pinned by sha256); ` +
      `${moduleVersion(greekZip.conf, greekZip.file)}; strongs-dictionary-xml v1.9 commit ${MORPHGNT_COMMIT} (strongsgreek.xml sha256 ${xml.sha256})`,
    files: [hebrewZip.file, ...hebrewBeta.files, greekZip.file, { url: MORPHGNT.xml.url, sha256: xml.sha256, bytes: xml.bytes }, { url: MORPHGNT.readme.url, sha256: readme.sha256, bytes: readme.bytes }],
    license: {
      id: 'PD',
      name: 'Public Domain (Strong’s 1890 text; the Greek XML edition is released under CC0 1.0)',
      url: 'https://creativecommons.org/publicdomain/zero/1.0/',
      attribution:
        'Strong’s Exhaustive Concordance dictionaries by James Strong (1890), public domain. Hebrew from the CrossWire Bible Society StrongsHebrew modules (v1.2 text; Hebrew script and transliteration from v3.0, Jens Grebner’s edition). Greek from “Strong’s Greek Dictionary in XML with real Greek” by Ulrik Sandborg-Petersen (morphgnt.org, CC0), checked against the CrossWire StrongsGreek module v2.0.',
      confirmedAt:
        `DistributionLicense=Public Domain in mods.d/strongshebrew.conf (${hebrewZip.file.url} and ${BETARAW}mods.d/strongshebrew.conf) and mods.d/strongsgreek.conf (${greekZip.file.url}); ` +
        `About: "${confText(confValue(hebrewZip.conf, 'About') ?? '').replace(/\n+/g, ' ')}"; CC0 waiver in ${MORPHGNT.readme.url}`,
    },
    outputs: ['strongs'],
    notes:
      `Greek fields come from the XML edition because CrossWire StrongsGreek v2.0 lacks ${cwMissing.length} entries (${cwMissing.slice(0, 8).map((n) => `G${n}`).join(', ')}, …), carries Chinese notes in 53 pronunciations, and does not mark which cross-references are Hebrew; ` +
      `${GREEK_UNUSED.size} Greek numbers that Strong’s never used (2717, 3203–3302) are stubs. Hebrew definitions come from v1.2 because the v3.0 text drops the commas of the KJV renderings and wraps them in stray braces; v3.0’s multiple Hebrew forms are stored in reverse order and are re-ordered to match their transliterations.`,
  });

  // Verify
  for (const id of order) {
    const e = out.get(id)!;
    const n = Number(id.slice(1));
    const stub = id[0] === 'G' && GREEK_UNUSED.has(n);
    if (!stub) {
      assert(e.lemma && (id[0] === 'G' ? /[\u0370-\u03ff\u1f00-\u1fff]/ : /[\u05d0-\u05ea]/).test(e.lemma), `${id}: lemma "${e.lemma}" is not in ${id[0] === 'G' ? 'Greek' : 'Hebrew'} script`);
      assert(e.x && !/[<>{}]/.test(e.x), `${id}: transliteration "${e.x}"`);
      assert(e.def.length || e.kjv || e.deriv, `${id}: no definition`);
    }
    if (e.pron !== undefined) assert(e.pron && !/[{}<>]|[\u4e00-\u9fff]/.test(e.pron), `${id}: pron "${e.pron}"`);
    if (e.kjv !== undefined) assert(!/^[:\-\s]|[<>{}]/.test(e.kjv), `${id}: kjv "${e.kjv}"`);
    for (const p of inlines(e.def)) {
      if (p.ref) assert(isValidCompact(p.ref), `${id}: ref ${p.ref}`);
    }
    for (const p of [...inlines(e.def), ...(e.deriv ?? []).filter((x): x is Exclude<Inline, string> => typeof x !== 'string')]) {
      if (p.s) {
        const m = /^([GH])(\d+)$/.exec(p.s);
        assert(m && Number(m[2]) >= 1 && Number(m[2]) <= (m[1] === 'G' ? GREEK_MAX : HEBREW_MAX), `${id}: Strong's link ${p.s}`);
      }
    }
    for (const b of e.def) {
      const t = inlineText(b.c);
      assert(!/<[a-zA-Z/][^>]*>|&[a-z]+;|[{}]/.test(t), `${id}: stray markup in "${t.slice(0, 60)}"`);
      assert(!new RegExp(`^\\s*0*${n}\\b`).test(t), `${id}: definition starts with its own number: "${t.slice(0, 60)}"`);
      assert(!e.lemma || !t.startsWith(e.lemma), `${id}: def repeats the lemma`);
    }
    if (e.roots) for (const r of e.roots) assert((e.deriv ?? []).some((p) => typeof p !== 'string' && p.s === r), `${id}: root ${r} not in deriv`);
  }
  const g25 = out.get('G25')!;
  assert(g25.lemma === 'ἀγαπάω' && g25.x === 'agapaō' && g25.pron === "ag-ap-ah'-o" && g25.kjv === '(be-)love(-ed)', `G25 ${JSON.stringify(g25)}`);
  assert(inlineText(g25.def[0].c) === 'to love (in a social or moral sense)', 'G25 definition');
  assert(cw.get(25)!.lemma === g25.lemma && cw.get(25)!.pron === g25.pron && normKjv(cw.get(25)!.kjv!) === normKjv(g25.kjv!), 'G25 agrees with StrongsGreek v2.0');
  const g26 = out.get('G26')!;
  assert(g26.lemma === 'ἀγάπη' && g26.pron === "ag-ah'-pay" && g26.roots?.join() === 'G25' && inlineText(g26.deriv!) === 'from G25', `G26 ${JSON.stringify(g26)}`);
  assert(g26.kjv === '(feast of) charity(-ably), dear, love', `G26 kjv ${g26.kjv}`);
  const g2309 = out.get('G2309')!;
  assert(g2309.lemma === 'θέλω' && g2309.roots?.join() === 'G138', 'G2309 θέλω (missing from StrongsGreek v2.0) is present');
  const h430 = out.get('H430')!;
  assert(h430.lemma === 'אלהים' && h430.x === "'ĕlôhîym" && h430.pron === "el-o-heem'", `H430 ${JSON.stringify(h430)}`);
  assert(inlineText(h430.deriv!) === 'plural of H433' && h430.roots?.join() === 'H433', `H430 deriv ${inlineText(h430.deriv ?? [])}`);
  assert(h430.kjv === 'angels, X exceeding, God (gods)(-dess, -ly), X (very) great, judges, X mighty', `H430 kjv ${h430.kjv}`);
  assert(inlineText(h430.def[0].c).startsWith('gods in the ordinary sense; but specifically used'), 'H430 def');
  const h1 = out.get('H1')!;
  assert(h1.lemma === 'אב' && h1.x === "'âb" && h1.pron === 'awb' && inlineText(h1.deriv!) === 'a primitive word', `H1 ${JSON.stringify(h1)}`);
  assert(h1.kjv === 'chief, (fore-)father(-less), X patrimony, principal' && inlineText(h1.def[0].c).startsWith('father'), `H1 kjv/def`);
  const h26 = out.get('H26')!;
  assert(h26.lemma === 'אביגיל' && h26.x === "'ăbîygayil", `H26 forms re-ordered: ${h26.lemma} ${h26.x}`);
  const idx = JSON.parse(readFileSync(join(OUT, 'strongs', 'index.json'), 'utf8')) as LexIndex;
  assert(idx.length === HEBREW_MAX + GREEK_MAX && idx[0][0] === 'H1' && idx[HEBREW_MAX][0] === 'G1', 'strongs index order');
  assert(idx.every((r) => r[3].length < 60), 'glosses under 60 characters');
  const g25row = idx.find((r) => r[0] === 'G25')!;
  assert(g25row.join('|') === 'G25|ἀγαπάω|agapaō|to love (in a social or moral sense)', `index G25 ${g25row.join('|')}`);
  const stubs = order.filter((id) => out.get(id)!.def[0]?.c[0] === UNUSED_NOTE);
  assert(stubs.length === GREEK_UNUSED.size, `stubs ${stubs.length}`);
  const noDeriv = order.filter((id) => !out.get(id)!.deriv && !stubs.includes(id)).length;
  const noKjv = order.filter((id) => !out.get(id)!.kjv && !stubs.includes(id)).length;
  const fs = folderStats('strongs');
  log('strongs', `verify ok: G1–G${GREEK_MAX} and H1–H${HEBREW_MAX} all present (${GREEK_MAX + HEBREW_MAX} entries); ${stubs.length} stubs (Greek numbers Strong’s skipped: 2717, 3203–3302)`);
  log('strongs', `entries without a derivation ${noDeriv}, without KJV usage ${noKjv}; Scripture refs in definitions linked: ${linker.stats.prose}`);
  log('strongs', `StrongsGreek v2.0 cross-check (${compared} entries it has): lemma same ${lemmaSame}, pron same ${pronSame}, KJV usage same ${kjvSame}; missing from v2.0: ${cwMissing.length} (${cwMissing.map((n) => `G${n}`).join(' ')}); its ${cwSuffixed} suffixed/out-of-range keys (00031A…, 05656…) are placeholders and not used`);
  log('strongs', `StrongsHebrew: v1.2 ${main.size} entries (record ${misnumbered.join(', ')}: key used), v3.0 ${beta.size} (+${betaDup} duplicate key); pronunciation differs between them in ${pronDiffers} (v1.2 used)`);
  log('strongs', `output strongs/ ${fs.text}`);
}

export const stages: Stage[] = [
  {
    id: 'dictionaries',
    description: 'CrossWire Easton, Smith, ISBE, Nave → dict/{easton|smith|isbe|nave}/',
    run: runDictionaries,
  },
  {
    id: 'strongs',
    description: 'Strong’s Hebrew and Greek dictionaries → strongs/',
    run: runStrongs,
  },
];
