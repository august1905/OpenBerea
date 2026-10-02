// Standard book codes (USFM/Paratext), in Protestant canonical order, with chapter counts.
// Display names live in the translation files (src/i18n), not here.

export const BOOK_CODES = [
  'GEN', 'EXO', 'LEV', 'NUM', 'DEU', 'JOS', 'JDG', 'RUT', '1SA', '2SA',
  '1KI', '2KI', '1CH', '2CH', 'EZR', 'NEH', 'EST', 'JOB', 'PSA', 'PRO',
  'ECC', 'SNG', 'ISA', 'JER', 'LAM', 'EZK', 'DAN', 'HOS', 'JOL', 'AMO',
  'OBA', 'JON', 'MIC', 'NAM', 'HAB', 'ZEP', 'HAG', 'ZEC', 'MAL',
  'MAT', 'MRK', 'LUK', 'JHN', 'ACT', 'ROM', '1CO', '2CO', 'GAL', 'EPH',
  'PHP', 'COL', '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB', 'JAS',
  '1PE', '2PE', '1JN', '2JN', '3JN', 'JUD', 'REV',
] as const;

export type BookCode = (typeof BOOK_CODES)[number];

const CHAPTER_COUNTS: readonly number[] = [
  50, 40, 27, 36, 34, 24, 21, 4, 31, 24,
  22, 25, 29, 36, 10, 13, 10, 42, 150, 31,
  12, 8, 66, 52, 5, 48, 12, 14, 3, 9,
  1, 4, 7, 3, 3, 3, 2, 14, 4,
  28, 16, 24, 21, 28, 16, 16, 13, 6, 6,
  4, 4, 5, 3, 6, 4, 3, 1, 13, 5,
  5, 3, 5, 1, 1, 1, 22,
];

export interface BookInfo {
  code: BookCode;
  /** 1-based canonical position (GEN = 1, REV = 66). */
  index: number;
  testament: 'OT' | 'NT';
  chapters: number;
}

export const BOOKS: readonly BookInfo[] = BOOK_CODES.map((code, i) => ({
  code,
  index: i + 1,
  testament: i < 39 ? 'OT' : 'NT',
  chapters: CHAPTER_COUNTS[i],
}));

const byCode = new Map<string, BookInfo>(BOOKS.map((b) => [b.code, b]));

export function isBookCode(value: string): value is BookCode {
  return byCode.has(value);
}

export function bookInfo(code: BookCode): BookInfo {
  return byCode.get(code)!;
}

/** Accepts any letter case, e.g. "jhn" → "JHN". */
export function toBookCode(value: string | undefined | null): BookCode | null {
  if (!value) return null;
  const upper = value.toUpperCase();
  return isBookCode(upper) ? upper : null;
}

export function bookByIndex(index: number): BookInfo | undefined {
  return BOOKS[index - 1];
}

export const TOTAL_CHAPTERS = CHAPTER_COUNTS.reduce((a, b) => a + b, 0);

/** Next/previous chapter across book boundaries, or null at the ends of the Bible. */
export function adjacentChapter(
  book: BookCode,
  chapter: number,
  dir: 1 | -1,
): { book: BookCode; chapter: number } | null {
  const info = bookInfo(book);
  const next = chapter + dir;
  if (next >= 1 && next <= info.chapters) return { book, chapter: next };
  const other = bookByIndex(info.index + dir);
  if (!other) return null;
  return { book: other.code, chapter: dir === 1 ? 1 : other.chapters };
}
