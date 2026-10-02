import { createElement } from 'react';

import { t } from '@/i18n';
import { bookInfo } from '@/lib/bible/books';

import { go } from '../nav/navigate';
import { registerMenuItems } from '../nav/useMainMenu';
import { registerVerseAction, registerVersePanel } from '../reader/verseActions';
import { StudyLinks } from './components';

registerMenuItems(
  'resources',
  (ctx) => ({ id: 'res.passage', label: t('menu.forPassage'), icon: 'resources', onSelect: () => go(`/resources/passage?ref=${ctx.book}.${ctx.chapter}`) }),
  () => ({ id: 'res.library', label: t('menu.library'), icon: 'dictionary', onSelect: () => go('/resources') }),
  () => ({ id: 'res.teachers', label: t('menu.teachers'), icon: 'person', onSelect: () => go('/resources/teachers') }),
  () => ({ id: 'res.about', label: t('menu.about'), icon: 'info', onSelect: () => go('/about') }),
);

registerVerseAction((ctx) => ({
  id: 'resources',
  label: t('res.verseAction'),
  icon: 'resources',
  onPress: () => go(`/resources/passage?ref=${ctx.book}.${ctx.chapter}.${ctx.verse}`),
}));

registerVersePanel({
  id: 'study-links',
  render: (ctx) => createElement(StudyLinks, { book: ctx.book, chapter: ctx.chapter, verse: ctx.verse, testament: bookInfo(ctx.book).testament }),
});
