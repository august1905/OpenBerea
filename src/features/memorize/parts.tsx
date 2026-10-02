import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, type TextStyle, View, type ViewStyle } from 'react-native';

import { Icon } from '@/components/Icon';
import { Body, Button, TextButton } from '@/components/ui';
import { t } from '@/i18n';
import { pressStyle } from '@/lib/platform/press';
import { useTheme } from '@/theme';
import { scriptureStyle } from '@/theme/typography';

import type { PracticeWord, Unit } from './passage';
import { percent, type Report } from './session';

// Shared pieces of the practice screens: running Scripture text built from word boxes, blanks,
// choice rows, and the result card.

/** Large Scripture text for practice (the theme's scripture style, a step up in size). */
export function usePracticeText() {
  const { scale, dyslexia } = useTheme();
  const base = scriptureStyle(scale * 1.1, dyslexia);
  const fontSize = base.fontSize ?? 22;
  const lineHeight = base.lineHeight ?? Math.round(fontSize * 1.65);
  return { base, fontSize, lineHeight };
}

/** Verse label inside a unit: "16", or "2:1" when the unit spans chapters. */
export function verseLabel(unit: Unit, vi: number): string {
  const v = unit.verses[vi];
  return unit.ref.endChapter !== undefined ? t('mem.part.chapterVerse', { c: v.c, v: v.n }) : String(v.n);
}

/**
 * The words of a unit laid out like running text. Each word is its own box, so it can become a
 * blank, an input, or a button, and line breaks still fall between words.
 */
export function WordFlow({
  unit,
  render,
  verseNumbers = true,
  idPrefix,
  testID,
}: {
  unit: Unit;
  render: (word: PracticeWord) => ReactNode;
  verseNumbers?: boolean;
  idPrefix?: string;
  testID?: string;
}) {
  const { fontSize } = usePracticeText();
  const gap = Math.round(fontSize * 0.3);
  return (
    <View testID={testID} style={[styles.flow, { columnGap: gap, rowGap: 8 }]}>
      {unit.words.map((w) => (
        <View key={w.i} nativeID={idPrefix ? `${idPrefix}-${w.i}` : undefined} style={[styles.unit, w.glue ? { marginLeft: -gap } : null]}>
          {verseNumbers && w.verseStart ? <VerseNumber label={verseLabel(unit, w.vi)} /> : null}
          {render(w)}
          <WordGap />
        </View>
      ))}
    </View>
  );
}

/**
 * A real space between word boxes (web), sized to nothing: the layout gap does the spacing, while the
 * text still reads as words when copied or read by a screen reader.
 */
export function WordGap() {
  if (Platform.OS !== 'web') return null;
  return <Text style={styles.gap}> </Text>;
}

export function VerseNumber({ label }: { label: string }) {
  const { palette, fonts, scale } = useTheme();
  return <Text style={[styles.verseNum, { color: palette.muted, fontFamily: fonts.ui, fontSize: 12 * scale }]}>{label}</Text>;
}

/** A word as printed, with its punctuation. Missed words get a quiet dotted underline. */
export function WordText({ word, missed, style }: { word: PracticeWord; missed?: boolean; style?: TextStyle }) {
  const { palette } = useTheme();
  const { base } = usePracticeText();
  const wordStyle: TextStyle[] = [];
  if (word.sc) wordStyle.push({ fontVariant: ['small-caps'] });
  if (missed) {
    wordStyle.push({ textDecorationLine: 'underline', textDecorationStyle: 'dotted', textDecorationColor: palette.muted } as TextStyle);
  }
  return (
    <Text style={[base, { color: palette.text }, style]}>
      {word.pre}
      <Text style={wordStyle}>{word.text}</Text>
      {word.post}
    </Text>
  );
}

/** Width of a blank for a word, roughly the word's printed width. */
export function blankWidth(word: PracticeWord, fontSize: number): number {
  return Math.round(Math.max(fontSize * 1.3, fontSize * 0.5 * word.text.length));
}

/** A hidden word: a line where the word goes, with its punctuation. The current target is peach. */
export function BlankWord({ word, active, children }: { word: PracticeWord; active?: boolean; children?: ReactNode }) {
  const { palette } = useTheme();
  const { base, fontSize } = usePracticeText();
  return (
    <View style={styles.blankRow}>
      {word.pre ? <Text style={[base, { color: palette.text }]}>{word.pre}</Text> : null}
      <View
        aria-hidden
        style={[
          styles.blank,
          {
            width: blankWidth(word, fontSize),
            height: Math.round(fontSize * 1.25),
            borderBottomColor: active ? palette.gold : palette.muted,
            borderBottomWidth: active ? 2.5 : 1.5,
            backgroundColor: active ? palette.highlight : 'transparent',
          },
        ]}
      >
        {children}
      </View>
      {word.post ? <Text style={[base, { color: palette.text }]}>{word.post}</Text> : null}
    </View>
  );
}

