// Independent spot checks of the generated data against the raw source files (run after `npm run data`):
//   - verse counts in every chapter of the KJV, ASV, and Hebrew/Greek data match the KJV versification;
//   - randomly sampled KJV and ASV verses read exactly as the CrossWire module text;
//   - the Strong's numbers on sampled KJV verses equal the module's tags, in order;
//   - the Strong's numbers on sampled ASV verses (carried over from the KJV) are among the KJV module's
//     tags for the same verse, and a fixed set of ASV words carries the expected numbers;
//   - the Strong's numbers on sampled Hebrew and Greek verses equal the TAHOT/TAGNT rows.
// The raw files are parsed here with their own minimal code, separate from the converters.
//   npx tsx scripts/verify-data.ts [samples=300]
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { BOOKS, type BookCode } from '../src/lib/bible/books';
import { verseCount } from '../src/lib/bible/versification';
import type { ChapterText, OrigChapter, Seg } from '../src/lib/data/types';
import { stepBook } from './pipeline/lib/stepbible-common';
import { openModule, readZip } from './pipeline/lib/sword-text';

const ROOT = join(__dirname, '..');
const DATA = join(ROOT, 'public', 'data');
const CACHE = join(ROOT, '.cache', 'sources');
const SAMPLES = Number(process.argv[2] ?? 300);
const load = <T>(rel: string) => JSON.parse(readFileSync(join(DATA, rel), 'utf8')) as T;

let failures = 0;
const fail = (msg: string) => {
  failures++;
  if (failures <= 25) console.log(`  MISMATCH ${msg}`);
};

// Deterministic pseudo-random sample (so a failure can be reproduced).
let seed = 20261002;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const allVerses: [BookCode, number, number][] = [];
for (const b of BOOKS) for (let c = 1; c <= b.chapters; c++) for (let v = 1; v <= verseCount(b.code, c); v++) allVerses.push([b.code, c, v]);
const sample = (n: number, filter: (b: BookCode) => boolean = () => true) => {
  const pool = allVerses.filter(([b]) => filter(b));
  return Array.from({ length: n }, () => pool[Math.floor(rand() * pool.length)]);
};

const segText = (segs: Seg[]) => segs.map((s) => (typeof s === 'string' ? s : s.t)).join('');
const norm = (s: string) => s.replace(/\s+/g, '');
const decode = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/**
 * The verse as the reader shows it: notes and colophons removed; a title at the start (a Psalm
 * superscription, shown above the chapter) removed; centered acrostic headings (Psalm 119's
 * "ה HE.") removed. A title at the end (Habakkuk 3:19's subscription) stays, as in the KJV.
 */
function verseBody(raw: string): string {
  let s = raw
    .replace(/<note\b[\s\S]*?<\/note>/g, '')
    .replace(/<div\b[^>]*type="colophon"[\s\S]*?<\/div>/g, '')
    .replace(/<l\b[^>]*type="x-center"[^>]*\/>[\s\S]*?<l\b[^>]*eID=[^>]*\/>/g, '');
  s = s.replace(/^((?:\s|<(?!title)[^>]+>)*)<title\b[\s\S]*?<\/title>/, '$1');
  return s.replace(/<title\b[^>]*>([\s\S]*?)<\/title>/g, ' $1 ');
}

function osisText(raw: string): string {
  return decode(verseBody(raw).replace(/<[^>]+>/g, ''));
}

/** Strong's numbers in an OSIS verse, in order, as base ids ("H7225"); titles excluded. */
function osisStrongs(raw: string): string[] {
  const body = verseBody(raw).replace(/<title\b[\s\S]*?<\/title>/g, '');
  const out: string[] = [];
  // Self-closing <w/> elements are original words the KJV leaves untranslated: no English, no tag.
  for (const w of body.matchAll(/<w\b([^>]*?)(?:\/>|>([\s\S]*?)<\/w>)/g)) {
    if (w[2] === undefined || !w[2].replace(/<[^>]+>/g, '').trim()) continue;
    const lemma = /lemma="([^"]*)"/.exec(w[1])?.[1] ?? '';
    for (const m of lemma.matchAll(/strong:([GH])0*(\d+)/g)) out.push(`${m[1]}${Number(m[2])}`);
  }
  return out;
}

