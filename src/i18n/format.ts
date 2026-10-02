import { fromCompact, type Ref } from '@/lib/bible/refs';

import { bookAbbr, bookName, bookShort } from './index';

/** "John 3:16", "Romans 8:38–39", "Genesis 1:1–2:3", "Psalms 23". Style "abbr" uses "Rom 8:28". */
export function formatRef(input: Ref | string, style: 'full' | 'abbr' | 'short' = 'full'): string {
  const ref = typeof input === 'string' ? fromCompact(input) : input;
  if (!ref) return String(input);
  const name = style === 'full' ? bookName(ref.book) : style === 'abbr' ? bookAbbr(ref.book) : bookShort(ref.book);
  let s = `${name} ${ref.chapter}`;
  if (ref.verse === undefined) return s;
  s += `:${ref.verse}`;
  if (ref.endChapter !== undefined) s += `–${ref.endChapter}:${ref.endVerse ?? 1}`;
  else if (ref.endVerse !== undefined) s += `–${ref.endVerse}`;
  return s;
}
