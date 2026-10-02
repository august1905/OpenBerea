// Reader for CrossWire SWORD key-indexed (lexicon / dictionary) modules: zLD (libsword zStr +
// EntriesBlock), RawLD (RawStr, 6-byte index) and RawLD4 (RawStr4, 8-byte index). Ported from the
// research decoder (sword.py), which mirrors libsword's zStr, RawStr, RawStr4 and SWLD::strongsPad.
//
// Layout (all integers little-endian):
//   zLD     .idx  8 bytes/key, sorted by key: u32 datOffset, u32 datSize
//           .dat  KEY \r\n payload; payload = u32 blockNum, u32 entryNum, or "@LINK <key>"
//           .zdx  8 bytes/block: u32 zdtOffset, u32 compSize
//           .zdt  zlib streams; each inflates to an EntriesBlock:
//                 u32 count, count × (u32 offset, u32 size), NUL-terminated entry strings
//   RawLD   .idx  6 bytes/key: u32 datOffset, u16 datSize   (RawLD4: 8 bytes, u32 datSize)
//           .dat  KEY (ended by "\", CR or LF) … LF, then the entry text or "@LINK <key>"
// The key ends at the first "\", CR or LF; the payload starts after the first LF.
import { inflateSync } from 'node:zlib';

import { confValue, parseConf, type SwordConf } from './sword-text';

export type LDDriver = 'zLD' | 'RawLD' | 'RawLD4';

export interface LDFiles {
  idx: Buffer;
  dat: Buffer;
  /** zLD only. */
  zdx?: Buffer;
  zdt?: Buffer;
}

export interface LDOptions {
  /** Text encoding of keys and entries: UTF-8, or windows-1252 for modules without Encoding=UTF-8. */
  encoding?: 'utf-8' | 'windows-1252';
  /** Conf CaseSensitiveKeys=true: keys are not upper-cased. */
  caseSensitive?: boolean;
  /** Conf StrongsPadding (default true): numeric lookup keys are zero-padded. */
  strongsPadding?: boolean;
  /** Number of inflated zLD blocks kept in memory. */
  cacheSize?: number;
}

export interface LDEntry {
  /** Record position in the index (key order). */
  index: number;
  key: string;
  /** Entry text with @LINK resolved. */
  text: string;
  /** Target key when the record is an @LINK. */
  link?: string;
}

/** Port of SWLD::strongsPad: "25" → "00025", "H430" → "H0430", "31a" → "00031A". */
export function strongsPad(key: string): string {
  const m = /^([GHgh]?)(\d+)(!?)([A-Za-z]?)$/.exec(key.trim());
  if (!m || key.length >= 9) return key;
  const [, pre, num, bang, sub] = m;
  return pre.toUpperCase() + num.replace(/^0+(?=\d)/, '').padStart(pre ? 4 : 5, '0') + bang + sub.toUpperCase();
}

/** A key as SWORD stores it: upper-cased (unless the module is case sensitive), Strong's-padded. */
export function normalizeKey(key: string, opts: Pick<LDOptions, 'caseSensitive' | 'strongsPadding'> = {}): string {
  let k = key.trim();
  if (!opts.caseSensitive) k = k.toUpperCase();
  if (opts.strongsPadding ?? true) k = strongsPad(k);
  return k;
}

/** Accent- and case-insensitive form of a key, used only as a lookup fallback. */
export function foldKey(key: string): string {
  return key.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase().trim();
}

const LINK = Buffer.from('@LINK');

function linkTarget(payload: Buffer, decode: (b: Buffer) => string): string | null {
  if (payload.length < 5 || !payload.subarray(0, 5).equals(LINK)) return null;
  let end = payload.indexOf(0x0a, 5);
  if (end < 0) end = payload.length;
  return decode(payload.subarray(5, end)).replace(/[\r\0]/g, '').trim();
}

export class SwordLD {
  private readonly entrySize: number;
  private readonly decoder: TextDecoder;
  private readonly cache = new Map<number, Buffer[]>();
  private keyMap: Map<string, number> | null = null;
  private foldMap: Map<string, number> | null = null;

