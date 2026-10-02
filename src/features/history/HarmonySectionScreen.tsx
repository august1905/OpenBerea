import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { ErrorState, Heading, Loading, Screen } from '@/components/ui';
import { bookName, t } from '@/i18n';
import { useData } from '@/lib/data/fetch';
import type { Harmony, HarmonySection } from '@/lib/data/types';
import { useTheme } from '@/theme';

import { PATHS } from './data';
import { allSections, gospelsOf, splitRefs } from './harmony';
import { harmonyHref, harmonySectionHref } from './hrefs';
import { PassageText } from './PassageText';
import { Credits, TextLink } from './parts';

const WIDE = 1200;
/** Narrowest readable column; below this the accounts stack with gospel headings. */
const MIN_COLUMN = 230;

/** /study/harmony/[n]: one section's parallel accounts, side by side on wide screens. */
export function HarmonySectionScreen() {
  const { n } = useLocalSearchParams<{ n: string }>();
  const harmony = useData<Harmony>(PATHS.harmony);
  const num = Number(n);
  if (harmony.status === 'error') {
    return (
      <Screen title={t('history.harmony.title')}>
        <ErrorState onRetry={harmony.reload} />
      </Screen>
    );
  }
  if (!harmony.data) {
    return (
      <Screen title={t('history.harmony.title')}>
        <Loading />
      </Screen>
    );
  }
  const sections = allSections(harmony.data);
  const i = sections.findIndex((s) => s.n === num);
  if (i < 0) {
    return (
      <Screen title={t('history.harmony.title')}>
        <Heading>{t('history.harmony.title')}</Heading>
        <ErrorState message={t('history.harmony.notFound', { n: String(n) })} />
        <TextLink href={harmonyHref()} style={styles.nav}>
          {t('history.harmony.all')}
        </TextLink>
      </Screen>
    );
  }
  const part = harmony.data.parts.find((p) => p.sections.includes(sections[i]))!;
  return <Section key={num} section={sections[i]} part={part.title} prev={sections[i - 1]} next={sections[i + 1]} total={sections.length} index={i} />;
}

function Nav({ prev, next }: { prev?: HarmonySection; next?: HarmonySection }) {
  return (
    <View style={styles.navRow} role="navigation" aria-label={t('history.harmony.navLabel')}>
      {prev ? (
        <TextLink testID="harmony-prev" href={harmonySectionHref(prev.n)} accessibilityLabel={t('history.harmony.prevNamed', { title: prev.title })} style={styles.nav}>
          {`← ${t('history.harmony.prev')}`}
        </TextLink>
      ) : (
        <View />
      )}
      <TextLink href={harmonyHref()} style={styles.nav}>
        {t('history.harmony.all')}
      </TextLink>
      {next ? (
        <TextLink testID="harmony-next" href={harmonySectionHref(next.n)} accessibilityLabel={t('history.harmony.nextNamed', { title: next.title })} style={styles.nav}>
          {`${t('history.harmony.next')} →`}
        </TextLink>
      ) : (
        <View />
      )}
    </View>
  );
}

function Section({ section, part, prev, next, total, index }: { section: HarmonySection; part: string; prev?: HarmonySection; next?: HarmonySection; total: number; index: number }) {
  const { palette, fonts } = useTheme();
  const { width } = useWindowDimensions();
  const gospels = gospelsOf(section);
  const available = Math.min(width - 40, WIDE);
  const side = gospels.length > 1 && available / gospels.length >= MIN_COLUMN;
  return (
    <Screen title={t('history.harmony.pageTitle', { title: section.title })} width={side ? WIDE : undefined}>
      <Text style={{ color: palette.muted, fontFamily: fonts.ui, fontSize: 13 }}>
        {part} · {t('history.harmony.sectionLabel', { n: index + 1, total })}
      </Text>
      <Heading style={{ marginTop: 6 }}>{section.title}</Heading>
      <Nav prev={prev} next={next} />
      <View testID="harmony-columns" style={side ? styles.columns : null}>
        {gospels.map((g) => (
          <View key={g} testID={`harmony-${g}`} style={side ? [styles.column, { borderColor: palette.rule }] : styles.stacked}>
            <Heading level={2} style={{ marginTop: side ? 0 : 18 }}>
              {bookName(g)}
            </Heading>
            <PassageText testID={`harmony-text-${g}`} refs={splitRefs(section.refs[g])} compact={side && gospels.length > 2} />
          </View>
        ))}
      </View>
      <Nav prev={prev} next={next} />
      <Credits lines={['history.credits.robertson']} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  navRow: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginVertical: 8 },
  nav: { fontSize: 15, paddingVertical: 11 },
  columns: { flexDirection: 'row', gap: 24, marginTop: 8 },
  column: { flex: 1, minWidth: 0, borderTopWidth: 2, paddingTop: 12 },
  stacked: { marginTop: 4 },
});
