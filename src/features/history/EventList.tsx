import { memo, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { TextButton } from '@/components/ui';
import { t } from '@/i18n';
import { formatRef } from '@/i18n/format';
import type { Place, PersonSummary, TimelineEvent } from '@/lib/data/types';
import { useTheme } from '@/theme';

import { refHref } from '../nav/hrefs';
import { replace } from '../nav/navigate';
import { byId } from './data';
import { mapHref, personHref, timelineHref } from './hrefs';
import { LinkGroups, type LinkItem, TextLink } from './parts';
import { revealNode } from './reveal';
import { approx, type Era, eraLabel, eraOf, ERAS, groupByEra } from './years';

// Events in chronological order, grouped by era, one era at a time (?era=, or the era of ?event=):
// approximate date, title, and links to the people (profiles), places (map), and passages (reader).

export function EventList({
  events,
  people,
  places,
  era: eraParam,
  highlight,
}: {
  events: TimelineEvent[];
  people: PersonSummary[];
  places: Place[];
  era?: string;
  highlight?: string;
}) {
  const { palette, fonts } = useTheme();
  const groups = useMemo(() => groupByEra(events), [events]);
  const eventRef = useRef<View | null>(null);
  const peopleById = byId(people);
  const placesById = byId(places);
  const linked = highlight ? byId(events).get(highlight) : undefined;
  const wanted: Era | undefined = linked ? eraOf(linked) : (ERAS as readonly string[]).includes(eraParam ?? '') ? (eraParam as Era) : undefined;
  const index = Math.max(0, groups.findIndex((g) => g.era === wanted));
  const group = groups[index];
  const prev = groups[index - 1];
  const next = groups[index + 1];

  // A link to one event (from a profile) scrolls it into view.
  useEffect(() => {
    if (!highlight) return;
    const id = setTimeout(() => revealNode(eventRef.current, 'center'), 60);
    return () => clearTimeout(id);
  }, [highlight]);

  if (!group) return null;
  return (
    <View testID="event-list">
      <View role="navigation" aria-label={t('history.timeline.eras')} style={styles.eras}>
        {groups.map((g) => (
          <TextButton
            key={g.era}
            testID={`era-link-${g.era}`}
            label={eraLabel(g.era)}
            accessibilityLabel={t('history.timeline.eraCount', { era: eraLabel(g.era), n: g.events.length })}
            active={g.era === group.era}
            onPress={() => replace(timelineHref({ era: g.era }))}
            size={14}
          />
        ))}
      </View>
      <View testID={`era-${group.era}`}>
        <Text role="heading" aria-level={2} style={[styles.era, { color: palette.text, fontFamily: fonts.ui }]}>
          {eraLabel(group.era)}
        </Text>
        <Text style={{ color: palette.muted, fontFamily: fonts.ui, fontSize: 13, marginBottom: 4 }}>
          {t('history.timeline.eraSpan', { n: group.events.length, date: approx(group.events[0].start, group.events[group.events.length - 1].start) })}
        </Text>
        {group.events.map((e) => (
          <EventRow
            key={e.id}
            event={e}
            people={peopleById}
            places={placesById}
            highlighted={e.id === highlight}
            rowRef={e.id === highlight ? (r) => void (eventRef.current = r) : undefined}
          />
        ))}
      </View>
      <View style={styles.pager}>
        {prev ? (
          <TextLink testID="era-prev" href={timelineHref({ era: prev.era })} style={styles.pagerLink}>
            {`← ${eraLabel(prev.era)}`}
          </TextLink>
        ) : (
          <View />
        )}
        {next ? (
          <TextLink testID="era-next" href={timelineHref({ era: next.era })} style={styles.pagerLink}>
            {`${eraLabel(next.era)} →`}
          </TextLink>
        ) : null}
      </View>
    </View>
  );
}

const EventRow = memo(function EventRow({
  event: e,
  people,
  places,
  highlighted,
  rowRef,
}: {
  event: TimelineEvent;
  people: Map<string, PersonSummary>;
  places: Map<string, Place>;
  highlighted: boolean;
  rowRef?: (r: View | null) => void;
}) {
  const { palette, fonts } = useTheme();
  const { width } = useWindowDimensions();
  const narrow = width < 600;
  const peopleLinks: LinkItem[] = (e.people ?? [])
    .map((id) => people.get(id))
    .filter((p): p is PersonSummary => !!p)
    .map((p) => ({ key: p.id, href: personHref(p.id), label: p.name }));
  const placeLinks: LinkItem[] = (e.places ?? [])
    .map((id) => places.get(id))
    .filter((p): p is Place => !!p)
    .map((p) => ({ key: p.id, href: mapHref({ place: p.id }), label: p.name }));
  const refLinks: LinkItem[] = (e.refs ?? []).map((r) => ({ key: r, href: refHref(r), label: formatRef(r, 'abbr') }));
  return (
    <View
      ref={rowRef}
      testID={`event-${e.id}`}
      aria-current={highlighted ? 'true' : undefined}
      style={[
        styles.row,
        narrow ? null : styles.rowWide,
        { borderColor: palette.rule },
        highlighted && { backgroundColor: palette.highlight, borderLeftColor: palette.gold, borderLeftWidth: 3 },
      ]}
    >
      <Text style={[styles.date, narrow ? null : styles.dateWide, { color: palette.muted, fontFamily: fonts.ui }]}>{approx(e.start, e.end)}</Text>
      <View style={{ flex: 1 }}>
        <Text role="heading" aria-level={3} style={{ color: palette.text, fontFamily: fonts.ui, fontSize: 16, fontWeight: '600', lineHeight: 22 }}>
          {e.title}
        </Text>
        <LinkGroups
          groups={[
            { label: t('history.event.people'), links: peopleLinks },
            { label: t('history.event.places'), links: placeLinks },
            { label: t('history.event.passages'), links: refLinks },
          ]}
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  era: { fontSize: 21, fontWeight: '600', marginTop: 24, marginBottom: 2 },
  eras: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  row: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 6 },
  rowWide: { flexDirection: 'row', gap: 16 },
  date: { fontSize: 13, lineHeight: 22 },
  dateWide: { width: 150 },
  pager: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginTop: 16 },
  pagerLink: { fontSize: 15, paddingVertical: 11 },
});