  constructor(
    readonly files: LDFiles,
    readonly driver: LDDriver,
    readonly opts: LDOptions = {},
  ) {
    this.entrySize = driver === 'RawLD' ? 6 : 8;
    this.decoder = new TextDecoder(opts.encoding ?? 'utf-8');
    if (files.idx.length % this.entrySize) {
      throw new Error(`${driver} index is ${files.idx.length} bytes, not a multiple of ${this.entrySize}`);
    }
    if (driver === 'zLD' && (!files.zdx || !files.zdt)) throw new Error('zLD needs .zdx and .zdt files');
  }

  get count(): number {
    return this.files.idx.length / this.entrySize;
  }

  private decode = (b: Buffer): string => this.decoder.decode(b);

  /** Key and raw payload (the bytes after the key line) of record i. */
  record(i: number): { key: string; payload: Buffer } {
    if (i < 0 || i >= this.count) throw new Error(`Record ${i} out of range (0..${this.count - 1})`);
    const off = i * this.entrySize;
    const start = this.files.idx.readUInt32LE(off);
    const size = this.driver === 'RawLD' ? this.files.idx.readUInt16LE(off + 4) : this.files.idx.readUInt32LE(off + 4);
    if (start + size > this.files.dat.length) throw new Error(`Record ${i} runs past the end of .dat`);
    const rec = this.files.dat.subarray(start, start + size);
    let keyEnd = 0;
    while (keyEnd < rec.length && rec[keyEnd] !== 0x5c && rec[keyEnd] !== 0x0d && rec[keyEnd] !== 0x0a) keyEnd++;
    const nl = rec.indexOf(0x0a);
    return { key: this.decode(rec.subarray(0, keyEnd)), payload: nl < 0 ? Buffer.alloc(0) : rec.subarray(nl + 1) };
  }

  key(i: number): string {
    return this.record(i).key;
  }

  keys(): string[] {
    return Array.from({ length: this.count }, (_, i) => this.key(i));
  }

  /** Inflated zLD block: its entry strings without the NUL terminators. */
  block(n: number): Buffer[] {
    const hit = this.cache.get(n);
    if (hit) return hit;
    const { zdx, zdt } = this.files as Required<LDFiles>;
    if (n * 8 + 8 > zdx.length) throw new Error(`No block ${n} in .zdx`);
    const off = zdx.readUInt32LE(n * 8);
    const comp = zdx.readUInt32LE(n * 8 + 4);
    // zlib stops at the end of the stream and ignores the NUL/CRLF padding that follows it.
    const raw = inflateSync(zdt.subarray(off, off + comp));
    const count = raw.readUInt32LE(0);
    const entries: Buffer[] = [];
    for (let e = 0; e < count; e++) {
      const eoff = raw.readUInt32LE(4 + e * 8);
      const esize = raw.readUInt32LE(8 + e * 8);
      if (eoff + esize > raw.length) throw new Error(`Block ${n} entry ${e} runs past the block`);
      let s = raw.subarray(eoff, eoff + esize);
      if (s.length && s[s.length - 1] === 0) s = s.subarray(0, -1);
      entries.push(s);
    }
    this.cache.set(n, entries);
    while (this.cache.size > (this.opts.cacheSize ?? 4)) this.cache.delete(this.cache.keys().next().value!);
    return entries;
  }

  /** Target key when record i is an @LINK (in the .dat payload or, for zLD, the stored text). */
  linkOf(i: number): string | null {
    const { payload } = this.record(i);
    const direct = linkTarget(payload, this.decode);
    if (direct !== null || this.driver !== 'zLD') return direct;
    return linkTarget(this.storedBytes(payload), this.decode);
  }

  private storedBytes(payload: Buffer): Buffer {
    if (this.driver !== 'zLD') return payload;
    if (payload.length < 8) throw new Error(`zLD payload of ${payload.length} bytes`);
    const entries = this.block(payload.readUInt32LE(0));
    const entry = entries[payload.readUInt32LE(4)];
    if (!entry) throw new Error(`zLD entry ${payload.readUInt32LE(4)} missing from block ${payload.readUInt32LE(0)}`);
    return entry;
  }

