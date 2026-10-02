// Reader for CrossWire SWORD verse-keyed modules: zText / zCom (10-byte verse index) and
// zText4 / zCom4 (12-byte verse index), BOOK or CHAPTER blocks, CompressType=ZIP (zlib streams).
// Ported from the research decoder (sword.py), which mirrors libsword's zVerse/zVerse4 and
// VersificationMgr::System::loadFromSBook(). Also reads the module .zip packages and .conf files.
//
// Layout (all integers little-endian):
//   .?zs block index  12 bytes/block: u32 compOffset, u32 compSize, u32 uncompSize
//   .?zv verse index  10 bytes/slot (zVerse: u32 block, u32 start, u16 size) or 12 (zVerse4: u32 size)
//   .?zz data         concatenated zlib streams (with trailing padding after each stream)
import { crc32, inflateRawSync, inflateSync } from 'node:zlib';

import { BOOK_CODES, type BookCode, bookInfo } from '../../../src/lib/bible/books';
import { verseCount } from '../../../src/lib/bible/versification';
import { OSIS_BOOKS } from './osis-books';

// ---------------------------------------------------------------------------------------------
// .zip packages (CrossWire rawzip): a minimal reader for stored and deflated entries.

/** Unpacks every file of a .zip archive into memory, checking sizes and CRC-32. */
export function readZip(zip: Buffer): Map<string, Buffer> {
  const EOCD = 0x06054b50;
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 65535); i--) {
    if (zip.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a zip file (no end-of-central-directory record)');
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  const files = new Map<string, Buffer>();
  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error(`Bad zip central directory entry at ${p}`);
    const method = zip.readUInt16LE(p + 10);
    const crc = zip.readUInt32LE(p + 16);
    const compSize = zip.readUInt32LE(p + 20);
    const size = zip.readUInt32LE(p + 24);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    const name = zip.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    if (zip.readUInt32LE(local) !== 0x04034b50) throw new Error(`Bad zip local header for ${name}`);
    const dataStart = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const raw = zip.subarray(dataStart, dataStart + compSize);
    let data: Buffer;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) data = inflateRawSync(raw);
    else throw new Error(`Unsupported zip compression method ${method} for ${name}`);
    if (data.length !== size) throw new Error(`Zip entry ${name}: expected ${size} bytes, got ${data.length}`);
    if (crc32(data) >>> 0 !== crc >>> 0) throw new Error(`Zip entry ${name}: CRC mismatch`);
    files.set(name, data);
  }
  return files;
}

// ---------------------------------------------------------------------------------------------
// .conf files

export interface SwordConf {
  /** Module name from the [Section] line. */
  name: string;
  /** All values per key, in file order (keys like GlobalOptionFilter repeat). */
  values: Record<string, string[]>;
}

/** Parses a SWORD .conf. A value ending in a backslash continues on the next line. */
export function parseConf(text: string): SwordConf {
  const values: Record<string, string[]> = {};
  let name = '';
  let continuing: string | null = null;
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    if (continuing !== null) {
      const list = values[continuing];
      const more = line.endsWith('\\') ? line.slice(0, -1) : line;
      list[list.length - 1] += '\n' + more;
      if (!line.endsWith('\\')) continuing = null;
      continue;
    }
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    if (!name && s.startsWith('[') && s.endsWith(']')) {
      name = s.slice(1, -1);
      continue;
    }
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1);
    const cont = value.endsWith('\\');
    if (cont) value = value.slice(0, -1);
    (values[key] ??= []).push(value);
    if (cont) continuing = key;
  }
  return { name, values };
}

export function confValue(conf: SwordConf, key: string): string | undefined {
  return conf.values[key]?.[0]?.trim();
}

