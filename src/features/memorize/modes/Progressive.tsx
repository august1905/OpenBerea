import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button } from '@/components/ui';
import { t } from '@/i18n';
import { pressStyle } from '@/lib/platform/press';
import { useTheme } from '@/theme';

import { hiddenInRound, hideCounts, hideOrder } from '../hide';
import { BlankWord, Instructions, practiceStyles, Row, Status, WordFlow, WordText } from '../parts';
import { percent } from '../session';
import type { ModeProps } from './types';

/**
 * Progressive hiding: read the passage, then each round hides more words (20%, 40%, … 100%).
 * Tapping a blank peeks at the word, which counts it as missed.
 */
export function Progressive({ unit, seed, onReport }: ModeProps) {
  const { palette } = useTheme();
  const words = unit.words;
  const n = words.length;
  const order = useMemo(() => hideOrder(n, seed), [n, seed]);
  const counts = useMemo(() => hideCounts(n), [n]);
  const last = counts.length - 1;
  const [round, setRound] = useState(0);
  /** Last round the reader finished (−1 before the first). */
  const [completed, setCompleted] = useState(-1);
  const [peeked, setPeeked] = useState<ReadonlySet<number>>(new Set());
  const [missed, setMissed] = useState<ReadonlySet<number>>(new Set());
  const done = completed === last;
  const hidden = useMemo(() => hiddenInRound(order, counts, round), [order, counts, round]);

  useEffect(() => {
    const finished = completed >= 0 ? hiddenInRound(order, counts, completed) : new Set<number>();
    const answered = new Set([...finished, ...missed]).size;
    const correct = [...finished].filter((i) => !missed.has(i)).length;
    const missedWords = [...missed].sort((a, b) => a - b).map((i) => words[i].text);
    onReport({ answered, correct, missed: missedWords, done });
  }, [completed, missed, order, counts, words, done, onReport]);

  const peek = (i: number) => {
    setPeeked((p) => new Set(p).add(i));
    setMissed((m) => new Set(m).add(i));
  };

  const nextRound = () => {
    setCompleted(round);
    setRound(round + 1);
    setPeeked(new Set());
  };

  return (
    <View>
      <Instructions>{t('mem.pr.instructions')}</Instructions>
      <View style={[practiceStyles.textBox, { borderColor: palette.rule, backgroundColor: palette.surface }]}>
        <WordFlow
          unit={unit}
          testID="practice-text"
          render={(w) =>
            hidden.has(w.i) && !peeked.has(w.i) && !done ? (
              <Pressable
                testID={`peek-${w.i}`}
                accessibilityRole="button"
                accessibilityLabel={t('mem.pr.peek', { n: w.i + 1 })}
                onPress={() => peek(w.i)}
                style={pressStyle(({ hovered, focused }) => [{ borderRadius: 6 }, (hovered || focused) && { backgroundColor: palette.highlight }])}
              >
                <BlankWord word={w} />
              </Pressable>
            ) : (
              <WordText word={w} missed={missed.has(w.i)} />
            )
          }
        />
      </View>
      <Status testID="progressive-status">
        {round === 0
          ? t('mem.pr.readThrough')
          : `${t('mem.pr.round', { n: round, total: last })} · ${t('mem.pr.hiddenShare', { pct: percent(counts[round] / Math.max(1, n)) })}`}
      </Status>
      {!done ? (
        <Row style={{ marginTop: 10 }}>
          {round < last ? (
            <Button testID="progressive-next" label={t('mem.pr.next')} onPress={nextRound} />
          ) : (
            <Button testID="progressive-finish" label={t('mem.pr.finish')} onPress={() => setCompleted(last)} />
          )}
        </Row>
      ) : null}
    </View>
  );
}
