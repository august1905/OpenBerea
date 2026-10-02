import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  type GestureResponderEvent,
  Platform,
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  TextInput,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Button, Loading } from '@/components/ui';
import { type MessageKey, t } from '@/i18n';
import { formatRef } from '@/i18n/format';
import type { BookCode } from '@/lib/bible/books';
import { fromVerseId } from '@/lib/bible/refs';
import type { ChapterText } from '@/lib/data/types';
import { linkProps, pressStyle } from '@/lib/platform/press';
import { useDisplay } from '@/lib/state/display';
import { useTheme } from '@/theme';

import { readHref } from '../nav/hrefs';
import { go } from '../nav/navigate';
import { Segments } from '../reader/Segments';
import { loadChapters } from './data';

// Small building blocks shared by the maps, timeline, people, and harmony screens.

/** In-app navigation for a link: modifier-clicks keep the browser's own behavior (new tab). */
export function onLink(href: string) {
  return (e?: GestureResponderEvent) => {
    const ev = e as unknown as { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; preventDefault?: () => void } | undefined;
    if (ev?.metaKey || ev?.ctrlKey || ev?.shiftKey) return;
    ev?.preventDefault?.();
    go(href);
  };
}

const webHref = (href: string) => (Platform.OS === 'web' ? linkProps(href, false) : null);

/** Inline text link (a real <a href> on the web). */
export function TextLink({
  href,
  children,
  testID,
  accessibilityLabel,
  style,
}: {
  href: string;
  children: ReactNode;
  testID?: string;
  accessibilityLabel?: string;
  style?: TextStyle;
}) {
  const { palette, fonts } = useTheme();
  return (
    <Text
      testID={testID}
      role="link"
      accessibilityLabel={accessibilityLabel}
      onPress={onLink(href)}
      {...webHref(href)}
      style={[{ color: palette.text, fontFamily: fonts.ui, textDecorationLine: 'underline', textDecorationColor: palette.gold } as TextStyle, style]}
    >
      {children}
    </Text>
  );
}

/** A whole row that links somewhere, highlighted on hover and focus. */
export function RowLink({
  href,
  children,
  testID,
  accessibilityLabel,
  style,
}: {
  href: string;
  children: ReactNode;
  testID?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { palette } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel}
      onPress={onLink(href)}
      {...webHref(href)}
      style={pressStyle(({ hovered, focused, pressed }) => [
        styles.row,
        { borderColor: palette.rule },
        (hovered || focused || pressed) && { backgroundColor: palette.highlight },
        style,
      ])}
    >
      {children}
    </Pressable>
  );
}

export interface LinkItem {
  key: string;
  href: string;
  label: string;
}

/** Labelled groups of links on one wrapping line ("People: David · Places: Hebron …"). */
export function LinkGroups({ groups, testID }: { groups: { label: string; links: LinkItem[] }[]; testID?: string }) {
  const { palette, fonts } = useTheme();
  const shown = groups.filter((g) => g.links.length);
  if (!shown.length) return null;
  return (
    <View testID={testID} style={styles.linkList}>
      {shown.map((g) => (
        <View key={g.label} role="group" aria-label={g.label} style={styles.linkGroup}>
          <Text style={[styles.groupLabel, { color: palette.muted, fontFamily: fonts.ui }]}>{g.label}</Text>
          {g.links.map((l) => (
            <TextLink key={l.key} href={l.href} style={styles.linkItem}>
              {l.label}
            </TextLink>
          ))}
        </View>
      ))}
    </View>
  );
}

// Control glyphs on the same 24×24 line grid as components/Icon.
const GLYPHS = {
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  // Four corners: fit back into view.
  reset: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
};

/** Round 44px icon button (zoom controls). */
export function RoundButton({ glyph, label, onPress, testID }: { glyph: keyof typeof GLYPHS; label: string; onPress: () => void; testID: string }) {
  const { palette } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={pressStyle(({ hovered, focused, pressed }) => [
        styles.round,
        { borderColor: palette.rule, backgroundColor: hovered || focused || pressed ? palette.highlight : palette.surface },
      ])}
    >
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" aria-hidden>
        <Path d={GLYPHS[glyph]} stroke={palette.text} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </Pressable>
  );
}

/** Small, muted source credits at the bottom of a screen. */
export function Credits({ lines }: { lines: MessageKey[] }) {
  const { palette, fonts } = useTheme();
  return (
    <View testID="history-credits" aria-label={t('history.credits.label')} role="group" style={[styles.credits, { borderColor: palette.rule }]}>
      {lines.map((k) => (
        <Text key={k} style={{ color: palette.muted, fontFamily: fonts.ui, fontSize: 12, lineHeight: 18 }}>
          {t(k)}
        </Text>
      ))}
    </View>
  );
}