  /**
   * Entry text of record i with @LINK resolved. libsword resolves links in the .dat payload only;
   * some modules (AbbottSmithStrongs) store "@LINK key" as the compressed text, so both are followed.
   */
  text(i: number, depth = 0): string {
    if (depth > 5) throw new Error(`@LINK loop at record ${i} (${this.key(i)})`);
    const target = this.linkOf(i);
    if (target !== null) {
      const j = this.find(target);
      if (j === null) throw new Error(`Broken @LINK from ${this.key(i)} to ${target}`);
      return this.text(j, depth + 1);
    }
    return this.decode(this.storedBytes(this.record(i).payload));
  }

  /** Record index of a key: exact, then SWORD-normalized, then accent-folded; null when absent. */
  find(key: string): number | null {
    if (!this.keyMap) {
      this.keyMap = new Map();
      for (let i = 0; i < this.count; i++) {
        const k = this.key(i);
        if (!this.keyMap.has(k)) this.keyMap.set(k, i);
      }
    }
    const hit = this.keyMap.get(key) ?? this.keyMap.get(normalizeKey(key, this.opts));
    if (hit !== undefined) return hit;
    if (!this.foldMap) {
      this.foldMap = new Map();
      for (const [k, i] of this.keyMap) if (!this.foldMap.has(foldKey(k))) this.foldMap.set(foldKey(k), i);
    }
    return this.foldMap.get(foldKey(key)) ?? null;
  }

  get(key: string): string | null {
    const i = this.find(key);
    return i === null ? null : this.text(i);
  }

  /** Every record in key order. */
  *entries(): Generator<LDEntry> {
    for (let i = 0; i < this.count; i++) {
      const key = this.key(i);
      const link = this.linkOf(i);
      yield link === null ? { index: i, key, text: this.text(i) } : { index: i, key, text: this.text(i), link };
    }
  }
}

export interface OpenedLD {
  conf: SwordConf;
  driver: LDDriver;
  module: SwordLD;
}

/**
 * Opens a lexicon/dictionary module from its files (paths as in the package: "mods.d/easton.conf",
 * "modules/lexdict/zld/easton/easton.idx", …).
 */
export function openLDModule(files: Map<string, Buffer>): OpenedLD {
  const confPath = [...files.keys()].find((k) => /^mods\.d\/[^/]+\.conf$/i.test(k));
  if (!confPath) throw new Error('No mods.d/*.conf in module files');
  const conf = parseConf(files.get(confPath)!.toString('utf8'));
  const driver = confValue(conf, 'ModDrv') as LDDriver;
  if (!['zLD', 'RawLD', 'RawLD4'].includes(driver)) throw new Error(`Unsupported ModDrv ${driver}`);
  if (driver === 'zLD' && (confValue(conf, 'CompressType') ?? 'ZIP').toUpperCase() !== 'ZIP') {
    throw new Error('Only CompressType=ZIP is supported');
  }
  const base = (confValue(conf, 'DataPath') ?? '').replace(/^\.\//, '');
  const get = (ext: string) => files.get(`${base}.${ext}`);
  const idx = get('idx');
  const dat = get('dat');
  if (!idx || !dat) throw new Error(`No ${base}.idx/.dat in module files`);
  const ld: LDFiles = { idx, dat };
  if (driver === 'zLD') {
    ld.zdx = get('zdx');
    ld.zdt = get('zdt');
  }
  const enc = (confValue(conf, 'Encoding') ?? 'Latin-1').toUpperCase().replace('-', '');
  const module = new SwordLD(ld, driver, {
    encoding: enc === 'UTF8' ? 'utf-8' : 'windows-1252',
    caseSensitive: confValue(conf, 'CaseSensitiveKeys')?.toLowerCase() === 'true',
    strongsPadding: confValue(conf, 'StrongsPadding')?.toLowerCase() !== 'false',
  });
  return { conf, driver, module };
}
