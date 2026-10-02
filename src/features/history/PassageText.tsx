import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Loading } from '@/components/ui';
import { formatRef } from '@/i18n/format';
import type { Ref } from '@/lib/bible/refs';
import { useDisplay } from '@/lib/state/display';
import { useTheme } from '@/theme';
import { scriptureStyle } from '@/theme/typography';

import { refHref } from '../nav/hrefs';
import { Segments } from '../reader/Segments';
import { versesOf } from './harmony';
import { TextLink, useChapterTexts } from './parts';

/** The KJV text of one or more passages, with verse numbers (and chapter numbers when they change). */
export function PassageText({ refs, testID, compact }: { refs: Ref[]; testID: string; compact?: boolean }) {
  const { palette, fonts, scale, dyslexia } = useTheme();
  const { redLetter } = useDisplay();
  const keys = useMemo(() => refs.flatMap((r) => versesOf(r).map((c) => ({ book: r.book, chapter: c.chapter }))), [refs]);
  const { texts, loading } = useChapterTexts(keys);
  const base = scriptureStyle(scale * (compact ? 0.85 : 0.95), dyslexia);
  const num = { color: palette.muted, fontFamily: fonts.ui, fontSize: 11 * scale, fontWeight: '600' as const };

  if (loading && !keys.every((k) => texts.has(`${k.book}.${k.chapter}`))) return <Loading />;

  return (
    <View testID={testID}>
      {refs.map((r, i) => {
        const chapters = versesOf(r);
        return (
          <View key={i} style={styles.passage}>
            <TextLink href={refHref(r)} style={styles.ref}>
              {formatRef(r)}
            </TextLink>
            <Text style={[base, { color: palette.text }]}>
              {chapters.map((c, ci) => {
                const ch = texts.get(`${r.book}.${c.chapter}`);
                return c.verses.map((v, vi) => {
                  const verse = ch?.v.find((x) => x.n === v);
                  if (!verse) return null;
                  const label = ci > 0 && vi === 0 ? `${c.chapter}:${v}` : String(v);
                  return (
                    <Text key={`${c.chapter}.${v}`} testID={`${testID}-${c.chapter}-${v}`}>
                      {ci + vi > 0 ? ' ' : ''}
                      <Text style={num}>{label} </Text>
                      <Segments segs={verse.s} redLetter={redLetter} />
                    </Text>
                  );
                });
              })}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  passage: { marginBottom: 14 },
  ref: { fontSize: 14, fontWeight: '600', paddingVertical: 11 },
});
