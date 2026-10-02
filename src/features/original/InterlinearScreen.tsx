import { useLocalSearchParams } from 'expo-router';
import { memo, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ErrorState, Heading, Loading, Screen, TextButton } from '@/components/ui';
import { bookName, t } from '@/i18n';
import { adjacentChapter, bookInfo, type BookCode, toBookCode } from '@/lib/bible/books';
import { useData } from '@/lib/data/fetch';
import type { ChapterText, OrigVerse, OrigWord, Seg, Verse } from '@/lib/data/types';
import { pressStyle } from '@/lib/platform/press';
import { setCurrentPassage } from '@/lib/state/passage';
import { useTheme } from '@/theme';

import { interlinearHref, readHref } from '../nav/hrefs';
import { go, replace } from '../nav/navigate';
import type { WordTap } from '../reader/Segments';
import { alignVerse } from './align';
import { paths } from './data';
import { WordPanel } from './WordPanel';

interface Cell {
  english: string;
  added?: boolean;
  words: OrigWord[];
  tap?: WordTap;
}

/** Builds interlinear cells for one verse: each English word with the original word(s) under it. */
export function buildCells(verse: Verse, orig: OrigVerse | undefined): { cells: Cell[]; untranslated: OrigWord[] } {
  const words = orig?.w ?? [];
  const { bySeg, unmatched } = alignVerse(verse.s, words);
  const cells: Cell[] = [];
  const pushPlain = (text: string, added?: boolean) => {
    for (const token of text.split(/\s+/).filter(Boolean)) {
      if (/^[^\p{L}\p{N}]+$/u.test(token) && cells.length) {
        cells[cells.length - 1].english += token;
      } else {
        cells.push({ english: token, added, words: [] });
      }
    }
  };
  verse.s.forEach((seg: Seg, i) => {
    if (typeof seg === 'string') return pushPlain(seg);
    if (!seg.s?.length) return pushPlain(seg.t, !!seg.a);
    const matched = (bySeg.get(i) ?? []).map((wi) => words[wi]);
    cells.push({
      english: seg.t.trim(),
      added: !!seg.a,
      words: matched,
      tap: { text: seg.t.trim(), strongs: seg.s, morph: seg.m, verse: verse.n, segIndex: i },
    });
  });
  return { cells, untranslated: unmatched.map((i) => words[i]).filter((w) => !/^H90\d\d$/.test(w.s)) };
}

const VerseRow = memo(function VerseRow({
  verse,
  orig,
  hebrew,
  highlight,
  onTap,
}: {
  verse: Verse;
  orig?: OrigVerse;
  hebrew: boolean;
  highlight: boolean;
  onTap: (tap: WordTap) => void;
}) {
  const { palette, fonts, scale } = useTheme();
  const { cells, untranslated } = buildCells(verse, orig);
  const scriptFont = hebrew ? fonts.hebrew : fonts.greek;
  return (
    <View testID={`il-verse-${verse.n}`} style={[styles.verse, highlight ? { backgroundColor: palette.highlight } : null, { borderColor: palette.rule }]}>
      <Text style={[styles.num, { color: palette.muted, fontFamily: fonts.ui }]}>{verse.n}</Text>
      <View style={styles.cells}>
        {cells.map((c, i) => {
          const content = (
            <>
              <Text style={{ color: palette.text, fontFamily: fonts.scripture, fontSize: 16 * scale, fontStyle: c.added ? 'italic' : 'normal' }}>
                {c.english}
              </Text>
              {c.words.map((w, j) => (
                <View key={j} style={styles.orig}>
                  <Text style={{ color: palette.text, fontFamily: scriptFont, fontSize: (hebrew ? 21 : 18) * scale, writingDirection: hebrew ? 'rtl' : 'ltr' }}>
                    {w.t}
                  </Text>
                  <Text style={[styles.meta, { color: palette.muted, fontFamily: fonts.ui }]}>{w.x}</Text>
                  <Text style={[styles.meta, { color: palette.muted, fontFamily: fonts.ui }]}>{w.s}</Text>
                </View>
              ))}
            </>
          );
          return c.tap && c.words.length ? (
            <Pressable
              key={i}
              testID={`il-cell-${verse.n}-${i}`}
              accessibilityRole="button"
              accessibilityLabel={t('interlinear.wordLabel', { english: c.english, original: c.words.map((w) => w.x).join(' '), strongs: c.words.map((w) => w.s).join(' ') })}
              onPress={() => onTap(c.tap!)}
              style={pressStyle(({ hovered, focused }) => [styles.cell, (hovered || focused) && { backgroundColor: palette.highlight }])}
            >
              {content}
            </Pressable>
          ) : (
            <View key={i} style={styles.cell}>
              {content}
            </View>
          );
        })}
      </View>
      {untranslated.length ? (
        <Text style={[styles.untranslated, { color: palette.muted, fontFamily: fonts.ui }]}>
          {t('interlinear.untranslated')}{' '}
          {untranslated.map((w, i) => (
            <Text key={i}>
              <Text
                role="button"
                onPress={() => onTap({ text: w.t, strongs: [w.s], orig: w })}
                style={{ fontFamily: scriptFont, color: palette.text, textDecorationLine: 'underline', textDecorationColor: palette.gold } as never}
              >
                {w.t}
              </Text>
              {` (${w.s})${i < untranslated.length - 1 ? ', ' : ''}`}
            </Text>
          ))}
        </Text>
      ) : null}
    </View>
  );
});