function checkCounts() {
  let chapters = 0;
  for (const b of BOOKS) {
    for (let c = 1; c <= b.chapters; c++) {
      const want = verseCount(b.code, c);
      for (const folder of ['kjv', 'asv']) {
        const ch = load<ChapterText>(`${folder}/${b.code}/${c}.json`);
        const nums = ch.v.map((v) => v.n);
        if (nums.length !== want || nums.some((n, i) => n !== i + 1)) fail(`${folder} ${b.code} ${c}: ${nums.length} verses, expected ${want}`);
      }
      const orig = load<OrigChapter>(`stepbible/orig/${b.code}/${c}.json`);
      const have = new Set(orig.v.filter((v) => v.n > 0).map((v) => v.n));
      for (let v = 1; v <= want; v++) if (!have.has(v)) fail(`orig ${b.code} ${c}:${v} missing`);
      chapters++;
    }
  }
  console.log(`Verse counts: ${chapters} chapters checked in kjv/, asv/, and stepbible/orig/.`);
}

function checkModule(name: 'KJV' | 'ASV') {
  const mod = openModule(readZip(readFileSync(join(CACHE, 'crosswire', `${name}.zip`)))).module;
  const folder = name.toLowerCase();
  let texts = 0;
  let tagged = 0;
  for (const [b, c, v] of sample(SAMPLES)) {
    const raw = mod.verse(b, c, v);
    const verse = load<ChapterText>(`${folder}/${b}/${c}.json`).v.find((x) => x.n === v)!;
    // Spacing is compared loosely: the converter repairs a few missing spaces in the ASV source.
    if (norm(osisText(raw)) !== norm(segText(verse.s))) fail(`${name} ${b} ${c}:${v} text differs\n    source: ${osisText(raw).trim()}\n    output: ${segText(verse.s)}`);
    texts++;
    if (name === 'KJV') {
      const want = osisStrongs(raw);
      // One source word "the <divineName>LORD</divineName>" becomes two runs ("The ", "LORD"), both
      // tagged; count it once, as the source does.
      const have = verse.s.flatMap((s, i) => {
        if (typeof s === 'string' || !s.s) return [];
        const prev = verse.s[i - 1];
        if (prev && typeof prev !== 'string' && (s.dn || prev.dn) && prev.s?.join() === s.s.join()) return [];
        return s.s;
      });
      if (want.join(' ') !== have.join(' ')) fail(`KJV ${b} ${c}:${v} Strong's ${have.join(' ')} vs source ${want.join(' ')}`);
      tagged += want.length;
    }
  }
  console.log(`${name}: ${texts} sampled verses match the module text${name === 'KJV' ? `; ${tagged} Strong's tags match in order` : ''}.`);
}

/** ASV Strong's numbers come from the KJV: each must be a KJV module tag of the same verse. */
function checkAsvStrongs() {
  const kjv = openModule(readZip(readFileSync(join(CACHE, 'crosswire', 'KJV.zip')))).module;
  let words = 0;
  let tagged = 0;
  for (const [b, c, v] of sample(SAMPLES)) {
    const want = new Set(osisStrongs(kjv.verse(b, c, v)));
    const verse = load<ChapterText>(`asv/${b}/${c}.json`).v.find((x) => x.n === v)!;
    for (const s of verse.s) {
      const n = (typeof s === 'string' ? s : s.t).match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
      words += n;
      if (typeof s === 'string' || !s.s) continue;
      tagged += n;
      if (s.a) fail(`ASV ${b} ${c}:${v} italic "${s.t}" is tagged`);
      for (const id of s.s) if (!want.has(id)) fail(`ASV ${b} ${c}:${v} "${s.t}" ${id} is not a KJV tag of the verse (${[...want].join(' ')})`);
    }
  }
  // A word the ASV prints as the KJV does, one it renders differently, and the divine name.
  const spot: [BookCode, number, number, string, string][] = [
    ['GEN', 1, 1, 'God', 'H430'],
    ['JHN', 3, 16, 'loved', 'G25'],
    ['JHN', 3, 16, 'eternal', 'G166'],
    ['PSA', 23, 1, 'Jehovah', 'H3068'],
    ['EXO', 3, 15, 'Jehovah', 'H3068'],
  ];
  for (const [b, c, v, word, id] of spot) {
    const seg = load<ChapterText>(`asv/${b}/${c}.json`).v[v - 1].s.find((s) => typeof s !== 'string' && s.t.split(/\W+/).includes(word));
    if (typeof seg === 'string' || !seg?.s?.includes(id)) fail(`ASV ${b} ${c}:${v} "${word}" should carry ${id}: ${JSON.stringify(seg)}`);
  }
  console.log(`ASV: ${SAMPLES} sampled verses, ${tagged} of ${words} words tagged (${((100 * tagged) / words).toFixed(1)}%), every number a KJV module tag of the verse; ${spot.length} spot checks.`);
}

/** Raw TAHOT/TAGNT rows grouped by KJV verse ("GEN.1.1"). */
function stepRows(prefix: 'TAHOT' | 'TAGNT') {
  const dir = join(CACHE, 'stepbible');
  const rows = new Map<string, string[][]>();
  for (const file of readdirSync(dir).filter((f) => f.startsWith(prefix))) {
    for (const line of readFileSync(join(dir, file), 'utf8').split(/\r?\n/)) {
      const m = /^([1-3A-Z][a-z0-9A-Z]{2})\.(\d+)\.(\d+)(?:\([^)]*\))?(?:\[(\d+)\.(\d+)\])?(?:\{[^}]*\})?#/.exec(line);
      if (!m) continue;
      const book = stepBook(m[1]);
      if (!book) continue;
      const [c, v] = m[4] ? [m[4], m[5]] : [m[2], m[3]];
      const key = `${book}.${Number(c)}.${Number(v)}`;
      rows.set(key, [...(rows.get(key) ?? []), line.split('\t')]);
    }
  }
  return rows;
}

