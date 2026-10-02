import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { TextButton } from '@/components/ui';
import { t } from '@/i18n';
import { useTheme } from '@/theme';

import { firstLetterShow, firstLetterStart, firstLetterType } from '../check';
import { BlankWord, Instructions, practiceStyles, Row, Status, usePracticeText, WordFlow, WordText } from '../parts';
import { scrollWithin } from '../scroll';
import type { ModeProps } from './types';

/**
 * First letter: type the first letter of each word. A correct letter reveals the word; a wrong one
 * counts the word as missed and is shown at the blank. Typing goes through a text field (not key
 * events), so phone on-screen keyboards and physical keyboards both work.
 */
export function FirstLetter({ unit, onReport }: ModeProps) {
  const { palette, fonts, scale } = useTheme();
  const { fontSize } = usePracticeText();
  const { width, height } = useWindowDimensions();
  const words = unit.words;
  const [state, setState] = useState(() => firstLetterStart(words.length));
  const [value, setValue] = useState('');
  const processed = useRef(0);
  const inputRef = useRef<TextInput>(null);
  const done = state.index >= words.length;
  const wrongHere = done ? [] : state.wrong[state.index];
  const missedCount = state.missed.filter(Boolean).length;

  useEffect(() => {
    const upTo = done ? words.length : state.index + (state.missed[state.index] ? 1 : 0);
    const missed = words.slice(0, upTo).filter((w) => state.missed[w.i]).map((w) => w.text);
    const correct = words.slice(0, state.index).filter((w) => !state.missed[w.i]).length;
    onReport({ answered: upTo, correct, missed, done });
  }, [state, done, words, onReport]);

  useEffect(() => {
    if (!done) scrollWithin('fl-box', `fl-${state.index}`);
  }, [state.index, done]);

  // Wide screens start typing right away; phones wait for a tap so the keyboard doesn't jump up.
  const [autoFocus] = useState(width >= 700);

  const onChangeText = (next: string) => {
    // Only characters added since the last change count; deleting does nothing (misses stay counted).
    const added = next.length > processed.current ? next.slice(processed.current) : '';
    processed.current = next.length;
    setValue(next);
    if (added) setState((s) => firstLetterType(s, words, added));
  };

  const focusInput = () => inputRef.current?.focus();
  // Long passages scroll inside a box so the input stays close to the current word (and above a
  // phone's keyboard).
  const phone = width < 700;
  const long = words.length > (phone ? 30 : 120);
  const maxHeight = Math.max(200, height * (phone ? 0.38 : 0.5));

  return (
    <View>
      <Instructions>{t('mem.fl.instructions')}</Instructions>
      <View
        {...({ onClick: focusInput } as object)}
        style={[practiceStyles.textBox, { borderColor: palette.rule, backgroundColor: palette.surface }]}
      >
        <ScrollView nativeID="fl-box" style={long ? { maxHeight } : undefined} nestedScrollEnabled>
          <WordFlow
            unit={unit}
            idPrefix="fl"
            testID="practice-text"
            render={(w) =>
              w.i < state.index ? (
                <WordText word={w} missed={state.missed[w.i]} />
              ) : (
                <BlankWord word={w} active={w.i === state.index}>
                  {w.i === state.index && wrongHere.length ? (
                    <Text
                      numberOfLines={1}
                      style={{ color: palette.muted, fontFamily: fonts.ui, fontSize: Math.round(fontSize * 0.55), textDecorationLine: 'line-through' }}
                    >
                      {wrongHere.slice(-3).join(' ')}
                    </Text>
                  ) : null}
                </BlankWord>
              )
            }
          />
        </ScrollView>
      </View>
      <Text nativeID="fl-label" style={[practiceStyles.label, { color: palette.muted, fontFamily: fonts.ui }]}>
        {t('mem.fl.input')}
      </Text>
      <TextInput
        ref={inputRef}
        autoFocus={autoFocus}
        testID="first-letter-input"
        aria-labelledby="fl-label"
        accessibilityLabel={t('mem.fl.input')}
        value={value}
        onChangeText={onChangeText}
        editable={!done}
        placeholder={t('mem.fl.placeholder')}
        placeholderTextColor={palette.muted}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="done"
        style={[
          practiceStyles.input,
          { color: palette.text, borderColor: palette.gold, backgroundColor: palette.surface, fontFamily: fonts.ui, fontSize: 18 * Math.min(scale, 1.4), letterSpacing: 2 },
        ]}
      />
      <Status testID="first-letter-status">
        {done ? t('mem.fl.done', { total: words.length }) : t('mem.fl.progress', { n: state.index + 1, total: words.length })}
        {missedCount ? ` · ${t('mem.fl.missedCount', { n: missedCount })}` : ''}
        {wrongHere.length ? ` · ${t('mem.fl.wrong', { key: wrongHere[wrongHere.length - 1] })}` : ''}
      </Status>
      {!done ? (
        <Row style={{ marginTop: 4, marginLeft: -8 }}>
          <TextButton testID="first-letter-show" label={t('mem.fl.show')} onPress={() => {
              setState((s) => firstLetterShow(s, words.length));
              focusInput();
            }}
          />
        </Row>
      ) : null}
    </View>
  );
}
