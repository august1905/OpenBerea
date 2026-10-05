import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type LayoutChangeEvent, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { ErrorState, Heading, Loading, Screen, TextButton } from '@/components/ui';
import { bookName, type MessageKey, t } from '@/i18n';
import { adjacentChapter, bookInfo, type BookCode, toBookCode } from '@/lib/bible/books';
import { prefetchData, useData } from '@/lib/data/fetch';
import type { ChapterText, Verse } from '@/lib/data/types';
import { isTypingTarget, onDocumentKey } from '@/lib/platform/dom';
import { useDisplay } from '@/lib/state/display';
import { setCurrentPassage } from '@/lib/state/passage';
import { useTheme } from '@/theme';
import { READING_WIDTH, scriptureStyle } from '@/theme/typography';

import { readHref, type ReadVersion } from '../nav/hrefs';
import { go, replace } from '../nav/navigate';
import { readerExtensions } from './extensions';
import { Segments, type WordTap } from './Segments';
import { VerseSheet } from './VerseSheet';

const VERSIONS: ReadVersion[] = ['kjv', 'asv', 'par', 'orig'];

function NotFound() {
  return (
    <Screen title={t('notFound.title')}>
      <Heading>{t('notFound.title')}</Heading>
      <ErrorState message={t('reader.notFound')} />
    </Screen>
  );
}

export function ReaderScreen() {
  const params = useLocalSearchParams<{ book: string; chapter: string; tr?: string; v?: string }>();
  const book = toBookCode(params.book);
  const chapter = Number(params.chapter);
  if (!book || !Number.isInteger(chapter) || chapter < 1 || chapter > bookInfo(book).chapters) return <NotFound />;
  const version = VERSIONS.includes(params.tr as ReadVersion) ? (params.tr as ReadVersion) : 'kjv';
  const verse = params.v ? Number(params.v) : undefined;
  return <Reader key={`${book}.${chapter}`} book={book} chapter={chapter} version={version} verse={verse} />;
}

