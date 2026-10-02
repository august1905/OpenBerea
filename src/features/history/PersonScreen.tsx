import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { RichText } from '@/components/RichText';
import { Body, ErrorState, Heading, Loading, Screen } from '@/components/ui';
import { t } from '@/i18n';
import { useData, useLoad } from '@/lib/data/fetch';
import type { Person, PersonSummary, TimelineEvent } from '@/lib/data/types';
import { useTheme } from '@/theme';

import { byId, loadPerson, PATHS } from './data';
import { FamilyTree } from './FamilyTree';
import { peopleHref, timelineHref } from './hrefs';
import { Credits, RowLink, TextLink, VerseList, versesLabel } from './parts';
import { approx } from './years';

/** /study/people/[id]: name, years, Easton's article, family tree, events, and every mention. */
export function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Profile key={id} id={String(id ?? '')} />;
}

function Profile({ id }: { id: string }) {
  const index = useData<PersonSummary[]>(PATHS.peopleIndex);
  const person = useLoad(`person:${id}`, () => loadPerson(id));
  const people = useMemo(() => (index.data ? byId(index.data) : null), [index.data]);

  if (person.status === 'error' || index.status === 'error') {
    return (
      <Screen title={t('history.people.title')}>
        <ErrorState />
      </Screen>
    );
  }
  if (person.status === 'loading' || !people) {
    return (
      <Screen title={t('history.people.title')}>
        <Loading />
      </Screen>
    );
  }
  if (!person.data) {
    return (
      <Screen title={t('history.people.title')}>
        <Heading>{t('history.people.title')}</Heading>
        <ErrorState message={t('history.people.notFound')} />
        <TextLink href={peopleHref()} style={{ fontSize: 15, paddingVertical: 11 }}>
          {t('history.people.title')}
        </TextLink>
      </Screen>
    );
  }
  return <ProfileBody person={person.data} people={people} />;
}

function ProfileBody({ person, people }: { person: Person; people: Map<string, PersonSummary> }) {
  const { palette, fonts } = useTheme();
  const years = [
    person.birth !== undefined ? t('history.person.born', { date: approx(person.birth) }) : null,
    person.death !== undefined ? t('history.person.died', { date: approx(person.death) }) : null,
  ].filter(Boolean);
  return (
    <Screen title={person.name}>
      <Heading>{person.name}</Heading>
      {person.title ? <Body muted>{person.title}</Body> : null}
      {years.length ? (
        <Text testID="person-years" style={[styles.years, { color: palette.text, fontFamily: fonts.ui }]}>
          {years.join(' · ')}
        </Text>
      ) : null}
      <Text style={{ color: palette.muted, fontFamily: fonts.ui, fontSize: 14, marginTop: 4 }}>
        {t('history.person.mentionsCount', { verses: versesLabel(person.verses.length) })}
      </Text>

      <Heading level={2}>{t('history.person.family')}</Heading>
      <FamilyTree person={person} people={people} />

      {person.dict?.length ? (
        <View testID="person-dict">
          <Heading level={2}>{t('history.person.dictionary')}</Heading>
          <RichText blocks={person.dict} serif />
        </View>
      ) : null}

      {person.events?.length ? <Events ids={person.events} /> : null}

      <Heading level={2}>{t('history.person.mentions')}</Heading>
      <VerseList testID="person-verses" verses={person.verses} />

      <Credits lines={['history.credits.theographic', 'history.credits.dates']} />
    </Screen>
  );
}

function Events({ ids }: { ids: string[] }) {
  const { palette, fonts } = useTheme();
  const events = useData<TimelineEvent[]>(PATHS.events);
  if (!events.data) return null;
  const lookup = byId(events.data);
  const list = ids.map((id) => lookup.get(id)).filter((e): e is TimelineEvent => !!e);
  if (!list.length) return null;
  return (
    <View testID="person-events">
      <Heading level={2}>{t('history.person.events')}</Heading>
      {list.map((e) => (
        <RowLink key={e.id} href={timelineHref({ event: e.id })} testID={`person-event-${e.id}`} style={styles.event}>
          <Text style={{ color: palette.text, fontFamily: fonts.ui, fontSize: 16, fontWeight: '600', flex: 1 }}>{e.title}</Text>
          <Text style={{ color: palette.muted, fontFamily: fonts.ui, fontSize: 13 }}>{approx(e.start, e.end)}</Text>
        </RowLink>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  years: { fontSize: 15, marginTop: 6 },
  event: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, minHeight: 48 },
});
