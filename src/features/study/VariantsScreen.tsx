import { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Body, ErrorState, Heading, Loading, Screen } from '@/components/ui';
import { bookName, type MessageKey, t } from '@/i18n';
import { bookInfo, type BookCode } from '@/lib/bible/books';
import type { OrigChapter, OrigVerse, VariantChapter, VariantUnit } from '@/lib/data/types';
import { setCurrentPassage } from '@/lib/state/passage';
import { useTheme } from '@/theme';

import { readHref } from '../nav/hrefs';
import { studyPaths, useOptionalData } from './data';
import { variantsHref } from './hrefs';
import { ChapterNav, Credit, InlineLink, Note } from './parts';
import { NotFoundScreen, usePassageParams } from './passage';
import { bareWord, editionLegend, formatEditions, groupUnits, MAIN_EDITIONS, variantVerses, type WordVariants } from './variants';

/** Marks Greek runs for screen readers and fonts (react-native-web passes lang through). */
const GRC = { lang: 'grc' } as object;

export function VariantsScreen() {
  const p = usePassageParams();
  if (!p) return <NotFoundScreen />;
  return <Variants key={`${p.book}.${p.chapter}`} book={p.book} chapter={p.chapter} verse={p.v} />;
}

/** The verse's Greek text with the words that differ between editions softly highlighted. */
function GreekVerse({ verse, marked }: { verse: OrigVerse; marked: Set<number> }) {
  const { palette, fonts, scale } = useTheme();
  return (
    <Text {...GRC} style={{ color: palette.text, fontFamily: fonts.greek, fontSize: 20 * scale, lineHeight: 34 * scale }}>
      {verse.w.map((w, i) => (
        <Text key={i}>
          {i > 0 ? ' ' : ''}
          {marked.has(i) ? (
            <Text
              testID={`var-word-${verse.n}-${i}`}
              accessibilityLabel={t('study.var.wordLabel', { greek: bareWord(w.t), gloss: w.g })}
              style={{ backgroundColor: palette.highlight, borderRadius: 4 }}
            >
              {w.t}
            </Text>
          ) : (
            w.t
          )}
        </Text>
      ))}
    </Text>
  );
}

function Unit({ unit, kind }: { unit: VariantUnit; kind: 'presence' | 'alt' }) {
  const { palette, fonts, scale } = useTheme();
  const size = 15 * Math.min(scale, 1.3);
  return (
    <Text style={{ color: palette.text, fontFamily: fonts.ui, fontSize: size, lineHeight: size * 1.55 }}>
      {kind === 'alt' ? <Text style={{ color: palette.muted }}>{`${t('study.var.alt')}: `}</Text> : null}
      <Text {...GRC} style={{ fontFamily: fonts.greek, fontSize: size * 1.15 }}>
        {bareWord(unit.t)}
      </Text>
      {unit.g ? <Text style={{ color: palette.muted }}>{` (${unit.g})`}</Text> : null}
      {' — '}
      {kind === 'presence' ? t('study.var.onlyIn', { editions: formatEditions(unit.ed) }) : t('study.var.altIn', { editions: formatEditions(unit.ed) })}
    </Text>
  );
}

function WordUnits({ group, verse }: { group: WordVariants; verse: number }) {
  const { palette } = useTheme();
  return (
    <View testID={`var-unit-${verse}-${group.w}`} style={[styles.unit, { borderColor: palette.gold }]}>
      {group.presence ? <Unit unit={group.presence} kind="presence" /> : null}
      {group.alts.map((u, i) => (
        <Unit key={i} unit={u} kind="alt" />
      ))}
    </View>
  );
}

function Legend({ other }: { other: string[] }) {
  const { palette, fonts } = useTheme();
  return (
    <View testID="var-legend" style={[styles.legend, { borderColor: palette.rule, backgroundColor: palette.surface }]}>
      <Heading level={2} style={styles.legendHeading}>
        {t('study.var.legend')}
      </Heading>
      <Note style={{ marginBottom: 8 }}>{t('study.var.legendHint')}</Note>
      {MAIN_EDITIONS.map((code) => (
        <View key={code} style={styles.legendRow}>
          <Text style={[styles.legendCode, { color: palette.text, fontFamily: fonts.ui }]}>{code}</Text>
          <Text style={[styles.legendName, { color: palette.text, fontFamily: fonts.ui }]}>{t(`study.var.ed.${code}` as MessageKey)}</Text>
        </View>
      ))}
      {other.length ? <Note style={{ marginTop: 8 }}>{t('study.var.otherMarks')}</Note> : null}
    </View>
  );
}

