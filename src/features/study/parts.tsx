import { type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, type TextStyle, View, type ViewStyle } from 'react-native';

import { Icon } from '@/components/Icon';
import { TextButton } from '@/components/ui';
import { bookName, t } from '@/i18n';
import { adjacentChapter, type BookCode } from '@/lib/bible/books';
import { linkProps, pressStyle } from '@/lib/platform/press';
import { useTheme } from '@/theme';

import { go, openInNewTab } from '../nav/navigate';

// Small building blocks shared by the study screens.

type ClickEvent = { preventDefault?: () => void; metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean } | undefined;

/**
 * Press handler for an in-app link. On the web the element is a real <a href>, so the browser's
 * own navigation is cancelled and the router moves instead (keeping tabs and in-memory state).
 * Modifier clicks are left to the browser.
 */
export function navigateTo(href: string, before?: () => void) {
  return (e?: unknown) => {
    const ev = e as ClickEvent;
    if (Platform.OS === 'web' && ev && (ev.metaKey || ev.ctrlKey || ev.shiftKey)) return;
    ev?.preventDefault?.();
    before?.();
    go(href);
  };
}

/** Web-only href so links are real anchors (middle-click, screen-reader link lists). */
export function hrefProps(href: string): object {
  return Platform.OS === 'web' ? linkProps(href, false) : {};
}

/** Inline text link to a page in the app. */
export function InlineLink({ href, children, style, testID, label }: { href: string; children: ReactNode; style?: TextStyle; testID?: string; label?: string }) {
  const { palette } = useTheme();
  return (
    <Text
      testID={testID}
      role="link"
      accessibilityLabel={label}
      onPress={navigateTo(href)}
      {...hrefProps(href)}
      style={[{ color: palette.text, textDecorationLine: 'underline', textDecorationColor: palette.gold } as TextStyle, style]}
    >
      {children}
    </Text>
  );
}

/** A full-width row that links to a page (list items in indexes and search results). */
export function RowLink({
  href,
  children,
  testID,
  label,
  style,
  before,
}: {
  href: string;
  children: ReactNode;
  testID?: string;
  label?: string;
  style?: ViewStyle;
  before?: () => void;
}) {
  const { palette } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={navigateTo(href, before)}
      {...hrefProps(href)}
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

/** Square icon button that opens a page in a new in-app tab. */
export function NewTabButton({ href, label, testID, before }: { href: string; label: string; testID?: string; before?: () => void }) {
  const { palette } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={t('study.openNewTab', { label })}
      onPress={() => {
        before?.();
        openInNewTab(href);
      }}
      style={pressStyle(({ hovered, focused, pressed }) => [styles.iconButton, (hovered || focused || pressed) && { backgroundColor: palette.highlight }])}
    >
      <Icon name="plus" size={18} color={palette.muted} />
    </Pressable>
  );
}

/** Small, muted source credit at the bottom of a screen. */
export function Credit({ children, testID }: { children: ReactNode; testID?: string }) {
  const { palette, fonts } = useTheme();
  return (
    <Text testID={testID ?? 'study-credit'} style={[styles.credit, { color: palette.muted, fontFamily: fonts.ui, borderColor: palette.rule }]}>
      {children}
    </Text>
  );
}

/** Small muted note under a heading. */
export function Note({ children, testID, style }: { children: ReactNode; testID?: string; style?: TextStyle }) {
  const { palette, fonts, scale } = useTheme();
  return (
    <Text testID={testID} style={[{ color: palette.muted, fontFamily: fonts.ui, fontSize: 14 * Math.min(scale, 1.3), lineHeight: 21 * Math.min(scale, 1.3) }, style]}>
      {children}
    </Text>
  );
}

/** Row of choices (commentaries, dictionaries); the active one carries aria-current. */
export function Switcher<T extends string>({
  options,
  value,
  onChange,
  label,
  testID,
}: {
  options: { id: T; label: string; accessibilityLabel?: string }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  testID?: string;
}) {
  return (
    <View role="group" aria-label={label} style={styles.switcher} testID={testID}>
      {options.map((o) => (
        <TextButton
          key={o.id}
          testID={testID ? `${testID}-${o.id}` : undefined}
          label={o.label}
          accessibilityLabel={o.accessibilityLabel}
          active={o.id === value}
          onPress={() => onChange(o.id)}
          size={14}
          style={styles.switchItem}
        />
      ))}
    </View>
  );
}