function checkOriginal() {
  const tahot = stepRows('TAHOT');
  let hebWords = 0;
  for (const [b, c, v] of sample(SAMPLES, (b) => BOOKS.find((x) => x.code === b)!.testament === 'OT')) {
    const want = (tahot.get(`${b}.${c}.${v}`) ?? [])
      .filter((r) => r[1]?.trim())
      .map((r) => {
        const root = /\{([HA]?H?\d+)[A-Za-z]?\}/.exec(r[4]) ?? /H0*(\d+)/.exec(r[4]);
        const n = /\d+/.exec(root![1] ?? root![0])![0];
        return `H${Number(n)}`;
      });
    const verse = load<OrigChapter>(`stepbible/orig/${b}/${c}.json`).v.find((x) => x.n === v);
    const have = verse?.w.map((w) => w.s) ?? [];
    if (want.join(' ') !== have.join(' ')) fail(`TAHOT ${b} ${c}:${v}: ${have.join(' ')} vs source ${want.join(' ')}`);
    hebWords += want.length;
  }
  console.log(`TAHOT: ${SAMPLES} sampled verses, ${hebWords} words, main Strong's numbers match the source rows.`);

  const tagnt = stepRows('TAGNT');
  let grkWords = 0;
  for (const [b, c, v] of sample(SAMPLES, (b) => BOOKS.find((x) => x.code === b)!.testament === 'NT')) {
    const rows = tagnt.get(`${b}.${c}.${v}`) ?? [];
    const want = rows.map((r) => {
      const n = /G0*(\d+)/.exec(r[3]);
      return n ? `G${Number(n[1])}` : '';
    });
    const verse = load<OrigChapter>(`stepbible/orig/${b}/${c}.json`).v.find((x) => x.n === v);
    const have = verse?.w.map((w) => w.s) ?? [];
    if (want.join(' ') !== have.join(' ')) fail(`TAGNT ${b} ${c}:${v}: ${have.join(' ')} vs source ${want.join(' ')}`);
    grkWords += want.length;
  }
  console.log(`TAGNT: ${SAMPLES} sampled verses, ${grkWords} words, Strong's numbers match the source rows.`);
}

function checkLexicon() {
  // Every Strong's number has an entry, and a sample has the fields the word panel shows.
  let checked = 0;
  for (const [letter, max] of [['G', 5624], ['H', 8674]] as const) {
    for (let n = 1; n <= max; n++) {
      const shard = load<Record<string, { id: string; def: unknown[] }>>(`strongs/${letter}/${Math.floor(n / 100)}.json`);
      if (!shard[`${letter}${n}`]) fail(`strongs ${letter}${n} missing`);
      checked++;
    }
  }
  const g25 = load<Record<string, { lemma: string; pron?: string; kjv?: string }>>('strongs/G/0.json').G25;
  if (g25.pron !== "ag-ap-ah'-o") fail(`G25 pronunciation ${g25.pron}`);
  const h430 = load<Record<string, { deriv?: unknown[] }>>('strongs/H/4.json').H430;
  if (!JSON.stringify(h430.deriv).includes('H433')) fail('H430 derivation should mention H433');
  console.log(`Strong's: all ${checked} numbers present; G25 and H430 spot checks pass.`);
}

checkCounts();
checkModule('KJV');
checkModule('ASV');
checkAsvStrongs();
checkOriginal();
checkLexicon();
console.log(failures ? `\n${failures} mismatches.` : '\nAll data checks passed.');
process.exit(failures ? 1 : 0);
