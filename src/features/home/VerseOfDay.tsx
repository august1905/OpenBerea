import { Pressable, StyleSheet, Text, View } from 'react-native';

import { t } from '@/i18n';
import { formatRef } from '@/i18n/format';
import { fromCompact } from '@/lib/bible/refs';
import { useData } from '@/lib/data/fetch';
import type { ChapterText } from '@/lib/data/types';
import { useDisplay } from '@/lib/state/display';
import { pressStyle } from '@/lib/platform/press';
import { useTheme } from '@/theme';
import { scriptureStyle } from '@/theme/typography';

import { readHref } from '../nav/hrefs';
import { go } from '../nav/navigate';
import { Segments } from '../reader/Segments';
import { verseOfTheDay } from './votd';

/** Verse of the day, picked by date from the built-in list (KJV). */
export function VerseOfDay() {
  const { palette, fonts, scale, dyslexia } = useTheme();
  const { redLetter } = useDisplay();
  const ref = fromCompact(verseOfTheDay())!;
  const chapter = useData<ChapterText>(`kjv/${ref.book}/${ref.chapter}.json`);
  const end = ref.endVerse ?? ref.verse!;
  const verses = chapter.data?.v.filter((v) => v.n >= ref.verse! && v.n <= end) ?? [];
  const label = formatRef(ref);

  return (
    <Pressable
      testID="votd"
      accessibilityRole="link"
      accessibilityLabel={`${t('home.votd')}: ${label}`}
      onPress={() => go(readHref(ref.book, ref.chapter, { v: ref.verse }))}
      style={pressStyle(({ hovered, focused }) => [
        styles.card,
        { borderColor: palette.rule, backgroundColor: hovered || focused ? palette.highlight : 'transparent' },
      ])}
    >
      <View style={[styles.rule, { backgroundColor: palette.gold }]} />
      <Text style={[styles.kicker, { color: palette.muted, fontFamily: fonts.ui }]}>{t('home.votd')}</Text>
      <Text style={[scriptureStyle(scale, dyslexia), { color: palette.text }]}>
        {verses.length ? verses.map((v, i) => (
          <Text key={v.n}>
            {i > 0 ? ' ' : ''}
            <Segments segs={v.s} redLetter={redLetter} />
          </Text>
        )) : ' '}
      </Text>
      <Text style={[styles.ref, { color: palette.text, fontFamily: fonts.ui }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, padding: 22, marginTop: 8 },
  rule: { width: 28, height: 2, borderRadius: 1, marginBottom: 12 },
  kicker: { fontSize: 13, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 10 },
  ref: { marginTop: 12, fontSize: 15, fontWeight: '600' },
});