function Variants({ book, chapter, verse }: { book: BookCode; chapter: number; verse?: number }) {
  const { palette, fonts } = useTheme();
  const nt = bookInfo(book).testament === 'NT';
  const variants = useOptionalData<VariantChapter>(nt ? studyPaths.variants(book, chapter) : null);
  const orig = useOptionalData<OrigChapter>(nt ? studyPaths.orig(book, chapter) : null);
  const scrollRef = useRef<ScrollView>(null);
  const scrolled = useRef(false);
  const label = `${bookName(book)} ${chapter}`;

  useEffect(() => {
    setCurrentPassage({ book, chapter, verse });
  }, [book, chapter, verse]);

  const failed = variants.status === 'error' || orig.status === 'error';
  const ready = variants.status === 'ready' && orig.status === 'ready';
  const byVerse = new Map((orig.data?.v ?? []).map((v) => [v.n, v]));
  const verses = variantVerses(variants.data ?? undefined);
  const legend = editionLegend(variants.data ?? undefined);

  return (
    <Screen ref={scrollRef} title={t('study.var.pageTitle', { label })}>
      <Heading>{t('study.var.pageTitle', { label })}</Heading>
      <View style={styles.links}>
        <InlineLink href={readHref(book, chapter, { v: verse })} style={{ fontFamily: fonts.ui, fontSize: 14 }}>
          {t('study.readPassage', { label })}
        </InlineLink>
      </View>
      {!nt ? (
        <View testID="var-ot" style={styles.notice}>
          <Body muted>{t('study.var.otOnly')}</Body>
        </View>
      ) : (
        <>
          <Note style={styles.intro}>{t('study.var.intro')}</Note>
          <Legend other={legend.other} />
          {failed ? (
            <ErrorState onRetry={() => (variants.status === 'error' ? variants.reload() : orig.reload())} />
          ) : !ready ? (
            <Loading />
          ) : !verses.length ? (
            <Body muted>{t('study.var.none')}</Body>
          ) : (
            <View testID="variants">
              {verses.map((n) => {
                const units = variants.data!.v[String(n)] ?? [];
                const ov = byVerse.get(n);
                const groups = groupUnits(units, ov);
                const active = n === verse;
                return (
                  <View
                    key={n}
                    testID={`var-verse-${n}`}
                    onLayout={(e) => {
                      if (active && !scrolled.current) {
                        scrolled.current = true;
                        const y = e.nativeEvent.layout.y;
                        requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: Math.max(0, y - 16), animated: false }));
                      }
                    }}
                    style={[styles.verse, { borderColor: active ? palette.gold : palette.rule }]}
                  >
                    <Heading level={2} style={styles.verseHeading}>
                      {t('study.var.verse', { n })}
                    </Heading>
                    {ov ? <GreekVerse verse={ov} marked={new Set(groups.map((g) => g.w))} /> : null}
                    <View style={styles.units}>
                      {groups.map((g) => (
                        <WordUnits key={g.w} group={g} verse={n} />
                      ))}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </>
      )}
      <ChapterNav book={book} chapter={chapter} href={(b, c) => variantsHref(b, c)} />
      {nt ? <Credit>{t('study.var.credit')}</Credit> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  links: { flexDirection: 'row', marginBottom: 8, minHeight: 28, alignItems: 'center' },
  intro: { marginBottom: 12 },
  notice: { paddingVertical: 16 },
  legend: { borderWidth: 1, borderRadius: 14, padding: 16, marginBottom: 16 },
  legendHeading: { marginTop: 0 },
  legendRow: { flexDirection: 'row', gap: 12, paddingVertical: 3 },
  legendCode: { width: 48, fontSize: 14, fontWeight: '700' },
  legendName: { flex: 1, fontSize: 14 },
  verse: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 12 },
  verseHeading: { marginTop: 0, marginBottom: 6 },
  units: { marginTop: 8, gap: 6 },
  unit: { borderLeftWidth: 2, paddingLeft: 10 },
});