/** A row of mutually exclusive choices (translation, mode, chapter-mode part). */
export function Choices<T extends string>({
  label,
  options,
  value,
  onChange,
  testIDPrefix,
  size = 15,
  showLabel = true,
}: {
  label: string;
  showLabel?: boolean;
  options: { id: T; label: string; a11y?: string }[];
  value: T;
  onChange: (id: T) => void;
  testIDPrefix: string;
  size?: number;
}) {
  const { palette, fonts } = useTheme();
  return (
    <View role="group" aria-label={label} style={styles.choiceRow}>
      {showLabel ? <Text style={[styles.choiceLabel, { color: palette.muted, fontFamily: fonts.ui }]}>{label}</Text> : null}
      {options.map((o) => (
        <TextButton
          key={o.id}
          testID={`${testIDPrefix}-${o.id}`}
          label={o.label}
          accessibilityLabel={o.a11y}
          active={o.id === value}
          onPress={() => onChange(o.id)}
          size={size}
        />
      ))}
    </View>
  );
}

/** Small square-ish option button, e.g. a chunk "1–3" or a chain step. */
export function OptionButton({ label, a11y, active, onPress, testID }: { label: string; a11y: string; active: boolean; onPress: () => void; testID: string }) {
  const { palette, fonts } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      aria-current={active ? 'true' : undefined}
      onPress={onPress}
      style={pressStyle(({ hovered, focused, pressed }) => [
        styles.option,
        {
          borderColor: active ? palette.gold : palette.rule,
          borderWidth: active ? 2 : 1,
          backgroundColor: active || hovered || focused || pressed ? palette.highlight : 'transparent',
        },
      ])}
    >
      <Text style={{ color: palette.text, fontFamily: fonts.ui, fontSize: 15, fontWeight: active ? '600' : '500' }}>{label}</Text>
    </Pressable>
  );
}

/** Instructions above a practice mode. */
export function Instructions({ children }: { children: ReactNode }) {
  return (
    <Body muted style={{ marginBottom: 14 }}>
      {children}
    </Body>
  );
}

/** Live status line under a practice (progress, gentle feedback). */
export function Status({ children, testID }: { children: ReactNode; testID?: string }) {
  const { palette, fonts } = useTheme();
  return (
    <View testID={testID} aria-live="polite" style={styles.status}>
      <Text style={{ color: palette.text, fontFamily: fonts.ui, fontSize: 15, lineHeight: 22 }}>{children}</Text>
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

/** Result of one practice run. */
export function ResultCard({ report, onAgain, next }: { report: Report; onAgain: () => void; next?: { label: string; onPress: () => void } | null }) {
  const { palette, fonts } = useTheme();
  const pct = report.answered ? percent(report.correct / report.answered) : 0;
  return (
    <View testID="practice-result" aria-live="polite" style={[styles.card, { borderColor: palette.rule, backgroundColor: palette.surface }]}>
      <View style={[styles.cardLine, { backgroundColor: palette.gold }]} />
      <View style={styles.row}>
        <Icon name="check" size={22} color={palette.text} />
        <Text role="heading" aria-level={2} style={{ color: palette.text, fontFamily: fonts.ui, fontSize: 19, fontWeight: '600' }}>
          {t('mem.result.heading')}
        </Text>
      </View>
      <Text testID="result-accuracy" style={{ color: palette.text, fontFamily: fonts.scripture, fontSize: 40, marginTop: 6 }}>
        {`${pct}%`}
      </Text>
      <Body muted>{t('mem.result.detail', { correct: report.correct, total: report.answered })}</Body>
      <Body style={{ marginTop: 6 }}>{report.missed.length ? t('mem.result.missed', { words: report.missed.join(', ') }) : t('mem.result.perfect')}</Body>
      <View style={[styles.row, { marginTop: 14, flexWrap: 'wrap' }]}>
        {next ? <Button testID="result-next" label={t('mem.result.next', { label: next.label })} onPress={next.onPress} /> : null}
        <Button testID="result-again" label={t('mem.result.again')} onPress={onAgain} />
      </View>
    </View>
  );
}

export const practiceStyles = StyleSheet.create({
  input: { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, minHeight: 52 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8, letterSpacing: 0.3 },
  textBox: { borderRadius: 16, paddingVertical: 18, paddingHorizontal: 18, borderWidth: 1, marginBottom: 14 },
});

const styles = StyleSheet.create({
  flow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  unit: { flexDirection: 'row', alignItems: 'center' },
  gap: { fontSize: 0, lineHeight: 0, width: 0 },
  verseNum: { marginRight: 5, alignSelf: 'flex-start', marginTop: 4, fontWeight: '600' },
  blankRow: { flexDirection: 'row', alignItems: 'center' },
  blank: { borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 2, marginBottom: 6 },
  choiceLabel: { fontSize: 13, fontWeight: '600', letterSpacing: 0.3, marginRight: 6 },
  option: { minWidth: 48, minHeight: 44, paddingHorizontal: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  status: { minHeight: 26, marginTop: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  card: { borderWidth: 1, borderRadius: 16, padding: 20, marginTop: 20, overflow: 'hidden' },
  cardLine: { position: 'absolute', top: 0, left: 0, right: 0, height: 3 },
});
