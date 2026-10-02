import { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { Button } from '@/components/ui';
import { type MessageKey, t } from '@/i18n';
import { formatRef } from '@/i18n/format';
import { parseReference, type Ref } from '@/lib/bible/refs';
import { verseCount } from '@/lib/bible/versification';
import { useTheme } from '@/theme';

import { checkReference, type RefCheck } from '../check';
import { Instructions, practiceStyles, Row, Status, WordFlow, WordText } from '../parts';
import type { ModeProps } from './types';

const FEEDBACK: Record<RefCheck, MessageKey> = {
  correct: 'mem.vr.correct',
  close: 'mem.vr.close',
  chapter: 'mem.vr.chapter',
  book: 'mem.vr.book',
  wrong: 'mem.vr.wrong',
  invalid: 'mem.vr.invalid',
};

/**
 * Verse → reference: the passage is shown without verse numbers and the reference is typed, parsed
 * like the quick-jump box ("Rom 8:28", "romans 8.28"). Typing (rather than multiple choice) asks for
 * real recall, and partial answers get gentle feedback (right book, right chapter, overlapping verses).
 */
export function VerseToRef({ unit, onReport }: ModeProps) {
  const { palette, fonts, scale } = useTheme();
  const [value, setValue] = useState('');
  const [result, setResult] = useState<{ result: RefCheck; parsed: Ref | null } | null>(null);
  const parsed = value.trim() ? parseReference(value, verseCount) : null;

  useEffect(() => {
    if (!result) return;
    const ok = result.result === 'correct';
    onReport({ answered: 1, correct: ok ? 1 : 0, missed: ok ? [] : [formatRef(unit.ref)], done: true });
  }, [result, unit, onReport]);

  const check = () => {
    if (value.trim()) setResult(checkReference(value, unit.ref));
  };

  return (
    <View>
      <Instructions>{t('mem.vr.instructions')}</Instructions>
      <View style={[practiceStyles.textBox, { borderColor: palette.rule, backgroundColor: palette.surface }]}>
        <WordFlow unit={unit} verseNumbers={false} testID="practice-text" render={(w) => <WordText word={w} />} />
      </View>
      {!result ? (
        <>
          <Text nativeID="vr-label" style={[practiceStyles.label, { color: palette.muted, fontFamily: fonts.ui }]}>
            {t('mem.vr.input')}
          </Text>
          <TextInput
            testID="reference-input"
            aria-labelledby="vr-label"
            accessibilityLabel={t('mem.vr.input')}
            value={value}
            onChangeText={setValue}
            onSubmitEditing={check}
            placeholder={t('mem.vr.placeholder')}
            placeholderTextColor={palette.muted}
            autoCapitalize="words"
            autoCorrect={false}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="done"
            style={[practiceStyles.input, { color: palette.text, borderColor: palette.gold, backgroundColor: palette.surface, fontFamily: fonts.ui, fontSize: 18 * Math.min(scale, 1.4) }]}
          />
          <Status>{value.trim() ? (parsed ? t('mem.vr.reads', { ref: formatRef(parsed) }) : t('mem.vr.unknown')) : ''}</Status>
          <Row style={{ marginTop: 8 }}>
            <Button testID="reference-check" label={t('mem.vr.check')} onPress={check} disabled={!value.trim()} />
          </Row>
        </>
      ) : (
        <View testID="reference-feedback" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 4 }}>
          <Icon name={result.result === 'correct' ? 'check' : 'info'} size={20} color={palette.text} />
          <Text style={{ color: palette.text, fontFamily: fonts.ui, fontSize: 16, lineHeight: 24, flex: 1 }}>
            {t(FEEDBACK[result.result], { ref: formatRef(unit.ref), typed: result.parsed ? formatRef(result.parsed) : value.trim() })}
          </Text>
        </View>
      )}
    </View>
  );
}
