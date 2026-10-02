import { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { RichText } from '@/components/RichText';
import { Body, ErrorState, Heading, Loading, Screen } from '@/components/ui';
import { bookName, type MessageKey, t } from '@/i18n';
import { bookInfo, type BookCode } from '@/lib/bible/books';
import type { CommentaryChapter } from '@/lib/data/types';
import { setCurrentPassage } from '@/lib/state/passage';
import { useTheme } from '@/theme';

import { readHref } from '../nav/hrefs';
import { replace } from '../nav/navigate';
import { COMMENTARIES, covers, entryForVerse, entryLabel, type ShippedCommentary, toCommentaryId } from './commentary';
import { studyPaths, useOptionalData } from './data';
import { commentaryHref } from './hrefs';
import { ChapterNav, Credit, InlineLink, Note, Switcher } from './parts';
import { NotFoundScreen, usePassageParams } from './passage';

export function CommentaryScreen() {
  const p = usePassageParams();
  if (!p) return <NotFoundScreen />;
  const id = toCommentaryId(p.params.c);
  return <Commentary key={`${id}:${p.book}.${p.chapter}`} id={id} book={p.book} chapter={p.chapter} verse={p.v} />;
}

function heading(v?: [number, number]): string {
  const l = entryLabel(v);
  if (l.kind === 'intro') return t('study.comm.intro');
  if (l.kind === 'verse') return t('study.comm.verse', { n: l.n });
  return t('study.comm.verses', { from: l.from, to: l.to });
}

function Commentary({ id, book, chapter, verse }: { id: ShippedCommentary; book: BookCode; chapter: number; verse?: number }) {
  const { palette, fonts } = useTheme();
  const testament = bookInfo(book).testament;
  const available = covers(id, testament);
  const data = useOptionalData<CommentaryChapter>(available ? studyPaths.commentary(id, book, chapter) : null);
  const scrollRef = useRef<ScrollView>(null);
  const scrolled = useRef(false);
  const label = `${bookName(book)} ${chapter}`;
  const name = t(`study.comm.name.${id}` as MessageKey);
  const target = data.status === 'ready' && data.data && verse ? entryForVerse(data.data.e, verse) : -1;

  useEffect(() => {
    setCurrentPassage({ book, chapter, verse });
  }, [book, chapter, verse]);

  const options = COMMENTARIES.map((c) => ({
    id: c,
    label: t(`study.comm.${c}` as MessageKey),
    accessibilityLabel: t(`study.comm.name.${c}` as MessageKey),
  }));

  return (
    <Screen ref={scrollRef} title={t('study.comm.pageTitle', { label, name: t(`study.comm.${id}` as MessageKey) })}>
      <Heading>{label}</Heading>
      <Text style={[styles.name, { color: palette.muted, fontFamily: fonts.ui }]}>{name}</Text>
      <Switcher
        testID="commentary-switch"
        label={t('study.comm.choose')}
        options={options}
        value={id}
        onChange={(c) => replace(commentaryHref(book, chapter, { c, v: verse }))}
      />
      <View style={styles.links}>
        <InlineLink href={readHref(book, chapter, { v: verse })} style={{ fontFamily: fonts.ui, fontSize: 14 }}>
          {t('study.readPassage', { label })}
        </InlineLink>
      </View>

      {!available ? (
        <View testID="commentary-unavailable" style={styles.notice}>
          <Body muted>{t('study.comm.barnesNtOnly')}</Body>
        </View>
      ) : data.status === 'error' ? (
        <ErrorState onRetry={data.reload} />
      ) : data.status === 'loading' ? (
        <Loading />
      ) : !data.data || !data.data.e.length ? (
        <View testID="commentary-empty" style={styles.notice}>
          <Body muted>{t('study.comm.noChapter')}</Body>
        </View>
      ) : (
        <View testID="commentary">
          {data.data.e.map((e, i) => {
            const active = i === target;
            return (
              <View
                key={i}
                testID={e.v ? `comm-entry-${e.v[0]}-${e.v[1]}` : 'comm-entry-intro'}
                onLayout={(ev) => {
                  if (active && !scrolled.current) {
                    scrolled.current = true;
                    const y = ev.nativeEvent.layout.y;
                    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: Math.max(0, y - 16), animated: false }));
                  }
                }}
                style={[styles.entry, { borderColor: active ? palette.gold : 'transparent' }]}
              >
                <Heading level={2} style={styles.entryHeading}>
                  {heading(e.v)}
                </Heading>
                <RichText blocks={e.blocks} serif />
              </View>
            );
          })}
        </View>
      )}

      <Note testID="gill-note" style={styles.gill}>
        {t('study.comm.gillNote')}
      </Note>
      <ChapterNav book={book} chapter={chapter} href={(b, c) => commentaryHref(b, c, { c: id === 'mhc' ? undefined : id })} />
      <Credit>{t('study.comm.credit', { name })}</Credit>
    </Screen>
  );
}

const styles = StyleSheet.create({
  name: { fontSize: 14, marginBottom: 10 },
  links: { flexDirection: 'row', marginBottom: 12, minHeight: 28, alignItems: 'center' },
  notice: { paddingVertical: 16 },
  entry: { borderLeftWidth: 2, paddingLeft: 10, marginLeft: -12, marginBottom: 8 },
  entryHeading: { marginTop: 14 },
  gill: { marginTop: 28 },
});