/** Previous / next chapter links for a study screen. */
export function ChapterNav({ book, chapter, href }: { book: BookCode; chapter: number; href: (book: BookCode, chapter: number) => string }) {
  const prev = adjacentChapter(book, chapter, -1);
  const next = adjacentChapter(book, chapter, 1);
  return (
    <View style={styles.nav}>
      {prev ? (
        <TextButton
          testID="study-prev"
          label={`‹ ${bookName(prev.book)} ${prev.chapter}`}
          accessibilityLabel={t('study.prevChapter', { label: `${bookName(prev.book)} ${prev.chapter}` })}
          onPress={() => go(href(prev.book, prev.chapter))}
        />
      ) : (
        <View />
      )}
      {next ? (
        <TextButton
          testID="study-next"
          label={`${bookName(next.book)} ${next.chapter} ›`}
          accessibilityLabel={t('study.nextChapter', { label: `${bookName(next.book)} ${next.chapter}` })}
          onPress={() => go(href(next.book, next.chapter))}
        />
      ) : null}
    </View>
  );
}

/** Labeled search field. */
export function SearchField({
  value,
  onChange,
  label,
  placeholder,
  testID,
  nativeID,
}: {
  value: string;
  onChange: (s: string) => void;
  label: string;
  placeholder: string;
  testID: string;
  nativeID: string;
}) {
  const { palette, fonts } = useTheme();
  return (
    <View>
      <Text nativeID={nativeID} style={[styles.label, { color: palette.muted, fontFamily: fonts.ui }]}>
        {label}
      </Text>
      <TextInput
        testID={testID}
        aria-labelledby={nativeID}
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={palette.muted}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        inputMode="search"
        style={[styles.input, { color: palette.text, borderColor: palette.gold, backgroundColor: palette.surface, fontFamily: fonts.ui }]}
      />
    </View>
  );
}

/** A–Z letter picker; letters without entries are dimmed and disabled. */
export function Letters({
  value,
  available,
  onChange,
  testID = 'letters',
}: {
  value: string | null;
  available?: Set<string>;
  onChange: (letter: string) => void;
  testID?: string;
}) {
  const { palette, fonts } = useTheme();
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  return (
    <View role="group" aria-label={t('study.dict.letters')} style={styles.letters} testID={testID}>
      {letters.map((l) => {
        const enabled = !available || available.has(l);
        const active = l === value;
        return (
          <Pressable
            key={l}
            testID={`${testID}-${l}`}
            accessibilityRole="button"
            accessibilityLabel={t('study.dict.letter', { letter: l })}
            aria-current={active ? 'true' : undefined}
            accessibilityState={{ disabled: !enabled }}
            disabled={!enabled}
            onPress={() => onChange(l)}
            style={pressStyle(({ hovered, focused, pressed }) => [
              styles.letter,
              { borderColor: active ? palette.gold : 'transparent' },
              (hovered || focused || pressed) && { backgroundColor: palette.highlight },
              !enabled && { opacity: 0.35 },
            ])}
          >
            <Text style={{ color: palette.text, fontFamily: fonts.ui, fontSize: 15, fontWeight: active ? '700' : '500' }}>{l}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 10, paddingHorizontal: 8, minHeight: 44, justifyContent: 'center' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  credit: { fontSize: 12, lineHeight: 18, marginTop: 40, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  switcher: { flexDirection: 'row', flexWrap: 'wrap', marginLeft: -8, marginBottom: 6 },
  switchItem: { minHeight: 44, justifyContent: 'center' },
  nav: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 36, marginHorizontal: -8, gap: 8 },
  label: { fontSize: 13, fontWeight: '600', letterSpacing: 0.4, marginBottom: 6, marginTop: 8 },
  input: { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, fontSize: 17, marginBottom: 12 },
  letters: { flexDirection: 'row', flexWrap: 'wrap', gap: 2, marginVertical: 8 },
  letter: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1.5 },
});