function Reader({ book, chapter, version, verse }: { book: BookCode; chapter: number; version: ReadVersion; verse?: number }) {
  const { palette, fonts } = useTheme();
  const display = useDisplay();
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const positions = useRef(new Map<number, number>());
  const [sheetVerse, setSheetVerse] = useState<number | null>(null);
  const [word, setWord] = useState<WordTap | null>(null);

  const needsKjv = version === 'kjv' || version === 'par';
  const needsAsv = version === 'asv' || version === 'par';
  const kjv = useData<ChapterText>(needsKjv ? `kjv/${book}/${chapter}.json` : null);
  const asv = useData<ChapterText>(needsAsv ? `asv/${book}/${chapter}.json` : null);
  const Original = readerExtensions.original;
  const WordPanel = readerExtensions.wordPanel;
  const Audio = readerExtensions.audio;

  const prev = adjacentChapter(book, chapter, -1);
  const next = adjacentChapter(book, chapter, 1);
  const name = bookName(book);
  const title = t('reader.chapterTitle', { book: name, chapter });

  useEffect(() => {
    setCurrentPassage({ book, chapter, verse });
  }, [book, chapter, verse]);

  // Prefetch neighbors so moving to the next chapter is instant.
  useEffect(() => {
    const folder = version === 'asv' ? 'asv' : 'kjv';
    for (const n of [next, prev]) if (n) prefetchData(`${folder}/${n.book}/${n.chapter}.json`);
  }, [book, chapter, version, next, prev]);

  useEffect(
    () =>
      onDocumentKey((e) => {
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e)) return;
        if (e.key === 'ArrowLeft' && prev) {
          e.preventDefault();
          go(readHref(prev.book, prev.chapter, { tr: version }));
        } else if (e.key === 'ArrowRight' && next) {
          e.preventDefault();
          go(readHref(next.book, next.chapter, { tr: version }));
        }
      }),
    [prev, next, version],
  );

  const ready = (!needsKjv || kjv.status === 'ready') && (!needsAsv || asv.status === 'ready');
  const failed = kjv.status === 'error' || asv.status === 'error';

  // Scroll to the requested verse once its position is known.
  const scrolled = useRef(false);
  const onVerseLayout = useCallback(
    (n: number) => (e: LayoutChangeEvent) => {
      positions.current.set(n, e.nativeEvent.layout.y);
      if (verse && n === verse && !scrolled.current) {
        scrolled.current = true;
        requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: Math.max(0, e.nativeEvent.layout.y - 80), animated: false }));
      }
    },
    [verse],
  );

  const wide = version === 'par' && width >= 760;
  const columnWidth = version === 'par' ? (wide ? 1120 : READING_WIDTH) : READING_WIDTH;

  const versionLabel = t(`reader.version.${version}` as MessageKey);

  return (
    <Screen ref={scrollRef} width={columnWidth} title={t('reader.pageTitle', { book: name, chapter, version: versionLabel })}>
      <View style={styles.header}>
        <Heading>{title}</Heading>
        <View style={styles.versions} role="group" aria-label={t('reader.versionsLabel')}>
          {VERSIONS.filter((v) => v !== 'orig' || Original).map((v) => (
            <TextButton
              key={v}
              testID={`version-${v}`}
              label={t(`reader.version.${v}` as MessageKey)}
              accessibilityLabel={t(`reader.versionName.${v}` as MessageKey)}
              active={v === version}
              onPress={() => replace(readHref(book, chapter, { tr: v, v: verse }))}
              size={14}
            />
          ))}
        </View>
      </View>

      {Audio ? <Audio book={book} chapter={chapter} /> : null}

      {version === 'orig' && Original ? (
        <Original book={book} chapter={chapter} verse={verse} onVerseLayout={onVerseLayout} onVersePress={setSheetVerse} />
      ) : failed ? (
        <ErrorState onRetry={() => (kjv.status === 'error' ? kjv.reload() : asv.reload())} />
      ) : !ready ? (
        <Loading />
      ) : version === 'par' ? (
        <Parallel kjv={kjv.data!} asv={asv.data!} wide={wide} verse={verse} onVerseLayout={onVerseLayout} onVersePress={setSheetVerse} onWord={WordPanel ? setWord : undefined} />
      ) : (
        <ChapterBody
          text={(version === 'asv' ? asv.data : kjv.data)!}
          layout={display.layout}
          redLetter={display.redLetter && version === 'kjv'}
          verse={verse}
          onVerseLayout={onVerseLayout}
          onVersePress={setSheetVerse}
          onWord={WordPanel ? setWord : undefined}
        />
      )}

      {version === 'asv' && display.redLetter ? (
        <Text style={[styles.note, { color: palette.muted, fontFamily: fonts.ui }]}>{t('reader.redLetterKjvOnly')}</Text>
      ) : null}

      <View style={styles.nav}>
        {prev ? (
          <TextButton
            testID="prev-chapter"
            label={`‹ ${bookName(prev.book)} ${prev.chapter}`}
            accessibilityLabel={t('reader.previous', { label: `${bookName(prev.book)} ${prev.chapter}` })}
            onPress={() => go(readHref(prev.book, prev.chapter, { tr: version }))}
          />
        ) : (
          <View />
        )}
        {next ? (
          <TextButton
            testID="next-chapter"
            label={`${bookName(next.book)} ${next.chapter} ›`}
            accessibilityLabel={t('reader.next', { label: `${bookName(next.book)} ${next.chapter}` })}
            onPress={() => go(readHref(next.book, next.chapter, { tr: version }))}
          />
        ) : null}
      </View>

      <VerseSheet
        visible={sheetVerse !== null}
        ctx={sheetVerse !== null ? { book, chapter, verse: sheetVerse } : null}
        onClose={() => setSheetVerse(null)}
      />
      {WordPanel && word ? <WordPanel word={word} book={book} chapter={chapter} onClose={() => setWord(null)} /> : null}
    </Screen>
  );
}

interface BodyProps {
  verse?: number;
  onVerseLayout: (n: number) => (e: LayoutChangeEvent) => void;
  onVersePress: (n: number) => void;
  onWord?: (w: WordTap) => void;
}

function VerseNumber({ n, onPress }: { n: number; onPress: (n: number) => void }) {
  const { palette, fonts, scale } = useTheme();
  return (
    <Text
      testID={`verse-num-${n}`}
      role="button"
      accessibilityLabel={t('reader.verseActions', { n })}
      onPress={() => onPress(n)}
      {...({ focusable: true } as object)}
      style={[styles.verseNum, { color: palette.muted, fontFamily: fonts.ui, fontSize: 12 * scale }]}
    >
      {n}
      {' '}
    </Text>
  );
}

