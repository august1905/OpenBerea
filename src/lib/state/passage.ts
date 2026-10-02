import type { BookCode } from '../bible/books';
import { createStore, useStore } from './store';

/** The passage most recently shown in this visit (memory only), used by menu actions like "Commentary". */
export interface CurrentPassage {
  book: BookCode;
  chapter: number;
  verse?: number;
}

export const passageStore = createStore<CurrentPassage>({ book: 'GEN', chapter: 1 });

export function useCurrentPassage(): CurrentPassage {
  return useStore(passageStore);
}

export function setCurrentPassage(p: CurrentPassage) {
  const prev = passageStore.get();
  if (prev.book === p.book && prev.chapter === p.chapter && prev.verse === p.verse) return;
  passageStore.set(p);
}
