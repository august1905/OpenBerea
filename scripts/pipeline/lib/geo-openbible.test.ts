import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import type { BookCode } from '../../../src/lib/bible/books';
import {
  bestLocation,
  type ObAncient,
  type ObModern,
  parseXrefLine,
  placeDisplayName,
  placeSlug,
  placeVerseToKjv,
  readZipEntry,
  xrefTarget,
} from './geo-openbible';
import { isKjvVerse, parseOsisVerse, type VerseMapper } from './versemap';

/** ESV-style → KJV with the one ESV renumbering (3 John 1:15 → 1:14). */
const mapper: VerseMapper = {
  scheme: 'esv',
  rules: [{ from: '3JN.1.15', to: '3JN.1.14', kind: 'table' }],
  map(book: BookCode, chapter: number, verse: number) {
    if (book === '3JN' && chapter === 1 && verse === 15) return { book, chapter, verse: 14, rule: 'table' };
    return isKjvVerse(book, chapter, verse) ? { book, chapter, verse } : null;
  },
  mapOsis(osis: string) {
    const r = parseOsisVerse(osis);
    return r ? this.map(r.book, r.chapter, r.verse) : null;
  },
};

// Trimmed records from data/ancient.jsonl and data/modern.jsonl (commit 7eb18a5e).
const bethlehem: ObAncient = {
  id: 'a112427',
  friendly_id: 'Bethlehem 1',
  url_slug: 'bethlehem-1',
  types: ['settlement'],
  identifications: [
    {
      id: 'm9b8daa',
      score: { time_total: 1000 },
      resolutions: [{ lonlat: '35.207639,31.704306', lonlat_type: 'point', type: 'settlement', modern_basis_id: 'm9b8daa' }],
    },
  ],
  modern_associations: { m9b8daa: { score: 1000 } },
};
const eden: ObAncient = {
  id: 'af3daeb',
  friendly_id: 'Eden 1',
  url_slug: 'eden-1',
  types: ['garden', 'special'],
  identifications: [
    { special: 'unknown_place', score: { time_total: 447 }, resolutions: [{ type: 'special', special: 'unknown_place' }] },
    {
      id: 'm47cd69',
      score: { time_total: 178 },
      resolutions: [{ lonlat: '44.950000,40.383333', lonlat_type: 'representative point', type: 'garden', modern_basis_id: 'm47cd69' }],
    },
  ],
};
const bethDagon: ObAncient = {
  id: 'a561af4',
  friendly_id: 'Beth-dagon 1',
  url_slug: 'beth-dagon-1',
  types: ['settlement'],
  identifications: [
    {
      id: 'md7e418',
      score: { time_total: 261 },
      resolutions: [{ lonlat: '34.808618,31.983580', lonlat_type: 'point', type: 'settlement', modern_basis_id: 'md7e418' }],
    },
  ],
  modern_associations: { m73c038: { score: 45 }, m756fb4: { score: 44 }, md7e418: { score: 261 } },
};
const bozez: ObAncient = {
  id: 'a0bozez',
  friendly_id: 'Bozez',
  types: ['cliff'],
  identifications: [{ score: { time_total: 1011 }, resolutions: [{ lonlat: '35.287147,31.857165', type: 'cliff', modern_basis_id: 'm0df275' }] }],
  modern_associations: { m0df275: { score: 1011 } },
};
const modern = new Map<string, ObModern>([['md7e418', { id: 'md7e418', friendly_id: 'Khirbet Dajun', custom_lonlat: '34.808016,31.984040' }]]);

