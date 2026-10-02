import type { BookCode } from '@/lib/bible/books';
import { fromCompact, type Ref, toCompact } from '@/lib/bible/refs';

// URL builders. Books appear in lower case ("/read/jhn/3"). The URL is the source of truth for the
// current passage, so back/forward and direct links work (spec: Technical architecture → State).

export type ReadVersion = 'kjv' | 'asv' | 'par' | 'orig';

export function readHref(book: BookCode, chapter: number, opts: { tr?: ReadVersion; v?: number } = {}): string {
  const q = new URLSearchParams();
  if (opts.tr && opts.tr !== 'kjv') q.set('tr', opts.tr);
  if (opts.v) q.set('v', String(opts.v));
  const qs = q.toString();
  return `/read/${book.toLowerCase()}/${chapter}${qs ? `?${qs}` : ''}`;
}

export function refHref(ref: Ref | string, tr?: ReadVersion): string {
  const r = typeof ref === 'string' ? fromCompact(ref) : ref;
  if (!r) return '/';
  return readHref(r.book, r.chapter, { tr, v: r.verse });
}

export function interlinearHref(book: BookCode, chapter: number, v?: number): string {
  return `/interlinear/${book.toLowerCase()}/${chapter}${v ? `?v=${v}` : ''}`;
}

export function wordHref(strongs: string): string {
  return `/word/${strongs}`;
}

export function searchHref(q?: string): string {
  return q ? `/search?q=${encodeURIComponent(q)}` : '/search';
}

export function passageParam(book: BookCode, chapter: number, verse?: number, endVerse?: number): string {
  return toCompact({ book, chapter, verse, endVerse });
}
