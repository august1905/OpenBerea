import { t } from '@/i18n';

import { go } from '../nav/navigate';
import { registerMenuItems } from '../nav/useMainMenu';
import { readerExtensions } from '../reader/extensions';
import { OriginalText } from './OriginalText';
import { WordPanel } from './WordPanel';

readerExtensions.original = OriginalText;
readerExtensions.wordPanel = WordPanel;

registerMenuItems('study', () => ({ id: 'study.word', label: t('menu.wordStudy'), icon: 'word', onSelect: () => go('/word') }));
