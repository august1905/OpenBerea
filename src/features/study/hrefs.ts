import type { BookCode } from '@/lib/bible/books';
import type { CommentaryId, DictionaryId } from '@/lib/data/types';

// URL builders for the study tools. Book segments are lower case, like the reader's.

const seg = (book: BookCode, chapter: number) => `${book.toLowerCase()}/${chapter}`;

function query(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : '';
}

export function crossrefsHref(book: BookCode, chapter: number, v?: number): string {
  return `/study/crossrefs/${seg(book, chapter)}${query({ v })}`;
}

export function commentaryHref(book: BookCode, chapter: number, opts: { c?: CommentaryId; v?: number } = {}): string {
  return `/study/commentary/${seg(book, chapter)}${query({ c: opts.c, v: opts.v })}`;
}

export function inductiveHref(book: BookCode, chapter: number, from?: number, to?: number): string {
  return `/study/inductive/${seg(book, chapter)}${query({ from, to })}`;
}

export function variantsHref(book: BookCode, chapter: number, v?: number): string {
  return `/study/variants/${seg(book, chapter)}${query({ v })}`;
}

export function dictionaryHref(opts: { d?: DictionaryId; l?: string; q?: string } = {}): string {
  return `/study/dictionary${query(opts)}`;
}

export function dictEntryHref(dict: DictionaryId, id: string): string {
  if (dict === 'nave') return topicHref(id);
  return `/study/dictionary/${dict}/${encodeURIComponent(id)}`;
}

export function topicsHref(opts: { l?: string; q?: string } = {}): string {
  return `/study/topics${query(opts)}`;
}

export function topicHref(id: string): string {
  return `/study/topics/${encodeURIComponent(id)}`;
}
