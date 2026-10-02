import type { CommentaryChapter, CommentaryId } from '@/lib/data/types';

// Commentaries shipped with the app, in switcher order. Gill is not included: its only digital
// edition is "All Rights Reserved" (docs/DATA_SOURCES.md).
export const COMMENTARIES = ['mhc', 'jfb', 'barnes'] as const satisfies readonly CommentaryId[];
export type ShippedCommentary = (typeof COMMENTARIES)[number];

export function toCommentaryId(value: string | undefined): ShippedCommentary {
  return (COMMENTARIES as readonly string[]).includes(value ?? '') ? (value as ShippedCommentary) : 'mhc';
}

/** Barnes' Notes covers only the New Testament. */
export function covers(id: ShippedCommentary, testament: 'OT' | 'NT'): boolean {
  return id !== 'barnes' || testament === 'NT';
}

export type EntryLabel = { kind: 'intro' } | { kind: 'verse'; n: number } | { kind: 'verses'; from: number; to: number };

export function entryLabel(v?: [number, number]): EntryLabel {
  if (!v) return { kind: 'intro' };
  if (v[0] === v[1]) return { kind: 'verse', n: v[0] };
  return { kind: 'verses', from: v[0], to: v[1] };
}

/**
 * The entry to scroll to for a verse: one that starts at the verse (the narrowest when several do),
 * otherwise the narrowest entry covering it. -1 when none covers it.
 */
export function entryForVerse(entries: CommentaryChapter['e'], verse: number): number {
  let best = -1;
  let bestScore = Infinity;
  entries.forEach((e, i) => {
    if (!e.v || verse < e.v[0] || verse > e.v[1]) return;
    // Starting at the verse beats merely covering it; then narrower wins; then earlier.
    const score = (e.v[0] === verse ? 0 : 10_000) + (e.v[1] - e.v[0]);
    if (score < bestScore) {
      best = i;
      bestScore = score;
    }
  });
  return best;
}