export function FilterInput({
  value,
  onChange,
  label,
  placeholder,
  testID,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder: string;
  testID: string;
}) {
  const { palette, fonts } = useTheme();
  const labelId = `${testID}-label`;
  return (
    <View style={{ marginTop: 8 }}>
      <Text nativeID={labelId} style={[styles.label, { color: palette.muted, fontFamily: fonts.ui }]}>
        {label}
      </Text>
      <TextInput
        testID={testID}
        aria-labelledby={labelId}
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={palette.muted}
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.input, { color: palette.text, borderColor: palette.gold, backgroundColor: palette.surface, fontFamily: fonts.ui }]}
      />
    </View>
  );
}

/** "1 verse", "896 verses". */
export function versesLabel(n: number): string {
  return n === 1 ? t('history.verses.one') : t('history.verses.many', { n: n.toLocaleString('en-US') });
}

/** KJV chapters for the given verse ids, accumulated as more are needed (earlier ones stay shown). */
export function useChapterTexts(keys: { book: BookCode; chapter: number }[]): { texts: Map<string, ChapterText>; loading: boolean } {
  const [texts, setTexts] = useState(() => new Map<string, ChapterText>());
  const missing = keys.filter((k) => !texts.has(`${k.book}.${k.chapter}`));
  const missingKey = missing.map((k) => `${k.book}.${k.chapter}`).join(',');
  useEffect(() => {
    if (!missingKey) return;
    let alive = true;
    const wanted = missingKey.split(',').map((s) => {
      const [book, chapter] = s.split('.');
      return { book: book as BookCode, chapter: Number(chapter) };
    });
    loadChapters(wanted)
      .then((loaded) => {
        if (!alive) return;
        setTexts((prev) => {
          const next = new Map(prev);
          for (const [k, v] of loaded) next.set(k, v);
          return next;
        });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [missingKey]);
  return { texts, loading: missing.length > 0 };
}

/** Every verse in a list, with its KJV text, a page at a time. Each verse links to the reader. */
export function VerseList({ verses, page = 20, testID }: { verses: number[]; page?: number; testID: string }) {
  const [shown, setShown] = useState(page);
  const { palette, fonts, scale } = useTheme();
  const { redLetter } = useDisplay();
  const slice = useMemo(() => verses.slice(0, shown), [verses, shown]);
  const keys = useMemo(() => {
    const seen = new Map<string, { book: BookCode; chapter: number }>();
    for (const id of slice) {
      const { book, chapter } = fromVerseId(id);
      seen.set(`${book}.${chapter}`, { book, chapter });
    }
    return [...seen.values()];
  }, [slice]);
  const { texts, loading } = useChapterTexts(keys);

  return (
    <View testID={testID}>
      <Text style={{ color: palette.muted, fontFamily: fonts.ui, fontSize: 13, marginBottom: 4 }}>
        {t('history.verses.shown', { shown: Math.min(shown, verses.length), total: verses.length })}
      </Text>
      {slice.map((id) => {
        const { book, chapter, verse } = fromVerseId(id);
        const ch = texts.get(`${book}.${chapter}`);
        if (!ch) return null;
        const segs = verse === 0 ? ch.title : ch.v.find((v) => v.n === verse)?.s;
        const label = verse === 0 ? `${formatRef({ book, chapter })} (${t('history.verses.psalmTitle')})` : formatRef({ book, chapter, verse });
        return (
          <RowLink key={id} testID={`${testID}-${id}`} href={readHref(book, chapter, { v: verse || undefined })}>
            <Text style={{ color: palette.text, fontFamily: fonts.ui, fontWeight: '600', fontSize: 14 }}>{label}</Text>
            <Text style={{ color: palette.text, fontFamily: fonts.scripture, fontSize: 16 * scale, lineHeight: 26 * scale }}>
              {segs ? <Segments segs={segs} redLetter={redLetter} /> : null}
            </Text>
          </RowLink>
        );
      })}
      {loading ? <Loading /> : null}
      {shown < verses.length ? (
        <View style={{ marginTop: 12 }}>
          <Button testID={`${testID}-more`} label={t('history.verses.more')} onPress={() => setShown((n) => n + page)} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 10, paddingHorizontal: 6, borderRadius: 6 },
  round: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  linkList: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 18 },
  linkGroup: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12 },
  groupLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.3, lineHeight: 44 },
  // Standalone link text padded to a 44px touch target.
  linkItem: { fontSize: 15, lineHeight: 22, paddingVertical: 11 },
  credits: { marginTop: 40, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, gap: 4 },
  label: { fontSize: 13, fontWeight: '600', letterSpacing: 0.4, marginBottom: 6 },
  input: { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, fontSize: 17, marginBottom: 12 },
});
