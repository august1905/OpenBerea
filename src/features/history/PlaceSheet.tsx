import { StyleSheet, Text, View } from 'react-native';

import { Sheet } from '@/components/Sheet';
import { Loading } from '@/components/ui';
import { type MessageKey, t } from '@/i18n';
import { formatRef } from '@/i18n/format';
import type { BookCode } from '@/lib/bible/books';
import { fromVerseId } from '@/lib/bible/refs';
import { useData } from '@/lib/data/fetch';
import type { Place, PlaceVerses } from '@/lib/data/types';
import { useTheme } from '@/theme';

import { readHref } from '../nav/hrefs';
import { PATHS } from './data';
import { TextLink, VerseList, versesLabel } from './parts';
import { confidenceOf } from './projection';

export function placeType(p: Place): string {
  return p.type ? p.type.charAt(0).toUpperCase() + p.type.slice(1) : '';
}

export function confidenceLabel(score: number): string {
  return t(`history.place.confidence.${confidenceOf(score)}` as MessageKey);
}

/** A place's details: type, how sure the identification is, and every verse that names it. */
export function PlaceSheet({
  place,
  chapter,
  onClose,
}: {
  place: Place | null;
  chapter?: { book: BookCode; chapter: number } | null;
  onClose: () => void;
}) {
  const { palette, fonts } = useTheme();
  const verses = useData<PlaceVerses>(place ? PATHS.placeVerses : null);
  if (!place) return null;
  const ids = verses.data?.[place.id] ?? [];
  const here = chapter ? ids.filter((id) => {
    const r = fromVerseId(id);
    return r.book === chapter.book && r.chapter === chapter.chapter;
  }) : [];
  const pct = Math.round(place.score / 10);
  return (
    <Sheet testID="place-sheet" visible title={place.name} onClose={onClose}>
      <View style={styles.facts}>
        <Text style={[styles.type, { color: palette.muted, fontFamily: fonts.ui }]}>{placeType(place)}</Text>
        <Text testID="place-confidence" style={[styles.confidence, { color: palette.text, fontFamily: fonts.ui }]}>
          {confidenceLabel(place.score)}
        </Text>
        <Text style={[styles.explain, { color: palette.muted, fontFamily: fonts.ui }]}>{t('history.place.confidenceExplain', { pct })}</Text>
      </View>
      {verses.status === 'loading' ? <Loading /> : null}
      {here.length && chapter ? (
        <View style={styles.here}>
          <Text style={[styles.subhead, { color: palette.text, fontFamily: fonts.ui }]} role="heading" aria-level={3}>
            {t('history.place.inChapter', { label: formatRef(chapter) })}
          </Text>
          <View style={styles.hereLinks}>
            {here.map((id) => {
              const r = fromVerseId(id);
              return (
                <TextLink key={id} href={readHref(r.book, r.chapter, { v: r.verse })} style={styles.hereLink}>
                  {formatRef(r)}
                </TextLink>
              );
            })}
          </View>
        </View>
      ) : null}
      {ids.length ? (
        <>
          <Text style={[styles.subhead, { color: palette.text, fontFamily: fonts.ui }]} role="heading" aria-level={3}>
            {t('history.place.mentions', { name: place.name })} · {versesLabel(ids.length)}
          </Text>
          <VerseList key={place.id} testID="place-verses" verses={ids} />
        </>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  facts: { gap: 4, marginBottom: 12 },
  type: { fontSize: 14, fontWeight: '600', letterSpacing: 0.3 },
  confidence: { fontSize: 16, fontWeight: '600', marginTop: 6 },
  explain: { fontSize: 14, lineHeight: 20 },
  here: { marginBottom: 8 },
  hereLinks: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14 },
  hereLink: { fontSize: 15, paddingVertical: 11 },
  subhead: { fontSize: 16, fontWeight: '600', marginTop: 12, marginBottom: 4 },
});
