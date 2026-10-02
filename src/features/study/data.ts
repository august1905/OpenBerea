import { useEffect, useRef, useState } from 'react';

import type { BookCode } from '@/lib/bible/books';
import { DataError, loadData, peekData, useData } from '@/lib/data/fetch';
import type { ChapterText, DictBucket, DictEntry, DictIndex, DictionaryId } from '@/lib/data/types';

import { batches, chapterPath, PREVIEW_BATCH, previewChapters } from './crossrefs';
import { findEntry } from './dictionary';

// Data paths and loaders for the study tools. Files are listed in src/lib/data/types.ts.

export const studyPaths = {
  kjv: (book: BookCode, chapter: number) => `kjv/${book}/${chapter}.json`,
  tsk: (book: BookCode, chapter: number) => `tsk/${book}/${chapter}.json`,
  openbible: (book: BookCode, chapter: number) => `openbible-xref/${book}/${chapter}.json`,
  commentary: (id: string, book: BookCode, chapter: number) => `comm/${id}/${book}/${chapter}.json`,
  variants: (book: BookCode, chapter: number) => `stepbible/variants/${book}/${chapter}.json`,
  orig: (book: BookCode, chapter: number) => `stepbible/orig/${book}/${chapter}.json`,
  dictIndex: (dict: DictionaryId) => `dict/${dict}/index.json`,
  dictBucket: (dict: DictionaryId, bucket: number) => `dict/${dict}/${bucket}.json`,
};

/** True when a load failed because the file doesn't exist (no data for this chapter). */
export function isMissing(error: Error | undefined): boolean {
  return error instanceof DataError && error.status === 404;
}

export type OptionalData<T> = (
  | { status: 'loading'; data?: undefined; error?: undefined }
  | { status: 'ready'; data: T | null; error?: undefined }
  | { status: 'error'; data?: undefined; error: Error }
) & { reload: () => void };

/**
 * Like useData, but a missing file (404) counts as "no data" rather than an error, since many
 * chapters simply have no entries in a source.
 */
export function useOptionalData<T>(path: string | null): OptionalData<T> {
  const state = useData<T>(path);
  if (state.status === 'error' && isMissing(state.error)) return { status: 'ready', data: null, reload: state.reload };
  return state;
}

/** Loads one dictionary entry by id (index row → bucket file). */
export async function loadDictEntry(dict: DictionaryId, id: string): Promise<{ entry: DictEntry | null; index: DictIndex }> {
  const index = await loadData<DictIndex>(studyPaths.dictIndex(dict));
  const row = findEntry(index, id);
  if (!row) return { entry: null, index };
  const bucket = await loadData<DictBucket>(studyPaths.dictBucket(dict, row[2]));
  return { entry: bucket[row[0]] ?? null, index };
}

/**
 * KJV chapters for previewing refs, loaded lazily and a batch at a time; previews fill in as each
 * batch arrives. Chapters already loaded this visit are available at once.
 */
export function usePreviewChapters(refs: string[]): Map<string, ChapterText> {
  const keys = previewChapters(refs);
  const signature = keys.join(',');
  const [loaded, setLoaded] = useState<Map<string, ChapterText>>(() => {
    const m = new Map<string, ChapterText>();
    for (const k of keys) {
      const known = peekData<ChapterText>(chapterPath(k));
      if (known) m.set(k, known);
    }
    return m;
  });
  const loadedRef = useRef(loaded);
  useEffect(() => {
    loadedRef.current = loaded;
  });

  useEffect(() => {
    let alive = true;
    const missing = signature ? signature.split(',').filter((k) => !loadedRef.current.has(k)) : [];
    (async () => {
      for (const group of batches(missing, PREVIEW_BATCH)) {
        const results = await Promise.all(
          group.map((k) =>
            loadData<ChapterText>(chapterPath(k)).then(
              (d) => [k, d] as const,
              () => null,
            ),
          ),
        );
        if (!alive) return;
        setLoaded((prev) => {
          const m = new Map(prev);
          for (const r of results) if (r) m.set(r[0], r[1]);
          return m;
        });
      }
    })();
    return () => {
      alive = false;
    };
  }, [signature]);

  return loaded;
}
