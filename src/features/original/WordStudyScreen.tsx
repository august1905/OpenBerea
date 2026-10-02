import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { RichText } from '@/components/RichText';
import { Body, Button, ErrorState, Heading, Loading, Rule, Screen } from '@/components/ui';
import { type MessageKey, t } from '@/i18n';
import { formatRef } from '@/i18n/format';
import { fromVerseId } from '@/lib/bible/refs';
import { loadData, useData, useLoad } from '@/lib/data/fetch';
import type { ChapterText, LexIndex, StepLexEntry } from '@/lib/data/types';
import { pressStyle } from '@/lib/platform/press';
import { useDisplay } from '@/lib/state/display';
import { useTheme } from '@/theme';

import { readHref, wordHref } from '../nav/hrefs';
import { go } from '../nav/navigate';
import { Segments } from '../reader/Segments';
import { baseStrongs, languageOf, loadConcordance, loadLexicon, loadStepEntries } from './data';
import { WordDetails } from './WordDetails';

const PAGE = 25;

function Section({ title, children, testID }: { title: string; children: React.ReactNode; testID?: string }) {
  return (
    <View testID={testID} style={styles.section}>
      <Heading level={2}>{title}</Heading>
      {children}
    </View>
  );
}

function Lexicon({ title, testID, children }: { title: string; testID: string; children: React.ReactNode }) {
  const { palette, fonts } = useTheme();
  const [open, setOpen] = useState(true);
  return (
    <View testID={testID} style={[styles.lexicon, { borderColor: palette.rule }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
        style={pressStyle(({ hovered, focused }) => [styles.lexHead, (hovered || focused) && { backgroundColor: palette.highlight }])}
      >
        <Text style={{ color: palette.text, fontFamily: fonts.ui, fontSize: 16, fontWeight: '600', flex: 1 }}>{title}</Text>
        <Text style={{ color: palette.muted, fontFamily: fonts.ui }}>{open ? '−' : '+'}</Text>
      </Pressable>
      {open ? <View style={styles.lexBody}>{children}</View> : null}
    </View>
  );
}

function StepEntries({ entries }: { entries: StepLexEntry[] }) {
  const { palette, fonts } = useTheme();
  if (!entries.length) return <Body muted>{t('lex.unavailable')}</Body>;
  return (
    <>
      {entries.map((e) => (
        <View key={e.id} style={{ marginBottom: 12 }}>
          <Text style={{ color: palette.text, fontFamily: fonts.ui, fontSize: 15 }}>
            <Text style={{ fontWeight: '600' }}>{e.lemma}</Text> ({e.x}) — {e.g}
            {e.pos ? <Text style={{ color: palette.muted }}>{`  ·  ${e.pos}`}</Text> : null}
          </Text>
          {e.d?.length ? <RichText blocks={e.d} size={15} /> : null}
          {e.src ? <Text style={{ color: palette.muted, fontFamily: fonts.ui, fontSize: 12 }}>{t(`lex.source.${e.src}` as MessageKey)}</Text> : null}
        </View>
      ))}
    </>
  );
}

function PdLexicon({ kind, id }: { kind: 'thayer' | 'bdb' | 'gesenius'; id: string }) {
  const entry = useLoad(`${kind}:${id}`, () => loadLexicon(kind, id));
  if (entry.status === 'loading') return <Loading />;
  if (!entry.data) return <Body muted>{t('lex.unavailable')}</Body>;
  return <RichText testID={`lex-${kind}-body`} blocks={entry.data.blocks} size={15} />;
}

/** Every occurrence: verses in canonical order with the KJV text, a page at a time. */
function Occurrences({ id, verses }: { id: string; verses: number[] }) {
  const [shown, setShown] = useState(PAGE);
  const slice = verses.slice(0, shown);
  const chapters = useMemo(() => [...new Set(slice.map((v) => Math.floor(v / 1000)))], [slice]);
  const texts = useLoad(`occ:${id}:${shown}`, async () => {
    const out = new Map<number, ChapterText>();
    await Promise.all(
      chapters.map(async (key) => {
        const { book, chapter } = fromVerseId(key * 1000 + 1);
        out.set(key, await loadData<ChapterText>(`kjv/${book}/${chapter}.json`));
      }),
    );
    return out;
  });
  const { redLetter } = useDisplay();
  const { palette, fonts, scale } = useTheme();
  return (
    <View testID="occurrences">
      <Body muted>{t('study.word.occurrences', { shown: Math.min(shown, verses.length), total: verses.length })}</Body>
      {texts.status !== 'ready' ? (
        <Loading />
      ) : (
        slice.map((vid) => {
          const { book, chapter, verse } = fromVerseId(vid);
          const ch = texts.data.get(Math.floor(vid / 1000));
          const segs = verse === 0 ? ch?.title : ch?.v.find((v) => v.n === verse)?.s;
          return (
            <Pressable
              key={vid}
              testID={`occ-${vid}`}
              accessibilityRole="link"
              onPress={() => go(readHref(book, chapter, { v: verse || undefined }))}
              style={pressStyle(({ hovered, focused }) => [styles.occ, { borderColor: palette.rule }, (hovered || focused) && { backgroundColor: palette.highlight }])}
            >
              <Text style={{ color: palette.text, fontFamily: fonts.ui, fontWeight: '600', fontSize: 14 }}>
                {verse === 0 ? `${formatRef({ book, chapter })} (${t('orig.title')})` : formatRef({ book, chapter, verse })}
              </Text>
              <Text style={{ color: palette.text, fontFamily: fonts.scripture, fontSize: 16 * scale, lineHeight: 26 * scale }}>
                {segs ? <Segments segs={segs} redLetter={redLetter} highlightStrongs={id} /> : null}
              </Text>
            </Pressable>
          );
        })
      )}
      {shown < verses.length ? (
        <View style={{ marginTop: 12 }}>
          <Button testID="occ-more" label={t('study.word.showMore')} onPress={() => setShown((n) => n + PAGE)} />
        </View>
      ) : null}
    </View>
  );
}

function Lookup() {
  const { palette, fonts } = useTheme();
  const [q, setQ] = useState('');
  const index = useData<LexIndex>('strongs/index.json');
  const query = q.trim().toLowerCase();
  const results = useMemo(() => {
    if (!query || !index.data) return [];
    const strip = (s: string) => s.normalize('NFD').replace(/[̀-֑ͯ-ׇ]/g, '').toLowerCase();
    const sq = strip(query);
    return index.data.filter(([, lemma, x, gloss]) => strip(lemma).includes(sq) || strip(x).includes(sq) || gloss.toLowerCase().includes(query)).slice(0, 40);
  }, [query, index.data]);
  const submit = () => {
    const id = baseStrongs(q);
    if (id) go(wordHref(id));
    else if (results[0]) go(wordHref(results[0][0]));
  };
  return (
    <View>
      <Text nativeID="word-lookup-label" style={[styles.label, { color: palette.muted, fontFamily: fonts.ui }]}>
        {t('study.word.searchLabel')}
      </Text>
      <TextInput
        testID="word-lookup"
        aria-labelledby="word-lookup-label"
        accessibilityLabel={t('study.word.searchLabel')}
        value={q}
        onChangeText={setQ}
        onSubmitEditing={submit}
        placeholder={t('study.word.searchPlaceholder')}
        placeholderTextColor={palette.muted}
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.input, { color: palette.text, borderColor: palette.gold, backgroundColor: palette.surface, fontFamily: fonts.ui }]}
      />
      {results.map(([id, lemma, x, gloss]) => (
        <Pressable
          key={id}
          accessibilityRole="link"
          onPress={() => go(wordHref(id))}
          style={pressStyle(({ hovered, focused }) => [styles.occ, { borderColor: palette.rule }, (hovered || focused) && { backgroundColor: palette.highlight }])}
        >
          <Text style={{ color: palette.text, fontFamily: fonts.ui, fontSize: 15 }}>
            <Text style={{ fontWeight: '600' }}>{id}</Text>{' '}
            <Text style={{ fontFamily: languageOf(id) === 'hbo' ? fonts.hebrew : fonts.greek, fontSize: 18 }}>{lemma}</Text> {x} — {gloss}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Guided word study: word → lexicons → usage → every occurrence. */
export function WordStudyScreen() {
  const { strongs } = useLocalSearchParams<{ strongs?: string }>();
  const id = strongs ? baseStrongs(strongs) : null;
  if (!strongs) {
    return (
      <Screen title={t('menu.wordStudy')}>
        <Heading>{t('menu.wordStudy')}</Heading>
        <Body muted>{t('study.word.intro')}</Body>
        <Rule />
        <Lookup />
      </Screen>
    );
  }
  if (!id) {
    return (
      <Screen title={t('notFound.title')}>
        <Heading>{t('notFound.title')}</Heading>
        <ErrorState message={t('word.notFound', { id: strongs })} />
      </Screen>
    );
  }
  return <WordStudy key={id} id={id} />;
}

function WordStudy({ id }: { id: string }) {
  const lang = languageOf(id);
  const conc = useLoad(`conc:${id}`, () => loadConcordance(id));
  const step = useLoad(`step:${id}`, () => loadStepEntries(id));
  return (
    <Screen title={t('study.word.title', { id })}>
      <Heading>{t('study.word.title', { id })}</Heading>
      <Body muted>{t('study.word.intro')}</Body>
      <Section title={t('study.word.step1')} testID="ws-word">
        <WordDetails id={id} showActions={false} hideUsage />
      </Section>
      <Section title={t('study.word.step2')} testID="ws-lexicons">
        <Lexicon title={t('lex.step')} testID="lex-step">
          {step.status === 'ready' ? <StepEntries entries={step.data} /> : <Loading />}
        </Lexicon>
        {lang === 'hbo' ? (
          <Lexicon title={t('lex.bdb')} testID="lex-bdb">
            <PdLexicon kind="bdb" id={id} />
          </Lexicon>
        ) : null}
        <Body muted style={{ fontSize: 13, marginTop: 4 }}>
          {lang === 'grc' ? t('lex.thayerMissing') : t('lex.geseniusMissing')}
        </Body>
      </Section>
      <Section title={t('study.word.step3')} testID="ws-usage">
        {conc.status === 'ready' && conc.data ? (
          <UsageTable kjv={conc.data.kjv} n={conc.data.n} verses={conc.data.v.length} />
        ) : conc.status === 'loading' ? (
          <Loading />
        ) : (
          <Body muted>{t('lex.unavailable')}</Body>
        )}
      </Section>
      <Section title={t('study.word.step4')} testID="ws-occurrences">
        {conc.status === 'ready' && conc.data ? <Occurrences id={id} verses={conc.data.v} /> : conc.status === 'loading' ? <Loading /> : null}
      </Section>
    </Screen>
  );
}

function UsageTable({ kjv, n, verses }: { kjv: [string, number][]; n: number; verses: number }) {
  const { palette, fonts } = useTheme();
  const max = kjv[0]?.[1] ?? 1;
  return (
    <View testID="usage-table">
      <Body>{t('word.usageCount', { n, verses })}</Body>
      <Text style={[styles.label, { color: palette.muted, fontFamily: fonts.ui, marginTop: 12 }]}>{t('word.kjvRenders')}</Text>
      {kjv.slice(0, 15).map(([word, count]) => (
        <View key={word} style={styles.barRow}>
          <Text style={{ color: palette.text, fontFamily: fonts.ui, fontSize: 14, width: 150 }} numberOfLines={1}>
            {word}
          </Text>
          <View style={[styles.bar, { width: `${Math.max(4, (count / max) * 100) * 0.6}%`, backgroundColor: palette.gold }]} />
          <Text style={{ color: palette.text, fontFamily: fonts.ui, fontSize: 14 }}>{count}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 8 },
  lexicon: { borderWidth: 1, borderRadius: 14, marginBottom: 10, overflow: 'hidden' },
  lexHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, minHeight: 48 },
  lexBody: { paddingHorizontal: 16, paddingBottom: 12 },
  occ: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 10, paddingHorizontal: 6, borderRadius: 6 },
  label: { fontSize: 13, fontWeight: '600', letterSpacing: 0.4, marginBottom: 6 },
  input: { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, fontSize: 17, marginBottom: 12 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  bar: { height: 8, borderRadius: 4 },
});
