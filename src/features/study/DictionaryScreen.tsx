import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Body, ErrorState, Heading, Loading, Screen, TextButton } from '@/components/ui';
import { type MessageKey, t } from '@/i18n';
import { loadData, useLoad } from '@/lib/data/fetch';
import type { DictIndex, DictionaryId } from '@/lib/data/types';
import { useTheme } from '@/theme';

import { replace } from '../nav/navigate';
import { isMissing, studyPaths, useOptionalData } from './data';
import { DICTIONARIES, entriesForLetter, LETTERS, lettersWithEntries, searchAll, type SearchGroup } from './dictionary';
import { dictEntryHref, dictionaryHref, topicsHref } from './hrefs';
import { Credit, Letters, Note, RowLink, SearchField, Switcher } from './parts';

const PAGE = 200;
const NAVE = ['nave'] as const;
const GROUP_PAGE = 25;

const dictName = (d: DictionaryId) => t(`study.dict.name.${d}` as MessageKey);

/** Loads several indexes; a missing one (not generated) is left out. */
async function loadIndexes(dicts: readonly DictionaryId[]): Promise<Partial<Record<DictionaryId, DictIndex>>> {
  const out: Partial<Record<DictionaryId, DictIndex>> = {};
  await Promise.all(
    dicts.map(async (d) => {
      try {
        out[d] = await loadData<DictIndex>(studyPaths.dictIndex(d));
      } catch (e) {
        if (!isMissing(e as Error)) throw e;
      }
    }),
  );
  return out;
}

function EntryList({ entries, dict, testID }: { entries: DictIndex; dict: DictionaryId; testID: string }) {
  const { palette, fonts, scale } = useTheme();
  const [shown, setShown] = useState(PAGE);
  return (
    <View testID={testID}>
      <Note style={{ marginBottom: 4 }}>{t('study.dict.entries', { n: entries.length })}</Note>
      {entries.slice(0, shown).map(([id, title]) => (
        <RowLink key={id} href={dictEntryHref(dict, id)} testID={`${testID}-${id}`}>
          <Text style={{ color: palette.text, fontFamily: fonts.ui, fontSize: 16 * Math.min(scale, 1.3) }}>{title}</Text>
        </RowLink>
      ))}
      {shown < entries.length ? (
        <TextButton label={t('study.dict.moreResults')} onPress={() => setShown((n) => n + PAGE)} style={styles.more} testID={`${testID}-more`} />
      ) : null}
    </View>
  );
}

function ResultGroup({ group, showName }: { group: SearchGroup; showName: boolean }) {
  const { palette, fonts, scale } = useTheme();
  const [shown, setShown] = useState(GROUP_PAGE);
  return (
    <View testID={`dict-results-${group.dict}`} style={styles.group}>
      {showName ? <Heading level={2}>{t('study.dict.resultsIn', { name: dictName(group.dict), n: group.entries.length })}</Heading> : null}
      {group.entries.slice(0, shown).map(([id, title]) => (
        <RowLink key={id} href={dictEntryHref(group.dict, id)} testID={`dict-result-${group.dict}-${id}`}>
          <Text style={{ color: palette.text, fontFamily: fonts.ui, fontSize: 16 * Math.min(scale, 1.3) }}>{title}</Text>
        </RowLink>
      ))}
      {shown < group.entries.length ? (
        <TextButton label={t('study.dict.moreResults')} onPress={() => setShown((n) => n + GROUP_PAGE)} style={styles.more} />
      ) : null}
    </View>
  );
}

/** Search results across the given dictionaries, grouped by dictionary. */
function Results({ dicts, query }: { dicts: readonly DictionaryId[]; query: string }) {
  const indexes = useLoad(`dict-indexes:${dicts.join(',')}`, () => loadIndexes(dicts));
  const groups = useMemo(() => (indexes.status === 'ready' ? searchAll(indexes.data, dicts, query) : []), [indexes, dicts, query]);
  if (indexes.status === 'error') return <ErrorState />;
  if (indexes.status === 'loading') return <Loading />;
  if (!Object.keys(indexes.data).length) return <Body muted>{t('study.dict.unavailable')}</Body>;
  const total = groups.reduce((n, g) => n + g.entries.length, 0);
  return (
    <View testID="dict-results" aria-live="polite">
      {total ? <Note style={{ marginBottom: 4 }}>{t('study.dict.results', { n: total })}</Note> : <Body muted>{t('study.dict.noResults', { q: query.trim() })}</Body>}
      {groups.map((g) => (
        <ResultGroup key={`${g.dict}:${query}`} group={g} showName={dicts.length > 1} />
      ))}
    </View>
  );
}

