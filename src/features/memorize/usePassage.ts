import type { Ref } from '@/lib/bible/refs';
import { toCompact } from '@/lib/bible/refs';
import { type DataState, loadData, useLoad } from '@/lib/data/fetch';
import type { ChapterText, TranslationId } from '@/lib/data/types';

import { segsText } from '../reader/Segments';
import { buildPassage, chaptersOf, type Passage } from './passage';

/** Loads the chapters a ref spans in one translation and keeps the verses it covers. */
export function usePassage(ref: Ref | null, tr: TranslationId): DataState<Passage> {
  const key = ref ? `mem:${tr}:${toCompact(ref)}` : null;
  return useLoad(key, async () => {
    if (!ref) throw new Error('No passage');
    const chapters = await Promise.all(chaptersOf(ref).map((c) => loadData<ChapterText>(`${tr}/${ref.book}/${c}.json`)));
    return buildPassage(chapters, ref, tr, segsText);
  });
}
