import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Body, ExternalLink, Heading, Rule, Screen } from '@/components/ui';
import { bookName, t } from '@/i18n';
import { formatRef } from '@/i18n/format';
import { BOOKS, bookInfo, type BookCode, toBookCode } from '@/lib/bible/books';
import { fromCompact, type Ref } from '@/lib/bible/refs';
import { pressStyle } from '@/lib/platform/press';
import { useCurrentPassage } from '@/lib/state/passage';
import { useTheme } from '@/theme';

import { RESOURCES, ResourceCard, StudyLinks, TeacherLinks, topicLabel } from './components';
import { ATTRIBUTION, links, SITE } from './links';

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

function FilterRow({ label, values, active, onPick, render, testID }: { label: string; values: string[]; active?: string; onPick: (v?: string) => void; render: (v: string) => string; testID: string }) {
  const { palette, fonts } = useTheme();
  return (
    <View style={{ marginTop: 10 }}>
      <Text style={{ color: palette.muted, fontFamily: fonts.ui, fontSize: 13, fontWeight: '600', marginBottom: 6 }}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        <Chip label={t('res.all')} active={!active} onPress={() => onPick(undefined)} />
        {values.map((v) => (
          <Chip key={v} testID={`${testID}-${v}`} label={render(v)} active={active === v} onPress={() => onPick(v)} />
        ))}
      </ScrollView>
    </View>
  );
}

/** Curated resource library, organized by book and topic (content/resources.json). */
export function LibraryScreen() {
  const params = useLocalSearchParams<{ book?: string; topic?: string; teacher?: string }>();
  const book = toBookCode(params.book);
  const books = useMemo(() => BOOKS.map((b) => b.code).filter((c) => RESOURCES.some((r) => r.books.includes(c))), []);
  const topics = useMemo(() => [...new Set(RESOURCES.flatMap((r) => r.topics))].sort(), []);
  const teachers = useMemo(() => [...new Set(RESOURCES.map((r) => r.teacher))], []);
  const items = RESOURCES.filter(
    (r) => (!book || r.books.includes(book)) && (!params.topic || r.topics.includes(params.topic)) && (!params.teacher || r.teacher === params.teacher),
  );
  const set = (patch: Record<string, string | undefined>) => router.setParams(patch as never);
  return (
    <Screen title={t('res.library')}>
      <Heading>{t('res.library')}</Heading>
      <Body muted>{t('res.libraryIntro')}</Body>
      <FilterRow testID="f-book" label={t('res.filterBook')} values={books} active={book ?? undefined} onPick={(v) => set({ book: v?.toLowerCase() })} render={(v) => bookName(v as BookCode)} />
      <FilterRow testID="f-topic" label={t('res.filterTopic')} values={topics} active={params.topic} onPick={(v) => set({ topic: v })} render={topicLabel} />
      <FilterRow testID="f-teacher" label={t('res.filterTeacher')} values={teachers} active={params.teacher} onPick={(v) => set({ teacher: v })} render={(v) => v} />
      <Text role="status" testID="res-count" style={{ marginVertical: 14 }}>
        <Body>{t('res.count', { n: items.length })}</Body>
      </Text>
      {items.length ? items.map((item) => <ResourceCard key={item.id} item={item} />) : <Body muted>{t('res.none')}</Body>}
    </Screen>
  );
}

export function TeachersScreen() {
  const { palette, fonts } = useTheme();
  const groups: { name: string; about: string; home: string; homeLabel: string; attribution: string }[] = [
    { name: t('res.teacher.piper'), about: t('res.teacher.piper.about'), home: SITE.dg, homeLabel: 'desiringGod.org', attribution: ATTRIBUTION.piper },
    { name: t('res.teacher.macarthur'), about: t('res.teacher.macarthur.about'), home: SITE.gty, homeLabel: 'gty.org', attribution: ATTRIBUTION.macarthur },
    { name: t('res.teacher.washer'), about: t('res.teacher.washer.about'), home: SITE.heartcry, homeLabel: 'heartcrymissionary.com', attribution: ATTRIBUTION.washer },
  ];
  return (
    <Screen title={t('res.teachers')}>
      <Heading>{t('res.teachers')}</Heading>
      <Body muted>{t('res.teachersIntro')}</Body>
      {groups.map((g) => (
        <View key={g.name} testID={`teacher-${g.homeLabel}`} style={[styles.teacher, { borderColor: palette.rule }]}>
          <Heading level={2} style={{ marginTop: 0 }}>{g.name}</Heading>
          <Body>{g.about}</Body>
          <View style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap', marginTop: 6 }}>
            <ExternalLink href={g.home} label={g.homeLabel} />
            {g.homeLabel.startsWith('heartcry') ? <ExternalLink href={links.washerSpeaker()} label={t('res.teacher.washer.all')} /> : null}
          </View>
          <Text style={{ color: palette.muted, fontFamily: fonts.ui, fontSize: 12, marginTop: 6 }}>{g.attribution}</Text>
          <Rule />
          {RESOURCES.filter((r) => r.teacher === g.name).map((item) => (
            <ResourceCard key={item.id} item={item} />
          ))}
        </View>
      ))}
    </Screen>
  );
}

function overlaps(r: Ref, book: BookCode, chapter: number) {
  return r.book === book && chapter >= r.chapter && chapter <= (r.endChapter ?? r.chapter);
}

/** Teachers, library items, and study links for one passage. */
export function PassageResourcesScreen() {
  const params = useLocalSearchParams<{ ref?: string }>();
  const current = useCurrentPassage();
  const ref = (params.ref && fromCompact(params.ref.toUpperCase())) || { book: current.book, chapter: current.chapter };
  const label = formatRef({ book: ref.book, chapter: ref.chapter });
  const chapterItems = RESOURCES.filter((r) => r.refs.some((s) => { const x = fromCompact(s); return x && overlaps(x, ref.book, ref.chapter); }));
  const bookItems = RESOURCES.filter((r) => r.books.includes(ref.book) && !chapterItems.includes(r));
  return (
    <Screen title={t('res.forPassage', { ref: label })}>
      <Heading>{t('res.forPassage', { ref: label })}</Heading>
      <Heading level={2}>{t('res.teachers')}</Heading>
      <TeacherLinks book={ref.book} chapter={ref.chapter} />
      <Heading level={2}>{t('res.inLibrary')}</Heading>
      {chapterItems.length || bookItems.length ? (
        [...chapterItems, ...bookItems].map((item) => <ResourceCard key={item.id} item={item} />)
      ) : (
        <Body muted>{t('res.none')}</Body>
      )}
      <Heading level={2}>{t('res.studyLinks')}</Heading>
      <StudyLinks book={ref.book} chapter={ref.chapter} verse={ref.verse} testament={bookInfo(ref.book).testament} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: 'row', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, minHeight: 36, justifyContent: 'center' },
  teacher: { borderWidth: 1, borderRadius: 18, padding: 18, marginTop: 16 },
});
