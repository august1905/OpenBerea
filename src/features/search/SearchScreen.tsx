import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Body, Button, Heading, Loading, Screen, TextButton } from '@/components/ui';
import { bookName, type MessageKey, t } from '@/i18n';
import { formatRef } from '@/i18n/format';
import { BOOKS, bookByIndex, type BookCode } from '@/lib/bible/books';
import { fromVerseId } from '@/lib/bible/refs';
import { verseAtOrdinal, verseOrdinal } from '@/lib/bible/versification';
import { useData, useLoad } from '@/lib/data/fetch';
import type { LexIndex, SearchCorpus } from '@/lib/data/types';
import { pressStyle } from '@/lib/platform/press';
import { useTheme } from '@/theme';

import { readHref, searchHref, wordHref } from '../nav/hrefs';
import { go } from '../nav/navigate';
import { languageOf, loadConcordance } from '../original/data';
import { compileQuery, detectMode, highlightRuns, normalizeStrongsQuery, searchCorpus, searchLexicon, type SearchMode } from './engine';

const MODES: SearchMode[] = ['words', 'phrase', 'strongs', 'original'];
const PAGE = 50;

function Chip({ label, active, onPress, testID }: { label: string; active: boolean; onPress: () => void; testID?: string }) {
  const { palette, fonts } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      aria-current={active ? 'true' : undefined}
      onPress={onPress}
      style={pressStyle(({ hovered, focused }) => [
        styles.chip,
        { borderColor: active ? palette.gold : palette.rule, backgroundColor: active || hovered || focused ? palette.highlight : 'transparent' },
      ])}
    >
      <Text style={{ color: palette.text, fontFamily: fonts.ui, fontSize: 14, fontWeight: active ? '600' : '400' }}>{label}</Text>
    </Pressable>
  );
}

interface Hit {
  ordinal: number;
  book: BookCode;
  chapter: number;
  verse: number;
}

function toHit(ordinal: number): Hit {
  const v = verseAtOrdinal(ordinal);
  return { ordinal, book: bookByIndex(v.bookIndex)!.code, chapter: v.chapter, verse: v.verse };
}

function Results({ hits, corpus, highlight, tr }: { hits: Hit[]; corpus: SearchCorpus; highlight: RegExp | null; tr: 'kjv' | 'asv' }) {
  const { palette, fonts, scale } = useTheme();
  const [book, setBook] = useState<BookCode | null>(null);
  const [shown, setShown] = useState(PAGE);
  const counts = useMemo(() => {
    const m = new Map<BookCode, number>();
    for (const h of hits) m.set(h.book, (m.get(h.book) ?? 0) + 1);
    return BOOKS.filter((b) => m.has(b.code)).map((b) => [b.code, m.get(b.code)!] as const);
  }, [hits]);
  const filtered = book ? hits.filter((h) => h.book === book) : hits;
  const total = filtered.length;
  return (
    <View testID="search-results">
      <Text role="status" testID="search-count" style={[styles.count, { color: palette.text, fontFamily: fonts.ui }]}>
        {hits.length === 1 ? t('search.resultsOne') : t('search.results', { n: hits.length })}
      </Text>
      {counts.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <Chip label={t('search.allBooks')} active={!book} onPress={() => setBook(null)} />
          {counts.map(([code, n]) => (
            <Chip key={code} testID={`search-book-${code}`} label={`${bookName(code)} (${n})`} active={book === code} onPress={() => { setBook(code); setShown(PAGE); }} />
          ))}
        </ScrollView>
      ) : null}
      {filtered.slice(0, shown).map((h) => (
        <Pressable
          key={h.ordinal}
          testID={`hit-${h.book}-${h.chapter}-${h.verse}`}
          accessibilityRole="link"
          onPress={() => go(readHref(h.book, h.chapter, { v: h.verse, tr: tr === 'asv' ? 'asv' : undefined }))}
          style={pressStyle(({ hovered, focused }) => [styles.hit, { borderColor: palette.rule }, (hovered || focused) && { backgroundColor: palette.highlight }])}
        >
          <Text style={{ color: palette.text, fontFamily: fonts.ui, fontWeight: '600', fontSize: 14 }}>{formatRef({ book: h.book, chapter: h.chapter, verse: h.verse })}</Text>
          <Text style={{ color: palette.text, fontFamily: fonts.scripture, fontSize: 16 * scale, lineHeight: 26 * scale }}>
            {highlight
              ? highlightRuns(corpus[h.ordinal], highlight).map((r, i) =>
                  r.hit ? (
                    <Text key={i} style={{ backgroundColor: palette.highlight, fontWeight: '600' }}>
                      {r.t}
                    </Text>
                  ) : (
                    r.t
                  ),
                )
              : corpus[h.ordinal]}
          </Text>
        </Pressable>
      ))}
      {shown < total ? (
        <View style={styles.more}>
          <Body muted>{t('search.showing', { shown, total })}</Body>
          <Button testID="search-more" label={t('search.showMore')} onPress={() => setShown((n) => n + PAGE)} />
        </View>
      ) : null}
    </View>
  );
}