/** Turns conf RTF-ish text (`\par`, `\qc`, …) into plain text with newlines. */
export function confText(value: string): string {
  return value
    .replace(/\\par\b[ \t]*/g, '\n')
    .replace(/\\[a-z]+\d* ?/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

// ---------------------------------------------------------------------------------------------
// Versification and the verse-index slot layout

export interface CanonBook {
  name: string;
  osis: string;
  testament: 1 | 2;
  verses: number[];
}

/** Reads the KJV book list and verses-per-chapter table from SWORD's include/canon.h. */
export function parseCanonH(src: string): CanonBook[] {
  const list = (name: string) => {
    const m = new RegExp(`struct sbook ${name}\\[\\] = \\{([\\s\\S]*?)\\n\\};`).exec(src);
    if (!m) throw new Error(`canon.h: ${name} not found`);
    const out: { name: string; osis: string; chapters: number }[] = [];
    for (const b of m[1].matchAll(/\{"([^"]*)", "([^"]*)", "([^"]*)", (\d+)\}/g)) {
      if (!b[1]) break;
      out.push({ name: b[1], osis: b[2], chapters: Number(b[4]) });
    }
    return out;
  };
  const vmMatch = /int vm\[\] = \{([\s\S]*?)\n\};/.exec(src);
  if (!vmMatch) throw new Error('canon.h: vm[] not found');
  const vm = vmMatch[1]
    .replace(/\/\/[^\n]*/g, '')
    .match(/\d+/g)!
    .map(Number);
  const books: CanonBook[] = [];
  let k = 0;
  for (const [testament, bl] of [[1, list('otbooks')], [2, list('ntbooks')]] as const) {
    for (const b of bl) {
      books.push({ name: b.name, osis: b.osis, testament, verses: vm.slice(k, k + b.chapters) });
      k += b.chapters;
    }
  }
  if (k !== vm.length) throw new Error(`canon.h: ${vm.length} vm[] entries for ${k} chapters`);
  return books;
}

export interface SlotBook {
  code: BookCode;
  osis: string;
  testament: 1 | 2;
  verses: number[];
  /** Slot of the book heading / book introduction (chapter 0, verse 0). */
  bookSlot: number;
  /** Slot of each chapter heading (verse 0); verse v of chapter c is chapterSlots[c-1] + v. */
  chapterSlots: number[];
}

export interface SlotLayout {
  books: SlotBook[];
  /** Number of verse-index slots per testament file. */
  slots: Record<1 | 2, number>;
}

/**
 * Builds the per-testament slot layout: 0 = module heading, 1 = testament heading, then per book
 * one book-heading slot and per chapter one chapter-heading slot followed by its verses.
 */
export function buildLayout(books: { osis: string; testament: 1 | 2; verses: number[] }[]): SlotLayout {
  const out: SlotBook[] = [];
  const slots: Record<1 | 2, number> = { 1: 0, 2: 0 };
  for (const t of [1, 2] as const) {
    let offset = 1;
    for (const b of books.filter((x) => x.testament === t)) {
      const i = OSIS_BOOKS.indexOf(b.osis as (typeof OSIS_BOOKS)[number]);
      if (i < 0) throw new Error(`Unknown OSIS book ${b.osis}`);
      offset++;
      const book: SlotBook = { code: BOOK_CODES[i], osis: b.osis, testament: t, verses: b.verses, bookSlot: offset, chapterSlots: [] };
      for (const n of b.verses) {
        offset++;
        book.chapterSlots.push(offset);
        offset += n;
      }
      out.push(book);
    }
    slots[t] = offset + 1;
  }
  return { books: out, slots };
}

let kjv: SlotLayout | null = null;

/** The KJV layout built from the app's versification (src/lib/bible/versification.json). */
export function kjvLayout(): SlotLayout {
  if (!kjv) {
    kjv = buildLayout(
      BOOK_CODES.map((code, i) => ({
        osis: OSIS_BOOKS[i],
        testament: i < 39 ? 1 : 2,
        verses: Array.from({ length: bookInfo(code).chapters }, (_, c) => verseCount(code, c + 1)),
      })),
    );
  }
  return kjv;
}

// ---------------------------------------------------------------------------------------------
// zVerse / zVerse4

export interface ZVerseFiles {
  bzs: Buffer;
  bzv: Buffer;
  bzz: Buffer;
}

export interface IndexEntry {
  block: number;
  start: number;
  size: number;
}

export interface Slot {
  t: 1 | 2;
  idx: number;
}

export function sameEntry(a: IndexEntry | null, b: IndexEntry | null): boolean {
  return !!a && !!b && a.size > 0 && a.block === b.block && a.start === b.start && a.size === b.size;
}

export class ZVerse {
  private cache = new Map<string, Buffer>();
  private bookByCode: Map<BookCode, SlotBook>;

  constructor(
    readonly files: Partial<Record<1 | 2, ZVerseFiles>>,
    readonly entrySize: 10 | 12,
    readonly layout: SlotLayout = kjvLayout(),
    readonly encoding: BufferEncoding = 'utf8',
    /** Number of inflated blocks kept in memory. */
    private cacheSize = 2,
  ) {
    this.bookByCode = new Map(layout.books.map((b) => [b.code, b]));
    for (const t of [1, 2] as const) {
      const f = files[t];
      if (!f) continue;
      const expected = layout.slots[t] * entrySize;
      if (f.bzv.length !== expected) {
        throw new Error(`Verse index for testament ${t} is ${f.bzv.length} bytes; expected ${layout.slots[t]} × ${entrySize}`);
      }
    }
  }

  has(t: 1 | 2): boolean {
    return !!this.files[t];
  }

  /** Verses in a chapter according to this module's layout. */
  verses(book: BookCode, chapter: number): number {
    return this.bookByCode.get(book)?.verses[chapter - 1] ?? 0;
  }

  /** Slot of a verse; chapter 0 = book heading, verse 0 = chapter heading. */
  slot(book: BookCode, chapter: number, verse: number): Slot {
    const b = this.bookByCode.get(book)!;
    if (chapter === 0) return { t: b.testament, idx: b.bookSlot };
    if (chapter > b.verses.length || verse > b.verses[chapter - 1]) {
      throw new Error(`${book} ${chapter}:${verse} is outside the versification`);
    }
    return { t: b.testament, idx: b.chapterSlots[chapter - 1] + verse };
  }

  entry(t: 1 | 2, idx: number): IndexEntry | null {
    const f = this.files[t];
    if (!f) return null;
    const off = idx * this.entrySize;
    if (off + this.entrySize > f.bzv.length) return null;
    return {
      block: f.bzv.readUInt32LE(off),
      start: f.bzv.readUInt32LE(off + 4),
      size: this.entrySize === 10 ? f.bzv.readUInt16LE(off + 8) : f.bzv.readUInt32LE(off + 8),
    };
  }

  blockCount(t: 1 | 2): number {
    const f = this.files[t];
    return f ? f.bzs.length / 12 : 0;
  }

  /** Inflates a block. zlib stops at the end of the stream and ignores the trailing padding. */
  block(t: 1 | 2, n: number): Buffer {
    const key = `${t}:${n}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const f = this.files[t];
    if (!f || n * 12 + 12 > f.bzs.length) throw new Error(`No block ${n} in testament ${t}`);
    const off = f.bzs.readUInt32LE(n * 12);
    const comp = f.bzs.readUInt32LE(n * 12 + 4);
    const size = f.bzs.readUInt32LE(n * 12 + 8);
    const data = inflateSync(f.bzz.subarray(off, off + comp));
    if (data.length !== size) throw new Error(`Block ${t}:${n} inflated to ${data.length} bytes; index says ${size}`);
    this.cache.set(key, data);
    while (this.cache.size > this.cacheSize) this.cache.delete(this.cache.keys().next().value!);
    return data;
  }

  bytes(e: IndexEntry, t: 1 | 2): Buffer {
    if (!e.size) return Buffer.alloc(0);
    const data = this.block(t, e.block);
    if (e.start + e.size > data.length) throw new Error(`Entry ${e.block}/${e.start}+${e.size} runs past its block`);
    return data.subarray(e.start, e.start + e.size);
  }

  /** Text of a slot ("" when empty). Bytes are sliced before decoding, as offsets are byte offsets. */
  read(t: 1 | 2, idx: number): string {
    const e = this.entry(t, idx);
    return e && e.size ? this.bytes(e, t).toString(this.encoding) : '';
  }

  verse(book: BookCode, chapter: number, verse: number): string {
    const s = this.slot(book, chapter, verse);
    return this.read(s.t, s.idx);
  }
}

export interface OpenedModule {
  conf: SwordConf;
  driver: 'zText' | 'zText4' | 'zCom' | 'zCom4';
  module: ZVerse;
}

/**
 * Opens a verse-keyed module from its files (paths as in the package: "mods.d/kjv.conf",
 * "modules/texts/ztext/kjv/ot.bzs", …).
 */
export function openModule(files: Map<string, Buffer>, layout: SlotLayout = kjvLayout()): OpenedModule {
  const confPath = [...files.keys()].find((k) => /^mods\.d\/[^/]+\.conf$/i.test(k));
  if (!confPath) throw new Error('No mods.d/*.conf in module files');
  const conf = parseConf(files.get(confPath)!.toString('utf8'));
  const driver = confValue(conf, 'ModDrv') as OpenedModule['driver'];
  if (!['zText', 'zText4', 'zCom', 'zCom4'].includes(driver)) throw new Error(`Unsupported ModDrv ${driver}`);
  if ((confValue(conf, 'CompressType') ?? 'ZIP').toUpperCase() !== 'ZIP') throw new Error('Only CompressType=ZIP is supported');
  const versification = confValue(conf, 'Versification') ?? 'KJV';
  if (versification !== 'KJV') throw new Error(`Unsupported versification ${versification}`);
  const dataPath = (confValue(conf, 'DataPath') ?? '').replace(/^\.\//, '').replace(/\/?$/, '/');
  const blockChar = ({ BOOK: 'b', CHAPTER: 'c', VERSE: 'v' } as Record<string, string>)[
    (confValue(conf, 'BlockType') ?? 'CHAPTER').toUpperCase()
  ];
  const dir = [...files.keys()].some((k) => k.startsWith(dataPath))
    ? dataPath
    : // JFB's conf says …/zcom/jfb/ while the package may use zcom4/; accept either.
      dataPath.replace(/\/z(com|text)\//, '/z$14/');
  const pick = (pre: string): ZVerseFiles | undefined => {
    const get = (ext: string) => files.get(`${dir}${pre}.${blockChar}z${ext}`);
    const bzs = get('s');
    const bzv = get('v');
    const bzz = get('z');
    return bzs && bzv && bzz ? { bzs, bzv, bzz } : undefined;
  };
  const tfiles: Partial<Record<1 | 2, ZVerseFiles>> = {};
  const ot = pick('ot');
  const nt = pick('nt');
  if (ot) tfiles[1] = ot;
  if (nt) tfiles[2] = nt;
  if (!ot && !nt) throw new Error(`No .${blockChar}z? files under ${dataPath}`);
  const enc = (confValue(conf, 'Encoding') ?? 'Latin-1').toUpperCase().replace('-', '');
  const entrySize = driver.endsWith('4') ? 12 : 10;
  return { conf, driver, module: new ZVerse(tfiles, entrySize, layout, enc === 'UTF8' ? 'utf8' : 'latin1') };
}

// ---------------------------------------------------------------------------------------------
// Commentary structure: linked ranges and orphaned text

export interface ChapterGroup {
  /** First and last verse covered (0 = the chapter-heading slot). */
  start: number;
  end: number;
  entry: IndexEntry;
}

/**
 * Groups the slots of one chapter (heading slot 0 and verses 1..n) into runs of identical
 * non-empty index entries. A run is one comment linked across a verse range.
 */
export function chapterGroups(mod: ZVerse, book: BookCode, chapter: number): ChapterGroup[] {
  const first = mod.slot(book, chapter, 0);
  const n = mod.verses(book, chapter);
  const groups: ChapterGroup[] = [];
  for (let v = 0; v <= n; v++) {
    const e = mod.entry(first.t, first.idx + v);
    if (!e || !e.size) continue;
    const last = groups[groups.length - 1];
    if (last && last.end === v - 1 && sameEntry(last.entry, e)) last.end = v;
    else groups.push({ start: v, end: v, entry: e });
  }
  return groups;
}

export interface Gap {
  t: 1 | 2;
  block: number;
  start: number;
  end: number;
  /** The slot whose entry ends closest before the gap (the gap follows its text). */
  afterIdx: number | null;
  /** The first slot whose entry starts after the gap. */
  beforeIdx: number | null;
}

/**
 * Byte ranges of each inflated block that no verse-index slot points to ("orphaned" text).
 * Only gaps whose tag-stripped text is longer than `minText` characters are returned.
 */
export function findGaps(mod: ZVerse, t: 1 | 2, minText = 20): Gap[] {
  const f = mod.files[t];
  if (!f) return [];
  const byBlock = new Map<number, { start: number; end: number; idx: number }[]>();
  const slots = f.bzv.length / mod.entrySize;
  for (let i = 0; i < slots; i++) {
    const e = mod.entry(t, i)!;
    if (!e.size) continue;
    let list = byBlock.get(e.block);
    if (!list) byBlock.set(e.block, (list = []));
    list.push({ start: e.start, end: e.start + e.size, idx: i });
  }
  const gaps: Gap[] = [];
  for (let b = 0; b < mod.blockCount(t); b++) {
    const data = mod.block(t, b);
    const list = (byBlock.get(b) ?? []).sort((x, y) => x.start - y.start || x.idx - y.idx);
    let pos = 0;
    let after: number | null = null;
    const consider = (a: number, z: number, before: number | null) => {
      const text = data.toString(mod.encoding, a, z).replace(/<[^>]*>/g, '').trim();
      if (text.length > minText) gaps.push({ t, block: b, start: a, end: z, afterIdx: after, beforeIdx: before });
    };
    for (const r of list) {
      if (r.start > pos) consider(pos, r.start, r.idx);
      if (r.end >= pos) {
        pos = r.end;
        after = r.idx;
      }
    }
    if (pos < data.length) consider(pos, data.length, null);
  }
  return gaps;
}
