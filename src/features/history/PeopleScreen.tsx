import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Body, Button, ErrorState, Heading, Loading, Screen } from '@/components/ui';
import { t } from '@/i18n';
import { useData } from '@/lib/data/fetch';
import type { PersonSummary } from '@/lib/data/types';
import { useTheme } from '@/theme';

import { PATHS } from './data';
import { personHref } from './hrefs';
import { Credits, FilterInput, RowLink, versesLabel } from './parts';
import { searchPeople } from './people';

const PAGE = 50;

/** /study/people: everyone named in the Bible, filtered by typed name. */
export function PeopleScreen() {
  const params = useLocalSearchParams<{ q?: string }>();
  const index = useData<PersonSummary[]>(PATHS.peopleIndex);
  const [q, setQ] = useState(params.q ?? '');
  const [shown, setShown] = useState(PAGE);
  const results = useMemo(() => (index.data ? searchPeople(index.data, q) : []), [index.data, q]);
  const { palette, fonts } = useTheme();

  const onQuery = (v: string) => {
    setQ(v);
    setShown(PAGE);
    router.setParams({ q: v || undefined });
  };

  return (
    <Screen title={t('history.people.title')}>
      <Heading>{t('history.people.title')}</Heading>
      <Body muted>{t('history.people.intro')}</Body>
      <FilterInput
        testID="people-filter"
        value={q}
        onChange={onQuery}
        label={t('history.people.searchLabel')}
        placeholder={t('history.people.searchPlaceholder')}
      />
      {index.status === 'error' ? (
        <ErrorState onRetry={index.reload} />
      ) : !index.data ? (
        <Loading />
      ) : (
        <View testID="people-list">
          {results.length ? (
            <Text style={{ color: palette.muted, fontFamily: fonts.ui, fontSize: 13, marginBottom: 4 }}>
              {t('history.people.count', { shown: Math.min(shown, results.length), total: results.length.toLocaleString('en-US') })}
            </Text>
          ) : (
            <Body muted>{t('history.people.noMatch', { q })}</Body>
          )}
          {results.slice(0, shown).map((p) => (
            <RowLink key={p.id} href={personHref(p.id)} testID={`person-${p.id}`} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: palette.text, fontFamily: fonts.ui, fontSize: 16, fontWeight: '600' }}>{p.name}</Text>
                {p.title ? <Text style={{ color: palette.muted, fontFamily: fonts.ui, fontSize: 14 }}>{p.title}</Text> : null}
              </View>
              <Text style={{ color: palette.muted, fontFamily: fonts.ui, fontSize: 13 }}>{versesLabel(p.n)}</Text>
            </RowLink>
          ))}
          {shown < results.length ? (
            <View style={{ marginTop: 12 }}>
              <Button testID="people-more" label={t('history.people.more')} onPress={() => setShown((n) => n + PAGE)} />
            </View>
          ) : null}
        </View>
      )}
      <Credits lines={['history.credits.theographic']} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
});