function StrongsResults({ id, corpus, tr }: { id: string; corpus: SearchCorpus; tr: 'kjv' | 'asv' }) {
  const { palette, fonts } = useTheme();
  const conc = useLoad(`conc:${id}`, () => loadConcordance(id));
  const index = useData<LexIndex>('strongs/index.json');
  const row = index.data?.find((r) => r[0] === id);
  const hits = useMemo(
    () =>
      (conc.data?.v ?? [])
        .map((vid) => {
          const { book, chapter, verse } = fromVerseId(vid);
          return verse === 0 ? null : toHit(verseOrdinal(book, chapter, verse));
        })
        .filter((h): h is Hit => !!h),
    [conc.data],
  );
  if (conc.status === 'loading') return <Loading />;
  return (
    <View>
      <View testID="strongs-card" style={[styles.card, { borderColor: palette.rule }]}>
        <Text style={{ color: palette.text, fontFamily: languageOf(id) === 'hbo' ? fonts.hebrew : fonts.greek, fontSize: 28 }}>{row?.[1] ?? id}</Text>
        <Text style={{ color: palette.text, fontFamily: fonts.ui, fontSize: 15 }}>
          {id}
          {row ? ` · ${row[2]} · ${row[3]}` : ''}
        </Text>
        <View style={{ marginTop: 10 }}>
          <Button label={t('search.wordStudy')} onPress={() => go(wordHref(id))} />
        </View>
      </View>
      {conc.data ? <Results hits={hits} corpus={corpus} highlight={null} tr={tr} /> : <Body muted>{t('search.noResults')}</Body>}
    </View>
  );
}

function OriginalResults({ q }: { q: string }) {
  const { palette, fonts } = useTheme();
  const index = useData<LexIndex>('strongs/index.json');
  const rows = useMemo(() => (index.data ? searchLexicon(index.data, q) : []), [index.data, q]);
  if (index.status === 'loading') return <Loading />;
  return (
    <View testID="original-results">
      <Text role="status" style={[styles.count, { color: palette.text, fontFamily: fonts.ui }]}>{t('search.words', { n: rows.length })}</Text>
      {rows.map(([id, lemma, x, gloss]) => (
        <View key={id} style={[styles.hit, styles.row, { borderColor: palette.rule }]}>
          <Pressable accessibilityRole="link" onPress={() => go(wordHref(id))} style={{ flex: 1 }}>
            <Text style={{ color: palette.text, fontFamily: fonts.ui, fontSize: 15 }}>
              <Text style={{ fontFamily: languageOf(id) === 'hbo' ? fonts.hebrew : fonts.greek, fontSize: 20 }}>{lemma}</Text>
              {`  ${x} — ${gloss}  `}
              <Text style={{ color: palette.muted }}>{id}</Text>
            </Text>
          </Pressable>
          <TextButton testID={`find-${id}`} label={t('search.findVerses')} onPress={() => go(`${searchHref(id)}&mode=strongs`)} />
        </View>
      ))}
    </View>
  );
}

