import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui';
import { t } from '@/i18n';
import { formatRef } from '@/i18n/format';
import { useTheme } from '@/theme';

import { type DiffResult, diffText } from '../check';
import { trName } from '../modes';
import { Instructions, practiceStyles, Row, usePracticeText, WordGap, WordText } from '../parts';
import type { ModeProps } from './types';

/** Reference → verse: see the reference, type the passage from memory, then compare word by word. */
export function RefToVerse({ unit, tr, onReport }: ModeProps) {
  const { palette, fonts, scale } = useTheme();
  const { base } = usePracticeText();
  const [value, setValue] = useState('');
  const [result, setResult] = useState<DiffResult | null>(null);
  const expected = useMemo(() => unit.words.map((w) => w.text), [unit]);
  const refLabel = formatRef(unit.ref);

  useEffect(() => {
    if (result) onReport({ answered: result.total, correct: result.correct, missed: result.missed, done: true });
  }, [result, onReport]);

  return (
    <View>
      <Instructions>{t('mem.rv.instructions')}</Instructions>
      <View style={[practiceStyles.textBox, { borderColor: palette.rule, backgroundColor: palette.surface, alignItems: 'center' }]}>
        <Text testID="prompt-ref" style={[base, { color: palette.text, fontSize: (base.fontSize ?? 22) * 1.25, textAlign: 'center' }]}>
          {refLabel}
        </Text>
        <Text style={{ color: palette.muted, fontFamily: fonts.ui, fontSize: 13, marginTop: 2 }}>{trName(tr)}</Text>
      </View>
      {!result ? (
        <>
          <Text nativeID="rv-label" style={[practiceStyles.label, { color: palette.muted, fontFamily: fonts.ui }]}>
            {t('mem.rv.input', { ref: refLabel })}
          </Text>
          <TextInput
            testID="recite-input"
            aria-labelledby="rv-label"
            accessibilityLabel={t('mem.rv.input', { ref: refLabel })}
            value={value}
            onChangeText={setValue}
            multiline
            placeholder={t('mem.rv.placeholder')}
            placeholderTextColor={palette.muted}
            autoCapitalize="sentences"
            autoCorrect={false}
            autoComplete="off"
            spellCheck={false}
            style={[
              practiceStyles.input,
              styles.textarea,
              { color: palette.text, borderColor: palette.gold, backgroundColor: palette.surface, fontFamily: base.fontFamily, fontSize: 18 * Math.min(scale, 1.4) },
            ]}
          />
          <Row style={{ marginTop: 12 }}>
            <Button testID="recite-check" label={t('mem.rv.check')} onPress={() => setResult(diffText(expected, value))} disabled={!value.trim()} />
          </Row>
        </>
      ) : (
        <DiffView result={result} unit={unit} />
      )}
    </View>
  );
}

function DiffView({ result, unit }: { result: DiffResult; unit: ModeProps['unit'] }) {
  const { palette, fonts } = useTheme();
  const { base, fontSize } = usePracticeText();
  const gap = Math.round(fontSize * 0.3);
  const small = { color: palette.muted, fontFamily: fonts.ui, fontSize: 13 };
  return (
    <View testID="recite-diff">
      <View style={styles.legend}>
        <Text style={small}>{`✓ ${t('mem.rv.legendRight')}`}</Text>
        <View style={[styles.missedBox, { borderColor: palette.muted }]}>
          <Text style={small}>{t('mem.rv.legendMissed')}</Text>
        </View>
        <Text style={[small, { textDecorationLine: 'line-through' }]}>{`+${t('mem.rv.legendExtra')}`}</Text>
      </View>
      <View style={[practiceStyles.textBox, { borderColor: palette.rule, backgroundColor: palette.surface }]}>
        <View style={[styles.flow, { columnGap: gap, rowGap: 8 }]}>
          {result.ops.map((op, k) => {
            const word = op.index !== undefined ? unit.words[op.index] : undefined;
            if (op.kind === 'ok' && word) {
              return (
                <View key={k} style={styles.unit}>
                  <WordText word={word} />
                  <WordGap />
                </View>
              );
            }
            if (op.kind === 'missed' && word) {
              return (
                <View key={k} testID="diff-missed" style={[styles.unit, styles.missedBox, { borderColor: palette.muted }]}>
                  <WordText word={word} />
                  <WordGap />
                </View>
              );
            }
            return (
              <View key={k} style={styles.unit}>
                <Text testID="diff-extra" style={[base, { color: palette.muted, textDecorationLine: 'line-through' }]}>
                  {`+${op.text}`}
                </Text>
                <WordGap />
              </View>
            );
          })}
        </View>
      </View>
      {result.missed.length ? <Text style={[small, styles.line]}>{t('mem.rv.missedWord', { word: result.missed.join(', ') })}</Text> : null}
      {result.extra.length ? <Text style={[small, styles.line]}>{t('mem.rv.extraWord', { word: result.extra.join(', ') })}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  textarea: { minHeight: 150, textAlignVertical: 'top', lineHeight: 28 },
  flow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  unit: { flexDirection: 'row', alignItems: 'center' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 14, marginBottom: 10 },
  missedBox: { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 6, paddingHorizontal: 4 },
  line: { marginTop: 4, fontSize: 14 },
});
