import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { TextButton } from '@/components/ui';
import { t } from '@/i18n';
import { pressStyle } from '@/lib/platform/press';
import { useTheme } from '@/theme';

import { BlankWord, Instructions, practiceStyles, Row, Status, usePracticeText, verseLabel, VerseNumber, WordGap, WordText } from '../parts';
import { hashSeed, scrambleOrder } from '../shuffle';
import type { ModeProps } from './types';

/**
 * Word scramble: each verse's words are shuffled into buttons; tap them in order to rebuild the
 * passage. Every word is a button (no dragging), so keyboards and screen readers work too. A wrong
 * tap counts the word being looked for as missed. Repeated words are interchangeable.
 */
export function Scramble({ unit, seed, onReport }: ModeProps) {
  const { palette, fonts, scale } = useTheme();
  const { fontSize } = usePracticeText();
  const words = unit.words;
  const n = words.length;
  // Shuffled chip order per verse.
  const pools = useMemo(
    () =>
      unit.verses.map((v, vi) => {
        const first = v.words[0]?.i ?? 0;
        return scrambleOrder(v.words.length, hashSeed(seed, vi)).map((k) => first + k);
      }),
    [unit, seed],
  );
  const [placed, setPlaced] = useState(0);
  const [used, setUsed] = useState<ReadonlySet<number>>(new Set());
  const [missed, setMissed] = useState<ReadonlySet<number>>(new Set());
  const [wrong, setWrong] = useState<string | null>(null);
  const done = placed >= n;

  useEffect(() => {
    const upTo = done ? n : placed + (missed.has(placed) ? 1 : 0);
    const missedWords = words.slice(0, upTo).filter((w) => missed.has(w.i)).map((w) => w.text);
    const correct = words.slice(0, placed).filter((w) => !missed.has(w.i)).length;
    onReport({ answered: upTo, correct, missed: missedWords, done });
  }, [placed, missed, words, n, done, onReport]);

  const place = (chip: number) => {
    setUsed((u) => new Set(u).add(chip));
    setPlaced((p) => p + 1);
    setWrong(null);
  };

  const tap = (chip: number) => {
    if (done) return;
    if (words[chip].norm === words[placed].norm) place(chip);
    else {
      setMissed((m) => new Set(m).add(placed));
      setWrong(words[chip].text);
    }
  };

  const showNext = () => {
    if (done) return;
    const target = words[placed];
    const chip = pools[target.vi].find((c) => !used.has(c) && words[c].norm === target.norm) ?? target.i;
    setMissed((m) => new Set(m).add(placed));
    place(chip);
  };

  // Long passages: the rebuilt text scrolls in its own box, kept at its end, so the word buttons stay
  // in view.
  const { width, height } = useWindowDimensions();
  const builtRef = useRef<ScrollView>(null);
  const long = n > (width < 700 ? 30 : 120);
  useEffect(() => {
    if (long) builtRef.current?.scrollToEnd({ animated: false });
  }, [placed, long]);

  const current = done ? null : words[placed];
  const pool = current ? pools[current.vi].filter((c) => !used.has(c)) : [];
  const gap = Math.round(fontSize * 0.3);

  return (
    <View>
      <Instructions>{t('mem.sc.instructions')}</Instructions>
      <ScrollView
        ref={builtRef}
        style={[practiceStyles.textBox, { borderColor: palette.rule, backgroundColor: palette.surface }, long ? { maxHeight: Math.max(180, height * 0.32) } : null]}
        nestedScrollEnabled
      >
      <View testID="scramble-built" role="group" aria-label={t('mem.sc.built')} style={[styles.flow, { columnGap: gap, rowGap: 8 }]}>
        {words.slice(0, placed).map((w) => (
          <View key={w.i} style={[styles.unit, w.glue ? { marginLeft: -gap } : null]}>
            {w.verseStart ? <VerseNumber label={verseLabel(unit, w.vi)} /> : null}
            <WordText word={w} missed={missed.has(w.i)} />
            <WordGap />
          </View>
        ))}
        {current ? (
          <View style={styles.unit}>
            {current.verseStart ? <VerseNumber label={verseLabel(unit, current.vi)} /> : null}
            <BlankWord word={{ ...current, pre: '', post: '' }} active />
          </View>
        ) : null}
      </View>
      </ScrollView>
      {current ? (
        <View role="group" aria-label={t('mem.sc.pool', { n: unit.verses[current.vi].n })} style={styles.pool}>
          {pool.map((c) => (
            <Pressable
              key={c}
              testID={`chip-${c}`}
              accessibilityRole="button"
              accessibilityLabel={t('mem.sc.wordButton', { word: words[c].text })}
              onPress={() => tap(c)}
              style={pressStyle(({ hovered, focused, pressed }) => [
                styles.chip,
                { borderColor: palette.rule, backgroundColor: hovered || focused || pressed ? palette.highlight : palette.surface },
              ])}
            >
              <Text style={{ color: palette.text, fontFamily: fonts.scripture, fontSize: 18 * Math.min(scale, 1.4) }}>{words[c].text}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <Status testID="scramble-status">
        {t('mem.sc.progress', { n: placed, total: n })}
        {wrong ? ` · ${t('mem.sc.notYet', { word: wrong })}` : ''}
      </Status>
      {!done ? (
        <Row style={{ marginTop: 4, marginLeft: -8 }}>
          <TextButton testID="scramble-hint" label={t('mem.sc.hint')} onPress={showNext} />
        </Row>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', minHeight: 40 },
  unit: { flexDirection: 'row', alignItems: 'center' },
  pool: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, justifyContent: 'center' },
});
