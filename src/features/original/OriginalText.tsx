import { useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';

import { ErrorState, Loading } from '@/components/ui';
import { t } from '@/i18n';
import type { BookCode } from '@/lib/bible/books';
import { useData } from '@/lib/data/fetch';
import type { OrigChapter, OrigWord } from '@/lib/data/types';
import { useTheme } from '@/theme';

import { paths } from './data';
import { WordPanel } from './WordPanel';

/** Hebrew/Aramaic OT (right to left, with vowel points) or Greek NT, every word tappable. */
export function OriginalText({
  book,
  chapter,
  verse,
  onVerseLayout,
  onVersePress,
}: {
  book: BookCode;
  chapter: number;
  verse?: number;
  onVerseLayout: (n: number) => (e: LayoutChangeEvent) => void;
  onVersePress: (n: number) => void;
}) {
  const { palette, fonts, scale } = useTheme();
  const data = useData<OrigChapter>(paths.orig(book, chapter));
  const [word, setWord] = useState<OrigWord | null>(null);
  if (data.status === 'loading') return <Loading />;
  if (data.status === 'error') return <ErrorState onRetry={data.reload} />;
  const hebrew = data.data.lang === 'hbo';
  const size = (hebrew ? 26 : 22) * scale;
  const textStyle = {
    fontFamily: hebrew ? fonts.hebrew : fonts.greek,
    fontSize: size,
    lineHeight: Math.round(size * (hebrew ? 1.9 : 1.7)),
    color: palette.text,
    textAlign: hebrew ? ('right' as const) : ('left' as const),
    writingDirection: hebrew ? ('rtl' as const) : ('ltr' as const),
  };

  return (
    <View testID="original-text">
      <Text style={[styles.hint, { color: palette.muted, fontFamily: fonts.ui }]}>
        {hebrew ? t('orig.hebrew') : t('orig.greek')} · {t('orig.tapHint')}
      </Text>
      {data.data.v.map((v) => (
        <View
          key={v.n}
          testID={`orig-verse-${v.n}`}
          onLayout={onVerseLayout(v.n)}
          style={[styles.verse, v.n === verse ? { backgroundColor: palette.highlight } : null]}
        >
          <Text style={textStyle} {...({ lang: hebrew ? 'he' : 'grc' } as object)}>
            <Text
              role="button"
              onPress={() => onVersePress(v.n)}
              accessibilityLabel={t('reader.verseActions', { n: v.n })}
              style={[styles.num, { color: palette.muted, fontFamily: fonts.ui, fontSize: 12 * scale }]}
            >
              {v.n === 0 ? t('orig.title') : v.n}
              {v.src ? ` (${t('orig.sourceVerse', { n: v.src })})` : ''}
              {' '}
            </Text>
            {v.w.map((w, i) => (
              <Text key={i}>
                <Text
                  role="button"
                  testID={`orig-word-${v.n}-${i}`}
                  accessibilityLabel={t('orig.word', { word: w.x, gloss: w.g })}
                  onPress={() => setWord(w)}
                >
                  {w.t}
                </Text>
                {i < v.w.length - 1 && !w.t.endsWith('־') ? ' ' : ''}
              </Text>
            ))}
          </Text>
        </View>
      ))}
      {word ? (
        <WordPanel word={{ text: word.t, strongs: [word.s], orig: word }} book={book} chapter={chapter} onClose={() => setWord(null)} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 13, marginBottom: 14 },
  verse: { marginBottom: 12, borderRadius: 6 },
  num: { fontWeight: '600' },
});
