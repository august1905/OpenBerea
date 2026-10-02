import type { AudioBook } from '@/lib/data/types';

/** The recordings that cover a chapter (usually one; a long chapter can be split across two). */
export function filesForChapter(book: AudioBook | undefined, chapter: number) {
  return book?.files.filter((f) => f.from <= chapter && chapter <= f.to) ?? [];
}
