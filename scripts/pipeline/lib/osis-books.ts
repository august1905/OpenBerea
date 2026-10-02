// OSIS book ids (as used by CrossWire SWORD modules) ↔ the app's USFM-style book codes.
import { BOOK_CODES, type BookCode } from '../../../src/lib/bible/books';

/** OSIS ids in KJV canonical order, parallel to BOOK_CODES. */
export const OSIS_BOOKS = [
  'Gen', 'Exod', 'Lev', 'Num', 'Deut', 'Josh', 'Judg', 'Ruth', '1Sam', '2Sam',
  '1Kgs', '2Kgs', '1Chr', '2Chr', 'Ezra', 'Neh', 'Esth', 'Job', 'Ps', 'Prov',
  'Eccl', 'Song', 'Isa', 'Jer', 'Lam', 'Ezek', 'Dan', 'Hos', 'Joel', 'Amos',
  'Obad', 'Jonah', 'Mic', 'Nah', 'Hab', 'Zeph', 'Hag', 'Zech', 'Mal',
  'Matt', 'Mark', 'Luke', 'John', 'Acts', 'Rom', '1Cor', '2Cor', 'Gal', 'Eph',
  'Phil', 'Col', '1Thess', '2Thess', '1Tim', '2Tim', 'Titus', 'Phlm', 'Heb', 'Jas',
  '1Pet', '2Pet', '1John', '2John', '3John', 'Jude', 'Rev',
] as const;

const toCode = new Map<string, BookCode>(OSIS_BOOKS.map((o, i) => [o, BOOK_CODES[i]]));
const toOsis = new Map<BookCode, string>(OSIS_BOOKS.map((o, i) => [BOOK_CODES[i], o]));

/** "John" → "JHN"; null for ids outside the 66-book canon (e.g. "Tob", "Bible"). */
export function osisToBook(osis: string): BookCode | null {
  return toCode.get(osis) ?? null;
}

export function bookToOsis(book: BookCode): string {
  return toOsis.get(book)!;
}
