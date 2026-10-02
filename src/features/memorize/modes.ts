import { type MessageKey, t } from '@/i18n';
import type { TranslationId } from '@/lib/data/types';

// Practice modes and the practice URL: /memorize/practice?ref=ROM.8.28-30&tr=kjv&mode=first-letter&part=chunk-1

export const MODES = ['first-letter', 'progressive', 'fill-blank', 'ref-to-verse', 'verse-to-ref', 'scramble'] as const;
export type Mode = (typeof MODES)[number];

export const TRANSLATIONS: readonly TranslationId[] = ['kjv', 'asv'];

export function toMode(value: string | undefined | null): Mode {
  return MODES.includes(value as Mode) ? (value as Mode) : 'first-letter';
}

export function toTranslation(value: string | undefined | null): TranslationId {
  return value === 'asv' ? 'asv' : 'kjv';
}

export function practiceHref(opts: { ref: string; tr?: TranslationId; mode?: Mode; part?: string }): string {
  const q = new URLSearchParams({ ref: opts.ref, tr: opts.tr ?? 'kjv', mode: opts.mode ?? 'first-letter' });
  if (opts.part) q.set('part', opts.part);
  return `/memorize/practice?${q.toString()}`;
}

export const DASHBOARD_HREF = '/memorize';
export const STARTERS_HREF = '/memorize?view=starters';

export const trName = (tr: TranslationId) => t(tr === 'asv' ? 'mem.tr.asvName' : 'mem.tr.kjvName');
export const trShort = (tr: TranslationId) => t(tr === 'asv' ? 'mem.tr.asv' : 'mem.tr.kjv');
export const modeName = (mode: Mode) => t(`mem.mode.${mode}` as MessageKey);
