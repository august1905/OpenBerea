import { Fragment, useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ErrorState, Heading, Loading, Screen } from '@/components/ui';
import { bookName, t } from '@/i18n';
import { formatRef } from '@/i18n/format';
import type { BookCode } from '@/lib/bible/books';
import { useData } from '@/lib/data/fetch';
import type { ChapterText, OpenBibleXrefChapter, TskChapter } from '@/lib/data/types';
import { pressStyle } from '@/lib/platform/press';
import { useDisplay } from '@/lib/state/display';
import { setCurrentPassage } from '@/lib/state/passage';
import { useTheme } from '@/theme';

import { readHref, refHref } from '../nav/hrefs';
import { replace } from '../nav/navigate';
import { Segments } from '../reader/Segments';
import { OPENBIBLE_TOP, verseXrefs } from './crossrefs';
import { studyPaths, useOptionalData } from './data';
import { crossrefsHref } from './hrefs';
import { ChapterNav, Credit, InlineLink, Note } from './parts';
import { NotFoundScreen, usePassageParams } from './passage';
import { VerseXrefs } from './XrefList';

export function CrossRefsScreen() {
  const p = usePassageParams();
  if (!p) return <NotFoundScreen />;
  return <CrossRefs key={`${p.book}.${p.chapter}`} book={p.book} chapter={p.chapter} verse={p.v} />;
}

/** Compact list of ref links (abbreviated), for verses that aren't expanded. */
function RefLinks({ refs, label, testID }: { refs: string[]; label: string; testID: string }) {
  const { palette, fonts } = useTheme();
  if (!refs.length) return null;
  return (
    <Text testID={testID} style={[styles.refs, { color: palette.muted, fontFamily: fonts.ui }]}>
      <Text style={styles.refsLabel}>{label} </Text>
      {refs.map((r, i) => (
        <Fragment key={r}>
          {i > 0 ? ' · ' : ''}
          <InlineLink href={refHref(r)} label={formatRef(r)}>
            {formatRef(r, 'abbr').replace(/ /g, '\u00a0')}
          </InlineLink>
        </Fragment>
      ))}
    </Text>
  );
}

function CrossRefs({ book, chapter, verse }: { book: BookCode; chapter: number; verse?: number }) {
  const { palette, fonts, scale } = useTheme();
  const { redLetter } = useDisplay();
  const kjv = useData<ChapterText>(studyPaths.kjv(book, chapter));
  const tsk = useOptionalData<TskChapter>(studyPaths.tsk(book, chapter));
  const ob = useOptionalData<OpenBibleXrefChapter>(studyPaths.openbible(book, chapter));
  const scrollRef = useRef<ScrollView>(null);
  const scrolled = useRef(false);
  const label = `${bookName(book)} ${chapter}`;

  useEffect(() => {
    setCurrentPassage({ book, chapter, verse });
  }, [book, chapter, verse]);

  const failed = kjv.status === 'error' || tsk.status === 'error' || ob.status === 'error';
  const ready = kjv.status === 'ready' && tsk.status === 'ready' && ob.status === 'ready';

  return (
    <Screen ref={scrollRef} title={t('study.xref.pageTitle', { label })}>
      <Heading>{t('study.xref.pageTitle', { label })}</Heading>
      <View style={styles.links}>
        <InlineLink href={readHref(book, chapter, { v: verse })} style={{ fontFamily: fonts.ui, fontSize: 14 }}>
          {t('study.readPassage', { label })}
        </InlineLink>
      </View>
      <Note style={styles.hint}>{t('study.xref.hint')}</Note>
      {failed ? (
        <ErrorState onRetry={() => [kjv, tsk, ob].forEach((d) => d.status === 'error' && d.reload())} />
      ) : !ready ? (
        <Loading />
      ) : (
        <View testID="xref-chapter">
          {kjv.data!.v.map((v) => {
            const refs = verseXrefs(tsk.data ?? undefined, ob.data ?? undefined, v.n);
            const open = v.n === verse;
            return (
              <View
                key={v.n}
                testID={`xref-verse-${v.n}`}
                onLayout={(e) => {
                  if (open && !scrolled.current) {
                    scrolled.current = true;
                    const y = e.nativeEvent.layout.y;
                    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: Math.max(0, y - 20), animated: false }));
                  }
                }}
                style={[styles.verse, { borderColor: palette.rule }, open && { backgroundColor: palette.surface, borderColor: palette.gold }]}
              >
                <Pressable
                  testID={`xref-open-${v.n}`}
                  accessibilityRole="button"
                  accessibilityLabel={t('study.xref.previewsFor', { n: v.n })}
                  aria-current={open ? 'true' : undefined}
                  onPress={() => replace(crossrefsHref(book, chapter, v.n))}
                  style={pressStyle(({ hovered, focused, pressed }) => [styles.verseHead, (hovered || focused || pressed) && { backgroundColor: palette.highlight }])}
                >
                  <Text style={{ color: palette.text, fontFamily: fonts.scripture, fontSize: 17 * scale, lineHeight: 27 * scale }}>
                    <Text style={{ color: palette.muted, fontFamily: fonts.ui, fontSize: 12 * scale, lineHeight: 12 * scale, fontWeight: '600' }}>{`${v.n} `}</Text>
                    <Segments segs={v.s} redLetter={redLetter} />
                  </Text>
                </Pressable>
                {open ? (
                  <View style={styles.expanded}>
                    <VerseXrefs book={book} chapter={chapter} verse={v.n} testID="xrefs-open" />
                  </View>
                ) : refs.tsk.length || refs.openbible.length ? (
                  <View style={styles.compact}>
                    <RefLinks refs={refs.tsk} label={`${t('study.xref.tsk')}:`} testID={`xref-tsk-${v.n}`} />
                    <RefLinks refs={refs.openbible.slice(0, OPENBIBLE_TOP).map((r) => r[0])} label={`${t('study.xref.openbible')}:`} testID={`xref-ob-${v.n}`} />
                  </View>
                ) : (
                  <Note style={styles.compact}>{t('study.xref.none')}</Note>
                )}
              </View>
            );
          })}
        </View>
      )}
      <ChapterNav book={book} chapter={chapter} href={(b, c) => crossrefsHref(b, c)} />
      <Credit>{t('study.xref.credit')}</Credit>
    </Screen>
  );
}

const styles = StyleSheet.create({
  links: { flexDirection: 'row', marginBottom: 8, minHeight: 28, alignItems: 'center' },
  hint: { marginBottom: 16 },
  verse: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 6, borderRadius: 8 },
  verseHead: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, minHeight: 44 },
  compact: { paddingHorizontal: 8, paddingBottom: 6 },
  expanded: { paddingHorizontal: 8, paddingBottom: 8 },
  refs: { fontSize: 13, lineHeight: 24 },
  refsLabel: { fontWeight: '600' },
});
