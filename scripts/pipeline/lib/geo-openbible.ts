// OpenBible.info helpers: Bible Geocoding Data (places) and the cross-reference file.
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

import { type BookCode, BOOKS, bookInfo } from '../../../src/lib/bible/books';
import { toCompact } from '../../../src/lib/bible/refs';
import { verseCount } from '../../../src/lib/bible/versification';
import type { MappedVerse, VerseMapper, VerseRef } from './versemap';

// ---------------------------------------------------------------------------------------------
// Geocoding records (only the fields we read; see the repo's schemas/ for the full shape)

export interface ObResolution {
  lonlat?: string;
  lonlat_type?: string;
  type?: string;
  modern_basis_id?: string;
  special?: string;
}

export interface ObIdentification {
  id?: string;
  special?: string;
  resolutions?: ObResolution[];
  score?: { time_total?: number };
  types?: string[];
}

export interface ObVerse {
  osis: string;
  translations?: string[];
  alternate_verses?: Record<string, string>;
}

export interface ObAncient {
  id: string;
  friendly_id: string;
  url_slug?: string;
  types: string[];
  identifications: ObIdentification[];
  modern_associations?: Record<string, { score?: number }>;
  verses?: ObVerse[];
  translation_name_counts?: Record<string, number>;
}

export interface ObModern {
  id: string;
  friendly_id?: string;
  custom_lonlat?: string;
}

export function readJsonl<T>(path: string): T[] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as T);
}

