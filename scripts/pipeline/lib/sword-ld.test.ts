import { deflateSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { foldKey, normalizeKey, openLDModule, strongsPad, SwordLD } from './sword-ld';

// Small modules built byte-for-byte in the zLD / RawLD layouts, with entry text copied from the
// real CrossWire Easton and StrongsHebrew modules.
const AARON = '<entryFree n="Aaron">\n<title>Aaron</title>\n<p>The eldest son of Amram and Jochebed, a daughter of Levi (<ref osisRef="Bible:Exod.6.20">Ex. 6:20</ref>).</p>\n</entryFree>';
const ABADDON = '<entryFree n="Abaddon">\n<title>Abaddon</title>\n<p>destruction, the Hebrew name (equivalent to the Greek Apollyon, i.e., destroyer) of “the angel of the bottomless pit” (<ref osisRef="Bible:Rev.9.11">Rev. 9:11</ref>).</p>\n</entryFree>';
const H430 = " 430  'elohiym  el-o-heem'\r\n\r\n plural of 433; gods in the ordinary sense:--angels, X\r\n exceeding, God (gods)(-dess, -ly).\r\n see HEBREW for 0433\r";

const u32 = (...n: number[]) => {
  const b = Buffer.alloc(4 * n.length);
  n.forEach((v, i) => b.writeUInt32LE(v, i * 4));
  return b;
};

/** An EntriesBlock: u32 count, (u32 offset, u32 size)…, NUL-terminated strings. */
function entriesBlock(texts: string[]): Buffer {
  const bodies = texts.map((t) => Buffer.concat([Buffer.from(t, 'utf8'), Buffer.from([0])]));
  let off = 4 + 8 * texts.length;
  const head = [u32(texts.length)];
  for (const b of bodies) {
    head.push(u32(off, b.length));
    off += b.length;
  }
  return Buffer.concat([...head, ...bodies]);
}

/** A zLD module: records are [key, {block, entry} | "@LINK target"]. Each zlib stream is padded as in the real files. */
function zld(blocks: string[][], records: [string, { block: number; entry: number } | string][]) {
  const zdtParts: Buffer[] = [];
  const zdx: Buffer[] = [];
  let pos = 0;
  for (const b of blocks) {
    const z = deflateSync(entriesBlock(b));
    const padded = Buffer.concat([z, Buffer.alloc(5), Buffer.from('\r\n')]);
    zdx.push(u32(pos, padded.length));
    zdtParts.push(padded);
    pos += padded.length;
  }
  const dat: Buffer[] = [];
  const idx: Buffer[] = [];
  let d = 0;
  for (const [key, payload] of records) {
    const body = typeof payload === 'string' ? Buffer.from(payload) : u32(payload.block, payload.entry);
    const rec = Buffer.concat([Buffer.from(`${key}\r\n`), body]);
    idx.push(u32(d, rec.length));
    dat.push(rec, Buffer.from('\r\n'));
    d += rec.length + 2;
  }
  return { idx: Buffer.concat(idx), dat: Buffer.concat(dat), zdx: Buffer.concat(zdx), zdt: Buffer.concat(zdtParts) };
}

/** A RawLD (6-byte index) or RawLD4 (8-byte) module. */
function rawld(records: [string, string][], four = false) {
  const dat: Buffer[] = [];
  const idx: Buffer[] = [];
  let d = 0;
  for (const [key, text] of records) {
    const rec = Buffer.from(`${key}\\\n${text}`, 'latin1');
    const e = Buffer.alloc(four ? 8 : 6);
    e.writeUInt32LE(d, 0);
    if (four) e.writeUInt32LE(rec.length, 4);
    else e.writeUInt16LE(rec.length, 4);
    idx.push(e);
    dat.push(rec);
    d += rec.length;
  }
  return { idx: Buffer.concat(idx), dat: Buffer.concat(dat) };
}

describe('strongsPad / normalizeKey', () => {
  it('pads like SWLD::strongsPad', () => {
    expect(strongsPad('25')).toBe('00025');
    expect(strongsPad('00430')).toBe('00430');
    expect(strongsPad('H430')).toBe('H0430');
    expect(strongsPad('g25')).toBe('G0025');
    expect(strongsPad('31a')).toBe('00031A');
    expect(strongsPad('AARON')).toBe('AARON');
  });
  it('upper-cases unless the module is case sensitive', () => {
    expect(normalizeKey('aaron')).toBe('AARON');
    expect(normalizeKey('Aaron', { caseSensitive: true })).toBe('Aaron');
    expect(normalizeKey('25', { strongsPadding: false })).toBe('25');
    expect(foldKey('ἀγαπάω')).toBe('ΑΓΑΠΑΩ');
  });
});

describe('SwordLD zLD', () => {
  const files = zld(
    [[AARON, ABADDON], ['@LINK AARON']],
    [
      ['AARON', { block: 0, entry: 0 }],
      ['ABADDON', { block: 0, entry: 1 }],
      ['ABBA', '@LINK ABADDON'],
      ['AHARON', { block: 1, entry: 0 }],
    ],
  );
  const ld = new SwordLD(files, 'zLD');

  it('reads keys and entries through padded zlib blocks', () => {
    expect(ld.count).toBe(4);
    expect(ld.keys()).toEqual(['AARON', 'ABADDON', 'ABBA', 'AHARON']);
    expect(ld.text(0)).toBe(AARON);
    expect(ld.get('abaddon')).toBe(ABADDON);
  });

  it('resolves @LINK in the .dat payload and in the stored text', () => {
    expect(ld.linkOf(2)).toBe('ABADDON');
    expect(ld.text(2)).toBe(ABADDON);
    expect(ld.linkOf(3)).toBe('AARON');
    expect(ld.text(3)).toBe(AARON);
    expect([...ld.entries()].map((e) => e.link ?? '')).toEqual(['', '', 'ABADDON', 'AARON']);
  });

  it('finds keys exactly, normalized, or accent-folded', () => {
    expect(ld.find('AARON')).toBe(0);
    expect(ld.find('Abba')).toBe(2);
    expect(ld.find('MOSES')).toBeNull();
  });

  it('opens a module from its package files', () => {
    const conf = '[Easton]\nDataPath=./modules/lexdict/zld/easton/easton\nModDrv=zLD\nSourceType=TEI\nEncoding=UTF-8\nCompressType=ZIP\nDistributionLicense=Public Domain\n';
    const pkg = new Map<string, Buffer>([
      ['mods.d/easton.conf', Buffer.from(conf)],
      ['modules/lexdict/zld/easton/easton.idx', files.idx],
      ['modules/lexdict/zld/easton/easton.dat', files.dat],
      ['modules/lexdict/zld/easton/easton.zdx', files.zdx],
      ['modules/lexdict/zld/easton/easton.zdt', files.zdt],
    ]);
    const { conf: c, driver, module } = openLDModule(pkg);
    expect(c.name).toBe('Easton');
    expect(driver).toBe('zLD');
    expect(module.get('AARON')).toBe(AARON);
  });
});

describe('SwordLD RawLD / RawLD4', () => {
  it('reads 6-byte index records; the key ends at the backslash', () => {
    const ld = new SwordLD(rawld([['00430', H430], ['00431', '@LINK 00430']]), 'RawLD', { encoding: 'windows-1252' });
    expect(ld.keys()).toEqual(['00430', '00431']);
    expect(ld.text(0)).toBe(H430);
    expect(ld.get('430')).toBe(H430);
    expect(ld.text(1)).toBe(H430);
  });

  it('reads 8-byte index records and windows-1252 text', () => {
    const ld = new SwordLD(rawld([['AARON', 'Moses\x92 brother']], true), 'RawLD4', { encoding: 'windows-1252' });
    expect(ld.text(0)).toBe('Moses’ brother');
  });

  it('rejects an index of the wrong size', () => {
    expect(() => new SwordLD({ idx: Buffer.alloc(7), dat: Buffer.alloc(0) }, 'RawLD')).toThrow();
  });
});
