import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { crc32, deflateRawSync, deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import {
  buildLayout,
  chapterGroups,
  confText,
  confValue,
  findGaps,
  kjvLayout,
  openModule,
  parseCanonH,
  parseConf,
  readZip,
  ZVerse,
} from './sword-text';

// A toy module: Genesis with chapters of 3 and 2 verses (OT), Matthew with one chapter of 2 verses (NT).
const layout = buildLayout([
  { osis: 'Gen', testament: 1, verses: [3, 2] },
  { osis: 'Matt', testament: 2, verses: [2] },
]);

/** Builds .bzs/.bzv/.bzz buffers; each block gets 16 bytes of NUL padding like real modules. */
function makeFiles(blocks: string[], entries: [number, number, number][], entrySize: 10 | 12) {
  const zz: Buffer[] = [];
  const zs = Buffer.alloc(blocks.length * 12);
  let off = 0;
  blocks.forEach((b, i) => {
    const comp = Buffer.concat([deflateSync(Buffer.from(b)), Buffer.alloc(16)]);
    zs.writeUInt32LE(off, i * 12);
    zs.writeUInt32LE(comp.length, i * 12 + 4);
    zs.writeUInt32LE(Buffer.byteLength(b), i * 12 + 8);
    zz.push(comp);
    off += comp.length;
  });
  const zv = Buffer.alloc(entries.length * entrySize);
  entries.forEach(([block, start, size], i) => {
    zv.writeUInt32LE(block, i * entrySize);
    zv.writeUInt32LE(start, i * entrySize + 4);
    if (entrySize === 10) zv.writeUInt16LE(size, i * entrySize + 8);
    else zv.writeUInt32LE(size, i * entrySize + 8);
  });
  return { bzs: zs, bzv: zv, bzz: Buffer.concat(zz) };
}

const OT_BLOCK = 'Intro.Gen1:1 text.Gen1:2-3 linked.ORPHAN 3. a comment no slot points to.Gen2:1.';
const at = (t: string): [number, number, number] => [0, OT_BLOCK.indexOf(t), t.length];
const otEntries: [number, number, number][] = [
  [0, 0, 0], // module heading
  [0, 0, 0], // testament heading
  at('Intro.'), // Gen book heading
  [0, 0, 0], // Gen 1 heading
  at('Gen1:1 text.'), // 1:1
  at('Gen1:2-3 linked.'), // 1:2 ┐ linked
  at('Gen1:2-3 linked.'), // 1:3 ┘
  [0, 0, 0], // Gen 2 heading
  at('Gen2:1.'), // 2:1
  [0, 0, 0], // 2:2
];

describe('verse-index layout', () => {
  it('numbers slots like libsword (headings, then verses per chapter)', () => {
    expect(layout.slots).toEqual({ 1: 10, 2: 6 });
    expect(layout.books[0]).toMatchObject({ code: 'GEN', bookSlot: 2, chapterSlots: [3, 7] });
    expect(layout.books[1]).toMatchObject({ code: 'MAT', bookSlot: 2, chapterSlots: [3] });
  });

  it('matches the known KJV slot numbers', () => {
    const kjv = kjvLayout();
    expect(kjv.slots).toEqual({ 1: 24115, 2: 8246 });
    const mod = new ZVerse({}, 10, kjv);
    expect(mod.slot('GEN', 1, 1)).toEqual({ t: 1, idx: 4 });
    expect(mod.slot('GEN', 0, 0)).toEqual({ t: 1, idx: 2 });
    expect(mod.slot('PSA', 3, 1)).toEqual({ t: 1, idx: 14460 });
    expect(mod.slot('MAT', 1, 1)).toEqual({ t: 2, idx: 4 });
    expect(mod.slot('JHN', 3, 16)).toEqual({ t: 2, idx: 3068 });
    expect(mod.slot('MAL', 4, 6)).toEqual({ t: 1, idx: 24114 });
    expect(() => mod.slot('JHN', 3, 37)).toThrow(/outside/);
  });
});

describe('ZVerse', () => {
  for (const size of [10, 12] as const) {
    it(`reads ${size === 10 ? 'zText/zCom' : 'zText4/zCom4'} entries through padded zlib blocks`, () => {
      const mod = new ZVerse(
        { 1: makeFiles([OT_BLOCK], otEntries, size), 2: makeFiles(['Matt1:1.'], [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 8], [0, 0, 0]], size) },
        size,
        layout,
      );
      expect(mod.verse('GEN', 1, 1)).toBe('Gen1:1 text.');
      expect(mod.verse('GEN', 1, 3)).toBe('Gen1:2-3 linked.');
      expect(mod.verse('GEN', 0, 0)).toBe('Intro.');
      expect(mod.verse('GEN', 2, 2)).toBe('');
      expect(mod.verse('MAT', 1, 1)).toBe('Matt1:1.');
      expect(mod.verses('GEN', 1)).toBe(3);
    });
  }

  it('rejects a verse index whose size does not fit the versification', () => {
    expect(() => new ZVerse({ 1: makeFiles([OT_BLOCK], otEntries.slice(0, 9), 10) }, 10, layout)).toThrow(/expected 10 × 10/);
  });

  it('groups linked slots into ranges and finds orphaned text', () => {
    const mod = new ZVerse({ 1: makeFiles([OT_BLOCK], otEntries, 12) }, 12, layout);
    expect(chapterGroups(mod, 'GEN', 1).map((g) => [g.start, g.end])).toEqual([
      [1, 1],
      [2, 3],
    ]);
    const gaps = findGaps(mod, 1);
    expect(gaps).toHaveLength(1);
    expect(OT_BLOCK.slice(gaps[0].start, gaps[0].end)).toBe('ORPHAN 3. a comment no slot points to.');
    expect(gaps[0].afterIdx).toBe(6); // after Gen 1:3, the last slot of the linked range
    expect(gaps[0].beforeIdx).toBe(8);
  });
});

