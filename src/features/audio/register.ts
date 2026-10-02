import { t } from '@/i18n';

import { readHref } from '../nav/hrefs';
import { go } from '../nav/navigate';
import { registerMenuItems } from '../nav/useMainMenu';
import { readerExtensions } from '../reader/extensions';
import { AudioBar } from './AudioBar';
import { audioStore, setAudioOpen } from './state';

readerExtensions.audio = AudioBar;

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
