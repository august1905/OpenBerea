// Hebrew (Masoretic) verse numbers → KJV verse numbers, for Hebrew lexicons that cite the Hebrew Bible
// in its own numbering (BDB, Gesenius).
//
// Built from the KJV-numbered original-language chapters of the "orig" stage
// (stepbible/orig/{BOOK}/{ch}.json): every OT verse there carries its Hebrew number in `src` when it
// differs ("18:1", "3:19", "10:4-5", "25:19-26:1"). Verse 0 is a Psalm title.
//
// When one Hebrew verse is spread over two KJV verses (Ps 11:1 = KJV title + 11:1; Ps 13:6 = KJV
// 13:5-6), the Hebrew verse maps to one KJV verse, chosen in this order: a real verse before a title,
// then a verse whose `src` names the Hebrew verse explicitly, then the lower KJV verse.

import type { BookCode } from '../../../src/lib/bible/books';

export interface KjvVerse {
  chapter: number;
  /** 0 = Psalm title. */
  verse: number;
}

interface Candidate extends KjvVerse {
  explicit: boolean;
}

/** Hebrew verses named by a `src` value: "18:1", "10:4-5" (same chapter), "25:19-26:1" (both ends). */
export function parseSrc(src: string): [number, number][] | null {
  let m = /^(\d+):(\d+)$/.exec(src);
  if (m) return [[Number(m[1]), Number(m[2])]];
  m = /^(\d+):(\d+)-(\d+)$/.exec(src);
  if (m) {
    const out: [number, number][] = [];
    for (let v = Number(m[2]); v <= Number(m[3]); v++) out.push([Number(m[1]), v]);
    return out.length ? out : null;
  }
  m = /^(\d+):(\d+)-(\d+):(\d+)$/.exec(src);
  if (m) return [[Number(m[1]), Number(m[2])], [Number(m[3]), Number(m[4])]];
  return null;
}

function better(a: Candidate, b: Candidate): boolean {
  if ((a.verse > 0) !== (b.verse > 0)) return a.verse > 0;
  if (a.explicit !== b.explicit) return a.explicit;
  return a.chapter !== b.chapter ? a.chapter < b.chapter : a.verse < b.verse;
}

export interface ChapterLike {
  b: BookCode;
  c: number;
  v: { n: number; src?: string }[];
}

export class MtToKjv {
  private verses = new Map<string, Candidate>();
  /** Hebrew chapter → KJV chapters its verses land in, and the reverse. */
  private toKjvChapters = new Map<string, Set<number>>();
  private fromMtChapters = new Map<string, Set<number>>();
  private books = new Set<BookCode>();
  badSrc: string[] = [];

  addChapter(ch: ChapterLike) {
    this.books.add(ch.b);
    for (const v of ch.v) {
      const hebrew = v.src ? parseSrc(v.src) : [[ch.c, v.n] as [number, number]];
      if (!hebrew) {
        this.badSrc.push(`${ch.b}.${ch.c}.${v.n}=${v.src}`);
        continue;
      }
      for (const [hc, hv] of hebrew) {
        const key = `${ch.b}.${hc}.${hv}`;
        const cand: Candidate = { chapter: ch.c, verse: v.n, explicit: !!v.src };
        const old = this.verses.get(key);
        if (!old || better(cand, old)) this.verses.set(key, cand);
        add(this.toKjvChapters, `${ch.b}.${hc}`, ch.c);
        add(this.fromMtChapters, `${ch.b}.${ch.c}`, hc);
      }
    }
  }

  hasBook(book: BookCode): boolean {
    return this.books.has(book);
  }

  /** KJV verse for a Hebrew verse, or undefined when the Hebrew Bible has no such verse. */
  verse(book: BookCode, chapter: number, verse: number): KjvVerse | undefined {
    const c = this.verses.get(`${book}.${chapter}.${verse}`);
    return c ? { chapter: c.chapter, verse: c.verse } : undefined;
  }

  /** KJV chapter for a whole Hebrew chapter, only when the two chapters hold exactly the same verses. */
  chapter(book: BookCode, chapter: number): number | undefined {
    const to = this.toKjvChapters.get(`${book}.${chapter}`);
    if (!to || to.size !== 1) return undefined;
    const kjv = [...to][0];
    const from = this.fromMtChapters.get(`${book}.${kjv}`);
    return from && from.size === 1 && from.has(chapter) ? kjv : undefined;
  }

  get size() {
    return this.verses.size;
  }
}

function add(map: Map<string, Set<number>>, key: string, value: number) {
  let s = map.get(key);
  if (!s) map.set(key, (s = new Set()));
  s.add(value);
}