describe('conf and canon.h', () => {
  it('parses confs with repeated keys, continuation lines, and RTF markup', () => {
    const conf = parseConf(
      [
        '[KJV]',
        'DataPath=./modules/texts/ztext/kjv/',
        'GlobalOptionFilter=OSISFootnotes',
        'GlobalOptionFilter=OSISHeadings',
        'About=This is the King James Version.  The rights to the base text are held by the Crown of England.\\par  Second\\',
        'line continues',
        'DistributionLicense=GPL',
      ].join('\n'),
    );
    expect(conf.name).toBe('KJV');
    expect(conf.values.GlobalOptionFilter).toEqual(['OSISFootnotes', 'OSISHeadings']);
    expect(confValue(conf, 'DistributionLicense')).toBe('GPL');
    expect(confText(conf.values.About[0])).toBe(
      'This is the King James Version.  The rights to the base text are held by the Crown of England.\nSecond\nline continues',
    );
  });

  it('reads book lists and verse counts from canon.h', () => {
    const src = [
      'struct sbook otbooks[] = {',
      '  {"Genesis", "Gen", "Gen", 2},',
      '  {"", "", "", 0}',
      '};',
      'struct sbook ntbooks[] = {',
      '  {"Jude", "Jude", "Jude", 1},',
      '  {"", "", "", 0}',
      '};',
      'int vm[] = {',
      '  // Genesis',
      '  31, 25,',
      '  // Jude',
      '  25',
      '};',
    ].join('\n');
    expect(parseCanonH(src)).toEqual([
      { name: 'Genesis', osis: 'Gen', testament: 1, verses: [31, 25] },
      { name: 'Jude', osis: 'Jude', testament: 2, verses: [25] },
    ]);
  });
});

/** A minimal zip writer (stored and deflated entries) for testing readZip. */
function makeZip(files: Record<string, { data: Buffer; deflate: boolean }>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, { data, deflate }] of Object.entries(files)) {
    const body = deflate ? deflateRawSync(data) : data;
    const n = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(n.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(deflate ? 8 : 0, 10);
    central.writeUInt32LE(crc32(data), 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(n.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, n, body);
    centrals.push(central, n);
    offset += 30 + n.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(files).length, 8);
  eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

describe('readZip and openModule', () => {
  it('unpacks stored and deflated entries and opens the module they hold', () => {
    const conf = '[Toy]\nDataPath=./modules/texts/ztext/toy/\nModDrv=zText\nBlockType=BOOK\nCompressType=ZIP\nEncoding=UTF-8\n';
    const ot = makeFiles([OT_BLOCK], otEntries, 10);
    const zip = makeZip({
      'mods.d/toy.conf': { data: Buffer.from(conf), deflate: false },
      'modules/texts/ztext/toy/ot.bzs': { data: ot.bzs, deflate: true },
      'modules/texts/ztext/toy/ot.bzv': { data: ot.bzv, deflate: true },
      'modules/texts/ztext/toy/ot.bzz': { data: ot.bzz, deflate: false },
    });
    const files = readZip(zip);
    expect([...files.keys()]).toHaveLength(4);
    const { conf: parsed, driver, module } = openModule(files, layout);
    expect(parsed.name).toBe('Toy');
    expect(driver).toBe('zText');
    expect(module.has(1) && !module.has(2)).toBe(true);
    expect(module.verse('GEN', 1, 1)).toBe('Gen1:1 text.');
  });

  it('detects a corrupted zip entry', () => {
    const zip = makeZip({ 'a.txt': { data: Buffer.from('hello'), deflate: false } });
    zip[30 + 5] = 0x48; // first data byte "h" → "H"
    expect(() => readZip(zip)).toThrow(/CRC/);
  });

  const KJV = join(__dirname, '..', '..', '..', '.cache', 'sources', 'crosswire', 'KJV.zip');
  it.skipIf(!existsSync(KJV))('reads John 3:16 from the cached CrossWire KJV package', () => {
    const { module } = openModule(readZip(readFileSync(KJV)));
    const raw = module.verse('JHN', 3, 16);
    expect(raw.startsWith('<q marker="" who="Jesus"><milestone marker="¶" type="x-p"/>')).toBe(true);
    expect(raw).toContain('<w lemma="strong:G25 lemma.TR:ηγαπησεν" morph="robinson:V-AAI-3S" src="3">loved</w>');
  });
});
