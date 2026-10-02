import { createElement } from 'react';

import { t } from '@/i18n';
import { lazyComponent } from '@/lib/lazy';

import { go } from '../nav/navigate';
import { registerMenuItems } from '../nav/useMainMenu';
import { registerVerseAction, registerVersePanel } from '../reader/verseActions';
import { commentaryHref, crossrefsHref, dictionaryHref, inductiveHref, topicsHref, variantsHref } from './hrefs';

// Study tools: verse tools sheet entries and corner-menu items.

const CrossRefPanel = lazyComponent(() => import('./CrossRefPanel').then((m) => m.CrossRefPanel));
registerVersePanel({ id: 'study.crossrefs', render: (ctx, close) => createElement(CrossRefPanel, { ctx, close }) });

registerVerseAction((ctx) => ({
  id: 'commentary',
  label: t('menu.commentary'),
  icon: 'page',
  onPress: () => go(commentaryHref(ctx.book, ctx.chapter, { v: ctx.verse })),
}));

registerMenuItems(
  'study.passage',
  (ctx) => ({ id: 'study.commentary', label: t('menu.commentary'), icon: 'page', onSelect: () => go(commentaryHref(ctx.book, ctx.chapter, { v: ctx.verse })) }),
  (ctx) => ({ id: 'study.crossrefs', label: t('menu.crossRefs'), icon: 'link', onSelect: () => go(crossrefsHref(ctx.book, ctx.chapter, ctx.verse)) }),
  (ctx) => ({ id: 'study.inductive', label: t('menu.inductive'), icon: 'study', onSelect: () => go(inductiveHref(ctx.book, ctx.chapter)) }),
  (ctx) => ({
    id: 'study.variants',
    label: t('menu.variants'),
    icon: 'word',
    // Greek edition markers exist for the New Testament only.
    disabled: ctx.testament !== 'NT',
    onSelect: () => go(variantsHref(ctx.book, ctx.chapter, ctx.verse)),
  }),
);

registerMenuItems(
  'study.reference',
  () => ({ id: 'study.dictionaries', label: t('menu.dictionaries'), icon: 'dictionary', onSelect: () => go(dictionaryHref()) }),
  () => ({ id: 'study.topics', label: t('menu.topics'), icon: 'display', onSelect: () => go(topicsHref()) }),
);
