import type { ComponentType } from 'react';
import type { LayoutChangeEvent } from 'react-native';

import type { BookCode } from '@/lib/bible/books';

import type { WordTap } from './Segments';

/** Views supplied by the original-languages feature (set at startup in features/registry). */
export const readerExtensions: {
  original?: ComponentType<{
    book: BookCode;
    chapter: number;
    verse?: number;
    onVerseLayout: (n: number) => (e: LayoutChangeEvent) => void;
    onVersePress: (n: number) => void;
  }>;
  wordPanel?: ComponentType<{ word: WordTap; book: BookCode; chapter: number; onClose: () => void }>;
  /** Audio Bible bar (shown when opened from the menu). */
  audio?: ComponentType<{ book: BookCode; chapter: number }>;
} = {};