describe('places', () => {
  it('derives URL-safe ids and display names from friendly_id', () => {
    expect(placeSlug('Bethlehem 1')).toBe('bethlehem-1');
    expect(placeSlug('Abel-beth-maacah')).toBe('abel-beth-maacah');
    expect(placeSlug("Solomon's Portico")).toBe('solomons-portico');
    expect(placeSlug('Bené-berak')).toBe('bene-berak');
    expect(placeDisplayName('Bethlehem 1')).toBe('Bethlehem');
    expect(placeDisplayName('Mount Sinai')).toBe('Mount Sinai');
  });

  it('takes the top identification and its first coordinates', () => {
    expect(bestLocation(bethlehem, modern)).toEqual({
      ok: true, lon: 35.207639, lat: 31.704306, type: 'settlement', score: 1000, clamped: undefined, lonlatType: 'point', custom: false,
    });
  });

  it('does not fall through to a lower identification', () => {
    expect(bestLocation(eden, modern)).toEqual({ ok: false, reason: 'unknown_place' });
  });

  it('substitutes custom_lonlat and uses the association score', () => {
    const b = bestLocation(bethDagon, modern);
    expect(b).toMatchObject({ ok: true, lon: 34.808016, lat: 31.98404, score: 261, custom: true });
  });

  it('clamps scores to 0–1000', () => {
    expect(bestLocation(bozez, modern)).toMatchObject({ ok: true, score: 1000, clamped: 1011 });
  });

  it("uses OpenBible's KJV alternate verse, else maps the ESV-numbered verse", () => {
    // Arimathea: named in Luke 23:50 in the ESV but in 23:51 in the KJV.
    const v = { osis: 'Luke.23.50', alternate_verses: { kjv: 'Luke.23.51', niv: 'Luke.23.51' } };
    expect(placeVerseToKjv(v, mapper)).toEqual({ verse: { book: 'LUK', chapter: 23, verse: 51 }, viaAlternate: true });
    expect(placeVerseToKjv({ osis: '3John.1.15' }, mapper).verse).toMatchObject({ book: '3JN', chapter: 1, verse: 14, rule: 'table' });
  });
});

describe('cross-references', () => {
  it('parses rows (copied from cross_references.txt)', () => {
    expect(parseXrefLine('From Verse\tTo Verse\tVotes\t#www.openbible.info CC-BY 2026-09-28')).toBeNull();
    expect(parseXrefLine('Gen.1.1\tProv.8.22-Prov.8.30\t76')).toEqual({ from: 'Gen.1.1', to: 'Prov.8.22-Prov.8.30', votes: 76 });
    expect(parseXrefLine('John.3.16\tRom.5.8\t984\r')).toEqual({ from: 'John.3.16', to: 'Rom.5.8', votes: 984 });
    expect(parseXrefLine('')).toBeNull();
    expect(() => parseXrefLine('Gen.1.1\tGen.1.2\tx')).toThrow();
  });

  it('maps targets to compact KJV refs', () => {
    expect(xrefTarget('Rom.5.8', mapper)).toEqual({ refs: ['ROM.5.8'], mapped: false, crossBook: false });
    expect(xrefTarget('1John.4.9-1John.4.10', mapper)?.refs).toEqual(['1JN.4.9-10']);
    expect(xrefTarget('Gen.11.32-Gen.12.1', mapper)?.refs).toEqual(['GEN.11.32-12.1']);
    expect(xrefTarget('3John.1.13-3John.1.15', mapper)).toEqual({ refs: ['3JN.1.13-14'], mapped: true, crossBook: false });
    expect(xrefTarget('3John.1.14-3John.1.15', mapper)?.refs).toEqual(['3JN.1.14']);
  });

  it('splits ranges that cross books', () => {
    expect(xrefTarget('2Chr.36.22-Ezra.1.3', mapper)).toEqual({ refs: ['2CH.36.22-23', 'EZR.1.1-3'], mapped: false, crossBook: true });
    expect(xrefTarget('Lev.27.34-Num.1.1', mapper)?.refs).toEqual(['LEV.27.34', 'NUM.1.1']);
    expect(xrefTarget('Hag.2.20-Zech.1.1', mapper)?.refs).toEqual(['HAG.2.20-23', 'ZEC.1.1']);
  });

  it('rejects unknown verses and reversed ranges', () => {
    expect(xrefTarget('Mal.4.7', mapper)).toBeNull();
    expect(xrefTarget('Gen.2.3-Gen.1.1', mapper)).toBeNull();
  });
});

describe('readZipEntry', () => {
  // A one-entry zip built in the same layout as cross-references.zip (deflate, central directory).
  function makeZip(name: string, content: Buffer): Buffer {
    const data = deflateRawSync(content);
    const nameBuf = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(0, 42);
    const cdOffset = local.length + nameBuf.length + data.length;
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(1, 8);
    eocd.writeUInt16LE(1, 10);
    eocd.writeUInt32LE(central.length + nameBuf.length, 12);
    eocd.writeUInt32LE(cdOffset, 16);
    return Buffer.concat([local, nameBuf, data, central, nameBuf, eocd]);
  }

  it('inflates a named entry', () => {
    const text = 'From Verse\tTo Verse\tVotes\nGen.1.1\tPs.115.15\t82\n';
    const zip = makeZip('cross_references.txt', Buffer.from(text));
    expect(readZipEntry(zip, 'cross_references.txt').toString('utf8')).toBe(text);
    expect(() => readZipEntry(zip, 'missing.txt')).toThrow(/not found/);
  });
});
