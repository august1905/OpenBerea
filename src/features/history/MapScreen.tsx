import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Body, Button, ErrorState, Heading, Loading, Screen } from '@/components/ui';
import { t } from '@/i18n';
import { formatRef } from '@/i18n/format';
import { bookInfo, type BookCode } from '@/lib/bible/books';
import { fromCompact } from '@/lib/bible/refs';
import { useData, useLoad } from '@/lib/data/fetch';
import type { BaseMap, Place } from '@/lib/data/types';
import { pressStyle } from '@/lib/platform/press';
import { useTheme } from '@/theme';

import { readHref } from '../nav/hrefs';
import { byId, loadChapterPlaces, PATHS } from './data';
import { mapHref } from './hrefs';
import { type FocusRequest, MapCanvas } from './MapCanvas';
import { Credits, FilterInput, TextLink, versesLabel } from './parts';
import { searchByName } from './people';
import { confidenceLabel, PlaceSheet, placeType } from './PlaceSheet';
import { boundsOf, projectPlaces } from './projection';

const PAGE = 40;
const MAP_WIDTH = 1040;

/** /study/maps?ch=JHN.3 (a chapter's places), ?place=<id> (focus one place), or every place. */
export function MapScreen() {
  const params = useLocalSearchParams<{ ch?: string; place?: string; q?: string }>();
  const ref = params.ch ? fromCompact(params.ch.toUpperCase()) : null;
  const chapter = ref && ref.chapter >= 1 && ref.chapter <= bookInfo(ref.book).chapters ? { book: ref.book, chapter: ref.chapter } : null;
  if (params.ch && !chapter) {
    return (
      <Screen title={t('history.map.allTitle')}>
        <Heading>{t('history.map.allTitle')}</Heading>
        <ErrorState message={t('history.map.badChapter')} />
      </Screen>
    );
  }
  const key = `${chapter ? `${chapter.book}.${chapter.chapter}` : 'all'}:${params.place ?? ''}`;
  return <MapPage key={key} chapter={chapter} placeParam={params.place ?? null} initialQuery={params.q ?? ''} />;
}

function MapPage({ chapter, placeParam, initialQuery }: { chapter: { book: BookCode; chapter: number } | null; placeParam: string | null; initialQuery: string }) {
  const { width, height } = useWindowDimensions();
  const base = useData<BaseMap>(PATHS.baseMap);
  const places = useData<Place[]>(PATHS.places);
  const chapterIds = useLoad(chapter ? `chapter-places:${chapter.book}.${chapter.chapter}` : null, () =>
    loadChapterPlaces(chapter!.book, chapter!.chapter),
  );

  const shown = useMemo<Place[] | null>(() => {
    if (!places.data) return null;
    if (!chapter) return places.data;
    if (chapterIds.status !== 'ready') return null;
    const lookup = byId(places.data);
    const list = chapterIds.data.map((id) => lookup.get(id)).filter((p): p is Place => !!p);
    const linked = placeParam ? lookup.get(placeParam) : undefined;
    return linked && !list.includes(linked) ? [...list, linked] : list;
  }, [places.data, chapter, chapterIds, placeParam]);

  const title = chapter ? t('history.map.chapterTitle', { label: formatRef(chapter) }) : t('history.map.allTitle');
  const failed = base.status === 'error' || places.status === 'error' || chapterIds.status === 'error';

  const column = Math.min(width - 40, MAP_WIDTH);
  const mapHeight = Math.round(Math.min(Math.max(column * (column < 600 ? 0.95 : 0.6), 300), height * 0.66));

  return (
    <Screen title={title} width={MAP_WIDTH}>
      <Heading>{title}</Heading>
      <Body muted style={styles.intro}>
        {chapter ? t('history.map.chapterIntro') : t('history.map.intro')}
      </Body>
      {chapter ? (
        <View style={styles.links}>
          <TextLink href={readHref(chapter.book, chapter.chapter)} style={styles.link}>
            {t('history.map.readChapter', { label: formatRef(chapter) })}
          </TextLink>
          <TextLink href={mapHref()} style={styles.link} testID="map-show-all">
            {t('history.map.showAll')}
          </TextLink>
        </View>
      ) : null}
      {failed ? (
        <ErrorState onRetry={() => (base.status === 'error' ? base.reload() : places.reload())} />
      ) : !base.data || !shown ? (
        <Loading />
      ) : (
        <MapAndList base={base.data} shown={shown} chapter={chapter} placeParam={placeParam} mapHeight={mapHeight} initialQuery={initialQuery} />
      )}
      <Credits lines={['history.credits.openbible', 'history.credits.naturalearth']} />
    </Screen>
  );
}

