import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Heading } from '@/components/ui';
import { bookName, t } from '@/i18n';
import { BOOKS, type BookCode } from '@/lib/bible/books';
import { pressStyle } from '@/lib/platform/press';
import { useTheme } from '@/theme';

import { readHref } from '../nav/hrefs';
import { go } from '../nav/navigate';

/** Book and chapter list for browsing (alongside typed quick jump). */
export function BookBrowser() {
  const { palette, fonts } = useTheme();
  const [open, setOpen] = useState<BookCode | null>(null);

  const section = (testament: 'OT' | 'NT', title: string) => (
    <View>
      <Heading level={3}>{title}</Heading>
      <View style={styles.grid}>
        {BOOKS.filter((b) => b.testament === testament).map((b) => {
          const expanded = open === b.code;
          return (
            <View key={b.code} style={expanded ? styles.expandedWrap : null}>
              <Pressable
                testID={`book-${b.code}`}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                onPress={() => (b.chapters === 1 ? go(readHref(b.code, 1)) : setOpen(expanded ? null : b.code))}
                style={pressStyle(({ hovered, focused }) => [
                  styles.book,
                  { borderColor: expanded ? palette.gold : palette.rule, backgroundColor: hovered || focused ? palette.highlight : 'transparent' },
                ])}
              >
                <Text style={{ color: palette.text, fontFamily: fonts.ui, fontSize: 15 }}>{bookName(b.code)}</Text>
              </Pressable>
              {expanded ? (
                <View style={styles.chapters} accessibilityLabel={t('home.chapters', { book: bookName(b.code) })}>
                  {Array.from({ length: b.chapters }, (_, i) => i + 1).map((c) => (
                    <Pressable
                      key={c}
                      testID={`chapter-${b.code}-${c}`}
                      accessibilityRole="link"
                      accessibilityLabel={t('home.chapterN', { book: bookName(b.code), chapter: c })}
                      onPress={() => go(readHref(b.code, c))}
                      style={pressStyle(({ hovered, focused }) => [
                        styles.chapter,
                        { borderColor: palette.rule, backgroundColor: hovered || focused ? palette.highlight : palette.surface },
                      ])}
                    >
                      <Text style={{ color: palette.text, fontFamily: fonts.ui, fontSize: 15 }}>{c}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );

  return (
    <View style={{ marginTop: 28 }}>
      <Heading level={2}>{t('home.books')}</Heading>
      {section('OT', t('home.oldTestament'))}
      {section('NT', t('home.newTestament'))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  expandedWrap: { width: '100%' },
  book: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: 40, justifyContent: 'center', alignSelf: 'flex-start' },
  chapters: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingVertical: 10 },
  chapter: { width: 44, height: 44, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
