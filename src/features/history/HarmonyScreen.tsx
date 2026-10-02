import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Body, ErrorState, Heading, Loading, Screen } from '@/components/ui';
import { t } from '@/i18n';
import { formatRef } from '@/i18n/format';
import { fromCompact } from '@/lib/bible/refs';
import { useData } from '@/lib/data/fetch';
import type { Harmony, HarmonySection } from '@/lib/data/types';
import { useTheme } from '@/theme';

import { PATHS } from './data';
import { filterHarmony, gospelsOf, sectionsForVerse, splitRefs } from './harmony';
import { harmonyHref, harmonySectionHref } from './hrefs';
import { Credits, FilterInput, RowLink, TextLink } from './parts';

/** Searchable text for a section's references: "Matthew 3:13–17 Mark 1:9–11 …". */
export function describeRefs(s: HarmonySection, style: 'full' | 'abbr' = 'full'): string {
  return gospelsOf(s)
    .flatMap((g) => splitRefs(s.refs[g]))
    .map((r) => formatRef(r, style))
    .join(style === 'full' ? ' ' : ' · ');
}

/** /study/harmony: Robertson's parts and sections, filtered by typed text, or ?v= the sections that include a verse. */
export function HarmonyScreen() {
  const params = useLocalSearchParams<{ q?: string; v?: string }>();
  const harmony = useData<Harmony>(PATHS.harmony);
  const verse = params.v ? fromCompact(params.v) : null;
  return (
    <Screen title={t('history.harmony.title')}>
      <Heading>{t('history.harmony.title')}</Heading>
      <Body muted>{t('history.harmony.intro')}</Body>
      {harmony.status === 'error' ? (
        <ErrorState onRetry={harmony.reload} />
      ) : !harmony.data ? (
        <Loading />
      ) : verse && verse.verse !== undefined ? (
        <ForVerse harmony={harmony.data} book={verse.book} chapter={verse.chapter} verse={verse.verse} />
      ) : (
        <Sections harmony={harmony.data} initialQuery={params.q ?? ''} />
      )}
      <Credits lines={['history.credits.robertson']} />
    </Screen>
  );
}

function SectionRow({ s }: { s: HarmonySection }) {
  const { palette, fonts } = useTheme();
  return (
    <RowLink href={harmonySectionHref(s.n)} testID={`harmony-section-${s.n}`}>
      <Text style={{ color: palette.text, fontFamily: fonts.ui, fontSize: 16, fontWeight: '600', lineHeight: 22 }}>{s.title}</Text>
      <Text style={{ color: palette.muted, fontFamily: fonts.ui, fontSize: 13, marginTop: 2 }}>{describeRefs(s, 'abbr')}</Text>
    </RowLink>
  );
}

function Sections({ harmony, initialQuery }: { harmony: Harmony; initialQuery: string }) {
  const [q, setQ] = useState(initialQuery);
  const parts = useMemo(() => filterHarmony(harmony, q, (s) => describeRefs(s)), [harmony, q]);
  const onQuery = (v: string) => {
    setQ(v);
    router.setParams({ q: v || undefined });
  };
  return (
    <View testID="harmony-index">
      <FilterInput
        testID="harmony-filter"
        value={q}
        onChange={onQuery}
        label={t('history.harmony.filterLabel')}
        placeholder={t('history.harmony.filterPlaceholder')}
      />
      {!parts.length ? <Body muted>{t('history.harmony.noMatch', { q })}</Body> : null}
      {parts.map((p) => (
        <View key={p.title} role="group" aria-label={p.title}>
          <Heading level={2}>{p.title}</Heading>
          {p.sections.map((s) => (
            <SectionRow key={s.n} s={s} />
          ))}
        </View>
      ))}
    </View>
  );
}

function ForVerse({ harmony, book, chapter, verse }: { harmony: Harmony; book: Parameters<typeof sectionsForVerse>[1]; chapter: number; verse: number }) {
  const sections = sectionsForVerse(harmony, book, chapter, verse);
  const label = formatRef({ book, chapter, verse });
  return (
    <View testID="harmony-for-verse">
      <Heading level={2}>{sections.length ? t('history.harmony.forVerse', { label }) : t('history.harmony.forVerseNone', { label })}</Heading>
      {sections.map((s) => (
        <SectionRow key={s.n} s={s} />
      ))}
      <TextLink href={harmonyHref()} style={styles.link}>
        {t('history.harmony.showAll')}
      </TextLink>
    </View>
  );
}

const styles = StyleSheet.create({
  link: { fontSize: 15, paddingVertical: 11, marginTop: 8 },
});
