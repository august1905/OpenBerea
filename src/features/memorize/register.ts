import { t } from '@/i18n';

import { go } from '../nav/navigate';
import { registerMenuItems } from '../nav/useMainMenu';
import { registerVerseAction } from '../reader/verseActions';
import { DASHBOARD_HREF, practiceHref, STARTERS_HREF } from './modes';
import { readerTranslation } from './scroll';

// Memorize menu: the dashboard, the current chapter in chapter mode, and the starter sets.
registerMenuItems(
  'memorize',
  () => ({ id: 'memorize.dashboard', label: t('menu.dashboard'), icon: 'memorize', onSelect: () => go(DASHBOARD_HREF) }),
  (ctx) => ({
    id: 'memorize.passage',
    label: t('menu.thisPassage'),
    icon: 'passage',
    onSelect: () => go(practiceHref({ ref: `${ctx.book}.${ctx.chapter}`, tr: ctx.version === 'asv' ? 'asv' : 'kjv', mode: 'first-letter' })),
  }),
  () => ({ id: 'memorize.starters', label: t('menu.starterSets'), icon: 'display', onSelect: () => go(STARTERS_HREF) }),
);

// Verse tools sheet: practice this verse.
registerVerseAction((ctx) => ({
  id: 'memorize',
  label: t('mem.verseAction'),
  icon: 'memorize',
  onPress: () => go(practiceHref({ ref: `${ctx.book}.${ctx.chapter}.${ctx.verse}`, tr: readerTranslation(), mode: 'first-letter' })),
}));