function ChapterBody({ text, layout, redLetter, verse, onVerseLayout, onVersePress, onWord }: BodyProps & { text: ChapterText; layout: 'verse' | 'paragraph'; redLetter: boolean }) {
  const { palette, scale, dyslexia } = useTheme();
  const base = scriptureStyle(scale, dyslexia);

  const paragraphs = useMemo(() => {
    if (layout === 'verse') return text.v.map((v) => [v]);
    const out: Verse[][] = [];
    for (const v of text.v) {
      if (v.p || !out.length) out.push([v]);
      else out[out.length - 1].push(v);
    }
    return out;
  }, [text, layout]);

  return (
    <View testID="chapter-text" style={styles.body}>
      {text.title ? (
        <Text testID="psalm-title" style={[base, styles.title, { color: palette.text }]}>
          <Segments segs={text.title} redLetter={false} />
        </Text>
      ) : null}
      {paragraphs.map((group) => {
        const first = group[0].n;
        return (
          <View key={first} onLayout={onVerseLayout(first)} style={layout === 'verse' ? styles.verseLine : styles.paragraph}>
            <Text style={[base, { color: palette.text }]}>
              {group.map((v, i) => (
                <Text
                  key={v.n}
                  testID={`verse-${v.n}`}
                  style={v.n === verse ? { backgroundColor: palette.highlight } : undefined}
                >
                  {i > 0 ? ' ' : ''}
                  <VerseNumber n={v.n} onPress={onVersePress} />
                  <Segments segs={v.s} redLetter={redLetter} onWord={onWord ? (w) => onWord({ ...w, tr: text.tr, verse: v.n }) : undefined} />
                </Text>
              ))}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function Parallel({ kjv, asv, wide, verse, onVerseLayout, onVersePress, onWord }: BodyProps & { kjv: ChapterText; asv: ChapterText; wide: boolean }) {
  const { palette, fonts, scale, dyslexia } = useTheme();
  const display = useDisplay();
  const base = scriptureStyle(scale * (wide ? 0.92 : 0.9), dyslexia);
  const asvByVerse = new Map(asv.v.map((v) => [v.n, v]));
  const label = (s: string) => <Text style={[styles.parLabel, { color: palette.muted, fontFamily: fonts.ui }]}>{s}</Text>;
  return (
    <View testID="parallel-text" style={styles.body}>
      {wide ? (
        <View style={styles.parRow}>
          <View style={styles.parCell}>{label(t('reader.versionName.kjv'))}</View>
          <View style={styles.parCell}>{label(t('reader.versionName.asv'))}</View>
        </View>
      ) : null}
      {kjv.v.map((v) => {
        const a = asvByVerse.get(v.n);
        const highlight = v.n === verse ? { backgroundColor: palette.highlight } : null;
        const kjvCell = (
          <Text testID={`par-kjv-${v.n}`} style={[base, { color: palette.text }]}>
            <VerseNumber n={v.n} onPress={onVersePress} />
            <Segments segs={v.s} redLetter={display.redLetter} onWord={onWord ? (w) => onWord({ ...w, tr: 'kjv', verse: v.n }) : undefined} />
          </Text>
        );
        const asvCell = (
          <Text testID={`par-asv-${v.n}`} style={[base, { color: palette.text }]}>
            {wide ? <VerseNumber n={v.n} onPress={onVersePress} /> : null}
            {a ? <Segments segs={a.s} redLetter={false} onWord={onWord ? (w) => onWord({ ...w, tr: 'asv', verse: v.n }) : undefined} /> : null}
          </Text>
        );
        return wide ? (
          <View key={v.n} testID={`par-${v.n}`} onLayout={onVerseLayout(v.n)} style={[styles.parRow, highlight, { borderColor: palette.rule }]}>
            <View style={styles.parCell}>{kjvCell}</View>
            <View style={styles.parCell}>{asvCell}</View>
          </View>
        ) : (
          <View key={v.n} testID={`par-${v.n}`} onLayout={onVerseLayout(v.n)} style={[styles.parStack, highlight, { borderColor: palette.rule }]}>
            {label(t('reader.version.kjv'))}
            {kjvCell}
            {label(t('reader.version.asv'))}
            {asvCell}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: 18 },
  versions: { flexDirection: 'row', flexWrap: 'wrap', marginLeft: -8, marginTop: 2 },
  body: { gap: 0 },
  title: { fontStyle: 'italic', marginBottom: 14, opacity: 0.9 },
  verseLine: { marginBottom: 10 },
  paragraph: { marginBottom: 18 },
  verseNum: { fontWeight: '600' },
  note: { fontSize: 13, marginTop: 16 },
  nav: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 36, marginHorizontal: -8 },
  parRow: { flexDirection: 'row', gap: 32, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  parCell: { flex: 1 },
  parStack: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 2 },
  parLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 4 },
});
