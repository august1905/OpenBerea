import type { BookCode } from '@/lib/bible/books';
import { loadData } from '@/lib/data/fetch';
import type {
  BaseMap,
  ChapterPlaces,
  ChapterText,
  Harmony,
  Person,
  PersonSummary,
  Place,
  PlaceVerses,
  Ruler,
  TimelineEvent,
} from '@/lib/data/types';

// Paths and loaders for people, places, timelines, the base map, and the gospel harmony. Derived
// lookups (id → record) are built once per loaded file and kept in memory for this visit.

export const PATHS = {
  peopleIndex: 'theographic/people/index.json',
  peopleBucket: (k: number) => `theographic/people/${k}.json`,
  events: 'theographic/timeline/events.json',
  rulers: 'theographic/timeline/rulers.json',
  places: 'openbible-geo/places.json',
  placeVerses: 'openbible-geo/verses.json',
  chapterPlaces: (book: BookCode) => `openbible-geo/chapters/${book}.json`,
  baseMap: 'naturalearth/base.json',
  harmony: 'harmony/robertson.json',
  kjv: (book: BookCode, chapter: number) => `kjv/${book}/${chapter}.json`,
};

const lookups = new WeakMap<object, Map<string, unknown>>();

/** id → item for an array loaded from /data (built once per array). */
export function byId<T extends { id: string }>(list: T[]): Map<string, T> {
  let map = lookups.get(list) as Map<string, T> | undefined;
  if (!map) {
    map = new Map(list.map((x) => [x.id, x]));
    lookups.set(list, map);
  }
  return map;
}

export const loadPeopleIndex = () => loadData<PersonSummary[]>(PATHS.peopleIndex);
export const loadPlaces = () => loadData<Place[]>(PATHS.places);
export const loadEvents = () => loadData<TimelineEvent[]>(PATHS.events);
export const loadRulers = () => loadData<Ruler[]>(PATHS.rulers);
export const loadBaseMap = () => loadData<BaseMap>(PATHS.baseMap);
export const loadHarmony = () => loadData<Harmony>(PATHS.harmony);
export const loadPlaceVerses = () => loadData<PlaceVerses>(PATHS.placeVerses);

/** Place ids mentioned in one chapter (empty when the book names no places). */
export async function loadChapterPlaces(book: BookCode, chapter: number): Promise<string[]> {
  const file = await loadData<ChapterPlaces>(PATHS.chapterPlaces(book)).catch(() => ({}) as ChapterPlaces);
  return file[String(chapter)] ?? [];
}

/** Full records for the given people. Only the buckets that hold them are fetched. */
export async function loadPeople(ids: string[]): Promise<Map<string, Person>> {
  const index = byId(await loadPeopleIndex());
  const buckets = new Map<number, string[]>();
  for (const id of new Set(ids)) {
    const k = index.get(id)?.k;
    if (k === undefined) continue;
    buckets.set(k, [...(buckets.get(k) ?? []), id]);
  }
  const out = new Map<string, Person>();
  await Promise.all(
    [...buckets].map(async ([k, members]) => {
      const bucket = await loadData<Record<string, Person>>(PATHS.peopleBucket(k));
      for (const id of members) if (bucket[id]) out.set(id, bucket[id]);
    }),
  );
  return out;
}

export async function loadPerson(id: string): Promise<Person | null> {
  return (await loadPeople([id])).get(id) ?? null;
}

/** KJV chapters keyed "BOOK.chapter". */
export async function loadChapters(keys: { book: BookCode; chapter: number }[]): Promise<Map<string, ChapterText>> {
  const out = new Map<string, ChapterText>();
  const unique = new Map(keys.map((k) => [`${k.book}.${k.chapter}`, k]));
  await Promise.all(
    [...unique].map(async ([key, k]) => {
      out.set(key, await loadData<ChapterText>(PATHS.kjv(k.book, k.chapter)));
    }),
  );
  return out;
}
