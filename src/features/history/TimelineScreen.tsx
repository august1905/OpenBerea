import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Body, ErrorState, Heading, Loading, Screen, TextButton } from '@/components/ui';
import { t } from '@/i18n';
import { useData } from '@/lib/data/fetch';
import type { Place, PersonSummary, Ruler, TimelineEvent } from '@/lib/data/types';

import { replace } from '../nav/navigate';
import { PATHS } from './data';
import { EventList } from './EventList';
import { timelineHref, type TimelineView } from './hrefs';
import { LaneChart } from './LaneChart';
import { Credits } from './parts';

const WIDTH = 1040;

/** /study/timeline (kings and prophets) and /study/timeline?view=events[&era=<era> | &event=<id>]. */
export function TimelineScreen() {
  const params = useLocalSearchParams<{ view?: string; event?: string; era?: string }>();
  const view: TimelineView = params.view === 'events' || params.event || params.era ? 'events' : 'kings';
  return (
    <Screen title={t('history.timeline.title')} width={WIDTH}>
      <Heading>{t('history.timeline.title')}</Heading>
      <Body muted style={{ marginBottom: 8 }}>
        {t('history.timeline.intro')}
      </Body>
      <View style={styles.views} role="group" aria-label={t('history.timeline.viewsLabel')}>
        {(['kings', 'events'] as const).map((v) => (
          <TextButton
            key={v}
            testID={`timeline-view-${v}`}
            label={t(v === 'kings' ? 'history.timeline.kings' : 'history.timeline.events')}
            active={view === v}
            onPress={() => replace(timelineHref({ view: v }))}
          />
        ))}
      </View>
      {view === 'kings' ? <Kings /> : <Events era={params.era} highlight={params.event} />}
      <Credits lines={['history.credits.theographic', 'history.credits.dates']} />
    </Screen>
  );
}

function Kings() {
  const rulers = useData<Ruler[]>(PATHS.rulers);
  if (rulers.status === 'error') return <ErrorState onRetry={rulers.reload} />;
  if (!rulers.data) return <Loading />;
  return (
    <>
      <Heading level={2}>{t('history.timeline.kings')}</Heading>
      <LaneChart rulers={rulers.data} />
    </>
  );
}

function Events({ era, highlight }: { era?: string; highlight?: string }) {
  const events = useData<TimelineEvent[]>(PATHS.events);
  const people = useData<PersonSummary[]>(PATHS.peopleIndex);
  const places = useData<Place[]>(PATHS.places);
  const failed = [events, people, places].find((d) => d.status === 'error');
  if (failed) return <ErrorState onRetry={failed.reload} />;
  if (!events.data || !people.data || !places.data) return <Loading />;
  return <EventList events={events.data} people={people.data} places={places.data} era={era} highlight={highlight} />;
}

const styles = StyleSheet.create({
  views: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 4 },
});
