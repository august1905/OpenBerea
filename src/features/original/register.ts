import { t } from '@/i18n';
import { lazyComponent } from '@/lib/lazy';

import { go } from '../nav/navigate';
import { registerMenuItems } from '../nav/useMainMenu';
import { readerExtensions } from '../reader/extensions';

// Loaded on first use, keeping the startup bundle small.
readerExtensions.original = lazyComponent(() => import('./OriginalText').then((m) => m.OriginalText));
readerExtensions.wordPanel = lazyComponent(() => import('./WordPanel').then((m) => m.WordPanel));

registerMenuItems('study', () => ({ id: 'study.word', label: t('menu.wordStudy'), icon: 'word', onSelect: () => go('/word') }));