/** Search by keyword, phrase, Strong's number, or original-language word (prebuilt indexes, in the browser). */
export function SearchScreen() {
  const params = useLocalSearchParams<{ q?: string; mode?: string; tr?: string }>();
  const { palette, fonts } = useTheme();
  const [input, setInput] = useState(params.q ?? '');
  const q = (params.q ?? '').trim();
  const mode: SearchMode = MODES.includes(params.mode as SearchMode) ? (params.mode as SearchMode) : detectMode(q);
  const tr: 'kjv' | 'asv' = params.tr === 'asv' ? 'asv' : 'kjv';
  const corpus = useData<SearchCorpus>(q && mode !== 'original' ? `search/${tr}.json` : null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const id = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(id);
  }, []);

  // The query lives in the URL, so results can be linked and the back button works.
  const setParams = (next: { q?: string; mode?: SearchMode | ''; tr?: string }) => {
    const value = (v: string | undefined) => (v ? v : undefined);
    router.setParams({
      q: value(next.q ?? params.q),
      mode: value(next.mode ?? params.mode),
      tr: value(next.tr ?? params.tr) === 'kjv' ? undefined : value(next.tr ?? params.tr),
    } as never);
  };

  const compiled = useMemo(() => (mode === 'words' || mode === 'phrase' ? compileQuery(q, mode) : null), [q, mode]);
  const hits = useMemo(() => {
    if (!compiled || !corpus.data) return null;
    return searchCorpus(corpus.data, compiled).map(toHit);
  }, [compiled, corpus.data]);

  const strongsId = mode === 'strongs' ? normalizeStrongsQuery(q) : null;
  const validStrongs = strongsId && /^[GH]\d+$/.test(strongsId);

  return (
    <Screen title={q ? `${t('search.title')}: ${q}` : t('search.title')}>
      <Heading>{t('search.title')}</Heading>
      <Text nativeID="search-label" style={[styles.label, { color: palette.muted, fontFamily: fonts.ui }]}>
        {t('search.label')}
      </Text>
      <TextInput
        ref={inputRef}
        testID="search-input"
        aria-labelledby="search-label"
        accessibilityLabel={t('search.label')}
        value={input}
        onChangeText={setInput}
        onSubmitEditing={() => setParams({ q: input.trim(), mode: '' })}
        placeholder={t('search.placeholder')}
        placeholderTextColor={palette.muted}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        enterKeyHint="search"
        style={[styles.input, { color: palette.text, borderColor: palette.gold, backgroundColor: palette.surface, fontFamily: fonts.ui }]}
      />
      <View style={styles.chips} role="group" aria-label={t('search.modes')}>
        {MODES.map((m) => (
          <Chip
            key={m}
            testID={`mode-${m}`}
            label={t(`search.mode.${m}` as MessageKey)}
            active={!!q && mode === m}
            onPress={() => setParams({ q: input.trim() || q, mode: m })}
          />
        ))}
      </View>
      {mode === 'words' || mode === 'phrase' || mode === 'strongs' ? (
        <View style={styles.chips} role="group" aria-label={t('search.translation')}>
          <Chip testID="tr-kjv" label={t('reader.version.kjv')} active={tr === 'kjv'} onPress={() => setParams({ tr: 'kjv' })} />
          <Chip testID="tr-asv" label={t('reader.version.asv')} active={tr === 'asv'} onPress={() => setParams({ tr: 'asv' })} />
        </View>
      ) : null}
      <Body muted style={{ marginBottom: 12, fontSize: 14 }}>
        {t(`search.hint.${q ? mode : 'words'}` as MessageKey)}
      </Body>

      {!q ? null : mode === 'original' ? (
        <OriginalResults q={q} />
      ) : corpus.status === 'loading' ? (
        <Loading label={t('search.loading')} />
      ) : corpus.status === 'error' ? (
        <Body muted>{t('common.offlineUnavailable')}</Body>
      ) : mode === 'strongs' ? (
        validStrongs ? <StrongsResults key={`${strongsId}-${tr}`} id={strongsId!} corpus={corpus.data!} tr={tr} /> : <Body muted>{t('search.invalidStrongs')}</Body>
      ) : hits && hits.length ? (
        <Results key={`${q}-${mode}-${tr}`} hits={hits} corpus={corpus.data!} highlight={compiled!.highlight} tr={tr} />
      ) : (
        <Body muted>{t('search.noResults')}</Body>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8, marginTop: 8 },
  input: { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, fontSize: 18, minHeight: 52 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chipRow: { flexDirection: 'row', gap: 8, marginTop: 4, marginBottom: 8 },
  chip: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, minHeight: 36, justifyContent: 'center' },
  count: { fontSize: 15, fontWeight: '600', marginVertical: 8 },
  hit: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 10, paddingHorizontal: 6, borderRadius: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  more: { marginTop: 16, gap: 8 },
  card: { borderWidth: 1, borderRadius: 16, padding: 18, marginVertical: 12 },
});