/** A–Z browsing of one index. */
function Browse({ dict, letter, onLetter }: { dict: DictionaryId; letter: string; onLetter: (l: string) => void }) {
  const index = useOptionalData<DictIndex>(studyPaths.dictIndex(dict));
  const available = useMemo(() => (index.data ? lettersWithEntries(index.data) : undefined), [index.data]);
  const entries = useMemo(() => (index.data ? entriesForLetter(index.data, letter) : []), [index.data, letter]);
  if (index.status === 'error') return <ErrorState onRetry={index.reload} />;
  if (index.status === 'loading') return <Loading />;
  if (!index.data) return <Body muted>{t('study.dict.unavailable')}</Body>;
  return (
    <>
      <Letters value={letter} available={available} onChange={onLetter} />
      <Heading level={2}>{letter}</Heading>
      <EntryList key={`${dict}:${letter}`} entries={entries} dict={dict} testID="dict-entries" />
    </>
  );
}

const toLetter = (l?: string) => (l && LETTERS.includes(l.toUpperCase()) ? l.toUpperCase() : 'A');

/** /study/dictionary: choose a dictionary, browse A–Z, or search headwords across all three. */
export function DictionaryScreen() {
  const params = useLocalSearchParams<{ d?: string; l?: string; q?: string }>();
  const dict: (typeof DICTIONARIES)[number] = (DICTIONARIES as readonly string[]).includes(params.d ?? '') ? (params.d as (typeof DICTIONARIES)[number]) : 'easton';
  const letter = toLetter(params.l);
  const [q, setQ] = useState(params.q ?? '');
  const searching = q.trim().length > 0;
  const options = DICTIONARIES.map((d) => ({ id: d, label: t(`study.dict.${d}` as MessageKey), accessibilityLabel: dictName(d) }));

  return (
    <Screen title={t('study.dict.title')}>
      <Heading>{t('study.dict.title')}</Heading>
      <SearchField
        testID="dict-search"
        nativeID="dict-search-label"
        value={q}
        onChange={setQ}
        label={t('study.dict.searchLabel')}
        placeholder={t('study.dict.searchPlaceholder')}
      />
      {searching ? (
        <Results dicts={DICTIONARIES} query={q} />
      ) : (
        <>
          <Switcher testID="dict-switch" label={t('study.dict.choose')} options={options} value={dict} onChange={(d) => replace(dictionaryHref({ d, l: letter }))} />
          <Browse dict={dict} letter={letter} onLetter={(l) => replace(dictionaryHref({ d: dict, l }))} />
        </>
      )}
      <Credit>{t('study.dict.credit', { name: searching ? DICTIONARIES.map(dictName).join('; ') : dictName(dict) })}</Credit>
    </Screen>
  );
}

/** /study/topics: Nave's Topical Bible, A–Z plus search. */
export function TopicsScreen() {
  const params = useLocalSearchParams<{ l?: string; q?: string }>();
  const letter = toLetter(params.l);
  const [q, setQ] = useState(params.q ?? '');
  const searching = q.trim().length > 0;
  return (
    <Screen title={t('study.topics.title')}>
      <Heading>{t('study.topics.title')}</Heading>
      <Note style={{ marginBottom: 12 }}>{t('study.topics.intro')}</Note>
      <SearchField
        testID="topic-search"
        nativeID="topic-search-label"
        value={q}
        onChange={setQ}
        label={t('study.topics.searchLabel')}
        placeholder={t('study.topics.searchPlaceholder')}
      />
      {searching ? <Results dicts={NAVE} query={q} /> : <Browse dict="nave" letter={letter} onLetter={(l) => replace(topicsHref({ l }))} />}
      <Credit>{t('study.dict.credit', { name: dictName('nave') })}</Credit>
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { marginBottom: 8 },
  more: { alignSelf: 'flex-start', marginTop: 8, marginLeft: -8, minHeight: 44, justifyContent: 'center' },
});