export function InterlinearScreen() {
  const params = useLocalSearchParams<{ book: string; chapter: string; v?: string }>();
  const book = toBookCode(params.book);
  const chapter = Number(params.chapter);
  if (!book || !Number.isInteger(chapter) || chapter < 1 || chapter > bookInfo(book).chapters) {
    return (
      <Screen title={t('notFound.title')}>
        <Heading>{t('notFound.title')}</Heading>
        <ErrorState message={t('reader.notFound')} />
      </Screen>
    );
  }
  return <Interlinear key={`${book}.${chapter}`} book={book} chapter={chapter} verse={params.v ? Number(params.v) : undefined} />;
}

function Interlinear({ book, chapter, verse }: { book: BookCode; chapter: number; verse?: number }) {
  const { palette, fonts } = useTheme();
  const kjv = useData<ChapterText>(`kjv/${book}/${chapter}.json`);
  const orig = useData<{ lang: 'hbo' | 'grc'; v: OrigVerse[] }>(paths.orig(book, chapter));
  const [tap, setTap] = useState<WordTap | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const scrolled = useRef(false);
  const name = bookName(book);
  const prev = adjacentChapter(book, chapter, -1);
  const next = adjacentChapter(book, chapter, 1);

  useEffect(() => {
    setCurrentPassage({ book, chapter, verse });
  }, [book, chapter, verse]);

  const ready = kjv.status === 'ready' && orig.status === 'ready';
  const byVerse = new Map((orig.data?.v ?? []).map((v) => [v.n, v]));
  return (
    <Screen ref={scrollRef} width={900} title={t('interlinear.title', { book: name, chapter })}>
      <Heading>{t('interlinear.title', { book: name, chapter })}</Heading>
      <View style={styles.links}>
        <TextButton label={t('reader.version.kjv')} onPress={() => replace(readHref(book, chapter, { v: verse }))} size={14} />
        <TextButton label={t('reader.version.orig')} onPress={() => replace(readHref(book, chapter, { tr: 'orig', v: verse }))} size={14} />
        <TextButton label={t('menu.interlinear')} active onPress={() => {}} size={14} />
      </View>
      <Text style={[styles.hint, { color: palette.muted, fontFamily: fonts.ui }]}>{t('interlinear.hint')}</Text>
      {kjv.status === 'error' || orig.status === 'error' ? (
        <ErrorState onRetry={() => (kjv.status === 'error' ? kjv.reload() : orig.reload())} />
      ) : !ready ? (
        <Loading />
      ) : (
        <View testID="interlinear">
          {kjv.data!.v.map((v) => (
            <View
              key={v.n}
              onLayout={(e) => {
                if (verse === v.n && !scrolled.current) {
                  scrolled.current = true;
                  const y = e.nativeEvent.layout.y;
                  requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: Math.max(0, y), animated: false }));
                }
              }}
            >
              <VerseRow verse={v} orig={byVerse.get(v.n)} hebrew={orig.data!.lang === 'hbo'} highlight={v.n === verse} onTap={setTap} />
            </View>
          ))}
        </View>
      )}
      <View style={styles.nav}>
        {prev ? <TextButton label={`‹ ${bookName(prev.book)} ${prev.chapter}`} onPress={() => go(interlinearHref(prev.book, prev.chapter))} /> : <View />}
        {next ? <TextButton label={`${bookName(next.book)} ${next.chapter} ›`} onPress={() => go(interlinearHref(next.book, next.chapter))} /> : null}
      </View>
      {tap ? <WordPanel word={tap} book={book} chapter={chapter} onClose={() => setTap(null)} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  links: { flexDirection: 'row', marginLeft: -8, marginBottom: 6 },
  hint: { fontSize: 13, marginBottom: 16 },
  verse: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderRadius: 4 },
  num: { fontSize: 12, fontWeight: '600', marginBottom: 6 },
  cells: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  cell: { paddingHorizontal: 6, paddingVertical: 4, borderRadius: 8, alignItems: 'center', minWidth: 28 },
  orig: { alignItems: 'center', marginTop: 2 },
  meta: { fontSize: 11 },
  untranslated: { fontSize: 13, marginTop: 8, lineHeight: 22 },
  nav: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 36, marginHorizontal: -8 },
});
