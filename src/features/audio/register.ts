import { createElement } from 'react';

import { t } from '@/i18n';
import type { BookCode } from '@/lib/bible/books';
import { lazyComponent } from '@/lib/lazy';

import { readHref } from '../nav/hrefs';
import { go } from '../nav/navigate';
import { registerMenuItems } from '../nav/useMainMenu';
import { readerExtensions } from '../reader/extensions';
import { audioStore, setAudioOpen, useAudioOpen } from './state';

const AudioBar = lazyComponent(() => import('./AudioBar').then((m) => m.AudioBar));

/** The player's code loads only once Listen is chosen. */
function AudioSlot(props: { book: BookCode; chapter: number }) {
  return useAudioOpen() ? createElement(AudioBar, props) : null;
}

readerExtensions.audio = AudioSlot;

registerMenuItems('read', (ctx) => ({
  id: 'read.listen',
  label: t('menu.listen'),
  icon: 'audio',
  active: audioStore.get().open,
  onSelect: () => {
    setAudioOpen(!audioStore.get().open || ctx.version === null);
    if (ctx.version === null || ctx.version === 'interlinear') go(readHref(ctx.book, ctx.chapter));
  },
}));
