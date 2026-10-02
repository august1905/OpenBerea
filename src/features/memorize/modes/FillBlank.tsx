import { useEffect, useMemo, useRef, useState } from 'react';
import { Text, TextInput, useWindowDimensions, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { Button } from '@/components/ui';
import { t } from '@/i18n';
import { useTheme } from '@/theme';

import { answerMatches } from '../check';
import { pickBlanks } from '../hide';
import { blankWidth, Instructions, practiceStyles, Row, Status, usePracticeText, WordFlow, WordText } from '../parts';
import type { PracticeWord } from '../passage';
import type { ModeProps } from './types';

/**
 * Fill in the blank: key words are blanked out and typed back in. Checking is lenient (case,
 * punctuation, apostrophes, and hyphens are ignored), and each blank shows right or missed.
 */
export function FillBlank({ unit, seed, onReport }: ModeProps) {
  const { palette } = useTheme();
  const { width } = useWindowDimensions();
  // Wide screens start typing in the first blank; phones wait for a tap so the keyboard doesn't jump up.
  const [autoFocus] = useState(width >= 700);
  const words = unit.words;
  const blanks = useMemo(() => pickBlanks(words, seed), [words, seed]);
  const position = useMemo(() => new Map(blanks.map((wi, k) => [wi, k])), [blanks]);
  const [values, setValues] = useState<Record<number, string>>({});
  const [results, setResults] = useState<Record<number, boolean>>({});
  const inputs = useRef(new Map<number, TextInput | null>());
  const checkedCount = Object.keys(results).length;
  const done = checkedCount === blanks.length && blanks.length > 0;

  useEffect(() => {
    const checked = blanks.filter((wi) => results[wi] !== undefined);
    const right = checked.filter((wi) => results[wi]);
    const missed = checked.filter((wi) => !results[wi]).map((wi) => words[wi].text);
    onReport({ answered: checked.length, correct: right.length, missed, done });
  }, [results, blanks, words, done, onReport]);

  const check = (wi: number) => setResults((r) => (r[wi] !== undefined ? r : { ...r, [wi]: answerMatches(words[wi].text, values[wi] ?? '') }));

  const submit = (wi: number) => {
    check(wi);
    const k = position.get(wi) ?? 0;
    const next = [...blanks.slice(k + 1), ...blanks.slice(0, k)].find((b) => results[b] === undefined && b !== wi);
    if (next !== undefined) inputs.current.get(next)?.focus();
  };

  const checkAll = () =>
    setResults((r) => {
      const out = { ...r };
      for (const wi of blanks) if (out[wi] === undefined) out[wi] = answerMatches(words[wi].text, values[wi] ?? '');
      return out;
    });

  return (
    <View>
      <Instructions>{t('mem.blank.instructions')}</Instructions>
      <View style={[practiceStyles.textBox, { borderColor: palette.rule, backgroundColor: palette.surface }]}>
        <WordFlow
          unit={unit}
          testID="practice-text"
          render={(w) => {
            const k = position.get(w.i);
            if (k === undefined) return <WordText word={w} />;
            if (results[w.i] !== undefined) return <CheckedBlank word={w} right={results[w.i]} typed={values[w.i] ?? ''} />;
            return (
              <BlankInput
                word={w}
                label={t('mem.blank.label', { n: k + 1, total: blanks.length })}
                value={values[w.i] ?? ''}
                onChange={(v) => setValues((s) => ({ ...s, [w.i]: v }))}
                onSubmit={() => submit(w.i)}
                autoFocus={autoFocus && k === 0}
                inputRef={(el) => {
                  inputs.current.set(w.i, el);
                }}
              />
            );
          }}
        />
      </View>
      <Status testID="fill-blank-status">{t('mem.blank.progress', { n: checkedCount, total: blanks.length })}</Status>
      {!done ? (
        <Row style={{ marginTop: 10 }}>
          <Button testID="fill-blank-check" label={t('mem.blank.check')} onPress={checkAll} />
        </Row>
      ) : null}
    </View>
  );
}

function BlankInput({
  word,
  label,
  value,
  onChange,
  onSubmit,
  inputRef,
  autoFocus,
}: {
  word: PracticeWord;
  label: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  inputRef: (el: TextInput | null) => void;
  autoFocus?: boolean;
}) {
  const { palette } = useTheme();
  const { base, fontSize } = usePracticeText();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {word.pre ? <Text style={[base, { color: palette.text }]}>{word.pre}</Text> : null}
      <TextInput
        ref={inputRef}
        autoFocus={autoFocus}
        testID={`blank-input-${word.i}`}
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        onSubmitEditing={onSubmit}
        blurOnSubmit={false}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="next"
        style={[
          {
            fontFamily: base.fontFamily,
            fontSize,
            color: palette.text,
            width: blankWidth(word, fontSize) + 24,
            minHeight: Math.round(fontSize * 1.6),
            paddingHorizontal: 6,
            borderBottomWidth: 2,
            borderColor: palette.gold,
            backgroundColor: palette.highlight,
            borderRadius: 4,
          },
        ]}
      />
      {word.post ? <Text style={[base, { color: palette.text }]}>{word.post}</Text> : null}
    </View>
  );
}

function CheckedBlank({ word, right, typed }: { word: PracticeWord; right: boolean; typed: string }) {
  const { palette, fonts } = useTheme();
  const status = right
    ? t('mem.blank.rightWord', { word: word.text })
    : typed.trim()
      ? t('mem.blank.wrongWord', { word: word.text, typed: typed.trim() })
      : t('mem.blank.emptyWord', { word: word.text });
  return (
    <View testID={`blank-result-${word.i}`} role="img" aria-label={status} style={{ alignItems: 'flex-start' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
        <WordText word={word} missed={!right} />
        <Icon name={right ? 'check' : 'close'} size={15} color={palette.muted} />
      </View>
      {!right ? (
        <Text style={{ color: palette.muted, fontFamily: fonts.ui, fontSize: 12 }}>
          {t('mem.missed')}
          {typed.trim() ? ` · ${t('mem.blank.youTyped', { typed: typed.trim() })}` : ''}
        </Text>
      ) : null}
    </View>
  );
}