function MapAndList({
  base,
  shown,
  chapter,
  placeParam,
  mapHeight,
  initialQuery,
}: {
  base: BaseMap;
  shown: Place[];
  chapter: { book: BookCode; chapter: number } | null;
  placeParam: string | null;
  mapHeight: number;
  initialQuery: string;
}) {
  const lookup = useMemo(() => new Map(shown.map((p) => [p.id, p])), [shown]);
  const points = useMemo(() => projectPlaces(shown, base), [shown, base]);
  const initialFocus = placeParam && lookup.has(placeParam) ? placeParam : null;
  const [selected, setSelected] = useState<string | null>(initialFocus);
  const [sheet, setSheet] = useState<string | null>(null);
  const [focus, setFocus] = useState<FocusRequest | null>(null);
  const labelled = useMemo(() => (chapter ? new Set(shown.map((p) => p.id)) : undefined), [chapter, shown]);
  const initial = useMemo(() => (chapter ? boundsOf(points) : null), [chapter, points]);

  const choose = (id: string, center: boolean) => {
    setSelected(id);
    setSheet(id);
    if (center) setFocus((f) => ({ id, seq: (f?.seq ?? 0) + 1 }));
  };

  const notFound = placeParam && !lookup.has(placeParam);

  return (
    <>
      {notFound ? <Body muted style={{ marginBottom: 8 }}>{t('history.map.notFound')}</Body> : null}
      <View testID="map">
        <MapCanvas
          base={base}
          points={points}
          selected={selected}
          labelled={labelled}
          initial={initial}
          initialFocus={initialFocus}
          focus={focus}
          onSelect={(id) => choose(id, false)}
          height={mapHeight}
          label={t('history.map.label', { n: shown.length.toLocaleString('en-US') })}
        />
      </View>
      <PlaceList places={shown} chapter={chapter} selected={selected} onChoose={(id) => choose(id, true)} initialQuery={initialQuery} />
      <PlaceSheet place={sheet ? (lookup.get(sheet) ?? null) : null} chapter={chapter} onClose={() => setSheet(null)} />
    </>
  );
}

/** Every place on the map as a list of buttons, for keyboard and screen-reader users (and anyone). */
function PlaceList({
  places,
  chapter,
  selected,
  onChoose,
  initialQuery,
}: {
  places: Place[];
  chapter: { book: BookCode; chapter: number } | null;
  selected: string | null;
  onChoose: (id: string) => void;
  initialQuery: string;
}) {
  const { palette, fonts } = useTheme();
  const [q, setQ] = useState(initialQuery);
  const [shown, setShown] = useState(PAGE);
  const filterable = !chapter;
  const results = useMemo(() => (filterable ? searchByName(places, q, 'mentions') : places), [filterable, places, q]);
  const slice = filterable ? results.slice(0, shown) : results;

  const onQuery = (v: string) => {
    setQ(v);
    setShown(PAGE);
    router.setParams({ q: v || undefined });
  };

  return (
    <View testID="place-list" style={styles.list}>
      <Heading level={2}>{t('history.map.listTitle')}</Heading>
      {filterable ? (
        <FilterInput testID="place-filter" value={q} onChange={onQuery} label={t('history.map.filterLabel')} placeholder={t('history.map.filterPlaceholder')} />
      ) : null}
      {!places.length ? <Body muted>{t('history.map.none')}</Body> : null}
      {places.length && !results.length ? <Body muted>{t('history.map.noMatch', { q })}</Body> : null}
      {filterable && results.length ? (
        <Text style={{ color: palette.muted, fontFamily: fonts.ui, fontSize: 13, marginBottom: 4 }}>
          {t('history.map.listCount', { shown: Math.min(shown, results.length), total: results.length.toLocaleString('en-US') })}
        </Text>
      ) : null}
      {slice.map((p) => {
        const conf = confidenceLabel(p.score);
        const verses = versesLabel(p.n);
        return (
          <Pressable
            key={p.id}
            testID={`place-${p.id}`}
            accessibilityRole="button"
            accessibilityLabel={t('history.map.item', { name: p.name, type: placeType(p), confidence: conf, verses })}
            aria-current={p.id === selected ? 'true' : undefined}
            onPress={() => onChoose(p.id)}
            style={pressStyle(({ hovered, focused, pressed }) => [
              styles.row,
              { borderColor: palette.rule },
              (hovered || focused || pressed || p.id === selected) && { backgroundColor: palette.highlight },
            ])}
          >
            <View style={[styles.dot, { backgroundColor: palette.gold }]} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: palette.text, fontFamily: fonts.ui, fontSize: 16, fontWeight: '600' }}>{p.name}</Text>
              <Text style={{ color: palette.muted, fontFamily: fonts.ui, fontSize: 13 }}>
                {placeType(p)} · {conf} · {verses}
              </Text>
            </View>
          </Pressable>
        );
      })}
      {filterable && shown < results.length ? (
        <View style={{ marginTop: 12 }}>
          <Button testID="place-more" label={t('history.map.showMore')} onPress={() => setShown((n) => n + PAGE)} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { marginBottom: 12 },
  links: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 20, marginBottom: 8 },
  link: { fontSize: 15, paddingVertical: 11 },
  list: { marginTop: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
