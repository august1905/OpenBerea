import { t } from '@/i18n';
import { toCompact } from '@/lib/bible/refs';
import { peekData, prefetchData } from '@/lib/data/fetch';
import type { Harmony } from '@/lib/data/types';
import { passageStore } from '@/lib/state/passage';

import { go } from '../nav/navigate';
import { registerMenuItems } from '../nav/useMainMenu';
import { registerVerseAction } from '../reader/verseActions';
import { PATHS } from './data';
import { isGospel, sectionsForVerse } from './harmony';
import { harmonyHref, harmonySectionHref, mapHref, peopleHref, timelineHref } from './hrefs';

registerMenuItems('study.passage', (ctx) => ({
  id: 'study.places',
  label: t('menu.places'),
  icon: 'map',
  onSelect: () => go(mapHref({ ch: { book: ctx.book, chapter: ctx.chapter } })),
}));

registerMenuItems(
  'study.reference',
  () => ({ id: 'study.maps', label: t('menu.maps'), icon: 'map', onSelect: () => go(mapHref()) }),
  () => ({ id: 'study.timeline', label: t('menu.timeline'), icon: 'timeline', onSelect: () => go(timelineHref()) }),
  () => ({ id: 'study.people', label: t('menu.people'), icon: 'person', onSelect: () => go(peopleHref()) }),
);

registerMenuItems('study', () => ({ id: 'study.harmony', label: t('history.menu.harmony'), icon: 'harmony', onSelect: () => go(harmonyHref()) }));

// Verse tools: "Harmony" for Gospel verses that a harmony section covers. Verse actions are built
// synchronously, so the small harmony file is fetched as soon as a Gospel chapter is shown.
const warm = () => {
  if (isGospel(passageStore.get().book)) prefetchData(PATHS.harmony);
};
passageStore.subscribe(warm);
warm();

registerVerseAction((ctx) => {
  if (!isGospel(ctx.book)) return null;
  const harmony = peekData<Harmony>(PATHS.harmony);
  if (!harmony) {
    prefetchData(PATHS.harmony);
    return null;
  }
  const sections = sectionsForVerse(harmony, ctx.book, ctx.chapter, ctx.verse);
  if (!sections.length) return null;
  const href =
    sections.length === 1
      ? harmonySectionHref(sections[0].n)
      : harmonyHref({ v: toCompact({ book: ctx.book, chapter: ctx.chapter, verse: ctx.verse }) });
  return { id: 'harmony', label: t('history.action.harmony'), icon: 'harmony', onPress: () => go(href) };
});
