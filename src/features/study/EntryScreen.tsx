import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { RichText } from '@/components/RichText';
import { ErrorState, Heading, Loading, Screen, TextButton } from '@/components/ui';
import { type MessageKey, t } from '@/i18n';
import { useLoad } from '@/lib/data/fetch';
import type { DictionaryId } from '@/lib/data/types';
import { useTheme } from '@/theme';

import { go } from '../nav/navigate';
import { isMissing, loadDictEntry } from './data';
import { letterOf, neighbors, toDictionaryId } from './dictionary';
import { dictEntryHref, dictionaryHref, topicsHref } from './hrefs';
import { Credit, InlineLink } from './parts';
import { NotFoundScreen } from './passage';

const dictName = (d: DictionaryId) => t(`study.dict.name.${d}` as MessageKey);

/** One dictionary entry or Nave's topic, with its source text (refs are links) and neighbors. */
function EntryView({ dict, id }: { dict: DictionaryId; id: string }) {
  const { fonts } = useTheme();
  const data = useLoad(`dict-entry:${dict}:${id}`, () => loadDictEntry(dict, id));
  const nave = dict === 'nave';

  if (data.status === 'error') {
    return isMissing(data.error) ? <NotFoundScreen message={t('study.dict.unavailable')} /> : <ErrorState />;
  }
  if (data.status === 'loading') {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }
  const { entry, index } = data.data;
  if (!entry) return <NotFoundScreen message={t('study.dict.entryNotFound', { id })} />;
  const { prev, next } = neighbors(index, entry.id);
  const letter = letterOf(entry.title);
  const back = nave ? topicsHref({ l: letter === '#' ? undefined : letter }) : dictionaryHref({ d: dict, l: letter === '#' ? undefined : letter });
  const backLabel = nave ? t('study.topics.back') : dictName(dict);

  return (
    <Screen title={`${entry.title} · ${nave ? t('study.topics.title') : dictName(dict)}`}>
      <View style={styles.back}>
        <InlineLink testID="entry-back" href={back} style={{ fontFamily: fonts.ui, fontSize: 14 }}>
          {`‹ ${backLabel}`}
        </InlineLink>
      </View>
      <Heading>{entry.title}</Heading>
      <View testID="dict-entry" style={styles.body}>
        <RichText testID="dict-entry-body" blocks={entry.blocks} serif={!nave} />
      </View>
      <View style={styles.nav}>
        {prev ? (
          <TextButton
            testID="entry-prev"
            label={`‹ ${prev[1]}`}
            accessibilityLabel={t('study.dict.prev', { title: prev[1] })}
            onPress={() => go(dictEntryHref(dict, prev[0]))}
            style={styles.navButton}
          />
        ) : (
          <View />
        )}
        {next ? (
          <TextButton
            testID="entry-next"
            label={`${next[1]} ›`}
            accessibilityLabel={t('study.dict.next', { title: next[1] })}
            onPress={() => go(dictEntryHref(dict, next[0]))}
            style={styles.navButton}
          />
        ) : null}
      </View>
      <Credit>{t('study.dict.credit', { name: dictName(dict) })}</Credit>
    </Screen>
  );
}

/** /study/dictionary/[dict]/[entry]. Nave's entries render the topic view (its links use this path too). */
export function DictionaryEntryScreen() {
  const params = useLocalSearchParams<{ dict: string; entry: string }>();
  const dict = toDictionaryId(params.dict);
  if (!dict || !params.entry) return <NotFoundScreen message={t('study.dict.unavailable')} />;
  return <EntryView key={`${dict}:${params.entry}`} dict={dict} id={params.entry} />;
}

/** /study/topics/[entry]: a Nave's topic with its subtopics and verse links. */
export function TopicScreen() {
  const params = useLocalSearchParams<{ entry: string }>();
  if (!params.entry) return <NotFoundScreen />;
  return <EntryView key={`nave:${params.entry}`} dict="nave" id={params.entry} />;
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', marginBottom: 10, minHeight: 28, alignItems: 'center' },
  body: { marginTop: 8 },
  nav: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 36, marginHorizontal: -8, gap: 12 },
  navButton: { maxWidth: '48%', minHeight: 44, justifyContent: 'center' },
});