/** URL-safe id from a friendly_id: "Bethlehem 1" → "bethlehem-1", "Abel-beth-maacah" → "abel-beth-maacah". */
export function placeSlug(friendlyId: string): string {
  return friendlyId
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Display name without the disambiguating number: "Bethlehem 1" → "Bethlehem". */
export function placeDisplayName(friendlyId: string): string {
  return friendlyId.replace(/\s+\d+$/, '');
}

export type BestLocation =
  | { ok: true; lon: number; lat: number; type: string; score: number; clamped?: number; lonlatType?: string; custom: boolean }
  | { ok: false; reason: string };

/**
 * Best-guess location: the top identification (already sorted by score) and its first resolution
 * with coordinates. `custom_lonlat` on the modern record replaces coordinates that came from a
 * commercial source. When the top identification has no coordinates (unknown_place, not_a_place,
 * …) the place is not plottable; we never fall through to a lower identification.
 */
export function bestLocation(a: ObAncient, modern: ReadonlyMap<string, ObModern>): BestLocation {
  const top = a.identifications[0];
  if (!top) return { ok: false, reason: 'no identification' };
  const res = (top.resolutions ?? []).find((r) => r.lonlat);
  if (!res?.lonlat) {
    const special = top.special ?? top.resolutions?.find((r) => r.special)?.special ?? 'no coordinates';
    return { ok: false, reason: special };
  }
  const m = res.modern_basis_id ? modern.get(res.modern_basis_id) : undefined;
  const ll = m?.custom_lonlat ?? res.lonlat;
  const [lon, lat] = ll.split(',').map(Number);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return { ok: false, reason: `bad lonlat ${ll}` };
  const assoc = res.modern_basis_id ? a.modern_associations?.[res.modern_basis_id]?.score : undefined;
  const raw = Math.round(assoc ?? top.score?.time_total ?? 0);
  // The score is a fitted trend over time and can overshoot (1011, 1169, -76); the scale is 0–1000.
  const score = Math.max(0, Math.min(1000, raw));
  return {
    ok: true,
    lon,
    lat,
    type: res.type ?? a.types[0] ?? 'place',
    score,
    clamped: score !== raw ? raw : undefined,
    lonlatType: res.lonlat_type,
    custom: !!m?.custom_lonlat,
  };
}

/**
 * KJV verse for a place-verse link. `alternate_verses.kjv` names the verse where the KJV itself
 * names the place when that differs (Luke 23:50 → 23:51 for Arimathea); otherwise the ESV-numbered
 * osis is mapped to KJV numbering.
 */
export function placeVerseToKjv(v: ObVerse, mapper: VerseMapper): { verse: MappedVerse | null; viaAlternate: boolean } {
  const alt = v.alternate_verses?.kjv;
  if (alt) {
    const r = mapper.mapOsis(alt);
    return { verse: r ? { book: r.book, chapter: r.chapter, verse: r.verse } : null, viaAlternate: true };
  }
  return { verse: mapper.mapOsis(v.osis), viaAlternate: false };
}

// ---------------------------------------------------------------------------------------------
// Cross-references

export interface XrefRow {
  from: string;
  to: string;
  votes: number;
}

/** Parses "Gen.1.1\tProv.8.22-Prov.8.30\t76"; returns null for the header and blank lines. */
export function parseXrefLine(line: string): XrefRow | null {
  const c = line.replace(/\r$/, '').split('\t');
  if (c.length < 3 || c[0] === 'From Verse' || !c[0]) return null;
  const votes = Number(c[2]);
  if (!Number.isInteger(votes)) throw new Error(`Bad votes in cross-reference line: ${line}`);
  return { from: c[0], to: c[1], votes };
}

function lastVerseOf(book: BookCode): VerseRef {
  const ch = bookInfo(book).chapters;
  return { book, chapter: ch, verse: verseCount(book, ch) };
}

function rangeCompact(a: VerseRef, b: VerseRef): string {
  if (a.chapter === b.chapter && a.verse === b.verse) return toCompact({ book: a.book, chapter: a.chapter, verse: a.verse });
  if (a.chapter === b.chapter) return toCompact({ book: a.book, chapter: a.chapter, verse: a.verse, endVerse: b.verse });
  return toCompact({ book: a.book, chapter: a.chapter, verse: a.verse, endChapter: b.chapter, endVerse: b.verse });
}

export interface XrefTarget {
  /** Compact KJV refs; more than one when the source range crosses books ("2Chr.36.22-Ezra.1.3"). */
  refs: string[];
  /** Some end of the ref was renumbered. */
  mapped: boolean;
  crossBook: boolean;
}

/** Maps an OpenBible "To Verse" (single verse or "A-B" range of full OSIS refs) to KJV compact refs. */
export function xrefTarget(to: string, mapper: VerseMapper): XrefTarget | null {
  const [s, e, extra] = to.split('-');
  if (extra !== undefined) return null;
  const a = mapper.mapOsis(s);
  const b = e === undefined ? a : mapper.mapOsis(e);
  if (!a || !b) return null;
  const mapped = !!(a.rule || b.rule);
  const ia = bookInfo(a.book).index;
  const ib = bookInfo(b.book).index;
  if (ia > ib || (ia === ib && (b.chapter < a.chapter || (b.chapter === a.chapter && b.verse < a.verse)))) return null;
  if (ia === ib) return { refs: [rangeCompact(a, b)], mapped, crossBook: false };
  // Compact refs can't cross books: one range per book.
  const refs = [rangeCompact(a, lastVerseOf(a.book))];
  for (let i = ia + 1; i < ib; i++) {
    const book = BOOKS[i - 1].code;
    refs.push(rangeCompact({ book, chapter: 1, verse: 1 }, lastVerseOf(book)));
  }
  refs.push(rangeCompact({ book: b.book, chapter: 1, verse: 1 }, b));
  return { refs, mapped, crossBook: true };
}

// ---------------------------------------------------------------------------------------------
// Minimal ZIP reader (stored or deflated entries), so the pinned zip is the only input.

export function readZipEntry(zip: Buffer, name: string): Buffer {
  // End of central directory record: signature 0x06054b50 within the last 64 KB.
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('ZIP: end of central directory not found');
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error('ZIP: bad central directory entry');
    const method = zip.readUInt16LE(p + 10);
    const compSize = zip.readUInt32LE(p + 20);
    const size = zip.readUInt32LE(p + 24);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const localOffset = zip.readUInt32LE(p + 42);
    const entryName = zip.toString('utf8', p + 46, p + 46 + nameLen);
    if (entryName === name) {
      if (zip.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('ZIP: bad local header');
      const start = localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28);
      const data = zip.subarray(start, start + compSize);
      const out = method === 0 ? Buffer.from(data) : method === 8 ? inflateRawSync(data) : null;
      if (!out) throw new Error(`ZIP: unsupported compression method ${method}`);
      if (out.length !== size) throw new Error(`ZIP: ${name} inflated to ${out.length} bytes, expected ${size}`);
      return out;
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`ZIP: entry ${name} not found`);
}
